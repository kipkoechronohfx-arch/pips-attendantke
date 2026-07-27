const webPush = require('web-push');
const db = require('./db');
const logger = require('../utils/logger');

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.APP_URL || 'mailto:support@pipsattendant.com';

if (vapidPublicKey && vapidPrivateKey) {
  webPush.setVapidDetails(
    vapidSubject,
    vapidPublicKey,
    vapidPrivateKey
  );
  logger.info('[Push] VAPID keys loaded. Web Push enabled.');
} else {
  logger.warn('[Push] Missing VAPID keys. Web Push is disabled.');
}

/**
 * Sends a push notification to a specific subscription.
 * If the subscription is invalid/expired, it removes it from DB.
 */
async function sendNotification(subscription, payload) {
  if (!vapidPublicKey) return false;
  try {
    await webPush.sendNotification(subscription, JSON.stringify(payload));
    return true;
  } catch (err) {
    if (err.statusCode === 404 || err.statusCode === 410) {
      logger.info(`[Push] Subscription expired/unsubscribed. Removing endpoint: ${subscription.endpoint}`);
      await db.deletePushSubscription(subscription);
    } else {
      logger.error(`[Push] Failed to send push: ${err.message}`);
    }
    return false;
  }
}

/**
 * Broadcasts a push notification to all subscribers in the database.
 */
async function broadcastPush(title, body, url = '/premium.html') {
  if (!vapidPublicKey) return { success: 0, failed: 0 };
  
  const subs = await db.getPushSubscriptions();
  if (!subs || subs.length === 0) return { success: 0, failed: 0 };

  const payload = {
    title,
    body,
    icon: '/favicon.png',
    badge: '/favicon.png',
    url
  };

  let successCount = 0;
  let failCount = 0;

  const promises = subs.map(async (sub) => {
    const success = await sendNotification(sub, payload);
    if (success) successCount++;
    else failCount++;
  });

  await Promise.all(promises);
  logger.info(`[Push] Broadcasted to ${subs.length} subscribers (${successCount} OK, ${failCount} Failed).`);
  
  return { success: successCount, failed: failCount };
}

module.exports = {
  sendNotification,
  broadcastPush
};
