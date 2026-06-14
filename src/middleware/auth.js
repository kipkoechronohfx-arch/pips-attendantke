const jwt = require('jsonwebtoken');
const { getUserById } = require('../services/db');

const JWT_SECRET = process.env.JWT_SECRET || process.env.SERVER_SECRET || 'pips-attendant-local-secret-key-2026';

function validateAdminKey(req, res, next) {
  const key = req.headers['x-admin-key'];
  const expectedKey = process.env.ADMIN_KEY || 'pips-admin-2026';
  if (key !== expectedKey) {
    return res.status(403).json({ ok: false, error: 'Unauthorized Access.' });
  }
  next();
}

function validateAdminSession(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!token) return res.status(401).json({ ok: false, error: 'Missing admin session token.' });
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'admin') return res.status(403).json({ ok: false, error: 'Unauthorized role.' });
    req.admin = decoded;
    next();
  } catch (err) {
    // Fallback for old HMAC tokens to avoid breaking active sessions immediately
    if (token.includes('.')) {
        try {
            const parts = token.split('.');
            if (parts.length === 2) {
                const serverSecret = process.env.SERVER_SECRET || 'pips-attendant-local-secret-key-2026';
                const expectedHmac = require('crypto').createHmac('sha256', serverSecret).update(parts[0]).digest('hex');
                if (parts[1] === expectedHmac) {
                    const payload = JSON.parse(Buffer.from(parts[0], 'base64').toString('utf8'));
                    if (payload.role === 'admin' && (!payload.exp || Date.now() <= payload.exp)) {
                        req.admin = payload;
                        return next();
                    }
                }
            }
        } catch(e) {}
    }
    return res.status(401).json({ ok: false, error: 'Invalid or expired token.' });
  }
}

async function validateUserSession(req, res, next) {
  const token = req.headers['x-vip-token'] || req.query.token;
  if (!token) return res.status(401).json({ ok: false, error: 'Missing token.' });
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await getUserById(decoded.id);
    if (!user) return res.status(401).json({ error: 'User not found.' });
    req.user = user;
    next();
  } catch (err) {
    // Legacy token fallback
    if (token.includes('.')) {
        try {
            const parts = token.split('.');
            if (parts.length === 2) {
                const serverSecret = process.env.SERVER_SECRET || 'pips-attendant-local-secret-key-2026';
                const expectedHmac = require('crypto').createHmac('sha256', serverSecret).update(parts[0]).digest('hex');
                if (parts[1] === expectedHmac) {
                    const decodedStr = Buffer.from(parts[0], 'base64').toString('utf8');
                    if (decodedStr.includes('"id"')) {
                        const payload = JSON.parse(decodedStr);
                        if (Date.now() <= payload.exp) {
                            const user = await getUserById(payload.id);
                            if (user) {
                                req.user = user;
                                return next();
                            }
                        }
                    }
                }
            }
        } catch(e) {}
    }
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

async function validateVipSession(req, res, next) {
  await validateUserSession(req, res, () => {
      const user = req.user;
      if (user && user.subscriptionExpiry && Date.now() <= user.subscriptionExpiry) {
          return next();
      }
      return res.status(403).json({ error: 'VIP Subscription required.' });
  });
}

// Fallback legacy admin key for certain VIP operations (used in old /api/verify-vip)
function vipAuthLimiter(req, res, next) {
    // Deprecated. We'll use express-rate-limit in route definition instead.
    next();
}

module.exports = {
  JWT_SECRET,
  validateAdminKey,
  validateAdminSession,
  validateUserSession,
  validateVipSession
};
