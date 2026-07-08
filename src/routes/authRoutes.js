const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { authLimiter, passwordResetLimiter } = require('../middleware/rateLimiters');
const { validateUserSession, JWT_SECRET } = require('../middleware/auth');
const { getUserByEmail, getUserById, saveUser, getPaymentByAccessCode } = require('../services/db');
const { sendEmail } = require('../services/emailService');
const { sendTelegramMessage } = require('../services/telegramBot');
const logger = require('../utils/logger');

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function verifyPassword(password, hash) {
  if (!hash) return false;
  // Silent migration for old scrypt passwords (format: salt:key)
  if (hash.includes(':')) {
    const [salt, key] = hash.split(':');
    const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
    return key === derivedKey;
  }
  // New bcrypt passwords
  return bcrypt.compareSync(password, hash);
}

function generateUserToken(user) {
  return jwt.sign(
    { id: user._id || user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

router.post('/register', authLimiter, async (req, res) => {
  const { email, password, name, referralCode } = req.body;
  if (!email || !password) return res.status(400).json({ ok: false, error: 'Email and password required.' });
  
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
  if (!passwordRegex.test(password)) {
    return res.status(400).json({ ok: false, error: 'Password must be at least 8 characters long and include an uppercase letter, a lowercase letter, a number, and a special character.' });
  }

  const existingUser = await getUserByEmail(email);
  if (existingUser) return res.status(400).json({ ok: false, error: 'Email already registered.' });

  let referredByUserId = null;
  if (referralCode) {
    const referrer = await getUserById(referralCode);
    if (referrer) referredByUserId = referrer._id || referrer.id;
  }

  const user = {
    id: `USER_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    email: email.toLowerCase().trim(),
    name: name || '',
    passwordHash: hashPassword(password),
    registeredAt: new Date().toISOString(),
    subscriptionExpiry: null,
    referredBy: referredByUserId || null,
    telegramId: null
  };

  await saveUser(user);
  const sessionToken = generateUserToken(user);
  
  try {
    const appUrl = process.env.APP_URL || 'https://pipsattendant.top';
    const welcomeHtml = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:'Segoe UI',Arial,sans-serif;">
<div style="max-width:580px;margin:0 auto;background:#111827;border-radius:16px;border:1px solid rgba(251,191,36,0.2);overflow:hidden;">
  <div style="background:linear-gradient(135deg,#92400e,#b45309,#d97706);padding:36px 32px;text-align:center;">
    <div style="font-size:48px;margin-bottom:8px;">🚀</div>
    <h1 style="color:#fff;margin:0;font-size:26px;font-weight:800;letter-spacing:-0.5px;">Welcome to Pips Attendant!</h1>
    <p style="color:rgba(255,255,255,0.8);margin:8px 0 0;font-size:14px;">Your trading edge starts here</p>
  </div>
  <div style="padding:32px;">
    <p style="color:#d1d5db;font-size:15px;margin:0 0 12px;">Hi <strong style="color:#fbbf24;">${user.name || 'Trader'}</strong>,</p>
    <p style="color:#9ca3af;font-size:14px;line-height:1.7;margin:0 0 24px;">Your account has been successfully created. We are thrilled to have you on board with the Pips Attendant community!</p>
    <div style="background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.2);border-radius:12px;padding:20px;margin-bottom:24px;">
      <p style="color:#fbbf24;font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px;">What's Next?</p>
      <p style="color:#d1d5db;font-size:13px;margin:0 0 8px;">✅ Log in and select a VIP subscription plan</p>
      <p style="color:#d1d5db;font-size:13px;margin:0 0 8px;">✅ Get access to exclusive Telegram signals</p>
      <p style="color:#d1d5db;font-size:13px;margin:0;">✅ Join a community of profitable traders</p>
    </div>
    <div style="text-align:center;margin-bottom:24px;">
      <a href="${appUrl}/premium.html" style="background:linear-gradient(135deg,#f59e0b,#fbbf24);color:#0d0800;font-weight:700;padding:14px 32px;border-radius:12px;text-decoration:none;display:inline-block;font-size:15px;">View Subscription Plans →</a>
    </div>
    <p style="color:#6b7280;font-size:12px;text-align:center;margin:0;">Questions? Reply to this email or reach us at <a href="mailto:Support@pipsattendant.com" style="color:#fbbf24;">Support@pipsattendant.com</a></p>
  </div>
  <div style="padding:16px 32px;border-top:1px solid rgba(255,255,255,0.06);text-align:center;">
    <p style="color:#374151;font-size:11px;margin:0;">© ${new Date().getFullYear()} Pips Attendant. Happy Trading!</p>
  </div>
</div>
</body></html>`;
    sendEmail(user.email, 'Welcome to Pips Attendant VIP! 🚀', welcomeHtml).catch(e => logger.error('[Email] Welcome email failed: ' + e.message));
    // Notify admin on Telegram
    const adminChatId = process.env.TELEGRAM_CHAT_ID;
    if (adminChatId) {
      sendTelegramMessage(adminChatId, `🎉 *New User Registered*\n\n👤 Name: ${user.name || 'N/A'}\n📧 Email: ${user.email}\n🕐 ${new Date().toUTCString()}`).catch(() => {});
    }
  } catch (err) {
    logger.error('[Email] Failed to send welcome email: ' + err.message);
  }

  res.json({ ok: true, sessionToken, user: { id: user._id || user.id, email: user.email, name: user.name, subscriptionExpiry: user.subscriptionExpiry, telegramId: user.telegramId } });
});

router.post('/login', authLimiter, async (req, res) => {
  const { email: rawEmail, password } = req.body;
  if (!rawEmail || !password) return res.status(400).json({ ok: false, error: 'Email and password required.' });
  const email = rawEmail.toLowerCase().trim();

  const user = await getUserByEmail(email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ ok: false, error: 'Invalid email or password.' });
  }

  // Silent upgrade of password hash if it's the old scrypt format
  if (user.passwordHash.includes(':')) {
      user.passwordHash = hashPassword(password);
      await saveUser(user);
  }

  const sessionToken = generateUserToken(user);
  res.json({ ok: true, sessionToken, user: { id: user._id || user.id, email: user.email, name: user.name, subscriptionExpiry: user.subscriptionExpiry, telegramId: user.telegramId } });
});

router.get('/me', validateUserSession, (req, res) => {
  res.json({
    ok: true,
    user: {
      id: req.user._id || req.user.id,
      email: req.user.email,
      name: req.user.name,
      subscriptionExpiry: req.user.subscriptionExpiry,
      telegramId: req.user.telegramId
    }
  });
});

const resetTokens = new Map();

router.post('/forgot-password', passwordResetLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ ok: false, error: 'Email required.' });

  const user = await getUserByEmail(email);
  if (!user) return res.json({ ok: true });

  const token = crypto.randomBytes(32).toString('hex');
  resetTokens.set(email.toLowerCase().trim(), {
    token,
    exp: Date.now() + 15 * 60 * 1000
  });

  const PORT = process.env.PORT || 3000;
  const resetLink = `${process.env.APP_URL || 'http://localhost:' + PORT}/premium.html?resetToken=${token}&email=${encodeURIComponent(email)}`;
  
  await sendEmail(
    user.email,
    'Password Reset Request - Pips_attendant',
    `<h3>Password Reset Request</h3>
     <p>You requested a password reset. Click the link below to set a new password. This link expires in 15 minutes.</p>
     <a href="${resetLink}">Reset Password</a>
     <p>If you didn't request this, you can safely ignore this email.</p>`
  );

  res.json({ ok: true });
});

router.post('/reset-password', passwordResetLimiter, async (req, res) => {
  const { email, token, newPassword } = req.body;
  if (!email || !token || !newPassword) return res.status(400).json({ ok: false, error: 'Missing fields.' });

  const resetData = resetTokens.get(email.toLowerCase().trim());
  if (!resetData || resetData.token !== token || resetData.exp < Date.now()) {
    return res.status(400).json({ ok: false, error: 'Invalid or expired reset token.' });
  }

  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
  if (!passwordRegex.test(newPassword)) {
    return res.status(400).json({ ok: false, error: 'Password must be at least 8 characters long and include an uppercase letter, a lowercase letter, a number, and a special character.' });
  }

  const user = await getUserByEmail(email);
  if (!user) return res.status(400).json({ ok: false, error: 'User not found.' });

  user.passwordHash = hashPassword(newPassword);
  await saveUser(user);
  resetTokens.delete(email.toLowerCase().trim());

  res.json({ ok: true });
});

router.post('/change-password', validateUserSession, authLimiter, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) return res.status(400).json({ ok: false, error: 'Missing fields.' });

  const user = await getUserById(req.user._id || req.user.id);
  if (!user) return res.status(404).json({ ok: false, error: 'User not found.' });

  if (!verifyPassword(oldPassword, user.passwordHash)) {
    return res.status(401).json({ ok: false, error: 'Incorrect old password.' });
  }

  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
  if (!passwordRegex.test(newPassword)) {
    return res.status(400).json({ ok: false, error: 'Password must be at least 8 characters long and include an uppercase letter, a lowercase letter, a number, and a special character.' });
  }

  user.passwordHash = hashPassword(newPassword);
  await saveUser(user);
  res.json({ ok: true, message: 'Password updated successfully.' });
});

router.post('/update-profile', validateUserSession, async (req, res) => {
  const { name } = req.body;
  if (!name || name.trim() === '') return res.status(400).json({ ok: false, error: 'Name cannot be empty.' });

  const user = await getUserById(req.user._id || req.user.id);
  if (!user) return res.status(404).json({ ok: false, error: 'User not found.' });

  user.name = name.trim();
  await saveUser(user);
  res.json({ ok: true, message: 'Profile updated successfully.', name: user.name });
});

router.post('/leaderboard-optin', validateUserSession, async (req, res) => {
  const { optIn } = req.body;
  if (typeof optIn !== 'boolean') return res.status(400).json({ ok: false, error: 'optIn must be a boolean.' });

  const user = await getUserById(req.user._id || req.user.id);
  if (!user) return res.status(404).json({ ok: false, error: 'User not found.' });

  user.leaderboardOptIn = optIn;
  await saveUser(user);
  res.json({ ok: true, message: optIn ? 'Opted into leaderboard.' : 'Opted out of leaderboard.', optIn: user.leaderboardOptIn });
});

router.post('/redeem-code', validateUserSession, async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ ok: false, error: 'No access code provided.' });

  const payment = await getPaymentByAccessCode(code);
  if (!payment) return res.status(400).json({ ok: false, error: 'Invalid access code.' });

  if (payment.usedBy) {
    return res.status(400).json({ ok: false, error: 'This access code has already been used.' });
  }

  const user = await getUserById(req.user._id || req.user.id);
  if (!user) return res.status(404).json({ ok: false, error: 'User not found.' });

  const now = Date.now();
  if (!user.subscriptionExpiry || user.subscriptionExpiry < now) {
    user.subscriptionExpiry = now;
  }
  
  // PLANS['1month'] logic
  let daysToAdd = 30;
  if (payment.plan === '2months') daysToAdd = 60;
  if (payment.plan === '3months') daysToAdd = 90;
  
  user.subscriptionExpiry += daysToAdd * 24 * 60 * 60 * 1000;
  
  // Mark code as used
  payment.usedBy = user._id || user.id;
  payment.usedAt = now;
  const { savePayment } = require('../services/db');
  await savePayment(payment.reference, payment);
  await saveUser(user);

  try {
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9fafb; padding: 20px; border-radius: 8px;">
      <h2 style="color: #10b981; text-align: center;">Subscription Activated! 🎉</h2>
      <p>Hello ${user.name || 'Trader'},</p>
      <p>You have successfully redeemed an access code.</p>
      <p>Your account has been granted <strong>${daysToAdd} Days of VIP Access!</strong></p>
      <p>You can access the VIP portal anytime at <a href="${process.env.APP_URL || 'https://pipsattendant.com'}/premium.html" style="color: #10b981;">pipsattendant.com/premium.html</a>.</p>
      <br/>
      <p>Happy Trading,<br/>Pips Attendant Team</p>
      </div>
    `;
    sendEmail(user.email, '✅ VIP Access Granted! - Pips_attendant', emailHtml).catch(console.error);
  } catch (err) {
    console.error('Failed to send subscription email', err);
  }

  // --- Referral Auto-Bonus System ---
  if (user.referredBy && !user.hasPaidBefore) {
    const referrer = await getUserById(user.referredBy);
    if (referrer) {
      const nowMs = Date.now();
      if (!referrer.subscriptionExpiry || referrer.subscriptionExpiry < nowMs) {
        referrer.subscriptionExpiry = nowMs;
      }
      // Grant 5 bonus days
      referrer.subscriptionExpiry += 5 * 24 * 60 * 60 * 1000;
      await saveUser(referrer);
      
      try {
        const refHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9fafb; padding: 20px; border-radius: 8px;">
          <h2 style="color: #f59e0b; text-align: center;">You Earned a Referral Bonus! 🎁</h2>
          <p>Hello ${referrer.name || 'Trader'},</p>
          <p>Great news! A friend you referred just activated their VIP subscription.</p>
          <p>As a thank you, we've automatically added <strong>5 Bonus Days</strong> to your VIP access!</p>
          <br/>
          <p>Keep sharing your link to earn more free days!</p>
          <p>- Pips Attendant Team</p>
          </div>
        `;
        sendEmail(referrer.email, '🎁 5 Bonus Days Added! - Pips_attendant', refHtml).catch(console.error);
      } catch(err) {
        console.error('Failed to send referrer bonus email', err);
      }
    }
  }

  // Mark the user as having paid so they don't trigger the bonus again
  user.hasPaidBefore = true;
  await saveUser(user);
  // -----------------------------------

  res.json({ ok: true, message: 'Subscription successfully activated!', subscriptionExpiry: user.subscriptionExpiry });
});

router.get('/public-config', async (req, res) => {
  const { getAppConfig } = require('../services/db');
  const config = await getAppConfig();
  res.json({
    ok: true,
    config: {
      promoCodesEnabled: config?.promoCodesEnabled || false
    }
  });
});

module.exports = router;
