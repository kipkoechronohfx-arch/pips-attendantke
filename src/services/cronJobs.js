const cron = require("node-cron");
const db = require("./db");
const { sendEmail } = require("./emailService");
const logger = require("../utils/logger");
const fetch = require('node-fetch');
const FormData = require('form-data');

// ── Weekly Performance Recap ──────────────────────────────────────────────────
async function sendWeeklyRecap() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_VIP_CHAT_ID || process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    const err = 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set.';
    logger.warn(`[Cron] Weekly recap skipped: ${err}`);
    return { ok: false, error: err };
  }

  try {
    // Fetch all signals and filter to the past 7 days
    const allSignals = await db.getSignals(0);
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const weekSignals = allSignals.filter(s => {
      const t = typeof s.sentAt === 'string' ? new Date(s.sentAt).getTime() : Number(s.sentAt);
      return t >= weekAgo && s.type === 'signal';
    });

    // Compute stats
    let wins = 0, losses = 0, pipsGained = 0, pipsLost = 0;
    for (const s of weekSignals) {
      if (s.outcome === 'TP Hit') {
        wins++;
        pipsGained += Number(s.pips) || 0;
      } else if (s.outcome === 'SL Hit') {
        losses++;
        pipsLost += Number(s.pips) || 0;
      }
    }

    const total = wins + losses;
    if (total === 0) {
      logger.info(`[Cron] Weekly recap skipped: No resolved signals this week.`);
      return { ok: false, error: 'No resolved signals found in the past 7 days.' };
    }

    const winRate = Math.round((wins / total) * 100);
    // Fix JS floating point math (e.g., 50.300000001)
    let netPips = pipsGained - pipsLost;
    netPips = Number(netPips.toFixed(1));

    // Get date range label e.g. "Jul 21 – Jul 27"
    const now = new Date();
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fmt = d => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    const weekLabel = `${fmt(weekStart)} – ${fmt(now)}`;

    const ratingEmoji = winRate >= 80 ? '🔥' : winRate >= 60 ? '✅' : '📊';

    let msg = `📊 *WEEKLY PERFORMANCE RECAP* 📊\n`;
    msg += `🗓️ *${weekLabel}*\n\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `✅ Wins: *${wins}*\n`;
    msg += `❌ Losses: *${losses}*\n`;
    msg += `🎯 Win Rate: *${winRate}%* ${ratingEmoji}\n`;
    msg += `📈 Net Pips: *${netPips >= 0 ? '+' : ''}${netPips} pips*\n`;
    msg += `🔢 Total Signals: *${weekSignals.length}*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

    let generalMsg = msg + `These results are from our *VIP signals only* — the ones you've been missing. 👀\n\n`;
    generalMsg += `🚀 *Join VIP today and never miss a winning signal again!*\n`;
    generalMsg += `👉 ${process.env.APP_URL || 'https://www.pipsattendant.com'}/premium.html`;

    let vipMsg = msg + `Stay consistent, manage risk, and let's go even harder next week! 💪💰`;

    const tgUrl = `https://api.telegram.org/bot${token}/sendMessage`;
    
    // 1. Send FOMO message to General
    const generalChatId = process.env.TELEGRAM_CHAT_ID;
    let result = { ok: true };
    
    if (generalChatId) {
      const response = await fetch(tgUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: generalChatId, text: generalMsg, parse_mode: 'Markdown', disable_web_page_preview: true })
      });
      result = await response.json();
    }

    // 2. Send standard message to VIP
    const vipChatId = process.env.TELEGRAM_VIP_CHAT_ID;
    if (vipChatId && vipChatId !== generalChatId) {
      await fetch(tgUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: vipChatId, text: vipMsg, parse_mode: 'Markdown' })
      }).catch(err => logger.error(`[Cron] Weekly recap VIP send error: ${err.message}`));
    }

    if (result.ok || !generalChatId) {
      const successMsg = `Weekly recap sent to General & VIP (${weekLabel}): ${wins}W/${losses}L, ${netPips >= 0 ? '+' : ''}${netPips} pips.`;
      logger.info(`[Cron] ${successMsg}`);
      return { ok: true, message: successMsg };
    } else {
      logger.error(`[Cron] Weekly recap Telegram error: ${result.description}`);
      return { ok: false, error: result.description };
    }
  } catch (err) {
    logger.error(`[Cron] Weekly recap job failed: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

// ── Monthly Performance Recap ─────────────────────────────────────────────────
// Fires on the 1st of every month. Reads from public performance logs (same
// source as /api/performance/stats) and blasts to the GENERAL channel to create
// FOMO and push free members to upgrade to VIP.
async function sendMonthlyRecap() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  // Target general channel for FOMO — free members should see this
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    const err = 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set.';
    logger.warn(`[Cron] Monthly recap skipped: ${err}`);
    return { ok: false, error: err };
  }

  try {
    const logs = await db.getPerformanceLogs();
    const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    const monthLogs = logs.filter(log => {
      const t = log.date ? new Date(log.date).getTime() : 0;
      return t >= monthAgo;
    });

    let wins = 0, losses = 0, breakeven = 0;
    let pipsGained = 0, pipsLost = 0;
    let bestTrade = null;

    for (const log of monthLogs) {
      const pips = Math.abs(Number(log.pips) || 0);
      if (log.result === 'Win') {
        wins++;
        pipsGained += pips;
        if (!bestTrade || pips > (bestTrade.pips || 0)) {
          bestTrade = { pair: log.asset || 'Unknown', pips };
        }
      } else if (log.result === 'Loss') {
        losses++;
        pipsLost += pips;
      } else if (log.result === 'Breakeven') {
        breakeven++;
      }
    }

    const total = wins + losses;
    if (total === 0) {
      logger.info(`[Cron] Monthly recap skipped: No resolved performance logs in the past 30 days.`);
      return { ok: false, error: 'No resolved performance logs in the past 30 days.' };
    }

    const winRate = Math.round((wins / total) * 100);
    const netPips = Number((pipsGained - pipsLost).toFixed(1));

    // Month label: name of the month just ended
    const now = new Date();
    const monthName = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const ratingEmoji = winRate >= 80 ? '🔥🔥' : winRate >= 60 ? '🔥' : '💪';

    let msg = `📆 *MONTHLY PERFORMANCE REPORT* 📆\n`;
    msg += `🗓️ *${monthName} — Full Month Recap*\n\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `🔢 *Total Signals:* ${monthLogs.length}\n`;
    msg += `✅ *Wins:* ${wins}\n`;
    msg += `❌ *Losses:* ${losses}\n`;
    if (breakeven > 0) msg += `🛡️ *Breakeven:* ${breakeven}\n`;
    msg += `🎯 *Win Rate:* ${winRate}% ${ratingEmoji}\n`;
    msg += `💰 *Net Pips:* ${netPips >= 0 ? '+' : ''}${netPips} pips\n`;
    if (bestTrade) msg += `🏆 *Best Trade:* ${bestTrade.pair} (+${bestTrade.pips} pips)\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `These results are from our *VIP signals only* — the ones you've been missing. 👀\n\n`;
    msg += `🚀 *Join VIP today and never miss a winning signal again!*\n`;
    msg += `👉 ${process.env.APP_URL || 'https://www.pipsattendant.com'}/premium.html`;

    const tgUrl = `https://api.telegram.org/bot${token}/sendMessage`;
    
    // 1. Send FOMO message to General
    const response = await fetch(tgUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'Markdown', disable_web_page_preview: true })
    });
    const result = await response.json();

    // 2. Send congratulatory message to VIP
    const vipChatId = process.env.TELEGRAM_VIP_CHAT_ID;
    if (vipChatId && vipChatId !== chatId) {
      let vipMsg = `📆 *MONTHLY PERFORMANCE REPORT* 📆\n`;
      vipMsg += `🗓️ *${monthName} — Full Month Recap*\n\n`;
      vipMsg += `━━━━━━━━━━━━━━━━━━━━━━━\n`;
      vipMsg += `🔢 *Total Signals:* ${monthLogs.length}\n`;
      vipMsg += `✅ *Wins:* ${wins}\n`;
      vipMsg += `❌ *Losses:* ${losses}\n`;
      if (breakeven > 0) vipMsg += `🛡️ *Breakeven:* ${breakeven}\n`;
      vipMsg += `🎯 *Win Rate:* ${winRate}% ${ratingEmoji}\n`;
      vipMsg += `💰 *Net Pips:* ${netPips >= 0 ? '+' : ''}${netPips} pips\n`;
      if (bestTrade) vipMsg += `🏆 *Best Trade:* ${bestTrade.pair} (+${bestTrade.pips} pips)\n`;
      vipMsg += `━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      vipMsg += `An incredible month for Pips Attendant VIP members! Thank you for trusting us with your trading journey. Let's make next month even better! 🚀💰`;

      await fetch(tgUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: vipChatId, text: vipMsg, parse_mode: 'Markdown' })
      }).catch(err => logger.error(`[Cron] Monthly recap VIP send error: ${err.message}`));
    }

    if (result.ok) {
      const successMsg = `Monthly recap sent to General & VIP (${monthName}): ${wins}W/${losses}L, ${netPips >= 0 ? '+' : ''}${netPips} pips.`;
      logger.info(`[Cron] ${successMsg}`);
      return { ok: true, message: successMsg };
    } else {
      logger.error(`[Cron] Monthly recap Telegram error: ${result.description}`);
      return { ok: false, error: result.description };
    }
  } catch (err) {
    logger.error(`[Cron] Monthly recap job failed: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

function buildRenewalReminderHtml({ userName, expiryDate, renewalUrl, daysLeft }) {
  return `
  <!DOCTYPE html>
  <html>
  <body style="margin:0;padding:0;background:#0d0800;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#111827;border-radius:16px;border:1px solid rgba(251,191,36,0.2);overflow:hidden;">
    <div style="background:linear-gradient(135deg,#f59e0b,#fbbf24);padding:28px 32px;text-align:center;">
      <h1 style="margin:0;color:#0d0800;font-size:22px;font-weight:800;">&#x23F0; VIP Access Expiring Soon</h1>
      <p style="margin:6px 0 0;color:#78350f;font-size:13px;">Pips Attendant VIP</p>
    </div>
    <div style="padding:32px;">
      <p style="color:#9ca3af;font-size:14px;margin:0 0 16px;">Hello <strong style="color:#f9fafb;">${userName || "Trader"}</strong>,</p>
      <p style="color:#9ca3af;font-size:14px;margin:0 0 24px;">
        Your VIP access expires in <strong style="color:#fbbf24;">${daysLeft} day${daysLeft !== 1 ? "s" : ""}</strong> on <strong style="color:#f9fafb;">${expiryDate}</strong>.
        Renew now to keep your full access to signals, tools, and the Platinum Lounge.
      </p>
      <div style="background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.2);border-radius:12px;padding:20px;margin-bottom:28px;">
        <p style="color:#fbbf24;font-size:13px;font-weight:700;margin:0 0 8px;">What you will lose access to:</p>
        <ul style="color:#9ca3af;font-size:13px;margin:0;padding-left:18px;line-height:1.8;">
          <li>Live Trading Signals (XAUUSD, Forex, Crypto)</li>
          <li>Daily Market Brief and Analysis</li>
          <li>Mentorship Bookings (Platinum)</li>
          <li>VIP PDF Resources and Trade Journal</li>
        </ul>
      </div>
      <div style="text-align:center;">
        <a href="${renewalUrl}" style="background:linear-gradient(135deg,#f59e0b,#fbbf24);color:#0d0800;font-weight:800;padding:14px 32px;border-radius:12px;text-decoration:none;display:inline-block;font-size:15px;">Renew My VIP Access</a>
      </div>
    </div>
    <div style="padding:16px 32px;border-top:1px solid rgba(255,255,255,0.06);text-align:center;">
      <p style="color:#4b5563;font-size:11px;margin:0;">Pips Attendant | support@pipsattendant.com</p>
    </div>
  </div>
  </body></html>`;
}

function buildTrialExpiryHtml({ userName, renewalUrl }) {
  return `
  <!DOCTYPE html>
  <html>
  <body style="margin:0;padding:0;background:#0d0800;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#111827;border-radius:16px;border:1px solid rgba(251,191,36,0.2);overflow:hidden;">
    <div style="background:linear-gradient(135deg,#f59e0b,#fbbf24);padding:28px 32px;text-align:center;">
      <h1 style="margin:0;color:#0d0800;font-size:22px;font-weight:800;">&#x23F0; Your Free Trial Ends Tomorrow!</h1>
    </div>
    <div style="padding:32px;">
      <p style="color:#9ca3af;font-size:14px;margin:0 0 16px;">Hello <strong style="color:#f9fafb;">${userName || "Trader"}</strong>,</p>
      <p style="color:#9ca3af;font-size:14px;margin:0 0 24px;">
        We hope you've enjoyed your 5-day Platinum trial! Your free access will expire in exactly 24 hours.
        Don't lose your edge in the markets—upgrade now and keep receiving exclusive VIP signals and mentorship.
      </p>
      <div style="background:rgba(251,191,36,0.08);border:1px dashed #fbbf24;border-radius:12px;padding:20px;margin-bottom:28px;text-align:center;">
        <p style="color:#fbbf24;font-size:15px;font-weight:800;margin:0 0 8px;">🎁 Special Offer</p>
        <p style="color:#9ca3af;font-size:13px;margin:0;">Use code <strong style="color:#fff;background:#000;padding:2px 6px;border-radius:4px;letter-spacing:1px;">TRIAL10</strong> at checkout for 10% off your first subscription!</p>
      </div>
      <div style="text-align:center;">
        <a href="${renewalUrl}" style="background:linear-gradient(135deg,#f59e0b,#fbbf24);color:#0d0800;font-weight:800;padding:14px 32px;border-radius:12px;text-decoration:none;display:inline-block;font-size:15px;">Upgrade Now</a>
      </div>
    </div>
    <div style="padding:16px 32px;border-top:1px solid rgba(255,255,255,0.06);text-align:center;">
      <p style="color:#4b5563;font-size:11px;margin:0;">Pips Attendant | support@pipsattendant.com</p>
    </div>
  </div>
  </body></html>`;
}

async function runExpiryReminders() {
  try {
    const users = await db.getUsers();
    const now = Date.now();
    const appUrl = process.env.APP_URL || "https://www.pipsattendant.com";
    let sent = 0;
    for (const user of users) {
      if (!user.email || !user.subscriptionExpiry) continue;
      const expiry = user.subscriptionExpiry;
      const daysLeft = Math.ceil((expiry - now) / (24 * 60 * 60 * 1000));
      if (daysLeft === 3 || daysLeft === 1) {
        if (user.isTrial && daysLeft !== 1) continue; // Trial users only get day 1 reminder

        const reminderKey = `reminder_${daysLeft}d_${expiry}`;
        if (user[reminderKey]) continue;
        try {
          let html;
          let subject;
          if (user.isTrial) {
            html = buildTrialExpiryHtml({
              userName: user.name,
              renewalUrl: `${appUrl}/premium.html`
            });
            subject = "⏳ Your 5-Day VIP Trial Ends Tomorrow!";
          } else {
            html = buildRenewalReminderHtml({
              userName: user.name,
              expiryDate: new Date(expiry).toDateString(),
              renewalUrl: `${appUrl}/premium.html`,
              daysLeft
            });
            subject = `Your Pips Attendant VIP expires in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}`;
          }
          await sendEmail(user.email, subject, html);
          user[reminderKey] = true;
          await db.saveUser(user);
          sent++;
          logger.info(`[Cron] Expiry reminder sent to ${user.email} (${daysLeft} days left)`);
        } catch (err) {
          logger.warn(`[Cron] Failed to send reminder to ${user.email}: ${err.message}`);
        }
      }
    }
    if (sent > 0) logger.info(`[Cron] Expiry reminders: sent ${sent} emails.`);
  } catch (err) {
    logger.error(`[Cron] Expiry reminder job failed: ${err.message}`);
  }
}

const BADGE_DEFINITIONS = [
  { id: "first_trade", name: "First Trade", icon: "??", description: "Logged your first trade", check: (e) => e.length >= 1 },
  { id: "pips_100", name: "100 Pips Club", icon: "??", description: "Accumulated 100+ net pips", check: (e) => e.reduce((s, x) => s + (Number(x.pl) || 0), 0) >= 100 },
  { id: "pips_500", name: "500 Pips Elite", icon: "??", description: "Accumulated 500+ net pips", check: (e) => e.reduce((s, x) => s + (Number(x.pl) || 0), 0) >= 500 },
  {
    id: "hot_streak", name: "Hot Streak", icon: "??", description: "5 consecutive winning trades",
    check: (entries) => {
      let streak = 0;
      for (const e of [...entries].reverse()) {
        if ((Number(e.pl) || 0) > 0) { streak++; if (streak >= 5) return true; } else streak = 0;
      }
      return false;
    }
  },
  { id: "trades_25", name: "Active Trader", icon: "??", description: "Logged 25+ trades", check: (e) => e.length >= 25 },
  { id: "profitable", name: "Profitable", icon: "?", description: "Positive net P&L overall", check: (e) => e.reduce((s, x) => s + (Number(x.pl) || 0), 0) > 0 }
];

async function computeAndSaveBadges(userId) {
  try {
    const user = await db.getUserById(userId);
    if (!user) return [];
    const entries = await db.getJournalEntries(userId);
    const earnedBadges = BADGE_DEFINITIONS
      .filter(b => b.check(entries))
      .map(b => ({ id: b.id, name: b.name, icon: b.icon, description: b.description }));
    user.badges = earnedBadges;
    await db.saveUser(user);
    return earnedBadges;
  } catch (err) {
    logger.warn(`[Badges] Failed to compute for ${userId}: ${err.message}`);
    return [];
  }
}

async function autoArchiveSignals() {
  try {
    const signals = await db.getSignals(100);
    const now = Date.now();
    const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
    let archivedCount = 0;
    
    for (const s of signals) {
      if (s.type === 'signal' && (!s.outcome || s.outcome === 'Running')) {
        const sentTime = typeof s.sentAt === 'string' ? new Date(s.sentAt).getTime() : Number(s.sentAt);
        if (now - sentTime > TTL_MS) {
          await db.updateSignalOutcome(s.id || s._id, 'Expired');
          archivedCount++;
        }
      }
    }
    if (archivedCount > 0) {
      logger.info(`[Cron] Auto-archived ${archivedCount} expired signals.`);
    }
  } catch (err) {
    logger.error(`[Cron] Auto-archive failed: ${err.message}`);
  }
}

async function processScheduledAlerts() {
  try {
    const alerts = await db.getScheduledAlerts();
    const now = Date.now();
    for (const alert of alerts) {
      if (!alert.sent && alert.scheduledTime <= now) {
        // Send email to free users if target is 'free'
        if (alert.target === 'free' || alert.target === 'all') {
          const allUsers = await db.getUsers();
          const freeUsers = allUsers.filter(u => !u.subscriptionExpiry || u.subscriptionExpiry < now);
          for (const u of freeUsers) {
            if (u.email) sendEmail(u.email, '⏰ Pips Attendant Scheduled Alert', `<p>${alert.message}</p>`).catch(() => {});
          }
        }
        // Send email to VIP users if target is 'vip'
        if (alert.target === 'vip' || alert.target === 'all') {
          const allUsers = await db.getUsers();
          const vipUsers = allUsers.filter(u => u.subscriptionExpiry && u.subscriptionExpiry > now);
          for (const u of vipUsers) {
            if (u.email) sendEmail(u.email, '💎 VIP Scheduled Alert', `<p>${alert.message}</p>`).catch(() => {});
          }
        }
        alert.sent = true;
        await db.saveScheduledAlert(alert);
        logger.info(`[Cron] Sent scheduled alert: ${alert.message.substring(0, 20)}...`);
      }
    }
  } catch (err) {
    logger.error(`[Cron] Scheduled alerts failed: ${err.message}`);
  }
}

async function processScheduledBroadcasts() {
  try {
    const broadcasts = await db.getScheduledBroadcasts();
    const now = Date.now();
    for (const b of broadcasts) {
      if (b.scheduledTime <= now) {
        logger.info(`[Cron] Processing scheduled broadcast ID: ${b._id}`);
        const token = process.env.TELEGRAM_BOT_TOKEN;
        if (!token) {
          logger.warn(`[Cron] Missing Telegram Token for broadcast ${b._id}`);
          continue;
        }

        const TG_BASE = `https://api.telegram.org/bot${token}`;
        const chatIds = Array.isArray(b.chatId) ? b.chatId : String(b.chatId).split(',').map(id => id.trim()).filter(Boolean);
        
        let telegramError = null;
        for (const currentChatId of chatIds) {
          try {
            if (b.imageBase64) {
              const mimeMatch = b.imageBase64.match(/^data:(image\/[\w+.-]+);base64,/);
              const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
              const ext = mimeType.split('/')[1].replace('+xml', '');
              const base64Data = b.imageBase64.replace(/^data:image\/[\w+.-]+;base64,/, '');
              const imgBuffer = Buffer.from(base64Data, 'base64');

              const form = new FormData();
              form.append('chat_id', currentChatId);
              form.append('photo', imgBuffer, {
                filename: `image.${ext}`,
                contentType: mimeType,
                knownLength: imgBuffer.length,
              });
              if (b.text) {
                form.append('caption', b.text);
                form.append('parse_mode', 'Markdown');
              }

              const photoRes = await fetch(`${TG_BASE}/sendPhoto`, { method: 'POST', body: form, headers: form.getHeaders() });
              const photoData = await photoRes.json();
              if (!photoData.ok) throw new Error(photoData.description);
            } else if (b.text) {
              const msgRes = await fetch(`${TG_BASE}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: currentChatId, text: b.text, parse_mode: 'Markdown', disable_web_page_preview: false }),
              });
              const msgData = await msgRes.json();
              if (!msgData.ok) throw new Error(msgData.description);
            }

            if (b.stickerId) {
              const stickerRes = await fetch(`${TG_BASE}/sendSticker`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: currentChatId, sticker: b.stickerId }),
              });
              const stickerData = await stickerRes.json();
              if (!stickerData.ok) throw new Error(stickerData.description);
            }
          } catch (tgErr) {
            telegramError = tgErr.message;
            logger.error(`[Cron] Telegram send failed for ${currentChatId}: ${telegramError}`);
          }
        }

        // Add to signals history if successful or partially successful
        await db.addSignal({
          id: Date.now(),
          type: b.type,
          text: b.text || '',
          sentAt: new Date().toISOString(),
          entryTime: b.entryTime || null,
          category: b.category || null
        });

        // Delete from queue regardless of success to prevent infinite loop of failing messages
        await db.deleteScheduledBroadcast(b._id);
        logger.info(`[Cron] Completed scheduled broadcast ${b._id}`);
      }
    }
  } catch (err) {
    logger.error(`[Cron] processScheduledBroadcasts failed: ${err.message}`);
  }
}

function startCronJobs() {
  cron.schedule("0 5 * * *", () => {
    logger.info("[Cron] Running daily VIP expiry reminder check...");
    runExpiryReminders();
  });
  
  // Run every hour to check for expired signals (older than 24 hours)
  cron.schedule("0 * * * *", () => {
    logger.info("[Cron] Checking for expired signals...");
    autoArchiveSignals();
  });
  
  // Run every minute to check scheduled alerts and broadcasts
  cron.schedule("* * * * *", () => {
    processScheduledAlerts();
    processScheduledBroadcasts();
  });

  // ── Weekly Performance Recap — Every Sunday at midnight (Both Channels) ──
  cron.schedule("0 0 * * 0", () => {
    logger.info("[Cron] Sending weekly performance recap to BOTH channels...");
    sendWeeklyRecap();
  }, { timezone: "Africa/Nairobi" });

  // ── Monthly Performance Recap — 1st of every month at 9 AM (Both Channels) ──
  cron.schedule("0 9 1 * *", () => {
    logger.info("[Cron] Sending monthly performance recap to BOTH channels...");
    sendMonthlyRecap();
  }, { timezone: "Africa/Nairobi" });

  logger.info("[Cron] Jobs scheduled: VIP expiry daily, Signal Auto-Archive hourly, Alerts minutely, Weekly & Monthly Recaps");
}

module.exports = { startCronJobs, computeAndSaveBadges, BADGE_DEFINITIONS, autoArchiveSignals, processScheduledAlerts, sendWeeklyRecap, sendMonthlyRecap };
