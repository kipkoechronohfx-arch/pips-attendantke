const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const rateLimit = require('express-rate-limit');
const { SYSTEM_PROMPT } = require('../services/knowledgeBase');

// ── Rate Limiter — 20 messages per minute per IP ───────────────────────────
const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  message: { ok: false, error: 'Too many messages. Please wait a moment before sending again.' },
  standardHeaders: true,
  legacyHeaders: false
});

// ── POST /api/chat ─────────────────────────────────────────────────────────
// Body: { messages: [{ role: 'user'|'model', parts: [{ text: '...' }] }] }
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

  // Sanitise messages — only allow user/model roles, limit history to last 20
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

  // Gemini 1.5 Flash endpoint (free tier, fast)
  const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  const requestBody = {
    system_instruction: {
      parts: [{ text: SYSTEM_PROMPT }]
    },
    contents: sanitised,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 600,
      topP: 0.9
    },
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
      return res.status(502).json({
        ok: false,
        error: 'AI service returned an error. Please try again shortly.'
      });
    }

    const data = await geminiRes.json();

    // Extract reply text
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!reply) {
      console.warn('[Chat] Gemini returned no content:', JSON.stringify(data).slice(0, 300));
      return res.status(502).json({
        ok: false,
        error: 'No response from AI. Please try again.'
      });
    }

    res.json({ ok: true, reply });

  } catch (err) {
    console.error('[Chat] Unexpected error:', err.message);
    res.status(500).json({
      ok: false,
      error: 'Something went wrong. Please contact support@pipsattendant.com if this persists.'
    });
  }
});

module.exports = router;
