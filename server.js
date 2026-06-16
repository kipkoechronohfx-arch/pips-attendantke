require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
const db = require('./src/services/db');
const { startCronJobs } = require('./src/services/cronJobs');
const { registerTelegramWebhook, handleTelegramUpdate } = require('./src/services/telegramBot');
const { initializeSocket } = require('./src/services/socketService');

const authRoutes = require('./src/routes/authRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const vipRoutes = require('./src/routes/vipRoutes');
const paymentRoutes = require('./src/routes/paymentRoutes');
const publicRoutes = require('./src/routes/publicRoutes');
const journalRoutes = require('./src/routes/journalRoutes');
const chatRoutes   = require('./src/routes/chatRoutes');

// ── Environment Validation ─────────────────────────────────────
const REQUIRED_ENV = ['MONGODB_URI', 'JWT_SECRET'];
// GEMINI_API_KEY is optional — AI chat is disabled gracefully if missing
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
    console.warn('\n⚠️  [Config Warning] Missing recommended env vars (some features disabled):');
    missingRec.forEach(k => console.warn('   - ' + k));
  }
  console.log('');
}

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Trust reverse proxy (Render, Heroku, Nginx) so rate limits use real IP
app.set('trust proxy', 1);

// ── Security Headers ───────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,  // Disabled to allow inline scripts in admin HTML pages
  crossOriginEmbedderPolicy: false
}));

// ── CORS ────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'https://pips-attendantke.onrender.com',
  'https://pipsattendant.top',
  'https://www.pipsattendant.top',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error('CORS: Origin not allowed — ' + origin));
  },
  credentials: true
}));

// ── Response Compression ───────────────────────────────────────
app.use(compression());

// ── Request Logging ────────────────────────────────────────────
app.use(morgan(IS_PRODUCTION ? 'combined' : 'dev'));

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
app.use('/api/journal', journalRoutes);
app.use('/api', chatRoutes);

// ── SPA Fallback ───────────────────────────────────────────────
app.get('*', (req, res) => {
  // If request looks like a page (no extension or .html), try to serve it or 404
  const ext = path.extname(req.path);
  if (!ext || ext === '.html') {
    const filePath = path.join(__dirname, req.path === '/' ? 'index.html' : req.path);
    res.sendFile(filePath, (err) => {
      if (err) {
        res.status(404).sendFile(path.join(__dirname, '404.html'));
      }
    });
  } else {
    res.status(404).sendFile(path.join(__dirname, '404.html'));
  }
});

// ── Centralized Error Handler ─────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Unhandled Error]', err.stack || err.message);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    ok: false,
    error: IS_PRODUCTION ? 'An unexpected error occurred.' : (err.message || 'Internal Server Error')
  });
});

// ── Graceful Shutdown ──────────────────────────────────────────
function shutdown(signal) {
  console.log('\n[Server] ' + signal + ' received — shutting down gracefully...');
  // Give in-flight requests 10s to complete, then force exit
  const timeout = setTimeout(() => {
    console.error('[Server] Forced shutdown after timeout.');
    process.exit(1);
  }, 10000);
  timeout.unref(); // Don't block event loop
  // Close DB client if exposed
  if (db.closeDB) {
    db.closeDB().then(() => {
      console.log('[Server] MongoDB connection closed.');
      process.exit(0);
    }).catch(() => process.exit(0));
  } else {
    process.exit(0);
  }
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// ── Application Startup ────────────────────────────────────────
const server = http.createServer(app);
initializeSocket(server);

async function startServer() {
  validateEnv();
  await db.connectDB();
  startCronJobs();

  server.listen(PORT, () => {
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
