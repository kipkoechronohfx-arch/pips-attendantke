const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../services/db');
const { validateUserSession, JWT_SECRET } = require('../middleware/auth');
const { sendEmail, buildReceiptHtml } = require('../services/emailService');

const PLANS = {
  '1month':  { days: 30,  kesPrice: 5000,  usdtPrice: 50  },
  '2months': { days: 60,  kesPrice: 9500,  usdtPrice: 95  },
  '3months': { days: 90,  kesPrice: 14000, usdtPrice: 140 },
  '6months': { days: 180, kesPrice: 25000, usdtPrice: 250 }
};

function getDaysForPlan(plan) {
  return (PLANS[plan] || PLANS['1month']).days;
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
      if (promo && promo.active) {
        finalAmount = Math.floor(finalAmount * (1 - (promo.discountPercentage / 100)));
      }
    }
  }

  const ref = `VIP_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  try {
    const auth = Buffer.from(`${PAYHERO_API_USER}:${PAYHERO_API_PASS}`).toString('base64');
    
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers.host;
    const callback_url = `${protocol}://${host}/api/payhero-webhook`;

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
      await db.savePayment(ref, { status: 'Pending', phone, userId: req.user._id || req.user.id, plan: selectedPlan, timestamp: new Date().toISOString() });
      res.json({ ok: true, reference: ref, message: 'Check your phone for the M-Pesa PIN prompt.' });
    } else {
      throw new Error(data.message || 'Payment initiation failed');
    }
  } catch (error) {
    console.error('[payhero error]', error);
    res.status(500).json({ ok: false, error: 'Failed to initiate payment. Please try again.' });
  }
});

router.post('/payhero-webhook', async (req, res) => {
  try {
    const body = req.body;
    console.log('[Payhero Webhook Received]', body);

    const ref = body.external_reference || (body.response && body.response.ExternalReference);
    const status = body.status || (body.response && body.response.Status) || 'Failed';

    if (ref) {
      const payment = await db.getPayment(ref);
      if (payment) {
        const statusStr = String(status).toLowerCase();
        const isSuccess = ['success', 'completed', 'successful'].includes(statusStr) || body.status === true || body.success === true;
        payment.status = isSuccess ? 'Success' : 'Failed';
        payment.rawWebhook = body;
        await db.savePayment(ref, payment);
      }
    }
    res.status(200).json({ received: true });
  } catch (err) {
    console.error('[webhook error]', err);
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
    if (!payment.processedForUser) {
      const user = await db.getUserById(currentUserId);
      if (user) {
        const days = getDaysForPlan(payment.plan || '1month');
        const currentExpiry = user.subscriptionExpiry && user.subscriptionExpiry > Date.now() ? user.subscriptionExpiry : Date.now();
        user.subscriptionExpiry = currentExpiry + days * 24 * 60 * 60 * 1000;
        await db.saveUser(user);
        
        payment.processedForUser = true;
        await db.savePayment(ref, payment);

        if (user.referredBy) {
          const referrer = await db.getUserById(user.referredBy);
          if (referrer && referrer.subscriptionExpiry) {
            referrer.subscriptionExpiry += 5 * 24 * 60 * 60 * 1000;
            await db.saveUser(referrer);
          }
        }

        if (user && user.email) {
          const plan = payment.plan || '1month';
          const expiryDate = new Date(user.subscriptionExpiry).toDateString();
          const receiptHtml = buildReceiptHtml({
            ref,
            userName: user.name,
            userEmail: user.email,
            plan,
            amount: payment.amount || PLANS[plan]?.kesPrice || 5000,
            currency: 'KES',
            method: 'M-Pesa (Payhero)',
            days,
            expiryDate
          });
          // Save receipt to DB
          await db.saveReceipt(ref, { html: receiptHtml, userId: currentUserId, plan, amount: payment.amount, createdAt: new Date().toISOString() });
          // Email receipt
          await sendEmail(user.email, `🧾 Your VIP Receipt — Pips Attendant`, receiptHtml);
        }
      }
    }

    const user = await db.getUserById(currentUserId);
    const sessionToken = jwt.sign({ id: user._id || user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });

    res.json({
      ok: true,
      status: 'Success',
      sessionToken,
      user: { id: user._id || user.id, email: user.email, name: user.name, subscriptionExpiry: user.subscriptionExpiry }
    });
  } else {
    res.json({ ok: true, status: payment.status });
  }
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
