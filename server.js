require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
const db = require('./src/services/db');
const logger = require('./src/utils/logger');
const { startCronJobs, computeAndSaveBadges } = require('./src/services/cronJobs');
const { registerTelegramWebhook, handleTelegramUpdate } = require('./src/services/telegramBot');
const { initializeSocket } = require('./src/services/socketService');

const authRoutes = require('./src/routes/authRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const vipRoutes = require('./src/routes/vipRoutes');
const paymentRoutes = require('./src/routes/paymentRoutes');
const publicRoutes = require('./src/routes/publicRoutes');
const journalRoutes = require('./src/routes/journalRoutes');
const chatRoutes   = require('./src/routes/chatRoutes');
const partnerRoutes = require('./src/routes/partnerRoutes');
const propfirmRoutes = require('./src/routes/propfirmRoutes');

// ── Environment Validation ─────────────────────────────────────
// SECURITY: JWT_SECRET and ADMIN_KEY are now required at startup.
const REQUIRED_ENV = ['MONGODB_URI', 'JWT_SECRET', 'ADMIN_KEY'];
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

// ── Canonical Domain Redirect ──────────────────────────────────
// Permanently redirect any traffic from pipsattendant.top OR bare
// pipsattendant.com (no www) to the single canonical www.pipsattendant.com.
// This eliminates the duplicate-website issue in Google Search.
app.use((req, res, next) => {
  const host = req.hostname;
  if (IS_PRODUCTION) {
    if (host.includes('pipsattendant.top') || host === 'pipsattendant.com') {
      return res.redirect(301, 'https://www.pipsattendant.com' + req.originalUrl);
    }
  }
  next();
});

// ── Security Headers ───────────────────────────────────────────
// SECURITY: CSP re-enabled with a permissive-but-real policy.
// Allows CDN scripts (Tailwind, Chart.js, etc.) and inline styles for the admin UI,
// but blocks arbitrary script injection from untrusted origins.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://unpkg.com",
        "https://cdn.jsdelivr.net",
        "https://cdn.tailwindcss.com",
        "https://fonts.googleapis.com",
        "https://s3.tradingview.com",
        "https://*.tradingview.com",
        "https://*.tradingview-widget.com",
        "https://*.myfxbook.com",
        "https://www.googletagmanager.com"
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",    // Required by inline Tailwind @theme block
        "https://unpkg.com",
        "https://cdn.jsdelivr.net",
        "https://fonts.googleapis.com",
        "https://fonts.gstatic.com"
      ],
      imgSrc: ["'self'", "data:", "blob:", "https:", "https://*.tradingview.com", "https://*.myfxbook.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      connectSrc: ["'self'", "https://api.telegram.org", "wss:", "ws:", "https://unpkg.com", "https://cdn.jsdelivr.net", "https://*.tradingview.com", "https://*.tradingview-widget.com", "https://pips-attendantke.onrender.com", "https://www.pipsattendant.com", "https://www.google-analytics.com", "https://analytics.google.com", "https://stats.g.doubleclick.net"],
      frameSrc: ["'self'", "https://www.tradingview.com", "https://s3.tradingview.com", "https://s.tradingview.com", "https://*.tradingview.com", "https://www.tradingview-widget.com", "https://*.tradingview-widget.com", "https://*.myfxbook.com", "https://www.youtube.com", "https://youtube.com", "https://www.google.com"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      // Helmet 7+ sets script-src-attr: 'none' by default, which blocks ALL inline onclick/onsubmit handlers.
      // We must explicitly allow them here so buttons work.
      scriptSrcAttr: ["'unsafe-inline'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

// ── CORS ────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'https://pips-attendantke.onrender.com',
  'https://www.pipsattendant.com',
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

// Cache static assets for 1 day, but explicitly DO NOT cache HTML files
const staticOptions = {
  maxAge: '1d',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    } else if (filePath.endsWith('.js')) {
      // JS files: short cache + must-revalidate so deploys take effect fast
      res.setHeader('Cache-Control', 'public, max-age=300, must-revalidate');
    }
  }
};
// ── Admin Panel Protection ─────────────────────────────────────
// Block direct browser access to admin.html without the ADMIN_KEY.
// This runs before express.static so the file is never served without auth.
app.get(['/admin.html', '/admin'], (req, res, next) => {
  const key = req.query.key || req.headers['x-admin-key'];
  if (key && key === process.env.ADMIN_KEY) return next();
  // Return a plain 403 — don't reveal that admin.html even exists
  return res.status(403).send('<html><body style="background:#000;color:#f00;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h1>403</h1><p>Access Denied</p></div></body></html>');
});

app.use(express.static(path.join(__dirname), staticOptions));
app.use(express.static(path.join(__dirname, 'admin'), staticOptions));

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
app.use('/api/partner', partnerRoutes);
app.use('/api/propfirm', propfirmRoutes);
app.use('/api', chatRoutes);

// ── Health Check Endpoint ──────────────────────────────────────
// Used by Render, UptimeRobot, or any monitoring service
app.get('/health', async (req, res) => {
  const uptime = process.uptime();
  const memUsed = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
  let dbStatus = 'unknown';
  try {
    await db.ping(); // Will work if db.js exposes a ping method
    dbStatus = 'ok';
  } catch {
    dbStatus = 'error';
  }
  const status = dbStatus === 'ok' ? 200 : 503;
  res.status(status).json({
    status: status === 200 ? 'ok' : 'degraded',
    uptime: `${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s`,
    memoryMB: memUsed,
    db: dbStatus,
    timestamp: new Date().toISOString()
  });
});

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
const io = initializeSocket(server);
// Expose io to routes so they can emit socket events
app.set('io', io);

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
  logger.error(`[Startup Error] ${err.message || err}`, err);
  process.exit(1);
});

// ── Global Error Handlers ─────────────────────────────────────
process.on('unhandledRejection', (reason) => {
  logger.error(`[UnhandledRejection] ${reason}`);
});
process.on('uncaughtException', (err) => {
  logger.error(`[UncaughtException] ${err.message}`, err);
  process.exit(1);
});
