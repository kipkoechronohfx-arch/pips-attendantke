const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { validateAdminKey, validateAdminSession, JWT_SECRET } = require('../middleware/auth');
// ── Rate Limiters (imported from middleware) ──────────────────
const { adminLoginLimiter, twoFASetupLimiter } = require('../middleware/rateLimiters');
const db = require('../services/db');
const { sendEmail, buildReceiptHtml } = require('../services/emailService');

const CONFIG_FILE = path.join(process.cwd(), 'data', 'config.json');

async function getAdmin2FASecret() {
  const conf = await db.getAppConfig();
  if (conf && conf.admin2FASecret) return conf.admin2FASecret;
  return process.env.ADMIN_2FA_SECRET || null;
}

async function saveAdmin2FASecret(secret) {
  const conf = await db.getAppConfig();
  conf.admin2FASecret = secret;
  await db.saveAppConfig(conf);
}

// ── Admin 2FA & Login ────────────────────────────────────────
// SECURITY: adminLoginLimiter caps brute-force attempts to 5 per 15 min.
router.post('/login', adminLoginLimiter, validateAdminKey, async (req, res) => {
  try {
    const { totpToken } = req.body;
    const currentSecret = await getAdmin2FASecret();
    if (!currentSecret) {
      return res.json({ ok: false, requiresSetup: true });
    }
    if (!totpToken) {
      return res.status(400).json({
        ok: false,
        error: '2FA code required. Open your authenticator app and enter the 6-digit code.'
      });
    }
    const cleanedToken = String(totpToken).replace(/\s/g, '');
    // SECURITY: '000000' backdoor removed. Use /2fa/reset if locked out.
    // window: 2 = ±60 seconds tolerance for authenticator clock drift.
    const verified = speakeasy.totp.verify({
      secret: currentSecret,
      encoding: 'base32',
      token: cleanedToken,
      window: 2
    });
    if (!verified) {
      return res.status(401).json({
        ok: false,
        error: 'Invalid 2FA code. Make sure your phone clock is synced and try the current code.'
      });
    }
    const jwt = require('jsonwebtoken');
    const adminSessionToken = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ ok: true, adminToken: adminSessionToken });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /2fa/setup — generates QR + secret for fresh setup.
// If 2FA is already configured, returns an error telling the user to reset first.
// The frontend Reset 2FA button handles the reset flow.
router.get('/2fa/setup', validateAdminKey, async (req, res) => {
  try {
    const existing = await getAdmin2FASecret();
    if (existing) {
      return res.status(400).json({
        ok: false,
        error: '2FA is already configured. Click "Reset 2FA" first to generate a new QR code.',
        alreadyConfigured: true
      });
    }
    const secret = speakeasy.generateSecret({
      name: `Pips_attendant Admin (${req.headers['x-admin-key'].slice(0, 6)}...)`,
      length: 20
    });
    const qrDataUrl = await QRCode.toDataURL(secret.otpauth_url);
    res.json({ ok: true, secret: secret.base32, qrCode: qrDataUrl, otpauthUrl: secret.otpauth_url });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Use twoFASetupLimiter (separate from login limiter) to avoid cross-contamination.
router.post('/2fa/verify-setup', twoFASetupLimiter, validateAdminKey, async (req, res) => {
  const { secret, token } = req.body;
  if (!secret || !token) return res.status(400).json({ ok: false, error: 'Secret and token required.' });
  const cleanedToken = String(token).replace(/\s/g, '');
  // SECURITY: '000000' backdoor removed. Only real TOTP codes accepted.
  // window: 2 = ±60 seconds tolerance for authenticator clock drift.
  const verified = speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token: cleanedToken,
    window: 2
  });
  if (verified) {
    await saveAdmin2FASecret(secret);
    const jwt = require('jsonwebtoken');
    const adminSessionToken = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ ok: true, adminToken: adminSessionToken });
  } else {
    res.status(401).json({
      ok: false,
      error: 'Invalid code. Make sure your phone clock is synced and try the current code from your authenticator app.'
    });
  }
});

// ── Reset 2FA — clears stored secret so admin can re-scan a fresh QR ──
router.post('/2fa/reset', validateAdminKey, async (req, res) => {
  try {
    const conf = await db.getAppConfig();
    conf.admin2FASecret = null;
    await db.saveAppConfig(conf);
    res.json({ ok: true, message: '2FA secret cleared. Visit /2fa/setup to configure a new one.' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Analytics Overview ──────────────────────────────────────────
router.get('/analytics', validateAdminSession, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const users = await db.getUsers();
    const payments = await db.getPayments();
    
    const now = Date.now();
    const activeVIPs = users.filter(u => u.subscriptionExpiry && u.subscriptionExpiry > now).length;
    const expiredUsers = users.filter(u => u.subscriptionExpiry && u.subscriptionExpiry <= now).length;
    const conversionRate = users.length > 0 ? Math.round(((activeVIPs + expiredUsers) / users.length) * 100) : 0;
    
    const successfulPayments = payments.filter(p => p.status === 'Success');
    const kesPayments = successfulPayments.filter(p => !p.network); // USDT payments have a 'network' field
    const usdtPayments = successfulPayments.filter(p => p.network);

    const totalKES = kesPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const totalUSDT = usdtPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

    // Date range setup
    let endObj = endDate ? new Date(endDate) : new Date();
    endObj.setHours(23, 59, 59, 999);
    
    let startObj = startDate ? new Date(startDate) : new Date(endObj.getTime() - 29 * 24 * 60 * 60 * 1000);
    startObj.setHours(0, 0, 0, 0);

    const startMs = startObj.getTime();
    const endMs = endObj.getTime();

    // Calculate MRR based on the period selected
    const recentKES = kesPayments.filter(p => {
      const t = p.createdAt ? new Date(p.createdAt).getTime() : 0;
      return t >= startMs && t <= endMs;
    });
    const recentUSDT = usdtPayments.filter(p => {
      const t = p.timestamp ? new Date(p.timestamp).getTime() : 0;
      return t >= startMs && t <= endMs;
    });
    
    const mrrKES = recentKES.reduce((sum, p) => sum + (p.amount || 0), 0);
    const mrrUSDT = recentUSDT.reduce((sum, p) => sum + (p.amount || 0), 0);

    // Group users by date for the period
    const diffDays = Math.max(1, Math.ceil((endMs - startMs) / (1000 * 60 * 60 * 24)));
    const usersByDate = {};
    const revByDate = {};
    
    // Initialize all dates in range to 0
    for(let i = 0; i < diffDays; i++) {
      const d = new Date(startMs);
      d.setDate(d.getDate() + i);
      const ds = d.toISOString().split('T')[0];
      usersByDate[ds] = 0;
      revByDate[ds] = { kes: 0, usdt: 0 };
    }

    users.forEach(u => {
      // Assuming user.createdAt or use Date.now for mock
      const dateStr = (u.createdAt || new Date(now).toISOString()).split('T')[0];
      if (usersByDate[dateStr] !== undefined) usersByDate[dateStr]++;
    });

    kesPayments.forEach(p => {
      const dateStr = (p.createdAt || new Date().toISOString()).split('T')[0];
      if (revByDate[dateStr]) revByDate[dateStr].kes += (p.amount || 0);
    });
    usdtPayments.forEach(p => {
      const dateStr = (p.timestamp || p.createdAt || new Date().toISOString()).split('T')[0];
      if (revByDate[dateStr]) revByDate[dateStr].usdt += (p.amount || 0);
    });

    const labels = Object.keys(usersByDate);

    res.json({
      ok: true,
      totalUsers: users.length,
      activeVIPs,
      expiredUsers,
      conversionRate,
      totalKES,
      totalUSDT,
      mrrKES,
      mrrUSDT,
      chartData: {
        labels,
        values: Object.values(usersByDate)
      },
      revenueChart: {
        labels,
        kesData: labels.map(l => revByDate[l].kes),
        usdtData: labels.map(l => revByDate[l].usdt)
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Send Test Email ─────────────────────────────────────────────
router.post('/test-email', validateAdminSession, async (req, res) => {
  const { to } = req.body;
  if (!to) return res.status(400).json({ ok: false, error: 'Recipient email (to) is required.' });
  try {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #111827; padding: 32px; border-radius: 16px; color: #f9fafb;">
        <h2 style="color: #fbbf24; text-align: center; margin-bottom: 8px;">📧 SendGrid Test Email</h2>
        <p style="text-align: center; color: #9ca3af; margin-bottom: 24px; font-size: 14px;">This is a test sent from your Pips Attendant admin panel.</p>
        <div style="background: #1f2937; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
          <p style="color: #10b981; font-size: 18px; font-weight: bold; margin: 0;">✅ Email delivery is working!</p>
        </div>
        <p style="color: #6b7280; font-size: 12px; text-align: center;">Sent at: ${new Date().toUTCString()}</p>
      </div>
    `;
    await sendEmail(to, '🧪 Pips Attendant — SendGrid Test', html);
    res.json({ ok: true, message: `Test email dispatched to ${to}. Check inbox (and spam folder).` });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/system-status', validateAdminSession, async (req, res) => {
  res.json({
    ok: true,
    status: {
      mongodb: process.env.MONGODB_URI ? 'configured' : 'missing',
      telegramBot: process.env.TELEGRAM_BOT_TOKEN ? 'configured' : 'missing',
      telegramChatId: process.env.TELEGRAM_CHAT_ID ? 'configured' : 'missing',
      pushNotifications: (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) ? 'configured' : 'missing'
    }
  });
});

// ── Users & Subscribers ────────────────────────────────────────
router.get('/users', validateAdminSession, async (req, res) => {
  try {
    const users = await db.getUsers();
    const safeUsers = users.map(u => ({ id: u._id || u.id, email: u.email, name: u.name, registeredAt: u.registeredAt, subscriptionExpiry: u.subscriptionExpiry, subscriptionTier: u.subscriptionTier || 'Gold' }));
    res.json({ ok: true, count: safeUsers.length, users: safeUsers });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/users/:id/tier', validateAdminSession, async (req, res) => {
  try {
    const { tier } = req.body;
    if (!['Gold', 'Platinum'].includes(tier)) {
      return res.status(400).json({ ok: false, error: 'Invalid tier specified.' });
    }
    const user = await db.getUserById(req.params.id);
    if (!user) return res.status(404).json({ ok: false, error: 'User not found.' });
    
    user.subscriptionTier = tier;
    await db.saveUser(user);
    res.json({ ok: true, message: `User tier updated to ${tier}` });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/subscribers', validateAdminSession, async (req, res) => {
  try {
    const subscribers = await db.getSubscribers();
    res.json({ ok: true, count: subscribers.length, subscribers });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/whatsapp-list', validateAdminSession, async (req, res) => {
  try {
    const list = await db.getWhatsAppList();
    res.json({ ok: true, count: list.length, subscribers: list });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── VIP Documents ──────────────────────────────────────────────
router.get('/vip-documents', validateAdminSession, async (req, res) => {
  try {
    const documents = await db.getVipDocuments();
    res.json({ ok: true, documents });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/upload-vip-document', validateAdminSession, async (req, res) => {
  const { filename, fileData } = req.body;
  if (!filename || !fileData) return res.status(400).json({ ok: false, error: 'Missing filename or fileData.' });
  if (fileData.length > 14 * 1024 * 1024) return res.status(400).json({ ok: false, error: 'File size exceeds 10MB limit.' });
  try {
    await db.saveVipDocument(filename, fileData);
    res.json({ ok: true, message: `File ${filename} uploaded successfully.` });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.delete('/delete-vip-document/:filename', validateAdminSession, async (req, res) => {
  const { filename } = req.params;
  if (!filename) return res.status(400).json({ ok: false, error: 'Missing filename.' });
  try {
    const deleted = await db.deleteVipDocument(filename);
    if (deleted) res.json({ ok: true, message: `File ${filename} deleted successfully.` });
    else res.status(404).json({ ok: false, error: 'File not found.' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/update-vip-password', validateAdminSession, async (req, res) => {
  const { vipPassword } = req.body;
  if (!vipPassword || vipPassword.trim().length < 6) {
    return res.status(400).json({ ok: false, error: 'Password must be at least 6 characters.' });
  }
  try {
    const config = await db.getAppConfig();
    // SECURITY: Hash VIP password with bcrypt before storing (cost factor 10).
    config.vipPassword = await bcrypt.hash(vipPassword.trim(), 10);
    config.vipPasswordIsHashed = true; // flag so auth layer knows to use bcrypt.compare
    if (await db.saveAppConfig(config)) res.json({ ok: true, message: 'VIP password updated successfully.' });
    else res.status(500).json({ ok: false, error: 'Failed to save configuration.' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Today's Setup ──────────────────────────────────────────────
router.get('/todays-setup', validateAdminSession, async (req, res) => {
  try {
    const setup = await db.getAdminTodaysSetup();
    res.json({ ok: true, setup });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/upload-todays-setup', validateAdminSession, async (req, res) => {
  const { image, analysis, signalType } = req.body;
  if (!image) return res.status(400).json({ ok: false, error: 'Image required.' });
  try {
    await db.saveTodaysSetup({ image, analysis, signalType, timestamp: new Date().toISOString() });
    res.json({ ok: true, message: "Today's setup uploaded!" });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.delete('/todays-setup', validateAdminSession, async (req, res) => {
  try {
    await db.saveTodaysSetup({ image: null, analysis: null, signalType: null, timestamp: null });
    res.json({ ok: true, message: 'Setup cleared.' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Today's Setup Results ──────────────────────────────────────
router.get('/todays-setup-results', validateAdminSession, async (req, res) => {
  try {
    const setup = await db.getAdminTodaysSetupResults();
    res.json({ ok: true, setup });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/upload-todays-setup-results', validateAdminSession, async (req, res) => {
  const { image } = req.body;
  if (!image) return res.status(400).json({ ok: false, error: 'Image required.' });
  try {
    await db.saveTodaysSetupResults({ image, timestamp: new Date().toISOString() });
    res.json({ ok: true, message: "Today's setup results uploaded!" });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.delete('/todays-setup-results', validateAdminSession, async (req, res) => {
  try {
    await db.saveTodaysSetupResults({ image: null, timestamp: null });
    res.json({ ok: true, message: 'Setup results cleared.' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Crypto Requests ────────────────────────────────────────────
router.get('/crypto-requests', validateAdminSession, async (req, res) => {
  try {
    const requests = await db.getCryptoRequests();
    res.json({ ok: true, count: requests.length, requests });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/approve-crypto-request', validateAdminSession, async (req, res) => {
  const { requestId, upgradeToPlatinum } = req.body;
  if (!requestId) return res.status(400).json({ ok: false, error: 'Request ID required.' });
  try {
    const requests = await db.getCryptoRequests();
    const found = requests.find(r => r.id === requestId || r._id?.toString() === requestId);
    if (!found) return res.status(404).json({ ok: false, error: 'Request not found.' });

    const userId = found.userId;
    
    const PLANS = {
      '1month':           { days: 30,  tier: 'Gold' },
      '2months':          { days: 60,  tier: 'Gold' },
      '3months':          { days: 90,  tier: 'Gold' },
      '6months':          { days: 180, tier: 'Gold' },
      '1month_platinum':  { days: 30,  tier: 'Platinum' },
      '3months_platinum': { days: 90,  tier: 'Platinum' },
      'lifetime_platinum':{ days: 36500, tier: 'Platinum' }
    };
    
    let finalPlan = found.plan || '1month';
    if (upgradeToPlatinum && !finalPlan.includes('platinum')) {
      if (finalPlan === '1month' || finalPlan === '2months') finalPlan = '1month_platinum';
      else if (finalPlan === '3months' || finalPlan === '6months') finalPlan = '3months_platinum';
      else finalPlan = 'lifetime_platinum';
    }
    
    const planInfo = PLANS[finalPlan] || PLANS['1month'];
    const days = planInfo.days;
    const tier = planInfo.tier;

    let userEmail = null;
    let userName = null;

    if (userId) {
      const user = await db.getUserById(userId);
      if (user) {
        const currentExpiry = user.subscriptionExpiry && user.subscriptionExpiry > Date.now() ? user.subscriptionExpiry : Date.now();
        user.subscriptionExpiry = currentExpiry + days * 24 * 60 * 60 * 1000;
        if (tier === 'Platinum' || user.subscriptionTier !== 'Platinum') {
          user.subscriptionTier = tier;
        }
        await db.saveUser(user);
        
        // ── Referral Program: Credit Referrer 5 Days ────────────
        if (user.referredBy) {
          const referrer = await db.getUserById(user.referredBy);
          if (referrer && referrer.subscriptionExpiry) {
            referrer.subscriptionExpiry += 5 * 24 * 60 * 60 * 1000; // 5 days
            await db.saveUser(referrer);
          }
        }
        // ───────────────────────────────────────────────────────

        userEmail = user.email;
        userName = user.name;
      }
    }

    const ref = found.id || found._id?.toString();
    const generatedAccessCode = crypto.randomBytes(4).toString('hex').toUpperCase();
    
    await db.savePayment('CRYPTO_' + ref, {
      status: 'Success', method: 'crypto', txHash: found.txHash, network: found.network,
      contactInfo: found.contactInfo, userId, plan: finalPlan,
      processedForUser: !!userId, approvedAt: new Date().toISOString(), timestamp: new Date().toISOString(),
      accessCode: generatedAccessCode
    });

    const idStr = found._id?.toString() || found.id;
    await db.updateCryptoRequest(idStr, { status: 'Approved', approvedAt: new Date().toISOString(), accessCode: generatedAccessCode });

    const targetEmail = userEmail || (found.contactInfo && found.contactInfo.includes('@') ? found.contactInfo : null);

    if (targetEmail) {
      try {
        const plan = found.plan || '1month';
        const usdtMap = { '1month': 50, '2months': 95, '3months': 140, '6months': 250 };
        const amount = usdtMap[plan] || 50;
        const expiryDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toDateString();
        const receiptHtml = buildReceiptHtml({
          ref,
          userName: userName || 'Trader',
          userEmail: targetEmail,
          plan,
          amount,
          currency: 'USDT',
          method: `Crypto (${found.network || 'Unknown'})`,
          days,
          expiryDate
        });

        // Add the access code section at the top of the receipt
        const accessCodeSection = `
          <div style="background-color: #111827; padding: 20px; border-radius: 12px; text-align: center; margin: 25px 0;">
            <p style="color: #9ca3af; font-size: 13px; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 1px;">Your VIP Access Code</p>
            <p style="color: #10b981; font-size: 28px; font-weight: bold; font-family: monospace; letter-spacing: 3px; margin: 0;">${generatedAccessCode}</p>
          </div>
          ${!userEmail ? '<p style="color:#9ca3af;font-size:13px;text-align:center;">Create an account and use this code to activate your VIP status.</p>' : ''}
        `;
        const emailHtml = receiptHtml.replace('<div style="padding:32px;">', `<div style="padding:32px;">${accessCodeSection}`);

        // Save receipt to DB
        await db.saveReceipt(ref, { html: emailHtml, userId: userId || null, plan, amount, createdAt: new Date().toISOString() });
        // Email receipt
        sendEmail(targetEmail, '✅ VIP Access Granted! - Pips_attendant', emailHtml).catch(console.error);
      } catch (err) {
        console.error('Failed to send crypto approval email', err);
      }
    }

    res.json({ ok: true, message: `VIP granted. Access Code: ${generatedAccessCode}` });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/reject-crypto-request', validateAdminSession, async (req, res) => {
  const { requestId } = req.body;
  if (!requestId) return res.status(400).json({ ok: false, error: 'Request ID required.' });
  try {
    const requests = await db.getCryptoRequests();
    const found = requests.find(r => r.id === requestId || r._id?.toString() === requestId);
    if (!found) return res.status(404).json({ ok: false, error: 'Request not found.' });

    const idStr = found._id?.toString() || found.id;
    await db.updateCryptoRequest(idStr, { status: 'Rejected', rejectedAt: new Date().toISOString() });

    res.json({ ok: true, message: 'Request rejected.' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Promos ──────────────────────────────────────────────────────
router.get('/promos', validateAdminSession, async (req, res) => {
  const promos = await db.getPromos();
  const config = await db.getAppConfig();
  res.json({ ok: true, promos, promoCodesEnabled: config?.promoCodesEnabled || false });
});

router.post('/toggle-promo-codes', validateAdminSession, async (req, res) => {
  const { enabled } = req.body;
  const config = await db.getAppConfig();
  config.promoCodesEnabled = !!enabled;
  if (await db.saveAppConfig(config)) {
    res.json({ ok: true, promoCodesEnabled: config.promoCodesEnabled });
  } else {
    res.status(500).json({ ok: false, error: 'Failed to save configuration.' });
  }
});

router.post('/promos', validateAdminSession, async (req, res) => {
  const { code, discountPercentage, expiresAt, usageLimit } = req.body;
  if (!code || !discountPercentage) return res.status(400).json({ ok: false, error: 'Missing fields' });
  await db.savePromo({
    code: code.toUpperCase(),
    discountPercentage: Number(discountPercentage),
    active: true,
    createdAt: Date.now(),
    expiresAt: expiresAt ? new Date(expiresAt).getTime() : null,
    usageLimit: usageLimit ? Number(usageLimit) : null,
    usageCount: 0
  });
  res.json({ ok: true });
});

router.delete('/promos/:code', validateAdminSession, async (req, res) => {
  await db.deletePromo(req.params.code);
  res.json({ ok: true });
});

// ── Tickets ─────────────────────────────────────────────────────
router.get('/tickets', validateAdminSession, async (req, res) => {
  const tickets = await db.getTickets();
  res.json({ ok: true, tickets });
});

router.post('/tickets/:id/reply', validateAdminSession, async (req, res) => {
  const { message } = req.body;
  const ticket = (await db.getTickets()).find(t => t._id?.toString() === req.params.id);
  if (ticket) {
    ticket.messages.push({ sender: 'Admin', text: message, timestamp: Date.now() });
    ticket.status = 'Answered';
    ticket.updatedAt = Date.now();
    await db.saveTicket(ticket);
  }
  res.json({ ok: true });
});

router.post('/tickets/:id/close', validateAdminSession, async (req, res) => {
  const ticket = (await db.getTickets()).find(t => t._id?.toString() === req.params.id);
  if (ticket) {
    ticket.status = 'Closed';
    ticket.updatedAt = Date.now();
    await db.saveTicket(ticket);
  }
  res.json({ ok: true });
});

// ── Broadcast to Tickets ───────────────────────────────────────────
router.post('/broadcast-to-tickets', validateAdminSession, async (req, res) => {
  const { message } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ ok: false, error: 'Message is required.' });
  }
  try {
    const tickets = await db.getTickets();
    const openTickets = tickets.filter(t => t.status === 'Open' || t.status === 'Answered');

    for (const ticket of openTickets) {
      if (!ticket.messages) ticket.messages = [];
      ticket.messages.push({
        sender: 'Admin',
        text: `📣 Admin Broadcast:\n\n${message.trim()}`,
        timestamp: Date.now(),
        isBroadcast: true
      });
      ticket.updatedAt = Date.now();
      await db.saveTicket(ticket);
    }

    res.json({
      ok: true,
      count: openTickets.length,
      message: `Broadcast posted to ${openTickets.length} ticket(s).`
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Signal Outcome & Category Management ────────────────────────────────
router.post('/signals/:id/outcome', validateAdminSession, async (req, res) => {
  const { outcome } = req.body;
  const validOutcomes = ['TP Hit', 'SL Hit', 'Breakeven', 'Running'];
  if (!outcome || !validOutcomes.includes(outcome)) {
    return res.status(400).json({ ok: false, error: `Outcome must be one of: ${validOutcomes.join(', ')}` });
  }
  try {
    const updated = await db.updateSignalOutcome(req.params.id, outcome);
    if (!updated) return res.status(404).json({ ok: false, error: 'Signal not found or DB not connected.' });
    res.json({ ok: true, message: `Signal outcome set to "${outcome}"` });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/signals/:id/category', validateAdminSession, async (req, res) => {
  const { category } = req.body;
  const validCats = ['Forex', 'Crypto', 'Indices', 'Commodities'];
  if (!category || !validCats.includes(category)) {
    return res.status(400).json({ ok: false, error: `Category must be one of: ${validCats.join(', ')}` });
  }
  try {
    await db.updateSignalCategory(req.params.id, category);
    res.json({ ok: true, message: `Signal category set to "${category}"` });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Webhook Trigger (fire signal to all Platinum webhook URLs) ────
router.post('/signals/:id/webhook-trigger', validateAdminSession, async (req, res) => {
  try {
    const signals = await db.getSignals(50);
    const signal = signals.find(s => String(s._id || s.id) === req.params.id);
    if (!signal) return res.status(404).json({ ok: false, error: 'Signal not found.' });

    const users = await db.getUsers();
    const platinumUsersWithWebhook = users.filter(u => {
      const tier = String(u.subscriptionTier || '').toLowerCase();
      return tier.includes('platinum') && u.webhookUrl && u.subscriptionExpiry > Date.now();
    });

    if (platinumUsersWithWebhook.length === 0) {
      return res.json({ ok: true, message: 'No Platinum members with webhook URLs found.', sent: 0 });
    }

    const payload = {
      type: 'signal',
      source: 'PipsAttendant VIP',
      signal: {
        id: signal._id || signal.id,
        pair: signal.pair,
        action: signal.action,
        entry: signal.entry,
        tp: signal.tp,
        sl: signal.sl,
        outcome: signal.outcome,
        timestamp: signal.createdAt || new Date().toISOString()
      }
    };

    let successCount = 0;
    const results = await Promise.allSettled(
      platinumUsersWithWebhook.map(u =>
        fetch(u.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(5000)
        }).then(r => r.ok ? 'ok' : 'fail').catch(() => 'fail')
      )
    );

    results.forEach(r => { if (r.status === 'fulfilled' && r.value === 'ok') successCount++; });

    res.json({ ok: true, message: `Webhook sent to ${successCount}/${platinumUsersWithWebhook.length} Platinum members.`, sent: successCount, total: platinumUsersWithWebhook.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Analytics ────────────────────────────────────────────────
router.get('/analytics', validateAdminSession, async (req, res) => {
  try {
    const users = await db.getUsers();
    const now = Date.now();
    let activeVIPs = 0;
    let expiredUsers = 0;

    // 30-day signup chart
    const last30Days = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now - i * 24 * 60 * 60 * 1000);
      last30Days[d.toISOString().split('T')[0]] = 0;
    }

    users.forEach(user => {
      if (user.subscriptionExpiry && user.subscriptionExpiry > now) activeVIPs++;
      else if (user.subscriptionExpiry && user.subscriptionExpiry <= now) expiredUsers++;
      const dateStr = (user.registeredAt || '').split('T')[0];
      if (last30Days[dateStr] !== undefined) last30Days[dateStr]++;
    });

    let totalKES = 0, totalUSDT = 0, mrrKES = 0, mrrUSDT = 0;
    const payments = await db.getAllPayments();
    const cryptoPayments = await db.getCryptoRequests();

    // Revenue by month (last 6 months)
    const revenueByMonth = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now);
      d.setMonth(d.getMonth() - i);
      const key = d.toISOString().slice(0, 7); // YYYY-MM
      revenueByMonth[key] = { kes: 0, usdt: 0 };
    }

    payments.filter(p => p.status === 'Success').forEach(p => {
      const amount = Number(p.amount) || 0;
      totalKES += amount;
      if (p.plan === '1month') mrrKES += amount;
      if (p.plan === '2months') mrrKES += amount / 2;
      if (p.plan === '3months') mrrKES += amount / 3;
      if (p.plan === '6months') mrrKES += amount / 6;
      // Revenue by month
      const monthKey = (p.timestamp || p.createdAt || '').slice(0, 7);
      if (revenueByMonth[monthKey]) revenueByMonth[monthKey].kes += amount;
    });

    cryptoPayments.filter(p => p.status === 'Approved').forEach(p => {
      const usdtMap = { '1month': 50, '2months': 95, '3months': 140, '6months': 250 };
      const amount = usdtMap[p.plan] || 50;
      totalUSDT += amount;
      if (p.plan === '1month') mrrUSDT += amount;
      if (p.plan === '2months') mrrUSDT += amount / 2;
      if (p.plan === '3months') mrrUSDT += amount / 3;
      if (p.plan === '6months') mrrUSDT += amount / 6;
      const monthKey = (p.timestamp || '').slice(0, 7);
      if (revenueByMonth[monthKey]) revenueByMonth[monthKey].usdt += amount;
    });

    // Conversion rate: users who ever paid vs total registered
    const payingUserIds = new Set(
      payments.filter(p => p.status === 'Success' && p.userId).map(p => String(p.userId))
    );
    const conversionRate = users.length > 0
      ? Math.round((payingUserIds.size / users.length) * 100)
      : 0;

    // Signal stats
    const signalStats = await db.getSignalStats();

    res.json({
      ok: true,
      totalUsers: users.length,
      activeVIPs,
      expiredUsers,
      freeUsers: users.length - activeVIPs - expiredUsers,
      conversionRate,
      totalKES,
      totalUSDT,
      mrrKES: Math.round(mrrKES),
      mrrUSDT: Math.round(mrrUSDT),
      signalStats,
      chartData: {
        labels: Object.keys(last30Days),
        values: Object.values(last30Days)
      },
      revenueChart: {
        labels: Object.keys(revenueByMonth),
        kes: Object.values(revenueByMonth).map(m => m.kes),
        usdt: Object.values(revenueByMonth).map(m => m.usdt)
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Payment History (filterable) ────────────────────────────────
router.get('/payments', validateAdminSession, async (req, res) => {
  try {
    const { status, method, plan, from, to } = req.query;
    let payments = await db.getAllPayments();
    const cryptoPayments = (await db.getCryptoRequests()).map(p => ({
      ...p,
      method: 'crypto',
      status: p.status === 'Approved' ? 'Success' : p.status,
      amount: { '1month': 50, '2months': 95, '3months': 140, '6months': 250 }[p.plan] || 50,
      currency: 'USDT'
    }));

    let all = [
      ...payments.map(p => ({ ...p, currency: 'KES', method: p.method || 'mpesa' })),
      ...cryptoPayments
    ];

    if (status) all = all.filter(p => p.status === status);
    if (method) all = all.filter(p => (p.method || '').toLowerCase() === method.toLowerCase());
    if (plan) all = all.filter(p => p.plan === plan);
    if (from) all = all.filter(p => new Date(p.timestamp || p.createdAt || 0) >= new Date(from));
    if (to) all = all.filter(p => new Date(p.timestamp || p.createdAt || 0) <= new Date(to));

    all.sort((a, b) => new Date(b.timestamp || b.createdAt || 0) - new Date(a.timestamp || a.createdAt || 0));

    res.json({ ok: true, count: all.length, payments: all });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Payment CSV Export ────────────────────────────────────────────
router.get('/payments/export', validateAdminSession, async (req, res) => {
  try {
    const payments = await db.getAllPayments();
    const cryptoPayments = await db.getCryptoRequests();

    const rows = [
      ['Reference', 'Date', 'Method', 'Plan', 'Amount', 'Currency', 'Status', 'User ID', 'Phone/Contact']
    ];

    payments.forEach(p => {
      rows.push([
        p.reference || p.ref || '',
        p.timestamp || '',
        'M-Pesa',
        p.plan || '',
        p.amount || '',
        'KES',
        p.status || '',
        p.userId || '',
        p.phone || ''
      ]);
    });

    cryptoPayments.forEach(p => {
      const usdtMap = { '1month': 50, '2months': 95, '3months': 140, '6months': 250 };
      rows.push([
        p.id || p._id || '',
        p.timestamp || '',
        `Crypto (${p.network || 'Unknown'})`,
        p.plan || '',
        usdtMap[p.plan] || 50,
        'USDT',
        p.status || '',
        p.userId || '',
        p.contactInfo || ''
      ]);
    });

    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="payments_${new Date().toISOString().slice(0,10)}.csv"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
router.get('/bookings', async (req, res) => {
  try {
    const { getBookings } = require('../services/db');
    const bookings = await getBookings();
    res.json({ ok: true, bookings });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Failed to fetch bookings.' });
  }
});

router.post('/bookings/:id/status', async (req, res) => {
  try {
    const { getBookings, saveBooking } = require('../services/db');
    const { sendEmail } = require('../services/emailService');
    const bookings = await getBookings();
    const booking = bookings.find(b => String(b._id) === req.params.id);
    if (!booking) return res.status(404).json({ ok: false, error: 'Booking not found.' });

    const { status } = req.body;
    if (!['Pending', 'Accepted', 'Completed', 'Cancelled'].includes(status)) {
      return res.status(400).json({ ok: false, error: 'Invalid status.' });
    }

    const oldStatus = booking.status;
    booking.status = status;
    await saveBooking(booking);

    // Send email notification on status change to Accepted or Cancelled (Declined)
    if (oldStatus !== status && (status === 'Accepted' || status === 'Cancelled') && booking.userEmail) {
      const isAccepted = status === 'Accepted';
      const subject = isAccepted ? '✅ Mentorship Session Accepted' : '❌ Mentorship Session Declined';
      const body = `
        <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #111827; padding: 32px; border-radius: 16px; color: #f9fafb;">
          <h2 style="color: ${isAccepted ? '#10b981' : '#f43f5e'}; text-align: center; margin-bottom: 8px;">${subject}</h2>
          <p style="text-align: center; color: #9ca3af; margin-bottom: 24px; font-size: 14px;">Update regarding your 1-on-1 session request</p>
          <div style="background: #1f2937; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
            <p style="color: #d1d5db; margin: 0 0 10px 0;"><strong>Date:</strong> ${booking.date}</p>
            <p style="color: #d1d5db; margin: 0 0 10px 0;"><strong>Time:</strong> ${booking.time} UTC</p>
            <p style="color: #d1d5db; margin: 0;"><strong>Topic:</strong> ${booking.topic}</p>
          </div>
          <p style="text-align: center; color: #d1d5db;">
            ${isAccepted 
              ? 'Your session has been approved. Your mentor will connect with you via Telegram at the scheduled time.' 
              : 'Unfortunately, your session request could not be accommodated at this time. Please try booking a different slot.'}
          </p>
        </div>
      `;
      sendEmail(booking.userEmail, subject, body).catch(e => console.error('Booking status email failed:', e));
    }

    res.json({ ok: true, message: 'Status updated', booking });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Failed to update booking status.' });
  }
});

// ── Announcements ────────────────────────────────────────────────
const { getAnnouncements, saveAnnouncement, deleteAnnouncement } = require('../services/db');

router.get('/announcements', validateAdminSession, async (req, res) => {
  try {
    const list = await getAnnouncements();
    res.json({ ok: true, announcements: list });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Failed to fetch announcements.' });
  }
});

router.post('/announcements', validateAdminSession, async (req, res) => {
  try {
    const { title, message, type } = req.body;
    if (!title || !message) {
      return res.status(400).json({ ok: false, error: 'Title and message are required.' });
    }
    const announcement = await saveAnnouncement({
      title: title.trim(),
      message: message.trim(),
      type: type || 'info', // 'info' | 'warning' | 'success'
      createdAt: new Date().toISOString()
    });
    
    // Broadcast Push Notification
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      try {
        const webpush = require('web-push');
        const { getPushSubscriptions, deletePushSubscription } = require('../services/db');
        webpush.setVapidDetails(
          'mailto:support@pipsattendant.com',
          process.env.VAPID_PUBLIC_KEY,
          process.env.VAPID_PRIVATE_KEY
        );
        const subscriptions = await getPushSubscriptions();
        const payload = JSON.stringify({
          title: 'New Announcement: ' + title.trim(),
          body: message.trim(),
          icon: '/favicon.png',
          badge: '/favicon.png',
          tag: 'pips-announcement',
          url: '/premium.html'
        });
        const promises = subscriptions.map(sub => 
          webpush.sendNotification(sub, payload).catch(err => {
            if (err.statusCode === 404 || err.statusCode === 410) {
              return deletePushSubscription(sub);
            }
          })
        );
        await Promise.all(promises);
      } catch (pushErr) {
        console.error('Failed to send push notification for announcement:', pushErr);
      }
    }
    
    res.json({ ok: true, announcement });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Failed to save announcement.' });
  }
});

router.delete('/announcements/:id', validateAdminSession, async (req, res) => {
  try {
    await deleteAnnouncement(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Failed to delete announcement.' });
  }
});

// ── Analytics ──────────────────────────────────────────────────
router.get('/analytics', validateAdminSession, async (req, res) => {
  try {
    const { getUsers, getBookings, getJournalColl, readJSON } = require('../services/db');
    
    // Users
    const users = await getUsers();
    const totalUsers = users.length;
    const platinumUsers = users.filter(u => String(u.subscriptionTier || '').toLowerCase().includes('platinum')).length;
    const goldUsers = totalUsers - platinumUsers;
    const now = Date.now();
    const activeUsers = users.filter(u => u.subscriptionExpiry && u.subscriptionExpiry > now).length;
    
    // Bookings
    const bookings = await getBookings();
    const pendingBookings = bookings.filter(b => b.status === 'pending').length;
    
    // Journal Entries (Total)
    let totalTrades = 0;
    try {
      const dbInstance = require('../services/db').db;
      if (dbInstance) {
        totalTrades = await getJournalColl().countDocuments();
      } else {
        const path = require('path');
        const JOURNAL_FILE = path.join(process.cwd(), 'data', 'journal.json');
        totalTrades = readJSON(JOURNAL_FILE).length;
      }
    } catch (e) {
      console.error('Error fetching journal stats', e);
    }
    
    res.json({
      ok: true,
      stats: {
        totalUsers,
        platinumUsers,
        goldUsers,
        activeUsers,
        expiredUsers: totalUsers - activeUsers,
        pendingBookings,
        totalTrades
      }
    });
  } catch (err) {
    console.error('Analytics Error:', err);
    res.status(500).json({ ok: false, error: 'Failed to load analytics.' });
  }
});
// ── Daily Market Brief ─────────────────────────────────────────
router.post('/daily-brief', validateAdminSession, async (req, res) => {
  try {
    const { bias, keyLevels, note } = req.body;
    if (!bias) return res.status(400).json({ ok: false, error: 'Bias is required.' });
    const conf = await db.getAppConfig();
    conf.dailyBrief = {
      bias: bias.trim(),
      keyLevels: keyLevels ? keyLevels.trim() : '',
      note: note ? note.trim() : '',
      postedAt: new Date().toISOString()
    };
    await db.saveAppConfig(conf);
    res.json({ ok: true, brief: conf.dailyBrief });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Failed to save daily brief.' });
  }
});

// ── Bulk Email Blast ────────────────────────────────────────────
router.post('/email-blast', validateAdminSession, async (req, res) => {
  try {
    const { subject, htmlBody, tierFilter } = req.body;
    if (!subject || !htmlBody) return res.status(400).json({ ok: false, error: 'Subject and body are required.' });

    let users = await db.getUsers();
    if (tierFilter && tierFilter !== 'all') {
      users = users.filter(u => {
        const tier = String(u.subscriptionTier || '').toLowerCase();
        if (tierFilter === 'platinum') return tier.includes('platinum');
        if (tierFilter === 'gold') return !tier.includes('platinum');
        return true;
      });
    }
    const targets = users.filter(u => u.email);
    let sent = 0, failed = 0;
    for (const user of targets) {
      try {
        const personalised = htmlBody.replace(/{{name}}/g, user.name || 'Trader');
        await sendEmail(user.email, subject, personalised);
        sent++;
      } catch (e) { failed++; }
    }
    res.json({ ok: true, sent, failed, total: targets.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Email blast failed: ' + err.message });
  }
});

module.exports = router;
