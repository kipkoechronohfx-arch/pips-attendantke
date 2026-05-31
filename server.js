/**
 * ============================================================
 *  Pips_attendant — Express Backend Server
 * ============================================================
 *  Handles:
 *   - Serving the static frontend files
 *   - Securely proxying Telegram API calls (bot token never exposed)
 *   - Server-side VIP password verification
 *   - Signal history logging (read/write to data/signals.json)
 *   - Subscriber collection (data/subscribers.json)
 * ============================================================
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.set('trust proxy', 1); // Trust Render's load balancer for rate limiting
const PORT = process.env.PORT || 3000;

// Generate a secure HMAC key on startup
const serverSecret = crypto.randomBytes(32).toString('hex');

// ── Paths ────────────────────────────────────────────────────
const DATA_DIR     = path.join(__dirname, 'data');
const SIGNALS_FILE = path.join(DATA_DIR, 'signals.json');
const SUBS_FILE    = path.join(DATA_DIR, 'subscribers.json');
const VIP_DOCS_DIR = path.join(DATA_DIR, 'vip_documents');
const CONFIG_FILE  = path.join(DATA_DIR, 'config.json');
const PAYMENTS_FILE= path.join(DATA_DIR, 'payments.json');

// Helper to get configuration (especially dynamic VIP password)
function getAppConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('[config read error]', err.message);
  }
  return { vipPassword: process.env.VIP_PASSWORD || 'PIPSVIP2026' };
}

function saveAppConfig(config) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    return true;
  } catch (err) {
    console.error('[config write error]', err.message);
    return false;
  }
}

function validateAdminKey(req, res, next) {
  const key = req.headers['x-admin-key'];
  const expectedKey = process.env.ADMIN_KEY || 'pips-admin-2026';
  if (key !== expectedKey) {
    return res.status(403).json({ ok: false, error: 'Forbidden. Invalid admin key.' });
  }
  next();
}

// Ensure data directory and files exist on first run
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(SIGNALS_FILE)) fs.writeFileSync(SIGNALS_FILE, '[]');
if (!fs.existsSync(SUBS_FILE))    fs.writeFileSync(SUBS_FILE, '[]');
if (!fs.existsSync(PAYMENTS_FILE))fs.writeFileSync(PAYMENTS_FILE, '{}');

// Ensure VIP documents directory and placeholder files exist
if (!fs.existsSync(VIP_DOCS_DIR)) fs.mkdirSync(VIP_DOCS_DIR);
const dummyDocs = [
  { name: 'smart-money-concepts-guide.pdf', content: 'PDF Dummy Content: Smart Money Concepts Guide' },
  { name: 'risk-management-workbook.pdf', content: 'PDF Dummy Content: Risk Management Workbook' },
  { name: 'high-probability-setups-playbook.pdf', content: 'PDF Dummy Content: High Probability Setups Playbook' },
  { name: 'custom-ema-settings-pack.zip', content: 'ZIP Dummy Content: Custom EMA Settings Pack' },
  { name: 'session-kill-zones-cheat-sheet.pdf', content: 'PDF Dummy Content: Session Kill Zones Cheat Sheet' }
];
dummyDocs.forEach(doc => {
  const filePath = path.join(VIP_DOCS_DIR, doc.name);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, doc.content);
  }
});

// ── Middleware ───────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Global rate limiter for all API requests
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: { ok: false, error: 'Too many requests, please try again later.' }
});

// Stricter rate limiter specifically for VIP password verification
const vipAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 failed/successful password attempts per window
  message: { ok: false, error: 'Too many password attempts. Try again in 15 minutes.' }
});

app.use('/api/', globalLimiter);

// Block access to sensitive server configuration/code files
app.use((req, res, next) => {
  const forbiddenFiles = ['.env', 'server.js', 'package.json', 'package-lock.json', '.gitignore'];
  const requestedFile = path.basename(req.path).toLowerCase();
  if (forbiddenFiles.includes(requestedFile) || req.path.startsWith('/data')) {
    return res.status(403).json({ error: 'Access Denied' });
  }
  next();
});

app.use(express.static(__dirname)); // Serve all static HTML/CSS/JS files

// ── Helpers ──────────────────────────────────────────────────
function readJSON(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return []; }
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function getCredentials(body) {
  // Accept credentials from environment (server-side) or fallback to body for legacy
  return {
    token:  process.env.TELEGRAM_BOT_TOKEN || body.token,
    chatId: process.env.TELEGRAM_CHAT_ID   || body.chatId,
  };
}

function now() {
  return new Date().toISOString();
}

// ════════════════════════════════════════════════════════════
//  ROUTES
// ════════════════════════════════════════════════════════════

// ── Health check ─────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: now(), service: 'pips-attendant-api' });
});

// ── POST /api/broadcast ──────────────────────────────────────
// Send a trade signal or message to Telegram
app.post('/api/broadcast', async (req, res) => {
  const { token, chatId } = getCredentials(req.body);
  const { text, imageBase64, stickerId, type = 'signal' } = req.body;

  if (!token || !chatId) {
    return res.status(400).json({ ok: false, error: 'Missing Telegram credentials.' });
  }
  if (!text && !imageBase64 && !stickerId) {
    return res.status(400).json({ ok: false, error: 'Provide text, image, or sticker.' });
  }

  const TG_BASE = `https://api.telegram.org/bot${token}`;

  try {
    // 1. Send photo with caption if image provided
    if (imageBase64) {
      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');

      const formData = new (require('stream').PassThrough)();
      // Use multipart form for photo upload via fetch
      const { FormData, Blob } = await import('node-fetch').catch(() => ({}));

      // Fallback: send text + notify about image separately
      const photoRes = await fetch(`${TG_BASE}/sendPhoto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          photo: imageBase64, // Works if it's a URL; base64 needs multipart
          caption: text || '',
          parse_mode: 'Markdown',
        }),
      });
      const photoData = await photoRes.json();

      if (!photoData.ok) {
        // Fallback to text-only if photo fails (base64 not supported as raw JSON)
        const txtRes = await fetch(`${TG_BASE}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: text || 'Signal sent.',
            parse_mode: 'Markdown',
            disable_web_page_preview: true,
          }),
        });
        const txtData = await txtRes.json();
        if (!txtData.ok) throw new Error(txtData.description);
      }
    } else if (text) {
      // 2. Text-only broadcast
      const msgRes = await fetch(`${TG_BASE}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'Markdown',
          disable_web_page_preview: false,
        }),
      });
      const msgData = await msgRes.json();
      if (!msgData.ok) throw new Error(msgData.description);
    }

    // 3. Send sticker if provided
    if (stickerId) {
      const stickerRes = await fetch(`${TG_BASE}/sendSticker`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, sticker: stickerId }),
      });
      const stickerData = await stickerRes.json();
      if (!stickerData.ok) throw new Error(stickerData.description);
    }

    // 4. Log to signals history
    const signals = readJSON(SIGNALS_FILE);
    signals.unshift({ id: Date.now(), type, text: text || '', sentAt: now() });
    if (signals.length > 100) signals.pop(); // Keep max 100 entries
    writeJSON(SIGNALS_FILE, signals);

    res.json({ ok: true, message: 'Broadcast sent and logged.' });
  } catch (err) {
    console.error('[broadcast error]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/signals ─────────────────────────────────────────
// Returns signal history (most recent first)
app.get('/api/signals', (req, res) => {
  const signals = readJSON(SIGNALS_FILE);
  const limit = parseInt(req.query.limit) || 20;
  res.json({ ok: true, signals: signals.slice(0, limit) });
});

// ── POST /api/pay-vip ─────────────────────────────────────────
// Initiates an STK Push to the user's phone via Payhero
app.post('/api/pay-vip', globalLimiter, async (req, res) => {
  const { phone } = req.body;
  const { PAYHERO_API_USER, PAYHERO_API_PASS, PAYHERO_CHANNEL_ID } = process.env;

  if (!phone) return res.status(400).json({ ok: false, error: 'Phone number is required.' });
  if (!PAYHERO_API_USER || !PAYHERO_API_PASS || !PAYHERO_CHANNEL_ID) {
    return res.status(500).json({ ok: false, error: 'Payment gateway not configured.' });
  }

  // Generate a unique reference for this transaction
  const ref = `VIP_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  try {
    const auth = Buffer.from(`${PAYHERO_API_USER}:${PAYHERO_API_PASS}`).toString('base64');
    
    // Determine callback URL (must be public for Payhero to reach it)
    const host = req.get('host');
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const callback_url = `${protocol}://${host}/api/payhero-webhook`;

    const response = await fetch('https://backend.payhero.co.ke/api/v2/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`
      },
      body: JSON.stringify({
        amount: 20,
        phone_number: phone,
        channel_id: PAYHERO_CHANNEL_ID,
        provider: 'm-pesa',
        external_reference: ref,
        callback_url: callback_url
      })
    });

    const data = await response.json();
    if (data.success || response.ok) {
      // Save pending transaction
      const payments = readJSON(PAYMENTS_FILE);
      payments[ref] = { status: 'Pending', phone, timestamp: now() };
      writeJSON(PAYMENTS_FILE, payments);

      res.json({ ok: true, reference: ref, message: 'Check your phone for the M-Pesa PIN prompt.' });
    } else {
      throw new Error(data.message || 'Payment initiation failed');
    }
  } catch (error) {
    console.error('[payhero error]', error);
    res.status(500).json({ ok: false, error: 'Failed to initiate payment. Please try again.' });
  }
});

// ── POST /api/payhero-webhook ─────────────────────────────────
// Webhook receiver for Payhero to post transaction status
app.post('/api/payhero-webhook', async (req, res) => {
  try {
    const body = req.body;
    console.log('[Payhero Webhook Received]', body);

    // Extract reference and status (handles different Payhero webhook structures)
    const ref = body.external_reference || (body.response && body.response.ExternalReference);
    const status = body.status || (body.response && body.response.Status) || 'Failed';

    if (ref) {
      const payments = readJSON(PAYMENTS_FILE);
      if (payments[ref]) {
        // Mark as Success if status matches known success strings
        const isSuccess = ['Success', 'Completed', 'Successful'].includes(String(status));
        payments[ref].status = isSuccess ? 'Success' : 'Failed';
        payments[ref].rawWebhook = body;
        writeJSON(PAYMENTS_FILE, payments);
      }
    }
    res.status(200).json({ received: true });
  } catch (err) {
    console.error('[webhook error]', err);
    res.status(500).send('Error');
  }
});

// ── GET /api/check-payment/:ref ───────────────────────────────
// Polled by the frontend to check if payment succeeded and get token
app.get('/api/check-payment/:ref', (req, res) => {
  const { ref } = req.params;
  const payments = readJSON(PAYMENTS_FILE);
  const payment = payments[ref];

  if (!payment) return res.status(404).json({ ok: false, error: 'Transaction not found.' });

  if (payment.status === 'Success') {
    // Generate a secure HMAC-signed token valid for 30 days
    const expires = Date.now() + 30 * 24 * 60 * 60 * 1000; 
    const hmac = crypto.createHmac('sha256', serverSecret).update(String(expires)).digest('hex');
    const sessionToken = `${expires}.${hmac}`;
    
    res.json({ ok: true, status: 'Success', sessionToken });
  } else {
    res.json({ ok: true, status: payment.status });
  }
});

// ── POST /api/verify-vip ──────────────────────────────────────
// Server-side VIP password check (Admin backup override)
app.post('/api/verify-vip', vipAuthLimiter, (req, res) => {
  const { password } = req.body;
  const config = getAppConfig();
  const correct = config.vipPassword || 'PIPSVIP2026';

  if (!password) return res.status(400).json({ ok: false, error: 'No password provided.' });

  if (password.toUpperCase() === correct.toUpperCase()) {
    // Generate a secure HMAC-signed token for 30 days
    const expires = Date.now() + 30 * 24 * 60 * 60 * 1000; 
    const hmac = crypto.createHmac('sha256', serverSecret).update(String(expires)).digest('hex');
    const sessionToken = `${expires}.${hmac}`;
    res.json({ ok: true, sessionToken });
  } else {
    res.status(401).json({ ok: false, error: 'Incorrect password.' });
  }
});

// ── GET /api/download-vip ─────────────────────────────────────
// Secure document download (verifies token & prevents path traversal)
app.get('/api/download-vip', (req, res) => {
  const { file, token } = req.query;

  if (!file || !token) {
    return res.status(400).json({ error: 'Missing file or token.' });
  }

  // 1. Verify session token
  try {
    const [expires, hmac] = token.split('.');
    if (!expires || !hmac) {
      return res.status(401).json({ error: 'Invalid token format.' });
    }

    if (Date.now() > Number(expires)) {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }

    const expectedHmac = crypto.createHmac('sha256', serverSecret).update(String(expires)).digest('hex');
    if (hmac !== expectedHmac) {
      return res.status(401).json({ error: 'Invalid token signature.' });
    }
  } catch (err) {
    return res.status(401).json({ error: 'Token verification failed.' });
  }

  // 2. Prevent Directory Traversal
  const safeFilename = path.basename(file);
  const filePath = path.resolve(VIP_DOCS_DIR, safeFilename);

  // Double check that the resolved path is actually inside the VIP_DOCS_DIR
  if (!filePath.startsWith(VIP_DOCS_DIR)) {
    return res.status(403).json({ error: 'Access Denied. Path traversal detected.' });
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Requested file not found.' });
  }

  // 3. Serve the file for download
  res.download(filePath, safeFilename);
});

// ── POST /api/subscribe ───────────────────────────────────────
// Save an interested subscriber (name + telegram handle)
app.post('/api/subscribe', (req, res) => {
  const { name, telegram, email } = req.body;

  if (!name && !telegram && !email) {
    return res.status(400).json({ ok: false, error: 'Provide at least a name or contact.' });
  }

  const subscribers = readJSON(SUBS_FILE);

  // Prevent duplicate entries by telegram handle
  if (telegram && subscribers.some(s => s.telegram === telegram)) {
    return res.json({ ok: true, message: 'Already subscribed!' });
  }

  subscribers.push({ name, telegram, email, joinedAt: now() });
  writeJSON(SUBS_FILE, subscribers);

  res.json({ ok: true, message: 'Subscribed successfully!' });
});

// ── GET /api/subscribers ──────────────────────────────────────
// Returns subscriber list (admin only)
app.get('/api/subscribers', validateAdminKey, (req, res) => {
  const subscribers = readJSON(SUBS_FILE);
  res.json({ ok: true, count: subscribers.length, subscribers });
});

// ── GET /api/vip-documents ────────────────────────────────────
// Lists metadata for VIP documents in the private folder (Admin only)
app.get('/api/vip-documents', validateAdminKey, (req, res) => {
  try {
    const files = fs.readdirSync(VIP_DOCS_DIR);
    const documents = files.map(filename => {
      const filePath = path.join(VIP_DOCS_DIR, filename);
      const stats = fs.statSync(filePath);
      return {
        filename,
        sizeBytes: stats.size,
        modifiedAt: stats.mtime.toISOString()
      };
    });
    res.json({ ok: true, documents });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/upload-vip-document ─────────────────────────────
// Uploads a new VIP document from base64 (Admin only)
app.post('/api/upload-vip-document', validateAdminKey, (req, res) => {
  const { filename, fileData } = req.body;

  if (!filename || !fileData) {
    return res.status(400).json({ ok: false, error: 'Missing filename or fileData.' });
  }

  // 10MB file size limit protection (base64 length is ~1.33x binary size)
  if (fileData.length > 14 * 1024 * 1024) {
    return res.status(400).json({ ok: false, error: 'File size exceeds 10MB limit.' });
  }

  try {
    const safeFilename = path.basename(filename);
    const filePath = path.resolve(VIP_DOCS_DIR, safeFilename);

    if (!filePath.startsWith(VIP_DOCS_DIR)) {
      return res.status(403).json({ ok: false, error: 'Access Denied. Path traversal detected.' });
    }

    const base64Clean = fileData.replace(/^data:.*;base64,/, '');
    const buffer = Buffer.from(base64Clean, 'base64');

    fs.writeFileSync(filePath, buffer);
    res.json({ ok: true, message: `File ${safeFilename} uploaded successfully.` });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── DELETE /api/delete-vip-document/:filename ─────────────────
// Deletes a VIP document (Admin only)
app.delete('/api/delete-vip-document/:filename', validateAdminKey, (req, res) => {
  const { filename } = req.params;

  if (!filename) {
    return res.status(400).json({ ok: false, error: 'Missing filename.' });
  }

  try {
    const safeFilename = path.basename(filename);
    const filePath = path.resolve(VIP_DOCS_DIR, safeFilename);

    if (!filePath.startsWith(VIP_DOCS_DIR)) {
      return res.status(403).json({ ok: false, error: 'Access Denied. Path traversal detected.' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ ok: false, error: 'File not found.' });
    }

    fs.unlinkSync(filePath);
    res.json({ ok: true, message: `File ${safeFilename} deleted successfully.` });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/update-vip-password ─────────────────────────────
// Dynamic password configuration (Admin only)
app.post('/api/update-vip-password', validateAdminKey, (req, res) => {
  const { vipPassword } = req.body;

  if (!vipPassword || vipPassword.trim().length < 4) {
    return res.status(400).json({ ok: false, error: 'Password must be at least 4 characters.' });
  }

  const config = getAppConfig();
  config.vipPassword = vipPassword.trim();

  if (saveAppConfig(config)) {
    res.json({ ok: true, message: 'VIP password updated successfully.' });
  } else {
    res.status(500).json({ ok: false, error: 'Failed to save configuration.' });
  }
});

// ── POST /api/engagement ─────────────────────────────────────
// Shortcut to send a community engagement message and log it
app.post('/api/engagement', async (req, res) => {
  req.body.type = 'engagement';
  // Reuse broadcast logic via internal redirect
  return app._router.handle(
    Object.assign(req, { url: '/api/broadcast', path: '/api/broadcast' }),
    res,
    () => {}
  );
});

// ── POST /api/live ───────────────────────────────────────────
// Shortcut to broadcast a live session alert and log it
app.post('/api/live', async (req, res) => {
  req.body.type = 'live';
  return app._router.handle(
    Object.assign(req, { url: '/api/broadcast', path: '/api/broadcast' }),
    res,
    () => {}
  );
});

// ── Serve index.html for any unknown routes (SPA fallback) ───
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ── Start ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════╗
  ║   Pips_attendant API Server           ║
  ║   Running on http://localhost:${PORT}   ║
  ╚═══════════════════════════════════════╝
  `);
});
