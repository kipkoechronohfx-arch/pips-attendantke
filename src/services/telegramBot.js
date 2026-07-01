const fetch = require('node-fetch');
const { getPerformanceLogs, getUserById, saveUser } = require('./db');

async function sendTelegramMessage(chatId, text, opts = {}) {
  const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!TOKEN) return;
  await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown', disable_web_page_preview: true, ...opts })
  });
}

async function handleTelegramUpdate(update) {
  if (!update.message) return;
  const msg = update.message;
  const chatId = msg.chat.id;
  const text = msg.text || '';

  if (text.startsWith('/stats')) {
    try {
      const logs = await getPerformanceLogs();
      let pipsGained = 0, pipsLost = 0;
      let wins = 0, losses = 0;
      logs.forEach(log => {
        if (log.type === 'win') { wins++; pipsGained += (log.pips || 0); }
        else if (log.type === 'loss') { losses++; pipsLost += (log.pips || 0); }
      });
      const totalPips = pipsGained + pipsLost;
      const winRate = totalPips > 0 ? Math.round((pipsGained / totalPips) * 100) : 0;
      const netPips = pipsGained - pipsLost;
      const replyText = `📊 *Pips Attendant Stats*\n\nWin Rate (Pips): ${winRate}%\nNet Pips: ${netPips > 0 ? '+'+netPips : netPips}\nTotal Trades: ${wins + losses}\n\n[Visit Dashboard](https://pips-attendantke.onrender.com)`;
      await sendTelegramMessage(chatId, replyText);
    } catch (err) {
      await sendTelegramMessage(chatId, 'Could not fetch stats at this time.');
    }
  } else if (text.startsWith('/start')) {
    const parts = text.trim().split(' ');
    if (parts.length === 2) {
      const userId = parts[1];
      const user = await getUserById(userId);
      if (user) {
        user.telegramId = String(chatId);
        await saveUser(user);
        await sendTelegramMessage(chatId, `✅ *Account Linked!*\n\nYour Telegram is now linked to *${user.name || user.email}* on Pips Attendant.\n\nYou will be automatically removed from VIP when your subscription expires.`, { parse_mode: 'Markdown' });
        return;
      }
    }
    await sendTelegramMessage(chatId, '👋 Welcome to *Pips Attendant Bot*!\n\nCommands:\n/stats — View trading stats\n\nTo link your account, use the button in your Pips Attendant profile.', { parse_mode: 'Markdown' });
  }
}

async function registerTelegramWebhook() {
  const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const BASE_URL = process.env.RENDER_EXTERNAL_URL || process.env.APP_URL;
  if (!TOKEN || !BASE_URL) {
    console.warn('[Telegram Bot] No token or URL set — skipping webhook registration.');
    return;
  }
  const webhookUrl = `${BASE_URL}/telegram-webhook`;
  try {
    const res = await fetch(`https://api.telegram.org/bot${TOKEN}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl, drop_pending_updates: true })
    });
    const data = await res.json();
    if (data.ok) {
      console.log(`[Telegram Bot] Webhook registered: ${webhookUrl}`);
    } else {
      console.error('[Telegram Bot] Webhook registration failed:', data.description);
    }
  } catch (err) {
    console.error('[Telegram Bot] Failed to register webhook:', err.message);
  }
}

async function kickUserFromTelegram(telegramId) {
  const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const VIP_CHAT_ID = process.env.TELEGRAM_VIP_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
  if (!TOKEN || !VIP_CHAT_ID || !telegramId) return;
  try {
    await fetch(`https://api.telegram.org/bot${TOKEN}/banChatMember`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: VIP_CHAT_ID, user_id: telegramId, revoke_messages: false })
    });
    await fetch(`https://api.telegram.org/bot${TOKEN}/unbanChatMember`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: VIP_CHAT_ID, user_id: telegramId, only_if_banned: true })
    });
    await sendTelegramMessage(telegramId, `⚠️ Your Pips Attendant VIP subscription has expired. You have been removed from the VIP group.\n\nRenew at: ${process.env.APP_URL || 'https://pips-attendantke.onrender.com'}/premium.html`);
  } catch(e) {
    console.warn(`[Auto-Kick] Failed to kick TG: ${telegramId}:`, e.message);
  }
}

module.exports = {
  sendTelegramMessage,
  handleTelegramUpdate,
  registerTelegramWebhook,
  kickUserFromTelegram
};
