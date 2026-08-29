const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const logger = require('../utils/logger');

// POST /api/bot/webhook
// Called by Telegram whenever the bot receives a message
router.post('/webhook', async (req, res) => {
  try {
    const update = req.body;
    
    // Always respond 200 OK immediately to Telegram so they don't retry
    res.status(200).send('OK');

    if (!update || !update.message || !update.message.text) {
      return;
    }

    const chatId = update.message.chat.id;
    const text = update.message.text.toLowerCase();
    
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return;

    let replyText = null;

    if (text.includes('vip') || text.includes('premium') || text.includes('cost') || text.includes('price')) {
      replyText = `🌟 <b>Welcome to Pips Attendant VIP!</b>\n\nTo join our premium channel and start receiving high-probability signals, please choose your plan here:\n👉 <a href="${process.env.APP_URL || 'https://www.pipsattendant.com'}/premium.html">View Premium Plans</a>\n\n<i>Let me know if you need help with payment!</i>`;
    } else if (text.includes('broker') || text.includes('account')) {
      replyText = `📈 <b>Need a reliable broker?</b>\n\nWe recommend our trusted partner for the best spreads and execution. Sign up here to get started:\n👉 <a href="https://one.justmarkets.link/a/by21d0s1wd">Create Broker Account</a>`;
    }

    if (replyText) {
      const tgUrl = `https://api.telegram.org/bot${token}/sendMessage`;
      await fetch(tgUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: replyText,
          parse_mode: 'HTML',
          disable_web_page_preview: true
        })
      });
      logger.info(`[Bot] Auto-replied to chat ${chatId}`);
    }
  } catch (err) {
    logger.error(`[Bot] Webhook error: ${err.message}`);
  }
});

module.exports = router;
