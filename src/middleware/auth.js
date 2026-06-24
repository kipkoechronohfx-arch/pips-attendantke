const jwt = require('jsonwebtoken');
const { getUserById } = require('../services/db');

// ── Secret Validation ──────────────────────────────────────────
// SECURITY: No hardcoded fallback secrets. Missing secrets cause a hard startup failure.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is not set. Server cannot start.');
}

const ADMIN_KEY = process.env.ADMIN_KEY;
if (!ADMIN_KEY) {
  throw new Error('FATAL: ADMIN_KEY environment variable is not set. Server cannot start.');
}

// ── Admin Key Validation ───────────────────────────────────────
function validateAdminKey(req, res, next) {
  const key = req.headers['x-admin-key'];
  // Constant-time comparison to prevent timing attacks
  if (!key || !ADMIN_KEY || key.length !== ADMIN_KEY.length) {
    return res.status(403).json({ ok: false, error: 'Unauthorized Access.' });
  }
  const crypto = require('crypto');
  const keyBuf  = Buffer.from(key,      'utf8');
  const expBuf  = Buffer.from(ADMIN_KEY, 'utf8');
  if (!crypto.timingSafeEqual(keyBuf, expBuf)) {
    return res.status(403).json({ ok: false, error: 'Unauthorized Access.' });
  }
  next();
}

// ── Admin Session Validation ───────────────────────────────────
// SECURITY: Legacy HMAC fallback removed. JWT-only validation going forward.
function validateAdminSession(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!token) return res.status(401).json({ ok: false, error: 'Missing admin session token.' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res.status(403).json({ ok: false, error: 'Unauthorized role.' });
    }
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: 'Invalid or expired token.' });
  }
}

// ── User Session Validation ────────────────────────────────────
// SECURITY: Legacy HMAC fallback removed. JWT-only validation going forward.
async function validateUserSession(req, res, next) {
  const token = req.headers['x-vip-token'] || req.query.token;
  if (!token) {
    console.error('[Auth Error] Missing token');
    return res.status(401).json({ ok: false, error: 'Missing token.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await getUserById(decoded.id);
    if (!user) {
      console.error('[Auth Error] User not found for ID:', decoded.id);
      return res.status(401).json({ error: 'User not found.' });
    }
    req.user = user;
    next();
  } catch (err) {
    console.error('[Auth Error] JWT Verify Error:', err.message);
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

// ── VIP Session Validation ─────────────────────────────────────
async function validateVipSession(req, res, next) {
  await validateUserSession(req, res, () => {
    const user = req.user;
    if (user && user.subscriptionExpiry && Date.now() <= user.subscriptionExpiry) {
      return next();
    }
    return res.status(403).json({ error: 'VIP Subscription required.' });
  });
}

module.exports = {
  JWT_SECRET,
  ADMIN_KEY,
  validateAdminKey,
  validateAdminSession,
  validateUserSession,
  validateVipSession
};
