const logger = require('../utils/logger');
const banService = require('../services/banService');

const ipActivity = new Map();
const WINDOW_MS = 60 * 1000;        // 1 minute window
const MAX_REQUESTS = 60;             // max requests per minute
const BAN_1H  = 60 * 60 * 1000;     // 1 hour ban (first offence)
const BAN_24H = 24 * 60 * 60 * 1000;// 24 hour ban (repeat offender)

/**
 * Extract the real client IP, respecting Cloudflare's CF-Connecting-IP header.
 * Without this, all traffic appears to come from Cloudflare's proxy IP
 * (e.g. 104.22.45.40) and bans incorrectly target Cloudflare rather than
 * the actual attacker.
 */
function getRealIP(req) {
  const cfIP = req.headers['cf-connecting-ip'];
  if (cfIP) return cfIP.trim();
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.ip || 'unknown';
}

async function suspiciousActivityMonitor(req, res, next) {
  // Never rate-limit, monitor or ban legitimate terminal API routes (quotes, candles, scanner, signals)
  if (req.originalUrl && (req.originalUrl.startsWith('/api/v1') || req.originalUrl.startsWith('/terminal'))) {
    return next();
  }

  const ip = getRealIP(req);
  if (ip === 'unknown') return next();

  // ── Whitelist: Authenticated admins bypass monitor & auto-unban IP ──
  const reqAdminKey = req.headers['x-admin-key'] || (req.query && req.query.key);
  if (reqAdminKey && process.env.ADMIN_KEY && reqAdminKey.trim() === process.env.ADMIN_KEY.trim()) {
    await banService.unbanIP(ip).catch(() => {});
    return next();
  }

  // ── Persistent ban check (MongoDB-backed, survives restarts) ──
  const ban = await banService.isBanned(ip);
  if (ban) {
    logger.warn(`[BLOCKED] Banned IP attempted access: ${ip} (expires ${ban.expiresAt})`);
    return res.status(403).json({ error: 'Access denied.' });
  }

  const now = Date.now();
  let activity = ipActivity.get(ip);

  if (!activity || now > activity.resetTime) {
    // Fetch persisted violation count so repeat offenders are caught after restart
    const pastViolations = await banService.getViolations(ip);
    activity = {
      count: 1,
      resetTime: now + WINDOW_MS,
      violations: pastViolations,
      alerted: false
    };
    ipActivity.set(ip, activity);
  } else {
    activity.count++;

    if (activity.count > MAX_REQUESTS && !activity.alerted) {
      activity.alerted = true;
      activity.violations++;

      const userEmail = req.user ? req.user.email : 'Unauthenticated';
      logger.warn(`[SUSPICIOUS] Real IP: ${ip} (${userEmail}) — violation #${activity.violations}`);

      let banMsg = '';
      let banDuration = 0;
      let banReason = '';

      if (activity.violations >= 2) {
        banDuration = BAN_24H;
        banReason = `repeat offender (${activity.violations} violations)`;
        banMsg = '\n⛔ *BANNED 24 HOURS — repeat offender*';
        logger.error(`[BANNED 24H] ${ip} — ${banReason}`);
      } else {
        banDuration = BAN_1H;
        banReason = `rate limit exceeded (${activity.violations} violation)`;
        banMsg = '\n🚫 *BANNED 1 HOUR*';
        logger.error(`[BANNED 1H] ${ip} — ${banReason}`);
      }

      // Persist the ban to MongoDB so it survives restarts
      await banService.banIP(ip, banDuration, banReason, activity.violations);

      // Notify admin via Telegram
      const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
      if (adminChatId) {
        const { sendTelegramMessage } = require('../services/telegramBot');
        sendTelegramMessage(
          adminChatId,
          `⚠️ *Suspicious Activity Detected*\n\n` +
          `👤 ${userEmail}\n` +
          `🌐 Real IP: \`${ip}\`\n` +
          `📈 Rate: >${MAX_REQUESTS} req/min\n` +
          `🛑 Violations: ${activity.violations}` +
          `${banMsg}\n` +
          `🕐 ${new Date().toUTCString()}`
        ).catch(() => {});
      }
    }
  }

  next();
}

// In-memory cleanup (MongoDB handles its own expiry via TTL index)
setInterval(() => {
  const now = Date.now();
  for (const [ip, activity] of ipActivity.entries()) {
    if (now > activity.resetTime && activity.violations === 0) {
      ipActivity.delete(ip);
    }
  }
}, WINDOW_MS * 2);

module.exports = { suspiciousActivityMonitor };
