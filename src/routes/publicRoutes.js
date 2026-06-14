const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const FormData = require('form-data');
const webpush = require('web-push');
const db = require('../services/db');
const { validateAdminKey } = require('../middleware/auth');

function now() { return new Date().toISOString(); }

const PLANS = {
  '1month':  { days: 30,  kesPrice: 5000,  usdtPrice: 50  },
  '2months': { days: 60,  kesPrice: 9500,  usdtPrice: 95  },
  '3months': { days: 90,  kesPrice: 14000, usdtPrice: 140 }
};

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:support@pipsattendant.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

router.get('/health', (req, res) => {
  res.json({ status: 'ok', time: now(), service: 'pips-attendant-api', dbConnected: true });
});

router.get('/plans', (req, res) => {
  res.json({ ok: true, plans: PLANS });
});

router.get('/crypto-wallets', (req, res) => {
  res.json({
    ok: true,
    wallets: {
      TRC20: process.env.USDT_WALLET_TRC20 || '',
      BEP20: process.env.USDT_WALLET_BEP20 || '',
      ERC20: process.env.USDT_WALLET_ERC20 || ''
    }
  });
});

router.get('/performance/stats', async (req, res) => {
  try {
    const logs = await db.getPerformanceLogs();
    let totalPips = 0;
    let pipsGained = 0;
    let pipsLost = 0;
    logs.forEach(log => {
      const p = Number(log.pips) || 0;
      totalPips += p;
      if (log.result === 'Win') {
        pipsGained += Math.abs(p);
      } else if (log.result === 'Loss') {
        pipsLost += Math.abs(p);
      }
    });
    const totalPipMovement = pipsGained + pipsLost;
    const winRate = totalPipMovement > 0 ? Math.round((pipsGained / totalPipMovement) * 100) : 0;
    res.json({ ok: true, totalTrades: logs.length, totalPips, winRate, recent: logs.slice(-5).reverse() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/performance/all', async (req, res) => {
  try {
    const logs = await db.getPerformanceLogs();
    res.json({ ok: true, count: logs.length, logs });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/performance', validateAdminKey, async (req, res) => {
  const { asset, type, result, pips } = req.body;
  if (!asset || !type || !result || pips === undefined) return res.status(400).json({ ok: false, error: 'Missing fields' });
  try {
    await db.logPerformanceAction({ asset, type, result, pips: Number(pips), date: now() });
    res.json({ ok: true, message: 'Performance logged successfully.' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/push/subscribe', async (req, res) => {
  const subscription = req.body;
  if (!subscription || !subscription.endpoint) return res.status(400).json({ ok: false, error: 'Invalid subscription' });
  try {
    await db.addPushSubscription(subscription);
    res.status(201).json({ ok: true, message: 'Subscribed to push notifications.' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/broadcast', async (req, res) => {
  const token = req.body.token || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = req.body.chatId || process.env.TELEGRAM_CHAT_ID;
  const { text, imageBase64, stickerId, type = 'signal' } = req.body;

  if (!token || !chatId) {
    return res.status(400).json({ ok: false, error: 'Missing Telegram credentials.' });
  }
  if (!text && !imageBase64 && !stickerId) {
    return res.status(400).json({ ok: false, error: 'Provide text, image, or sticker.' });
  }

  const TG_BASE = `https://api.telegram.org/bot\${token}`;

  try {
    let telegramError = null;
    try {
      if (imageBase64) {
        const mimeMatch = imageBase64.match(/^data:(image\/[\w+.-]+);base64,/);
        const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
        const ext = mimeType.split('/')[1].replace('+xml', '');
        const base64Data = imageBase64.replace(/^data:image\/[\w+.-]+;base64,/, '');
        const imgBuffer = Buffer.from(base64Data, 'base64');

        const form = new FormData();
        form.append('chat_id', chatId);
        form.append('photo', imgBuffer, {
          filename: `image.\${ext}`,
          contentType: mimeType,
          knownLength: imgBuffer.length,
        });
        if (text) {
          form.append('caption', text);
          form.append('parse_mode', 'Markdown');
        }

        const photoRes = await fetch(`\${TG_BASE}/sendPhoto`, {
          method: 'POST',
          body: form,
          headers: form.getHeaders(),
        });
        const photoData = await photoRes.json();
        if (!photoData.ok) throw new Error(`Telegram image send failed: \${photoData.description || 'Unknown error'}`);
      } else if (text) {
        const msgRes = await fetch(`\${TG_BASE}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown', disable_web_page_preview: false }),
        });
        const msgData = await msgRes.json();
        if (!msgData.ok) throw new Error(msgData.description);
      }

      if (stickerId) {
        const stickerRes = await fetch(`\${TG_BASE}/sendSticker`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, sticker: stickerId }),
        });
        const stickerData = await stickerRes.json();
        if (!stickerData.ok) throw new Error(stickerData.description);
      }
    } catch (tgErr) {
      telegramError = tgErr.message;
    }

    try {
      const entryTime = req.body.entryTime || null;
      await db.addSignal({ id: Date.now(), type, text: text || '', sentAt: now(), entryTime });
    } catch (logErr) {}

    try {
      const subscriptions = await db.getPushSubscriptions();
      const pushPayload = JSON.stringify({
        title: 'New VIP Signal Alert!',
        body: text ? text.substring(0, 100) + '...' : 'A new signal or update was just posted.',
        icon: '/favicon.png',
        url: '/'
      });
      const pushPromises = subscriptions.map(sub => 
        webpush.sendNotification(sub, pushPayload).catch(err => {
          if (err.statusCode === 404 || err.statusCode === 410) {
            return db.deletePushSubscription(sub);
          }
        })
      );
      await Promise.all(pushPromises);
    } catch (pushErr) {}

    res.json({ ok: true, message: 'Broadcast processed' + (telegramError ? ` (Telegram failed: \${telegramError})` : '.') });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/engagement', async (req, res) => {
  req.body.type = 'engagement';
  // internally forward to /broadcast
  // Since we use router here, we can just call the route handler or duplicate the logic.
  // The simplest is to redirect 307
  res.redirect(307, '/api/broadcast');
});

router.get('/signals', async (req, res) => {
  try {
    const signals = await db.getSignals(100);
    signals.sort((a, b) => {
      const ta = typeof a.sentAt === 'string' ? new Date(a.sentAt).getTime() : Number(a.sentAt);
      const tb = typeof b.sentAt === 'string' ? new Date(b.sentAt).getTime() : Number(b.sentAt);
      return tb - ta;
    });
    res.json({ ok: true, count: signals.length, signals });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/signals/history', async (req, res) => {
  try {
    const signals = await db.getSignals(100);
    signals.sort((a, b) => {
      const ta = typeof a.sentAt === 'string' ? new Date(a.sentAt).getTime() : Number(a.sentAt);
      const tb = typeof b.sentAt === 'string' ? new Date(b.sentAt).getTime() : Number(b.sentAt);
      return tb - ta;
    });
    res.json({ ok: true, count: signals.length, signals });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/subscribe', async (req, res) => {
  const { name, telegram, email } = req.body;
  if (!name && !telegram && !email) {
    return res.status(400).json({ ok: false, error: 'Please provide at least one contact method.' });
  }
  try {
    if (telegram) {
      const existing = await db.getSubscriberByTelegram(telegram);
      if (existing) return res.json({ ok: true, message: 'You are already subscribed!' });
    }
    await db.addSubscriber({ name, telegram, email, joinedAt: now() });
    res.json({ ok: true, message: 'Successfully subscribed to free signals!' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/whatsapp-subscribe', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ ok: false, error: 'Phone number required' });
  try {
    await db.addWhatsApp(phone);
    res.json({ ok: true, message: 'Added to WhatsApp broadcast!' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/telegram/bot-username', async (req, res) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return res.json({ ok: true, botUsername: null });
  try {
    const response = await fetch(`https://api.telegram.org/bot\${token}/getMe`);
    const data = await response.json();
    if (data.ok) res.json({ ok: true, botUsername: data.result.username });
    else res.json({ ok: true, botUsername: null });
  } catch (e) {
    res.json({ ok: true, botUsername: null });
  }
});

router.get('/telegram/generate-invite', async (req, res) => {
  const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const VIP_CHAT_ID = process.env.TELEGRAM_VIP_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
  if (!TOKEN || !VIP_CHAT_ID) return res.status(500).send('Telegram not configured.');
  try {
    const response = await fetch(`https://api.telegram.org/bot\${TOKEN}/createChatInviteLink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: VIP_CHAT_ID,
        member_limit: 1,
        expire_date: Math.floor(Date.now() / 1000) + (10 * 60)
      })
    });
    const data = await response.json();
    if (data.ok) res.redirect(data.result.invite_link);
    else res.status(500).send('Error communicating with Telegram.');
  } catch (err) {
    res.status(500).send('Error communicating with Telegram.');
  }
});

// ── User-facing Support Tickets ────────────────────────────────
const { validateUserSession } = require('../middleware/auth');

router.post('/tickets', validateUserSession, async (req, res) => {
  const { subject, message } = req.body;
  if (!subject || !message) return res.status(400).json({ ok: false, error: 'Missing fields' });
  const ticket = {
    userId: req.user._id || req.user.id,
    userEmail: req.user.email,
    subject,
    status: 'Open',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [{ sender: 'User', text: message, timestamp: Date.now() }]
  };
  try {
    const saved = await db.saveTicket(ticket);
    res.json({ ok: true, ticket: saved });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/tickets', validateUserSession, async (req, res) => {
  try {
    const tickets = await db.getUserTickets(req.user.email);
    res.json({ ok: true, tickets });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/tickets/:id/reply', validateUserSession, async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ ok: false, error: 'Message required' });
  try {
    const allTickets = await db.getUserTickets(req.user.email);
    const ticket = allTickets.find(t => t._id && t._id.toString() === req.params.id);
    if (!ticket) return res.status(404).json({ ok: false, error: 'Ticket not found.' });
    ticket.messages.push({ sender: 'User', text: message, timestamp: Date.now() });
    ticket.updatedAt = Date.now();
    await db.saveTicket(ticket);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
