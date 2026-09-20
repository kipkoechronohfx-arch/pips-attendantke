const logger = require('../utils/logger');
const { sendEmail } = require('../services/emailService');

// Map to track user activity: { userId: { count: number, resetTime: number, alerted: boolean } }
const userActivity = new Map();
const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 60; // 60 requests per minute max

function suspiciousActivityMonitor(req, res, next) {
  // Only monitor authenticated users
  if (!req.user) return next();

  const userId = req.user._id || req.user.id;
  if (!userId) return next();

  const now = Date.now();
  let activity = userActivity.get(userId);

  if (!activity || now > activity.resetTime) {
    // Reset or initialize
    activity = {
      count: 1,
      resetTime: now + WINDOW_MS,
      alerted: false
    };
    userActivity.set(userId, activity);
  } else {
    activity.count++;

    if (activity.count > MAX_REQUESTS && !activity.alerted) {
      activity.alerted = true;
      
      const ip = req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
      const userEmail = req.user.email || 'unknown';
      
      logger.warn(`[SUSPICIOUS ACTIVITY] User ${userEmail} (${userId}) exceeded rate limit from IP ${ip}`);

      // Notify admin via Telegram
      const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
      if (adminChatId) {
        const { sendTelegramMessage } = require('../services/telegramBot');
        sendTelegramMessage(
          adminChatId,
          `⚠️ *Suspicious Activity Detected*\n\n👤 ${req.user.name || userEmail}\n📧 ${userEmail}\n🌐 IP: \`${ip}\`\n📈 Rate: >${MAX_REQUESTS} req/min\n🕐 ${new Date().toUTCString()}`
        ).catch(() => {});
      }

      // We don't block the request here, just alert. 
      // Express-rate-limit handles actual blocking if configured.
    }
  }

  next();
}

// Cleanup interval to prevent memory leaks for inactive users
setInterval(() => {
  const now = Date.now();
  for (const [userId, activity] of userActivity.entries()) {
    if (now > activity.resetTime) {
      userActivity.delete(userId);
    }
  }
}, WINDOW_MS * 2);

module.exports = {
  suspiciousActivityMonitor
};
