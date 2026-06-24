const rateLimit = require('express-rate-limit');

// ── VIP Auth Limiter ───────────────────────────────────────────
const vipAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 password attempts per window
  message: { ok: false, error: 'Too many password attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});

// ── General Auth Limiter ───────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // Limit each IP to 15 login/register attempts per window
  message: { ok: false, error: 'Too many authentication attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});

// ── Admin Login Limiter (strict) ───────────────────────────────
// SECURITY: Only 5 attempts per 15 minutes to protect admin panel from brute-force.
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: { ok: false, error: 'Too many admin login attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true // Only count failures against the limit
});

module.exports = {
  vipAuthLimiter,
  authLimiter,
  adminLoginLimiter
};
