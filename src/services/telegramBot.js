const logger = require('../utils/logger');
const fetch = require('node-fetch');
const { getPerformanceLogs, getUserById, saveUser } = require('./db');

async function sendTelegramMessage(chatId, text, opts = {}) {
  const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!TOKEN || TOKEN.includes('your_telegram_bot_token')) {
    logger.warn('[Telegram Bot] TELEGRAM_BOT_TOKEN not configured or is placeholder.');
    return { ok: false, error: 'Token not set' };
  }
  if (!chatId || String(chatId).includes('your_vip_group_chat_id')) {
    logger.warn('[Telegram Bot] Chat ID not configured or is placeholder.');
    return { ok: false, error: 'Chat ID not set' };
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown', disable_web_page_preview: true, ...opts })
    });
    const data = await res.json();
    if (!data.ok) {
      logger.warn(`[Telegram Bot] API returned error: ${data.description}`);
    }
    return data;
  } catch (err) {
    logger.error(`[Telegram Bot] Fetch error: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

function formatSignalTelegramHtml(signal) {
  const isBuy = String(signal.direction).toUpperCase() === 'BUY';
  const dirEmoji = isBuy ? '🟢' : '🔴';
  const actionText = isBuy ? 'BUY' : 'SELL';
  const subText = isBuy ? 'LONG' : 'SHORT';
  
  const tf = signal.timeframe || 'H1';
  const entry = signal.entry_price || signal.price;
  const sl = signal.stop_loss;
  const tp1 = signal.take_profit_1;
  const tp2 = signal.take_profit_2;
  const tp3 = signal.take_profit_3;
  const rr = signal.risk_reward_ratio || '2.5';
  const conf = signal.confidence || 90;
  const justification = signal.technical_justification || signal.notes;
  const source = signal.source === 'AUTO' ? '⚡ AI Confluence Engine' : '👨‍💼 Trading Desk Verified';

  let msg = `🚨 <b>PIPS ATTENDANT — NEW SIGNAL ALERT</b> 🚨\n\n`;
  msg += `📊 <b>Pair:</b> <code>${signal.symbol}</code> (${tf})\n`;
  msg += `🎯 <b>Action:</b> ${dirEmoji} <b>${actionText} (${subText})</b>\n`;
  msg += `💵 <b>Entry Zone:</b> <code>${entry}</code>\n`;
  msg += `🛑 <b>Stop Loss:</b> <code>${sl}</code>\n`;
  msg += `🎯 <b>Take Profit 1:</b> <code>${tp1}</code>\n`;
  if (tp2) msg += `🎯 <b>Take Profit 2:</b> <code>${tp2}</code>\n`;
  if (tp3) msg += `🎯 <b>Take Profit 3:</b> <code>${tp3}</code>\n`;
  msg += `⚖️ <b>Risk / Reward:</b> <code>1:${rr}</code>\n`;
  msg += `🔥 <b>Confidence:</b> <code>${conf}%</code>\n`;
  msg += `📡 <b>Source:</b> ${source}\n\n`;

  if (justification) {
    const cleanJustification = String(justification).replace(/</g, '&lt;').replace(/>/g, '&gt;');
    msg += `🧠 <b>Confluence Analysis:</b>\n<i>${cleanJustification}</i>\n\n`;
  }

  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `⚠️ <b>Risk Management:</b> Risk max 1-2% per position. Always set SL.\n`;
  const terminalUrl = process.env.APP_URL ? `${process.env.APP_URL}/terminal/` : 'https://www.pipsattendant.com/terminal/';
  msg += `⚡ <a href="${terminalUrl}">Open Live Signal Center</a>`;

  return msg;
}

async function broadcastSignalToTelegram(signal) {
  const VIP_CHAT_ID = process.env.TELEGRAM_VIP_CHAT_ID;
  const GENERAL_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
  const html = formatSignalTelegramHtml(signal);

  const targetChats = [];
  if (VIP_CHAT_ID && !VIP_CHAT_ID.includes('your_')) targetChats.push(VIP_CHAT_ID);
  if (GENERAL_CHAT_ID && !GENERAL_CHAT_ID.includes('your_') && !targetChats.includes(GENERAL_CHAT_ID)) {
    targetChats.push(GENERAL_CHAT_ID);
  }

  if (targetChats.length === 0) {
    logger.warn('[Telegram Broadcast] No target Telegram Chat IDs configured (TELEGRAM_VIP_CHAT_ID / TELEGRAM_CHAT_ID).');
    return { ok: false, message: 'No chat IDs configured', count: 0, channels: [] };
  }

  let sentCount = 0;
  const sentChannels = [];
  for (const chatId of targetChats) {
    const res = await sendTelegramMessage(chatId, html, { parse_mode: 'HTML' });
    if (res && res.ok) {
      sentCount++;
      sentChannels.push(chatId === VIP_CHAT_ID ? 'VIP' : 'General');
    }
  }

  logger.info(`[Telegram Broadcast] Broadcasted ${signal.symbol} ${signal.direction} to ${sentCount}/${targetChats.length} Telegram chats.`);
  return { ok: sentCount > 0, count: sentCount, total: targetChats.length, channels: sentChannels };
}

async function handleTelegramUpdate(update) {
  if (!update.message) return;
  const msg = update.message;
  const chatId = msg.chat.id;
  const text = msg.text || '';

  if (text.startsWith('/status')) {
    try {
      const { getUserByTelegramId } = require('./db');
      const user = await getUserByTelegramId(String(chatId));
      if (!user) {
        await sendTelegramMessage(chatId, '❌ Your Telegram account is not linked to any Pips Attendant account.\n\nPlease log in to the portal and link your account.');
        return;
      }

      const now = Date.now();
      const isVip = user.subscriptionExpiry && user.subscriptionExpiry > now;
      const tier = user.subscriptionTier || 'Gold';
      
      if (!isVip) {
        await sendTelegramMessage(chatId, `⚠️ *VIP Expired*\n\nYour subscription has expired.\n[Renew here](${process.env.APP_URL || 'https://www.pipsattendant.com'}/premium.html)`);
        return;
      }

      const expiryDate = new Date(user.subscriptionExpiry);
      const daysLeft = Math.ceil((user.subscriptionExpiry - now) / (1000 * 60 * 60 * 24));
      const expiryStr = expiryDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      
      const tierIcon = tier.toLowerCase().includes('platinum') ? '💎 Platinum' : '⭐ Gold';
      
      const reply = `✅ *VIP Active*\n\n*Name:* ${user.name || user.email}\n*Tier:* ${tierIcon}\n*Expires:* ${expiryStr} (${daysLeft} day${daysLeft !== 1 ? 's' : ''} left)\n\n[Access Portal](${process.env.APP_URL || 'https://www.pipsattendant.com'}/premium.html)`;
      
      await sendTelegramMessage(chatId, reply);
    } catch (err) {
      await sendTelegramMessage(chatId, 'Could not fetch status at this time.');
    }
  } else if (text.startsWith('/stats')) {
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
    await sendTelegramMessage(chatId, '👋 Welcome to *Pips Attendant Bot*!\n\nCommands:\n/status — Check your VIP subscription\n/stats — View trading stats\n\nTo link your account, use the button in your Pips Attendant profile.', { parse_mode: 'Markdown' });
  }
}

async function registerTelegramWebhook() {
  const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const BASE_URL = process.env.RENDER_EXTERNAL_URL || process.env.APP_URL;
  if (!TOKEN || !BASE_URL) {
    logger.warn('[Telegram Bot] No token or URL set — skipping webhook registration.');
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
      logger.info(`[Telegram Bot] Webhook registered: ${webhookUrl}`);
    } else {
      logger.error('[Telegram Bot] Webhook registration failed:', data.description);
    }
  } catch (err) {
    logger.error('[Telegram Bot] Failed to register webhook:', err.message);
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
    logger.warn(`[Auto-Kick] Failed to kick TG: ${telegramId}:`, e.message);
  }
}

module.exports = {
  sendTelegramMessage,
  broadcastSignalToTelegram,
  formatSignalTelegramHtml,
  handleTelegramUpdate,
  registerTelegramWebhook,
  kickUserFromTelegram
};
