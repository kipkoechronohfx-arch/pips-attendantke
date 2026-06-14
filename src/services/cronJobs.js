const cron = require('node-cron');
const db = require('./db');
const { kickUserFromTelegram, sendTelegramMessage } = require('./telegramBot');

const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY || '');

async function sendEmail(to, subject, htmlContent) {
  if (!process.env.SENDGRID_API_KEY || !process.env.SENDGRID_FROM_EMAIL) return;
  try {
    await sgMail.send({ to, from: process.env.SENDGRID_FROM_EMAIL, subject, html: htmlContent });
  } catch (error) {}
}

function startCronJobs() {
  // ── Daily Auto-Kick Expired VIP Users ────────────────────────
  // Runs every day at 01:00 EAT
  cron.schedule('0 1 * * *', async () => {
    console.log('[Cron] Checking for expired VIP users to kick...');
    try {
      const users = await db.getUsers();
      const now = Date.now();
      let kickCount = 0;

      for (const user of users) {
        if (!user.subscriptionExpiry) continue;

        const timeUntilExpiry = user.subscriptionExpiry - now;
        const daysUntilExpiry = Math.ceil(timeUntilExpiry / (1000 * 60 * 60 * 24));

        // 1. Send "Expiring Soon" Email (Exactly 3 days left)
        if (daysUntilExpiry === 3 && user.email) {
          const html = '<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">' +
            '<h2 style="color: #fbbf24;">Your VIP Access is Expiring Soon! \u23f0</h2>' +
            '<p>Hi ' + (user.name || 'Trader') + ',</p>' +
            "<p>Just a quick reminder that your VIP subscription will expire in exactly 3 days.</p>" +
            "<p>Don't miss out on upcoming signals! Log in and renew your plan to keep the profits rolling.</p>" +
            '<p>- The Pips Attendant Team</p>' +
            '</div>';
          sendEmail(user.email, 'VIP Expiring Soon \u23f0', html).catch(() => {});
        }

        // 2. Auto-Kick Expired Users
        if (user.telegramId && user.subscriptionExpiry < now) {
          await kickUserFromTelegram(user.telegramId);
          console.log('[Auto-Kick] Kicked ' + user.email + ' (TG: ' + user.telegramId + ') from VIP group.');
          kickCount++;
        }

        // 3. Win-Back Campaign (Exactly 7 days after expiry)
        if (daysUntilExpiry === -7 && user.email) {
          const html = '<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">' +
            '<h2 style="color: #fbbf24;">We Miss You! Here\'s 10% Off \ud83c\udf81</h2>' +
            '<p>Hi ' + (user.name || 'Trader') + ',</p>' +
            "<p>It's been a week since your VIP access expired. The markets have been crazy, and we want you back!</p>" +
            '<p>Use the promo code <strong>COMEBACK10</strong> at checkout to get 10% off your next subscription plan.</p>' +
            '<p>- The Pips Attendant Team</p>' +
            '</div>';
          sendEmail(user.email, "We Miss You! Here's 10% Off \ud83c\udf81", html).catch(() => {});
        }
      }
      console.log('[Cron] Auto-kick and Drip Campaigns complete. Kicked ' + kickCount + ' user(s).');
    } catch (err) {
      console.error('[Cron] Auto-kick failed:', err.message);
    }
  }, { timezone: 'Africa/Nairobi' });

  // Weekly report (Sunday at 23:59 EAT)
  cron.schedule('59 23 * * 0', async () => {
    if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) return;
    console.log('[Cron] Running weekly performance report...');
    try {
      const logs = await db.getPerformanceLogs();
      const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const weeklyLogs = logs.filter(l => {
        const t = typeof l.date === 'string' ? new Date(l.date).getTime() : (l.timestamp || 0);
        return t >= oneWeekAgo;
      });
      let pipsGained = 0, pipsLost = 0, wins = 0, losses = 0;
      weeklyLogs.forEach(l => {
        if (l.result === 'Win') { wins++; pipsGained += (l.pips || 0); }
        else if (l.result === 'Loss') { losses++; pipsLost += (l.pips || 0); }
      });
      const totalPips = pipsGained + pipsLost;
      const winRate = totalPips > 0 ? Math.round((pipsGained / totalPips) * 100) : 0;
      const netPips = pipsGained - pipsLost;
      const netStr = netPips > 0 ? ('+' + netPips) : String(netPips);
      const msg = '\ud83c\udfc6 *Weekly Performance Report* \ud83c\udfc6\n\nTrades this week: ' + (wins + losses) +
        '\nWin Rate (Pips): ' + winRate + '%\nNet Pips Gained: ' + netStr + ' pips\n\nLet\'s crush the coming week! \ud83d\ude80';
      await sendTelegramMessage(process.env.TELEGRAM_CHAT_ID, msg);
    } catch (err) {
      console.error('[Cron] Weekly report failed:', err.message);
    }
  }, { timezone: 'Africa/Nairobi' });
}

module.exports = { startCronJobs };
