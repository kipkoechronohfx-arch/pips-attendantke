require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./src/services/db');
const { startCronJobs } = require('./src/services/cronJobs');
const { registerTelegramWebhook, handleTelegramUpdate } = require('./src/services/telegramBot');

const authRoutes = require('./src/routes/authRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const vipRoutes = require('./src/routes/vipRoutes');
const paymentRoutes = require('./src/routes/paymentRoutes');
const publicRoutes = require('./src/routes/publicRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust reverse proxy (e.g. Render, Heroku, Nginx) so rate limits use correct IP
app.set('trust proxy', 1);

app.use(cors());

// Serve static frontend files
app.use(express.static(path.join(__dirname)));
app.use(express.static(path.join(__dirname, 'admin')));

// ── Webhooks (must be before body parsers if they need raw body, but Payhero uses JSON) ──
app.post('/telegram-webhook', express.json(), async (req, res) => {
  res.sendStatus(200); // always respond immediately to Telegram
  try {
    await handleTelegramUpdate(req.body);
  } catch (err) {
    console.error('[Telegram Webhook] Error handling update:', err.message);
  }
});

app.use(express.json({ limit: '15mb' })); // Allow larger payloads for base64 PDF uploads
app.use(express.urlencoded({ extended: true }));

// ── Routes ──
app.use('/api', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', vipRoutes);
app.use('/api', paymentRoutes);
app.use('/api', publicRoutes);

// ── SPA Fallback ──
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ── Application Startup ──
async function startServer() {
  await db.connectDB();
  
  startCronJobs();

  app.listen(PORT, () => {
    console.log(`
    ╔═══════════════════════════════════════╗
    ║   Pips_attendant API Server           ║
    ║   Running on http://localhost:${PORT}   ║
    ╚═══════════════════════════════════════╝
    `);
    registerTelegramWebhook();
  });
}

startServer().catch(err => {
  console.error('[Startup Error]', err);
});
