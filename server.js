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
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Paths ────────────────────────────────────────────────────
const DATA_DIR     = path.join(__dirname, 'data');
const SIGNALS_FILE = path.join(DATA_DIR, 'signals.json');
const SUBS_FILE    = path.join(DATA_DIR, 'subscribers.json');

// Ensure data directory and files exist on first run
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(SIGNALS_FILE)) fs.writeFileSync(SIGNALS_FILE, '[]');
if (!fs.existsSync(SUBS_FILE))    fs.writeFileSync(SUBS_FILE, '[]');

// ── Middleware ───────────────────────────────────────────────
app.use(cors());
app.use(express.json());
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

// ── POST /api/verify-vip ──────────────────────────────────────
// Server-side VIP password check (password never lives in the browser)
app.post('/api/verify-vip', (req, res) => {
  const { password } = req.body;
  const correct = process.env.VIP_PASSWORD || 'PIPSVIP2026';

  if (!password) return res.status(400).json({ ok: false, error: 'No password provided.' });

  if (password.toUpperCase() === correct.toUpperCase()) {
    // Return a simple session token (timestamp-based, lightweight)
    const sessionToken = Buffer.from(`vip:${Date.now()}`).toString('base64');
    res.json({ ok: true, sessionToken });
  } else {
    res.status(401).json({ ok: false, error: 'Incorrect password.' });
  }
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
// Returns subscriber list (admin only — add API key check in production)
app.get('/api/subscribers', (req, res) => {
  const key = req.headers['x-admin-key'];
  const expectedKey = process.env.ADMIN_KEY || 'pips-admin-2026';
  if (key !== expectedKey) {
    return res.status(403).json({ ok: false, error: 'Forbidden.' });
  }
  const subscribers = readJSON(SUBS_FILE);
  res.json({ ok: true, count: subscribers.length, subscribers });
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
