const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { validateAdminKey, validateAdminSession, JWT_SECRET } = require('../middleware/auth');
const { adminLoginLimiter } = require('../middleware/rateLimiters');
const db = require('../services/db');
const { sendEmail } = require('../services/emailService');

const CONFIG_FILE = path.join(process.cwd(), 'data', 'config.json');

async function getAdmin2FASecret() {
  const conf = await db.getAppConfig();
  if (conf && conf.admin2FASecret) return conf.admin2FASecret;
  return process.env.ADMIN_2FA_SECRET || null;
}

async function saveAdmin2FASecret(secret) {
  const conf = await db.getAppConfig();
  conf.admin2FASecret = secret;
  await db.saveAppConfig(conf);
}

// ── Admin 2FA & Login ────────────────────────────────────────
// SECURITY: adminLoginLimiter caps brute-force attempts to 5 per 15 min.
router.post('/login', adminLoginLimiter, validateAdminKey, async (req, res) => {
  try {
    const { totpToken } = req.body;
    const currentSecret = await getAdmin2FASecret();
    if (!currentSecret) {
      return res.json({ ok: false, requiresSetup: true });
    }
    if (!totpToken) {
      return res.status(400).json({ ok: false, error: '2FA code required.' });
    }
    const cleanedToken = String(totpToken).replace(/\s/g, '');
    // SECURITY: '000000' backdoor removed. Use /2fa/reset if locked out.
    const verified = speakeasy.totp.verify({
      secret: currentSecret,
      encoding: 'base32',
      token: cleanedToken,
      window: 1  // ±30 seconds only (was ±5 minutes)
    });
    if (!verified) {
      return res.status(401).json({ ok: false, error: 'Invalid 2FA code.' });
    }
    const jwt = require('jsonwebtoken');
    const adminSessionToken = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ ok: true, adminToken: adminSessionToken });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/2fa/setup', validateAdminKey, async (req, res) => {
  try {
    const existing = await getAdmin2FASecret();
    if (existing) {
      return res.status(400).json({ ok: false, error: '2FA is already configured.' });
    }
    const secret = speakeasy.generateSecret({
      name: `Pips_attendant Admin (${req.headers['x-admin-key'].slice(0, 6)}...)`,
      length: 20
    });
    const qrDataUrl = await QRCode.toDataURL(secret.otpauth_url);
    res.json({ ok: true, secret: secret.base32, qrCode: qrDataUrl, otpauthUrl: secret.otpauth_url });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/2fa/verify-setup', adminLoginLimiter, validateAdminKey, async (req, res) => {
  const { secret, token } = req.body;
  if (!secret || !token) return res.status(400).json({ ok: false, error: 'Secret and token required.' });
  const cleanedToken = String(token).replace(/\s/g, '');
  // SECURITY: '000000' backdoor removed. Only real TOTP codes accepted.
  const verified = speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token: cleanedToken,
    window: 1  // ±30 seconds only (was ±5 minutes)
  });
  if (verified) {
    await saveAdmin2FASecret(secret);
    const jwt = require('jsonwebtoken');
    const adminSessionToken = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ ok: true, adminToken: adminSessionToken });
  } else {
    res.status(401).json({ ok: false, error: 'Invalid token.' });
  }
});

// ── Reset 2FA — clears stored secret so admin can re-scan a fresh QR ──
router.post('/2fa/reset', validateAdminKey, async (req, res) => {
  try {
    const conf = await db.getAppConfig();
    conf.admin2FASecret = null;
    await db.saveAppConfig(conf);
    res.json({ ok: true, message: '2FA secret cleared. Visit /2fa/setup to configure a new one.' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Send Test Email ─────────────────────────────────────────────
router.post('/test-email', validateAdminSession, async (req, res) => {
  const { to } = req.body;
  if (!to) return res.status(400).json({ ok: false, error: 'Recipient email (to) is required.' });
  try {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #111827; padding: 32px; border-radius: 16px; color: #f9fafb;">
        <h2 style="color: #fbbf24; text-align: center; margin-bottom: 8px;">📧 SendGrid Test Email</h2>
        <p style="text-align: center; color: #9ca3af; margin-bottom: 24px; font-size: 14px;">This is a test sent from your Pips Attendant admin panel.</p>
        <div style="background: #1f2937; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
          <p style="color: #10b981; font-size: 18px; font-weight: bold; margin: 0;">✅ Email delivery is working!</p>
        </div>
        <p style="color: #6b7280; font-size: 12px; text-align: center;">Sent at: ${new Date().toUTCString()}</p>
      </div>
    `;
    await sendEmail(to, '🧪 Pips Attendant — SendGrid Test', html);
    res.json({ ok: true, message: `Test email dispatched to ${to}. Check inbox (and spam folder).` });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/system-status', validateAdminSession, async (req, res) => {
  res.json({
    ok: true,
    status: {
      mongodb: process.env.MONGODB_URI ? 'configured' : 'missing',
      telegramBot: process.env.TELEGRAM_BOT_TOKEN ? 'configured' : 'missing',
      telegramChatId: process.env.TELEGRAM_CHAT_ID ? 'configured' : 'missing',
      pushNotifications: (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) ? 'configured' : 'missing'
    }
  });
});

// ── Users & Subscribers ────────────────────────────────────────
router.get('/users', validateAdminSession, async (req, res) => {
  try {
    const users = await db.getUsers();
    const safeUsers = users.map(u => ({ id: u._id || u.id, email: u.email, name: u.name, registeredAt: u.registeredAt, subscriptionExpiry: u.subscriptionExpiry }));
    res.json({ ok: true, count: safeUsers.length, users: safeUsers });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/subscribers', validateAdminSession, async (req, res) => {
  try {
    const subscribers = await db.getSubscribers();
    res.json({ ok: true, count: subscribers.length, subscribers });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/whatsapp-list', validateAdminSession, async (req, res) => {
  try {
    const list = await db.getWhatsAppList();
    res.json({ ok: true, count: list.length, subscribers: list });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── VIP Documents ──────────────────────────────────────────────
router.get('/vip-documents', validateAdminSession, async (req, res) => {
  try {
    const documents = await db.getVipDocuments();
    res.json({ ok: true, documents });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/upload-vip-document', validateAdminSession, async (req, res) => {
  const { filename, fileData } = req.body;
  if (!filename || !fileData) return res.status(400).json({ ok: false, error: 'Missing filename or fileData.' });
  if (fileData.length > 14 * 1024 * 1024) return res.status(400).json({ ok: false, error: 'File size exceeds 10MB limit.' });
  try {
    await db.saveVipDocument(filename, fileData);
    res.json({ ok: true, message: `File ${filename} uploaded successfully.` });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.delete('/delete-vip-document/:filename', validateAdminSession, async (req, res) => {
  const { filename } = req.params;
  if (!filename) return res.status(400).json({ ok: false, error: 'Missing filename.' });
  try {
    const deleted = await db.deleteVipDocument(filename);
    if (deleted) res.json({ ok: true, message: `File ${filename} deleted successfully.` });
    else res.status(404).json({ ok: false, error: 'File not found.' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/update-vip-password', validateAdminSession, async (req, res) => {
  const { vipPassword } = req.body;
  if (!vipPassword || vipPassword.trim().length < 6) {
    return res.status(400).json({ ok: false, error: 'Password must be at least 6 characters.' });
  }
  try {
    const config = await db.getAppConfig();
    // SECURITY: Hash VIP password with bcrypt before storing (cost factor 10).
    config.vipPassword = await bcrypt.hash(vipPassword.trim(), 10);
    config.vipPasswordIsHashed = true; // flag so auth layer knows to use bcrypt.compare
    if (await db.saveAppConfig(config)) res.json({ ok: true, message: 'VIP password updated successfully.' });
    else res.status(500).json({ ok: false, error: 'Failed to save configuration.' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Today's Setup ──────────────────────────────────────────────
router.get('/todays-setup', validateAdminSession, async (req, res) => {
  try {
    const setup = await db.getAdminTodaysSetup();
    res.json({ ok: true, setup });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/upload-todays-setup', validateAdminSession, async (req, res) => {
  const { image, analysis, signalType } = req.body;
  if (!image) return res.status(400).json({ ok: false, error: 'Image required.' });
  try {
    await db.saveTodaysSetup({ image, analysis, signalType, timestamp: new Date().toISOString() });
    res.json({ ok: true, message: "Today's setup uploaded!" });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.delete('/todays-setup', validateAdminSession, async (req, res) => {
  try {
    await db.saveTodaysSetup({ image: null, analysis: null, signalType: null, timestamp: null });
    res.json({ ok: true, message: 'Setup cleared.' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Today's Setup Results ──────────────────────────────────────
router.get('/todays-setup-results', validateAdminSession, async (req, res) => {
  try {
    const setup = await db.getAdminTodaysSetupResults();
    res.json({ ok: true, setup });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/upload-todays-setup-results', validateAdminSession, async (req, res) => {
  const { image } = req.body;
  if (!image) return res.status(400).json({ ok: false, error: 'Image required.' });
  try {
    await db.saveTodaysSetupResults({ image, timestamp: new Date().toISOString() });
    res.json({ ok: true, message: "Today's setup results uploaded!" });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.delete('/todays-setup-results', validateAdminSession, async (req, res) => {
  try {
    await db.saveTodaysSetupResults({ image: null, timestamp: null });
    res.json({ ok: true, message: 'Setup results cleared.' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Crypto Requests ────────────────────────────────────────────
router.get('/crypto-requests', validateAdminSession, async (req, res) => {
  try {
    const requests = await db.getCryptoRequests();
    res.json({ ok: true, count: requests.length, requests });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/approve-crypto-request', validateAdminSession, async (req, res) => {
  const { requestId } = req.body;
  if (!requestId) return res.status(400).json({ ok: false, error: 'Request ID required.' });
  try {
    const requests = await db.getCryptoRequests();
    const found = requests.find(r => r.id === requestId || r._id?.toString() === requestId);
    if (!found) return res.status(404).json({ ok: false, error: 'Request not found.' });

    const userId = found.userId;
    const days = found.plan === '3months' ? 90 : (found.plan === '2months' ? 60 : 30);

    let userEmail = null;
    let userName = null;

    if (userId) {
      const user = await db.getUserById(userId);
      if (user) {
        const currentExpiry = user.subscriptionExpiry && user.subscriptionExpiry > Date.now() ? user.subscriptionExpiry : Date.now();
        user.subscriptionExpiry = currentExpiry + days * 24 * 60 * 60 * 1000;
        await db.saveUser(user);
        userEmail = user.email;
        userName = user.name;
      }
    }

    const ref = found.id || found._id?.toString();
    const generatedAccessCode = crypto.randomBytes(4).toString('hex').toUpperCase();
    
    await db.savePayment('CRYPTO_' + ref, {
      status: 'Success', method: 'crypto', txHash: found.txHash, network: found.network,
      contactInfo: found.contactInfo, userId, plan: found.plan || '1month',
      processedForUser: !!userId, approvedAt: new Date().toISOString(), timestamp: new Date().toISOString(),
      accessCode: generatedAccessCode
    });

    const idStr = found._id?.toString() || found.id;
    await db.updateCryptoRequest(idStr, { status: 'Approved', approvedAt: new Date().toISOString(), accessCode: generatedAccessCode });

    const targetEmail = userEmail || (found.contactInfo && found.contactInfo.includes('@') ? found.contactInfo : null);

    if (targetEmail) {
      try {
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9fafb; padding: 20px; border-radius: 8px;">
          <h2 style="color: #10b981; text-align: center;">Crypto Payment Approved! 🎉</h2>
          <p>Hello ${userName || 'Trader'},</p>
          <p>We have successfully verified your crypto payment.</p>
          <p>Your payment covers <strong>${days} Days of VIP Access!</strong></p>
          
          <div style="background-color: #111827; padding: 20px; border-radius: 12px; text-align: center; margin: 25px 0;">
            <p style="color: #9ca3af; font-size: 13px; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 1px;">Your VIP Access Code</p>
            <p style="color: #10b981; font-size: 28px; font-weight: bold; font-family: monospace; letter-spacing: 3px; margin: 0;">${generatedAccessCode}</p>
          </div>

          ${!userEmail ? '<p>Since you do not have an account yet, you can create one or log in, then use the Access Code above to activate your VIP status.</p>' : '<p>Your account has been automatically upgraded, but you can keep this code for your records.</p>'}

          <p>You can access the VIP portal anytime at <a href="${process.env.APP_URL || 'https://pipsattendant.com'}/premium.html" style="color: #10b981; font-weight: bold;">pipsattendant.com/premium.html</a>.</p>
          <br/>
          <p>Happy Trading,<br/>Pips Attendant Team</p>
          </div>
        `;
        sendEmail(targetEmail, '✅ VIP Access Granted! - Pips_attendant', emailHtml).catch(console.error);
      } catch (err) {
        console.error('Failed to send crypto approval email', err);
      }
    }

    res.json({ ok: true, message: `VIP granted. Access Code: ${generatedAccessCode}` });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/reject-crypto-request', validateAdminSession, async (req, res) => {
  const { requestId } = req.body;
  if (!requestId) return res.status(400).json({ ok: false, error: 'Request ID required.' });
  try {
    const requests = await db.getCryptoRequests();
    const found = requests.find(r => r.id === requestId || r._id?.toString() === requestId);
    if (!found) return res.status(404).json({ ok: false, error: 'Request not found.' });

    const idStr = found._id?.toString() || found.id;
    await db.updateCryptoRequest(idStr, { status: 'Rejected', rejectedAt: new Date().toISOString() });

    res.json({ ok: true, message: 'Request rejected.' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Promos ──────────────────────────────────────────────────────
router.get('/promos', validateAdminSession, async (req, res) => {
  const promos = await db.getPromos();
  const config = await db.getAppConfig();
  res.json({ ok: true, promos, promoCodesEnabled: config?.promoCodesEnabled || false });
});

router.post('/toggle-promo-codes', validateAdminSession, async (req, res) => {
  const { enabled } = req.body;
  const config = await db.getAppConfig();
  config.promoCodesEnabled = !!enabled;
  if (await db.saveAppConfig(config)) {
    res.json({ ok: true, promoCodesEnabled: config.promoCodesEnabled });
  } else {
    res.status(500).json({ ok: false, error: 'Failed to save configuration.' });
  }
});

router.post('/promos', validateAdminSession, async (req, res) => {
  const { code, discountPercentage } = req.body;
  if (!code || !discountPercentage) return res.status(400).json({ ok: false, error: 'Missing fields' });
  await db.savePromo({ code: code.toUpperCase(), discountPercentage: Number(discountPercentage), active: true, createdAt: Date.now() });
  res.json({ ok: true });
});

router.delete('/promos/:code', validateAdminSession, async (req, res) => {
  await db.deletePromo(req.params.code);
  res.json({ ok: true });
});

// ── Tickets ─────────────────────────────────────────────────────
router.get('/tickets', validateAdminSession, async (req, res) => {
  const tickets = await db.getTickets();
  res.json({ ok: true, tickets });
});

router.post('/tickets/:id/reply', validateAdminSession, async (req, res) => {
  const { message } = req.body;
  const ticket = (await db.getTickets()).find(t => t._id?.toString() === req.params.id);
  if (ticket) {
    ticket.messages.push({ sender: 'Admin', text: message, timestamp: Date.now() });
    ticket.status = 'Answered';
    ticket.updatedAt = Date.now();
    await db.saveTicket(ticket);
  }
  res.json({ ok: true });
});

router.post('/tickets/:id/close', validateAdminSession, async (req, res) => {
  const ticket = (await db.getTickets()).find(t => t._id?.toString() === req.params.id);
  if (ticket) {
    ticket.status = 'Closed';
    ticket.updatedAt = Date.now();
    await db.saveTicket(ticket);
  }
  res.json({ ok: true });
});

// ── Broadcast to Tickets ───────────────────────────────────────────
router.post('/broadcast-to-tickets', validateAdminSession, async (req, res) => {
  const { message } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ ok: false, error: 'Message is required.' });
  }
  try {
    const tickets = await db.getTickets();
    const openTickets = tickets.filter(t => t.status === 'Open' || t.status === 'Answered');

    for (const ticket of openTickets) {
      if (!ticket.messages) ticket.messages = [];
      ticket.messages.push({
        sender: 'Admin',
        text: `📣 Admin Broadcast:\n\n${message.trim()}`,
        timestamp: Date.now(),
        isBroadcast: true
      });
      ticket.updatedAt = Date.now();
      await db.saveTicket(ticket);
    }

    res.json({
      ok: true,
      count: openTickets.length,
      message: `Broadcast posted to ${openTickets.length} ticket(s).`
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Analytics ────────────────────────────────────────────────
router.get('/analytics', validateAdminSession, async (req, res) => {
  try {
    const users = await db.getUsers();
    const now = Date.now();
    let activeVIPs = 0;

    const last7Days = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now - i * 24 * 60 * 60 * 1000);
      last7Days[d.toISOString().split('T')[0]] = 0;
    }

    users.forEach(user => {
      if (user.subscriptionExpiry && user.subscriptionExpiry > now) activeVIPs++;
      const dateStr = (user.registeredAt || '').split('T')[0];
      if (last7Days[dateStr] !== undefined) last7Days[dateStr]++;
    });

    let totalKES = 0, totalUSDT = 0, mrrKES = 0, mrrUSDT = 0;
    const payments = await db.getAllPayments();
    const cryptoPayments = await db.getCryptoRequests();

    payments.filter(p => p.status === 'Success').forEach(p => {
      const amount = Number(p.amount) || 0;
      totalKES += amount;
      if (p.plan === '1month') mrrKES += amount;
      if (p.plan === '2months') mrrKES += amount / 2;
      if (p.plan === '3months') mrrKES += amount / 3;
    });

    cryptoPayments.filter(p => p.status === 'Approved').forEach(p => {
      const usdtMap = { '1month': 50, '2months': 95, '3months': 140 };
      const amount = usdtMap[p.plan] || 50;
      totalUSDT += amount;
      if (p.plan === '1month') mrrUSDT += amount;
      if (p.plan === '2months') mrrUSDT += amount / 2;
      if (p.plan === '3months') mrrUSDT += amount / 3;
    });

    res.json({
      ok: true,
      totalUsers: users.length,
      activeVIPs,
      totalKES,
      totalUSDT,
      mrrKES: Math.round(mrrKES),
      mrrUSDT: Math.round(mrrUSDT),
      chartData: {
        labels: Object.keys(last7Days),
        values: Object.values(last7Days)
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
