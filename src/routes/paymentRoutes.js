const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../services/db');
const { validateUserSession, JWT_SECRET } = require('../middleware/auth');
const { sendEmail, buildReceiptHtml } = require('../services/emailService');
const { sendTelegramMessage } = require('../services/telegramBot');
const logger = require('../utils/logger');

function notifyAdminPaymentError(context, error) {
  // Use dedicated admin chat ID — never send errors to the VIP group
  const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
  if (!adminChatId) return;
  const msg = `⚠️ *Payment Error*\n\n*Context:* ${context}\n*Error:* ${error}`;
  sendTelegramMessage(adminChatId, msg).catch(() => {});
}

const PLANS = {
  // ── Gold (Standard) Plans ────────────────────────────────
  '1month':           { days: 30,  kesPrice: 5000,  usdtPrice: 50,  tier: 'Gold' },
  '2months':          { days: 60,  kesPrice: 9500,  usdtPrice: 95,  tier: 'Gold' },
  '3months':          { days: 90,  kesPrice: 14000, usdtPrice: 140, tier: 'Gold' },
  '6months':          { days: 180, kesPrice: 25000, usdtPrice: 250, tier: 'Gold' },
  // ── Platinum (Premium) Plans ──────────────────────────────
  '1month_platinum':  { days: 30,  kesPrice: 9500,  usdtPrice: 90,  tier: 'Platinum' },
  '3months_platinum': { days: 90,  kesPrice: 25000, usdtPrice: 240, tier: 'Platinum' },
  'lifetime_platinum':{ days: 36500, kesPrice: 65000, usdtPrice: 499, tier: 'Platinum' }
};

function getDaysForPlan(plan) {
  return (PLANS[plan] || PLANS['1month']).days;
}

function getTierForPlan(plan) {
  return (PLANS[plan] || PLANS['1month']).tier || 'Gold';
}

router.post('/pay-vip', validateUserSession, async (req, res) => {
  const { phone, plan, promoCode } = req.body;
  const { PAYHERO_API_USER, PAYHERO_API_PASS, PAYHERO_CHANNEL_ID } = process.env;

  if (!phone) return res.status(400).json({ ok: false, error: 'Phone number is required.' });
  if (!PAYHERO_API_USER || !PAYHERO_API_PASS || !PAYHERO_CHANNEL_ID) {
    return res.status(500).json({ ok: false, error: 'Payment gateway not configured.' });
  }

  let finalAmount = PLANS[plan] ? PLANS[plan].kesPrice : PLANS['1month'].kesPrice;
  const selectedPlan = plan || '1month';

  if (promoCode) {
    if (promoCode.toUpperCase() === 'COMEBACK10') {
      finalAmount = Math.floor(finalAmount * 0.90);
    } else {
      const promo = await db.getPromoByCode(promoCode.toUpperCase());
      const now = Date.now();
      const notExpired = !promo?.expiresAt || promo.expiresAt > now;
      const withinLimit = !promo?.usageLimit || (promo.usageCount || 0) < promo.usageLimit;
      if (promo && promo.active && notExpired && withinLimit) {
        finalAmount = Math.floor(finalAmount * (1 - (promo.discountPercentage / 100)));
        // Increment usage count
        promo.usageCount = (promo.usageCount || 0) + 1;
        await db.savePromo(promo);
      }
    }
  }

  const ref = `VIP_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  try {
    const auth = Buffer.from(`${PAYHERO_API_USER}:${PAYHERO_API_PASS}`).toString('base64');
    
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers.host;
    const webhookSecret = process.env.PAYHERO_WEBHOOK_SECRET || 'fallback_secret_123';
    const callback_url = `${protocol}://${host}/api/payhero-webhook?secret=${webhookSecret}`;

    const response = await fetch('https://backend.payhero.co.ke/api/v2/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`
      },
      body: JSON.stringify({
        amount: finalAmount,
        phone_number: phone,
        channel_id: PAYHERO_CHANNEL_ID,
        provider: 'm-pesa',
        external_reference: ref,
        callback_url: callback_url
      })
    });

    const data = await response.json();
    if (data.success || response.ok) {
      await db.savePayment(ref, { status: 'Pending', phone, userId: req.user._id || req.user.id, plan: selectedPlan, amount: finalAmount, timestamp: new Date().toISOString() });
      res.json({ ok: true, reference: ref, message: 'Check your phone for the M-Pesa PIN prompt.' });
    } else {
      throw new Error(data.message || 'Payment initiation failed');
    }
  } catch (error) {
    logger.error(`[Payhero] Payment initiation failed for user ${req.user?.email}: ${error.message}`);
    notifyAdminPaymentError(`M-Pesa payment initiation — User: ${req.user?.email}, Plan: ${selectedPlan}`, error.message);
    res.status(500).json({ ok: false, error: 'Failed to initiate payment. Please try again.' });
  }
});

router.post('/payhero-webhook', async (req, res) => {
  try {
    const { secret } = req.query;
    const expectedSecret = process.env.PAYHERO_WEBHOOK_SECRET || 'fallback_secret_123';
    
    if (secret !== expectedSecret) {
      logger.warn(`[Payhero Webhook] Unauthorized attempt from IP ${req.ip}`);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const body = req.body;
    // ── Permanent Audit Log — saved before any processing ────────
    // Every raw Payhero payload is logged permanently for dispute resolution.
    db.saveWebhookLog({ ref: body.external_reference || (body.response && body.response.ExternalReference), body, receivedAt: new Date().toISOString() }).catch(() => {});
    logger.info('[Payhero Webhook Received] ref=' + (body.external_reference || '?') + ' body=' + JSON.stringify(body));

    const ref = body.external_reference || (body.response && body.response.ExternalReference);
    // Prefer the nested M-Pesa response status (most reliable), fall back to top-level status string.
    // IMPORTANT: Do NOT use body.status === true or body.success === true — Payhero sets these
    // for a successful API call even when the underlying M-Pesa transaction was cancelled/failed.
    const mpesaResultCode = body.response && body.response.ResultCode;
    const statusStr = String(
      (body.response && body.response.Status) || body.status || 'Failed'
    ).toLowerCase();

    if (ref) {
      const payment = await db.getPayment(ref);
      if (payment) {
        // isSuccess = true ONLY when M-Pesa confirms the actual money was received.
        // We explicitly check ResultCode from M-Pesa if it exists, otherwise fallback to status string.
        let isSuccess = false;
        if (body.response && body.response.ResultCode !== undefined) {
          isSuccess = (Number(body.response.ResultCode) === 0);
        } else {
          isSuccess = ['success', 'completed', 'successful'].includes(statusStr);
        }

        payment.status = isSuccess ? 'Success' : 'Failed';
        payment.rawWebhook = body;
        await db.savePayment(ref, payment);

        // ── Auto-Upgrade User Immediately on Success ─────────────────
        if (isSuccess && payment.userId && !payment.processedForUser) {
          try {
            const user = await db.getUserById(payment.userId);
            if (user) {
              const days = getDaysForPlan(payment.plan || '1month');
              const tier = getTierForPlan(payment.plan || '1month');
              const currentExpiry = user.subscriptionExpiry && user.subscriptionExpiry > Date.now() ? user.subscriptionExpiry : Date.now();
              user.subscriptionExpiry = currentExpiry + days * 24 * 60 * 60 * 1000;
              user.isTrial = false; // Clear trial flag upon payment

              user.subscriptionTier = tier;
              await db.saveUser(user);

              payment.processedForUser = true;
              await db.savePayment(ref, payment);

              // Referral bonus: +5 days for referrer
              if (user.referredBy) {
                try {
                  const referrer = await db.getUserById(user.referredBy);
                  if (referrer && referrer.subscriptionExpiry) {
                    referrer.subscriptionExpiry += 5 * 24 * 60 * 60 * 1000;
                    await db.saveUser(referrer);
                    logger.info(`[Referral] +5 days awarded to referrer ${referrer.email}`);
                  }
                } catch (refErr) {
                  logger.warn(`[Referral] Failed to award referral bonus: ${refErr.message}`);
                }
              }

              // Send receipt email
              if (user.email) {
                try {
                  const plan = payment.plan || '1month';
                  const expiryDate = new Date(user.subscriptionExpiry).toDateString();
                  const amount = payment.amount || PLANS[plan]?.kesPrice || 5000;
                  const receiptHtml = buildReceiptHtml({
                    ref,
                    userName: user.name,
                    userEmail: user.email,
                    plan,
                    amount,
                    currency: 'KES',
                    method: 'M-Pesa (Payhero)',
                    days,
                    expiryDate
                  });
                  await db.saveReceipt(ref, { html: receiptHtml, userId: payment.userId, plan, amount, createdAt: new Date().toISOString() });
                  await sendEmail(user.email, `🧾 Your VIP Receipt — Pips Attendant`, receiptHtml);
                  logger.info(`[Webhook] Receipt sent to ${user.email} for ref ${ref}`);
                } catch (emailErr) {
                  logger.warn(`[Webhook] Receipt email failed: ${emailErr.message}`);
                }
              }

              logger.info(`[Webhook] ✅ Auto-upgraded user ${user.email} to ${user.subscriptionTier} via ref ${ref}`);
            }
          } catch (upgradeErr) {
            logger.error(`[Webhook] Auto-upgrade failed for ref ${ref}: ${upgradeErr.message}`);
            notifyAdminPaymentError(`Webhook auto-upgrade — ref ${ref}`, upgradeErr.message);
          }
        }

        // Notify connected browser sessions via Socket.io
        if (isSuccess && payment.userId) {
          const io = req.app.get('io');
          if (io) {
            io.emit('paymentSuccess', { userId: String(payment.userId), message: 'VIP Payment Successful! Your account has been upgraded.' });
          }
        }
      }
    }
    res.status(200).json({ received: true });
  } catch (err) {
    logger.error(`[Payhero Webhook Error] ${err.message}`);
    notifyAdminPaymentError('Payhero webhook processing', err.message);
    res.status(500).send('Error');
  }
});


router.get('/check-payment/:ref', validateUserSession, async (req, res) => {
  const { ref } = req.params;
  const payment = await db.getPayment(ref);

  if (!payment) return res.status(404).json({ ok: false, error: 'Transaction not found.' });

  const currentUserId = req.user._id || req.user.id;
  if (payment.userId && payment.userId !== currentUserId) {
    return res.status(403).json({ ok: false, error: 'Unauthorized.' });
  }

  if (payment.status === 'Success') {
    // Fallback upgrade: fires only if the webhook hasn't set processedForUser yet.
    // Receipt is intentionally NOT sent here — it is sent exclusively by the webhook
    // handler to prevent duplicate emails.
    if (!payment.processedForUser) {
      const user = await db.getUserById(currentUserId);
      if (user) {
        const days = getDaysForPlan(payment.plan || '1month');
        const tier = getTierForPlan(payment.plan || '1month');
        const currentExpiry = user.subscriptionExpiry && user.subscriptionExpiry > Date.now() ? user.subscriptionExpiry : Date.now();
        user.subscriptionExpiry = currentExpiry + days * 24 * 60 * 60 * 1000;
        user.isTrial = false; // Clear trial flag upon payment
        user.subscriptionTier = tier;
        await db.saveUser(user);

        payment.processedForUser = true;
        await db.savePayment(ref, payment);
        logger.info(`[check-payment] Fallback upgrade applied for ref ${ref}, user ${user.email}`);
      }
    }

    const user = await db.getUserById(currentUserId);
    const sessionToken = jwt.sign({ id: user._id || user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });

    res.json({
      ok: true,
      status: 'Success',
      sessionToken,
      user: { id: user._id || user.id, email: user.email, name: user.name, subscriptionExpiry: user.subscriptionExpiry, subscriptionTier: user.subscriptionTier || 'Gold' }
    });
  } else {
    res.json({ ok: true, status: payment.status });
  }
});

// ── Validate Promo Code (live preview) ───────────────────────
router.post('/validate-promo', validateUserSession, async (req, res) => {
  const { promoCode, plan } = req.body;
  if (!promoCode) return res.status(400).json({ ok: false, error: 'No code provided.' });

  const baseKes = PLANS[plan]?.kesPrice || PLANS['1month'].kesPrice;
  const baseUsd = PLANS[plan]?.usdPrice || PLANS['1month'].usdPrice;
  const code = promoCode.toUpperCase();
  const now = Date.now();

  if (code === 'COMEBACK10') {
    return res.json({ ok: true, discount: 10, finalKes: Math.floor(baseKes * 0.90), finalUsd: (baseUsd * 0.90).toFixed(2) });
  }

  const promo = await db.getPromoByCode(code);
  if (!promo || !promo.active) return res.status(404).json({ ok: false, error: 'Invalid promo code.' });
  if (promo.expiresAt && promo.expiresAt < now) return res.status(400).json({ ok: false, error: 'Promo code has expired.' });
  if (promo.usageLimit && (promo.usageCount || 0) >= promo.usageLimit) return res.status(400).json({ ok: false, error: 'Promo code usage limit reached.' });

  const factor = 1 - (promo.discountPercentage / 100);
  res.json({
    ok: true,
    discount: promo.discountPercentage,
    finalKes: Math.floor(baseKes * factor),
    finalUsd: (baseUsd * factor).toFixed(2)
  });
});

router.post('/crypto-pay', validateUserSession, async (req, res) => {
  const { txHash, network, contactInfo, plan } = req.body;
  if (!txHash || !network || !contactInfo) {
    return res.status(400).json({ ok: false, error: 'Transaction Hash, Network, and Contact Info are required.' });
  }
  const cleanHash = txHash.trim();
  if (cleanHash.length < 10) {
    return res.status(400).json({ ok: false, error: 'Invalid transaction hash.' });
  }
  const request = {
    id: `CRYPTO_REQ_${Date.now()}`,
    userId: req.user._id || req.user.id,
    txHash: cleanHash,
    network,
    contactInfo,
    status: 'Pending',
    timestamp: new Date().toISOString(),
    plan: plan || '1month',
  };
  try {
    await db.saveCryptoRequest(request);

    // Send admin notification
    const adminEmail = process.env.SENDGRID_FROM_EMAIL;
    if (adminEmail) {
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #fbbf24;">New Crypto Payment Request 💰</h2>
          <p>A new crypto payment request has been submitted and requires approval.</p>
          <ul>
            <li><strong>Tx Hash:</strong> ${cleanHash}</li>
            <li><strong>Network:</strong> ${network}</li>
            <li><strong>Contact Info:</strong> ${contactInfo}</li>
            <li><strong>Plan:</strong> ${request.plan}</li>
          </ul>
          <p>Log in to the Admin Panel to approve or reject this request.</p>
        </div>
      `;
      sendEmail(adminEmail, 'Action Required: New Crypto Payment Request', emailHtml).catch(console.error);
    }

    res.json({ ok: true, message: 'Payment request submitted! We will verify and issue your access within 24 hours.', requestId: request.id });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Failed to save request. Please try again.' });
  }
});

// ── View Receipt ────────────────────────────────────────────────
router.get('/receipt/:ref', validateUserSession, async (req, res) => {
  const { ref } = req.params;
  try {
    const receipt = await db.getReceipt(ref);
    if (!receipt) return res.status(404).json({ ok: false, error: 'Receipt not found.' });
    // Verify the receipt belongs to the requesting user
    const currentUserId = String(req.user._id || req.user.id);
    if (receipt.userId && String(receipt.userId) !== currentUserId) {
      return res.status(403).json({ ok: false, error: 'Unauthorized.' });
    }
    res.setHeader('Content-Type', 'text/html');
    res.send(receipt.html);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
