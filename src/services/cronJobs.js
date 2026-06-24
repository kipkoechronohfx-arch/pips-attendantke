const cron = require('node-cron');
const db = require('./db');
const { kickUserFromTelegram, sendTelegramMessage } = require('./telegramBot');
const { sendEmail } = require('./emailService');



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

        // 1. Send "Expiring Soon" Emails
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

        // 1-day last chance reminder
        if (daysUntilExpiry === 1 && user.email) {
          const html = '<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background:#111827; padding:24px; border-radius:12px; color:#f9fafb;">' +
            '<h2 style="color: #ef4444;">\u26a0\ufe0f Last Chance — VIP Expires Tomorrow!</h2>' +
            '<p style="color:#d1d5db;">Hi ' + (user.name || 'Trader') + ',</p>' +
            '<p style="color:#d1d5db;">Your VIP subscription expires <strong>tomorrow</strong>. Renew now to avoid losing access to premium signals and the VIP chat room.</p>' +
            '<div style="text-align:center;margin:24px 0;"><a href="' + (process.env.APP_URL || 'https://pipsattendant.top') + '/premium.html" style="background:linear-gradient(135deg,#f59e0b,#fbbf24);color:#0d0800;font-weight:700;padding:14px 28px;border-radius:12px;text-decoration:none;display:inline-block;">Renew VIP Access</a></div>' +
            '<p style="color:#6b7280;font-size:12px;">- The Pips Attendant Team</p>' +
            '</div>';
          sendEmail(user.email, '\u26a0\ufe0f Last Chance: VIP Expires Tomorrow!', html).catch(() => {});
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

      // Also send Email to all active VIP users
      const users = await db.getUsers();
      const now = Date.now();
      const activeVIPs = users.filter(u => u.subscriptionExpiry && u.subscriptionExpiry > now && u.email);
      
      // Find best trade
      let bestTradeStr = 'N/A';
      if (weeklyLogs.length > 0) {
        const sorted = [...weeklyLogs].sort((a, b) => (b.pips || 0) - (a.pips || 0));
        if (sorted[0] && sorted[0].pips > 0) {
          bestTradeStr = `${sorted[0].asset || 'Trade'} (+${sorted[0].pips} pips)`;
        }
      }
      
      const emailHtml = `
      <div style="font-family: 'Inter', sans-serif; background-color: #0d0800; color: #fff; padding: 30px; max-width: 600px; margin: 0 auto; border-radius: 16px; border: 1px solid rgba(251,191,36,0.2);">
        <h2 style="color: #fbbf24; text-align: center; margin-bottom: 30px;">🏆 Weekly Performance Report 🏆</h2>
        <p style="color: #d1d5db; text-align: center; margin-bottom: 20px;">Here is how we did this week in the VIP group.</p>
        
        <div style="background-color: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 20px; margin-bottom: 30px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 15px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 15px;">
            <span style="color: #9ca3af; font-weight: bold;">Total Trades</span>
            <span style="color: #fff; font-weight: bold; font-size: 1.2rem;">${wins + losses}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 15px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 15px;">
            <span style="color: #9ca3af; font-weight: bold;">Win Rate</span>
            <span style="color: #10b981; font-weight: bold; font-size: 1.2rem;">${winRate}%</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 15px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 15px;">
            <span style="color: #9ca3af; font-weight: bold;">Net Pips</span>
            <span style="color: ${netPips > 0 ? '#10b981' : (netPips < 0 ? '#ef4444' : '#fff')}; font-weight: bold; font-size: 1.2rem;">${netStr} pips</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #9ca3af; font-weight: bold;">Best Trade</span>
            <span style="color: #fbbf24; font-weight: bold; font-size: 1.2rem;">${bestTradeStr}</span>
          </div>
        </div>
        
        <p style="color: #d1d5db; text-align: center; margin-bottom: 30px;">Let's keep crushing the markets! Prepare yourself for another profitable week ahead. 🚀</p>
        
        <div style="text-align: center;">
          <a href="https://pipsattendant.com/premium.html" style="background: linear-gradient(135deg, #f59e0b, #fbbf24); color: #0d0800; font-weight: bold; padding: 14px 28px; border-radius: 12px; text-decoration: none; display: inline-block;">Access VIP Area</a>
        </div>
      </div>
      `;

      let emailsSent = 0;
      for (const u of activeVIPs) {
        await sendEmail(u.email, '🏆 Weekly Performance Report 🏆', emailHtml).catch(() => {});
        emailsSent++;
      }
      console.log(`[Cron] Weekly report emailed to ${emailsSent} active VIP users.`);
    } catch (err) {
      console.error('[Cron] Weekly report failed:', err.message);
    }
  }, { timezone: 'Africa/Nairobi' });
  // ── Keep-Alive Ping (Render Free Tier) ───────────────────────
  const SELF_URL = process.env.RENDER_EXTERNAL_URL || 'https://pips-attendantke.onrender.com';
  cron.schedule('*/14 * * * *', async () => {
    try {
      const fetch = require('node-fetch');
      const res = await fetch(`${SELF_URL}/api/public-config`);
      console.log('[Keep-Alive] Ping OK:', res.status);
    } catch (err) {
      console.warn('[Keep-Alive] Ping failed:', err.message);
    }
  });
}

// ── Signal Email Digest ── called externally when admin posts a signal ────
async function notifyVIPsNewSignal(signalText) {
  try {
    const users = await db.getUsers();
    const now = Date.now();
    const activeVIPs = users.filter(u => u.subscriptionExpiry && u.subscriptionExpiry > now && u.email);
    if (!activeVIPs.length) return;

    const preview = (signalText || '').slice(0, 300).replace(/\n/g, '<br/>');
    const html = `
    <div style="font-family:'Inter',Arial,sans-serif;max-width:600px;margin:0 auto;background:#111827;border-radius:16px;border:1px solid rgba(251,191,36,0.2);overflow:hidden;">
      <div style="background:linear-gradient(135deg,#f59e0b,#fbbf24);padding:20px 28px;">
        <h2 style="margin:0;color:#0d0800;font-size:18px;font-weight:800;">📡 New VIP Signal Alert</h2>
      </div>
      <div style="padding:24px;">
        <p style="color:#9ca3af;font-size:13px;margin:0 0 16px;">A new signal has just been posted in the VIP group:</p>
        <div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:16px;color:#f9fafb;font-size:14px;line-height:1.6;">${preview}</div>
        <div style="text-align:center;margin-top:24px;">
          <a href="${process.env.APP_URL || 'https://pipsattendant.top'}/premium.html" style="background:linear-gradient(135deg,#f59e0b,#fbbf24);color:#0d0800;font-weight:700;padding:13px 26px;border-radius:12px;text-decoration:none;display:inline-block;">View Signal →</a>
        </div>
      </div>
    </div>`;

    let sent = 0;
    for (const u of activeVIPs) {
      await sendEmail(u.email, '📡 New VIP Signal — Pips Attendant', html).catch(() => {});
      sent++;
    }
    console.log(`[Signal Notify] Emailed ${sent} VIP users.`);
  } catch (err) {
    console.error('[Signal Notify Error]', err.message);
  }
}

module.exports = { startCronJobs, notifyVIPsNewSignal };
