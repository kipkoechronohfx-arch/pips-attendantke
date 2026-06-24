const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const { SYSTEM_PROMPT } = require('../services/knowledgeBase');
const db = require('../services/db');
const { JWT_SECRET } = require('../middleware/auth');

// Build a dynamic, data-enriched system prompt using live DB data
async function buildDynamicPrompt() {
  let context = SYSTEM_PROMPT;

  try {
    const signals = await db.getSignals(10);
    if (signals && signals.length > 0) {
      const signalLines = signals.map((s, i) => {
        const date = s.sentAt ? new Date(s.sentAt).toLocaleDateString() : 'Recent';
        const preview = (s.text || '').slice(0, 200).replace(/\n/g, ' ');
        return `  ${i + 1}. [${date}] ${preview}`;
      }).join('\n');
      context += `\n\n## Recent VIP Signals (Live from database):\n${signalLines}`;
    }
  } catch (e) {}

  try {
    const setup = await db.getTodaysSetup();
    if (setup && setup.analysis) {
      context += `\n\n## Today's Market Setup Analysis:\n${setup.analysis}`;
    }
  } catch (e) {}

  return context;
}

// ── Rate Limiter — 20 messages per minute per IP ───────────────────────────
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { ok: false, error: 'Too many messages. Please wait a moment before sending again.' },
  standardHeaders: true,
  legacyHeaders: false
});

// ── Room validation helper ─────────────────────────────────────────────────
const VALID_ROOMS = ['general', 'vip', 'signals'];

function getRoomFromReq(req) {
  const room = req.query.room || req.body?.room || 'general';
  return VALID_ROOMS.includes(room) ? room : 'general';
}

// ── VIP room auth middleware ──────────────────────────────────────────────
function requireVipForRoom(room) {
  return (req, res, next) => {
    if (room !== 'vip') return next();
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ ok: false, error: 'VIP room requires authentication.' });
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const now = Date.now();
      if (!decoded.subscriptionExpiry || decoded.subscriptionExpiry < now) {
        return res.status(403).json({ ok: false, error: 'Active VIP subscription required for this room.' });
      }
      req.user = decoded;
      next();
    } catch {
      return res.status(401).json({ ok: false, error: 'Invalid or expired token.' });
    }
  };
}

// ── GET /api/chat/messages?room=general ──────────────────────────────────
router.get('/chat/messages', async (req, res) => {
  const room = getRoomFromReq(req);

  // VIP room: check token from query param for GET requests
  if (room === 'vip') {
    const token = req.query.token || (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ ok: false, error: 'VIP room requires authentication.' });
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (!decoded.subscriptionExpiry || decoded.subscriptionExpiry < Date.now()) {
        return res.status(403).json({ ok: false, error: 'Active VIP subscription required.' });
      }
    } catch {
      return res.status(401).json({ ok: false, error: 'Invalid token.' });
    }
  }

  try {
    const messages = await db.getChatMessages(room);
    res.json({ ok: true, room, messages: messages.reverse() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/chat/messages — room-aware message posting ─────────────────
router.post('/chat/messages', chatLimiter, async (req, res) => {
  const { text, author, room: requestedRoom } = req.body;
  const room = VALID_ROOMS.includes(requestedRoom) ? requestedRoom : 'general';

  if (!text || !text.trim()) return res.status(400).json({ ok: false, error: 'Message text is required.' });

  // VIP room auth check
  if (room === 'vip') {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ ok: false, error: 'VIP room requires authentication.' });
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (!decoded.subscriptionExpiry || decoded.subscriptionExpiry < Date.now()) {
        return res.status(403).json({ ok: false, error: 'Active VIP subscription required.' });
      }
    } catch {
      return res.status(401).json({ ok: false, error: 'Invalid token.' });
    }
  }

  // Signals room: read-only for non-admins (admin key required to post)
  if (room === 'signals') {
    return res.status(403).json({ ok: false, error: 'Signals room is read-only. Only admin can post here.' });
  }

  try {
    const msg = await db.addChatMessage({ author: author || 'Member', text: text.trim(), room });
    // Broadcast via socket if available
    if (req.app.get('io')) {
      req.app.get('io').to(`room:${room}`).emit('newMessage', msg);
    }
    res.json({ ok: true, message: msg });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/chat — AI Chat (Gemini) ────────────────────────────────────
router.post('/chat', chatLimiter, async (req, res) => {
  const { messages } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ ok: false, error: 'messages array is required.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[Chat] GEMINI_API_KEY not set — AI assistant is disabled.');
    return res.status(503).json({
      ok: false,
      error: 'AI assistant is temporarily unavailable. Please contact support@pipsattendant.com'
    });
  }

  const sanitised = messages
    .filter(m => m.role === 'user' || m.role === 'model')
    .slice(-20)
    .map(m => ({
      role: m.role,
      parts: [{ text: String(m.parts?.[0]?.text || '').slice(0, 2000) }]
    }));

  if (sanitised.length === 0) {
    return res.status(400).json({ ok: false, error: 'No valid messages provided.' });
  }

  const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;
  const dynamicPrompt = await buildDynamicPrompt();

  const requestBody = {
    system_instruction: { parts: [{ text: dynamicPrompt }] },
    contents: sanitised,
    generationConfig: { temperature: 0.7, maxOutputTokens: 600, topP: 0.9 },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' }
    ]
  };

  try {
    const geminiRes = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('[Chat] Gemini API error:', geminiRes.status, errText);
      return res.status(502).json({ ok: false, error: 'AI service returned an error. Please try again shortly.' });
    }

    const data = await geminiRes.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!reply) {
      console.warn('[Chat] Gemini returned no content:', JSON.stringify(data).slice(0, 300));
      return res.status(502).json({ ok: false, error: 'No response from AI. Please try again.' });
    }

    res.json({ ok: true, reply });
  } catch (err) {
    console.error('[Chat] Unexpected error:', err.message);
    res.status(500).json({ ok: false, error: 'Something went wrong. Please contact support@pipsattendant.com if this persists.' });
  }
});

module.exports = router;
