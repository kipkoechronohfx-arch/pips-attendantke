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

// ── 2FA Setup Limiter (separate from login limiter) ───────────
// Higher limit than login (10 vs 5) since setup requires back-and-forth with app.
const twoFASetupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { ok: false, error: 'Too many 2FA setup attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true
});

// ── Password Reset Limiter (strict) ───────────────────────────
// Prevent malicious spamming of reset emails.
const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // Only 3 reset attempts per 15 mins
  message: { ok: false, error: 'Too many password reset attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});

// ── Admin Probe Limiter ────────────────────────────────────────
// SECURITY: Block scanners/bots hitting the admin URL without auth.
// 3 unauthenticated hits within 60s → 429 for the rest of the window.
// Successful (authenticated) requests are excluded so real admins are never throttled.
const adminProbeLimiter = rateLimit({
  windowMs: 60 * 1000,   // 60-second window
  max: 3,                // 3 unauthenticated attempts max
  skipSuccessfulRequests: true, // Authenticated hits don't count
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).send(
      '<html><body style="background:#000;color:#f00;font-family:monospace;' +
      'display:flex;align-items:center;justify-content:center;height:100vh;margin:0">' +
      '<div style="text-align:center"><h1>429</h1><p>Too Many Requests</p></div>' +
      '</body></html>'
    );
  }
});

// ── Lead Capture Limiter ───────────────────────────────────────
// Prevents bots from spamming the lead capture form with fake emails.
// Limit: 3 lead submissions per IP per 1 hour window.
const leadCaptureLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: { ok: false, error: 'Too many submissions from this IP. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = {
  vipAuthLimiter,
  authLimiter,
  adminLoginLimiter,
  twoFASetupLimiter,
  passwordResetLimiter,
  adminProbeLimiter,
  leadCaptureLimiter
};
