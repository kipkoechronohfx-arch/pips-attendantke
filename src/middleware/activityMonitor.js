const logger = require('../utils/logger');
const { sendEmail } = require('../services/emailService');

const ipActivity = new Map();
const bannedIPs = new Map();
// Persistent repeat-offender blocklist — survives window resets (not server restarts)
const permanentBlocklist = new Set();
const WINDOW_MS = 60 * 1000;       // 1 minute
const MAX_REQUESTS = 60;            // 60 requests per minute max
const BAN_DURATION_MS = 60 * 60 * 1000; // 1 hour ban
const REPEAT_BAN_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hour ban for repeat offenders

/**
 * Extract the real client IP, respecting Cloudflare's CF-Connecting-IP header.
 * Without this, all traffic appears to come from Cloudflare's IP (e.g. 104.22.45.40)
 * and bans incorrectly target Cloudflare rather than the actual attacker.
 */
function getRealIP(req) {
  // Cloudflare sets this to the original visitor IP — most reliable when behind CF
  const cfIP = req.headers['cf-connecting-ip'];
  if (cfIP) return cfIP.trim();
  // Fallback: first entry in X-Forwarded-For (set by other proxies / Render)
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.ip || 'unknown';
}

function suspiciousActivityMonitor(req, res, next) {
  const ip = getRealIP(req);

  if (ip === 'unknown') return next();

  // Block permanently blocklisted IPs immediately
  if (permanentBlocklist.has(ip)) {
    logger.warn(`[BLOCKLIST] Blocked request from repeat offender: ${ip}`);
    return res.status(403).json({ error: 'Access denied.' });
  }

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

      logger.warn(`[SUSPICIOUS ACTIVITY] Real IP: ${ip} (User: ${userEmail}) exceeded rate limit. Violations: ${activity.violations}`);

      let banMsg = '';
      if (activity.violations >= 2) {
        // Repeat offender — escalate to 24-hour ban and add to session blocklist
        bannedIPs.set(ip, now + REPEAT_BAN_DURATION_MS);
        permanentBlocklist.add(ip);
        banMsg = '\n⛔ *IP BANNED 24 HOURS (repeat offender)*';
        logger.error(`[BANNED 24H] Repeat offender IP ${ip} banned for 24 hours.`);
      } else if (activity.violations >= 1) {
        bannedIPs.set(ip, now + BAN_DURATION_MS);
        banMsg = '\n🚫 *IP BANNED FOR 1 HOUR*';
        logger.error(`[BANNED 1H] IP ${ip} has been banned for 1 hour.`);
      }

      // Notify admin via Telegram
      const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
      if (adminChatId) {
        const { sendTelegramMessage } = require('../services/telegramBot');
        sendTelegramMessage(
          adminChatId,
          `⚠️ *Suspicious Activity Detected*\n\n👤 ${userEmail}\n🌐 Real IP: \`${ip}\`\n📈 Rate: >${MAX_REQUESTS} req/min\n🛑 Violations: ${activity.violations}${banMsg}\n🕐 ${new Date().toUTCString()}`
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
