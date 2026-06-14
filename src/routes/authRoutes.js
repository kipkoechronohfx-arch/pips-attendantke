const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { authLimiter } = require('../middleware/rateLimiters');
const { validateUserSession, JWT_SECRET } = require('../middleware/auth');
const { getUserByEmail, getUserById, saveUser, getPaymentByAccessCode } = require('../services/db');

// Add sendEmail placeholder since it was in server.js, in a real app this would be in services/email.js
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY || '');
async function sendEmail(to, subject, htmlContent) {
  if (!process.env.SENDGRID_API_KEY || !process.env.SENDGRID_FROM_EMAIL) {
    console.log('\\n========================================');
    console.log(`[Email Simulation] To: ${to}\\nSubject: ${subject}\\nBody: ${htmlContent}`);
    console.log('========================================\\n');
    return;
  }
  try {
    await sgMail.send({ to, from: process.env.SENDGRID_FROM_EMAIL, subject, html: htmlContent });
  } catch (error) { console.error('[SendGrid Error]', error); }
}

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function verifyPassword(password, hash) {
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
  
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[\\W_]).{8,}$/;
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
    const welcomeHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <h2 style="color: #fbbf24;">Welcome to Pips Attendant VIP! 🚀</h2>
        <p>Hi ${user.name || 'Trader'},</p>
        <p>Your account has been successfully created. We are thrilled to have you on board!</p>
        <p>To get started, please log in and select a subscription plan. Once subscribed, you will receive exclusive access to our VIP Telegram signals.</p>
        <p>Happy Trading!</p>
        <p>- The Pips Attendant Team</p>
      </div>
    `;
    sendEmail(user.email, 'Welcome to Pips Attendant VIP! 🚀', welcomeHtml).catch(console.error);
  } catch (err) {
    console.error('[Email] Failed to send welcome email', err);
  }

  res.json({ ok: true, sessionToken, user: { id: user._id || user.id, email: user.email, name: user.name, subscriptionExpiry: user.subscriptionExpiry, telegramId: user.telegramId } });
});

router.post('/login', authLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ ok: false, error: 'Email and password required.' });

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

router.post('/forgot-password', authLimiter, async (req, res) => {
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

router.post('/reset-password', authLimiter, async (req, res) => {
  const { email, token, newPassword } = req.body;
  if (!email || !token || !newPassword) return res.status(400).json({ ok: false, error: 'Missing fields.' });

  const resetData = resetTokens.get(email.toLowerCase().trim());
  if (!resetData || resetData.token !== token || resetData.exp < Date.now()) {
    return res.status(400).json({ ok: false, error: 'Invalid or expired reset token.' });
  }

  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[\\W_]).{8,}$/;
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

  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[\\W_]).{8,}$/;
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

  res.json({ ok: true, message: 'Subscription successfully activated!', subscriptionExpiry: user.subscriptionExpiry });
});

module.exports = router;
