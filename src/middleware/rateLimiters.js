const rateLimit = require('express-rate-limit');

const vipAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 password attempts per window
  message: { ok: false, error: 'Too many password attempts. Try again in 15 minutes.' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // Limit each IP to 15 login/register attempts per window
  message: { ok: false, error: 'Too many authentication attempts. Try again in 15 minutes.' }
});

module.exports = {
  vipAuthLimiter,
  authLimiter
};
