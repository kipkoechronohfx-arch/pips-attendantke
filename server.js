require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const db = require('./src/services/db');
const { startCronJobs } = require('./src/services/cronJobs');
const { registerTelegramWebhook, handleTelegramUpdate } = require('./src/services/telegramBot');

const authRoutes = require('./src/routes/authRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const vipRoutes = require('./src/routes/vipRoutes');
const paymentRoutes = require('./src/routes/paymentRoutes');
const publicRoutes = require('./src/routes/publicRoutes');

// ── Environment Validation ─────────────────────────────────────
const REQUIRED_ENV = ['MONGODB_URI', 'JWT_SECRET'];
const RECOMMENDED_ENV = [
  'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID',
  'PAYHERO_API_USER', 'PAYHERO_API_PASS', 'PAYHERO_CHANNEL_ID',
  'SENDGRID_API_KEY', 'SENDGRID_FROM_EMAIL',
  'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'
];

function validateEnv() {
  const missing = REQUIRED_ENV.filter(k => !process.env[k]);
  if (missing.length) {
    console.warn('\n⚠️  [Config Warning] Missing required environment variables:');
    missing.forEach(k => console.warn('   - ' + k));
  }
  const missingRec = RECOMMENDED_ENV.filter(k => !process.env[k]);
  if (missingRec.length) {
    console.warn('\n⚠️  [Config Warning] Missing recommended environment variables (some features will be disabled):');
    missingRec.forEach(k => console.warn('   - ' + k));
  }
  console.log('');
}

const app = express();
const PORT = process.env.PORT || 3000;

// Trust reverse proxy (e.g. Render, Heroku, Nginx) so rate limits use correct IP
app.set('trust proxy', 1);

// ── Security Headers ───────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // Disabled to allow inline scripts in admin HTML pages
  crossOriginEmbedderPolicy: false
}));

app.use(cors());

// ── Static Files ───────────────────────────────────────────────
app.use(express.static(path.join(__dirname)));
app.use(express.static(path.join(__dirname, 'admin')));

// ── Telegram Webhook (before body parser — needs immediate 200 ACK) ──
app.post('/telegram-webhook', express.json(), async (req, res) => {
  res.sendStatus(200);
  try {
    await handleTelegramUpdate(req.body);
  } catch (err) {
    console.error('[Telegram Webhook] Error:', err.message);
  }
});

// ── Body Parsers ───────────────────────────────────────────────
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true }));

// ── API Routes ─────────────────────────────────────────────────
app.use('/api', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', vipRoutes);
app.use('/api', paymentRoutes);
app.use('/api', publicRoutes);

// ── SPA Fallback ───────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ── Centralized Error Handler ─────────────────────────────────
// Must be defined AFTER all routes (4 arguments = error middleware)
app.use((err, req, res, next) => {
  console.error('[Unhandled Error]', err.stack || err.message);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    ok: false,
    error: process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred.'
      : (err.message || 'Internal Server Error')
  });
});

// ── Application Startup ────────────────────────────────────────
async function startServer() {
  validateEnv();
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
  process.exit(1);
});
