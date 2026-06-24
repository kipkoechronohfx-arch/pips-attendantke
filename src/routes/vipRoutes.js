const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../services/db');
const { validateVipSession, JWT_SECRET } = require('../middleware/auth');
const { vipAuthLimiter } = require('../middleware/rateLimiters');

router.post('/verify-vip', vipAuthLimiter, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ ok: false, error: 'Password required.' });

  const config = await db.getAppConfig();
  if (!config || !config.vipPassword) {
    return res.status(503).json({ ok: false, error: 'VIP access is not configured yet.' });
  }

  // SECURITY: Support bcrypt-hashed passwords (set via admin panel) and
  // legacy plaintext passwords (for backward compatibility during migration).
  let match = false;
  if (config.vipPasswordIsHashed) {
    match = await bcrypt.compare(password, config.vipPassword);
  } else {
    match = (password === config.vipPassword);
  }

  if (match) {
    const sessionToken = jwt.sign({ role: 'legacy_vip' }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ ok: true, sessionToken });
  } else {
    res.status(401).json({ ok: false, error: 'Incorrect VIP password.' });
  }
});

router.post('/verify-access-code', vipAuthLimiter, async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ ok: false, error: 'Access code required.' });

  const payment = await db.getPaymentByAccessCode(code);
  if (!payment) return res.status(401).json({ ok: false, error: 'Invalid access code.' });

  let days = 30;
  if (payment.plan === '2months') days = 60;
  if (payment.plan === '3months') days = 90;
  
  const expiry = new Date(new Date(payment.timestamp || payment.approvedAt || Date.now()).getTime() + days * 24 * 60 * 60 * 1000);
  if (Date.now() > expiry.getTime()) {
    return res.status(401).json({ ok: false, error: 'This access code has expired.' });
  }

  const sessionToken = jwt.sign({ role: 'legacy_vip', accessCode: code }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ ok: true, sessionToken });
});

router.get('/chat/messages', validateVipSession, async (req, res) => {
  try {
    const msgs = await db.getChatMessages();
    res.json({ ok: true, messages: msgs });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/chat/message', validateVipSession, async (req, res) => {
  const { author, text } = req.body;
  if (!text) return res.status(400).json({ ok: false, error: 'Message required' });
  try {
    const msg = await db.addChatMessage({ author: author || 'VIP Member', text });
    res.json({ ok: true, message: msg });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/todays-setup', validateVipSession, async (req, res) => {
  try {
    const setup = await db.getTodaysSetup();
    res.json({ ok: true, setup });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/todays-setup-results', validateVipSession, async (req, res) => {
  try {
    const setup = await db.getTodaysSetupResults();
    res.json({ ok: true, setup });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Used to download VIP PDF/ZIP documents securely via browser download
router.get('/download-vip', async (req, res) => {
  const { token, file } = req.query;
  if (!token) return res.status(401).send('Missing token.');

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // basic check to see if user has VIP status
    if (decoded.role !== 'legacy_vip') {
        const user = await db.getUserById(decoded.id);
        if (!user || !user.subscriptionExpiry || Date.now() > user.subscriptionExpiry) {
            return res.status(403).send('VIP Subscription required or expired.');
        }
    }
  // SECURITY: Legacy HMAC token fallback removed. JWT verification only.
  } catch (err) {
    return res.status(401).send('Invalid or expired token.');
  }

  try {
    const filename = file || 'pips_attendant_vip_guide.pdf';
    const document = await db.getVipDocument(filename);
    if (!document) return res.status(404).send('Document not found on the server.');

    const base64Data = document.fileData.split(',')[1];
    const mimeMatch = document.fileData.match(/^data:(.*);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'application/octet-stream';

    const buffer = Buffer.from(base64Data, 'base64');
    res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
    res.setHeader('Content-Type', mimeType);
    res.send(buffer);
  } catch (err) {
    res.status(500).send('Error downloading file: ' + err.message);
  }
});

module.exports = router;
