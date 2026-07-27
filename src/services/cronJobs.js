const cron = require("node-cron");
const db = require("./db");
const { sendEmail } = require("./emailService");
const logger = require("../utils/logger");

// ── Weekly Performance Recap ──────────────────────────────────────────────────
async function sendWeeklyRecapToVIP() {
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
    const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
    const netPips = pipsGained - pipsLost;

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
    msg += `Stay consistent, manage risk, and let's go even harder next week! 💪💰`;

    const tgUrl = `https://api.telegram.org/bot${token}/sendMessage`;
    const response = await fetch(tgUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'Markdown' })
    });
    const result = await response.json();

    if (result.ok) {
      const successMsg = `Weekly recap sent to VIP (${weekLabel}): ${wins}W/${losses}L, ${netPips >= 0 ? '+' : ''}${netPips} pips.`;
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
  
  // Run every minute to check scheduled alerts
  cron.schedule("* * * * *", () => {
    processScheduledAlerts();
  });

  // ── Weekly Performance Recap — Every Sunday at midnight (VIP Telegram) ──
  cron.schedule("0 0 * * 0", () => {
    logger.info("[Cron] Sending weekly performance recap to VIP channel...");
    sendWeeklyRecapToVIP();
  });
  
  logger.info("[Cron] Jobs scheduled: VIP expiry daily, Signal Auto-Archive hourly, Alerts minutely, Weekly Recap every Sunday midnight");
}

module.exports = { startCronJobs, computeAndSaveBadges, BADGE_DEFINITIONS, autoArchiveSignals, processScheduledAlerts, sendWeeklyRecapToVIP };
