const logger = require('../utils/logger');
const { sendEmail } = require('../services/emailService');

const ipActivity = new Map();
const bannedIPs = new Map();
const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 60; // 60 requests per minute max
const BAN_DURATION_MS = 60 * 60 * 1000; // 1 hour

function suspiciousActivityMonitor(req, res, next) {
  const ip = req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  
  if (ip === 'unknown') return next();

  const now = Date.now();

  // Check if IP is banned
  const banExpiry = bannedIPs.get(ip);
  if (banExpiry) {
    if (now < banExpiry) {
      return res.status(403).json({ error: 'Your IP has been temporarily banned due to suspicious activity.' });
    } else {
      bannedIPs.delete(ip);
    }
  }

  let activity = ipActivity.get(ip);

  if (!activity || now > activity.resetTime) {
    activity = { 
      count: 1, 
      resetTime: now + WINDOW_MS, 
      violations: activity ? activity.violations : 0, 
      alerted: false 
    };
    ipActivity.set(ip, activity);
  } else {
    activity.count++;

    if (activity.count > MAX_REQUESTS && !activity.alerted) {
      activity.alerted = true;
      activity.violations++;
      
      const userEmail = req.user ? req.user.email : 'Unauthenticated';
      
      logger.warn(`[SUSPICIOUS ACTIVITY] IP ${ip} (User: ${userEmail}) exceeded rate limit. Violations: ${activity.violations}`);

      if (activity.violations >= 3) {
        bannedIPs.set(ip, now + BAN_DURATION_MS);
        logger.error(`[BANNED] IP ${ip} has been banned for 1 hour.`);
      }

      // Notify admin via Telegram
      const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
      if (adminChatId) {
        const { sendTelegramMessage } = require('../services/telegramBot');
        sendTelegramMessage(
          adminChatId,
          `⚠️ *Suspicious Activity Detected*\n\n👤 ${userEmail}\n🌐 IP: \`${ip}\`\n📈 Rate: >${MAX_REQUESTS} req/min\n🛑 Violations: ${activity.violations}${activity.violations >= 3 ? '\n⛔ *IP BANNED FOR 1 HOUR*' : ''}\n🕐 ${new Date().toUTCString()}`
        ).catch(() => {});
      }
    }
  }

  next();
}

// Cleanup interval
setInterval(() => {
  const now = Date.now();
  for (const [ip, activity] of ipActivity.entries()) {
    if (now > activity.resetTime && activity.violations === 0) {
      ipActivity.delete(ip);
    }
  }
  for (const [ip, expiry] of bannedIPs.entries()) {
    if (now > expiry) {
      bannedIPs.delete(ip);
      ipActivity.delete(ip); // Clear violations to start fresh
    }
  }
}, WINDOW_MS * 2);

module.exports = {
  suspiciousActivityMonitor,
  bannedIPs
};
