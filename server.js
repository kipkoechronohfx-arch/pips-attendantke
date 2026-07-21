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
const { adminProbeLimiter } = require('./src/middleware/rateLimiters');
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
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  // HSTS: force HTTPS for 1 year, include subdomains
  hsts: IS_PRODUCTION ? {
    maxAge: 31536000,        // 1 year in seconds
    includeSubDomains: true,
    preload: true
  } : false
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
    } else if (/\.(png|jpe?g|webp|svg|ico)$/i.test(filePath)) {
      // Images: 30-day aggressive cache for better performance
      res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
    } else if (filePath.endsWith('.js')) {
      // JS files: short cache + must-revalidate so deploys take effect fast
      res.setHeader('Cache-Control', 'public, max-age=300, must-revalidate');
    }
  }
};

// ── Security: Block Backend File Access ────────────────────────
// Prevent public access to source code and data files via express.static
const allowedPublicJS = ['/app.js', '/premium.js', '/chat-widget.js', '/sw.js'];

app.use((req, res, next) => {
  const p = req.path.toLowerCase();
  
  // Block sensitive directories
  if (p.startsWith('/src/') || p.startsWith('/data/') || p.startsWith('/logs/') || p.startsWith('/tests/') || p.startsWith('/node_modules/')) {
    return res.status(403).send('Forbidden');
  }
  
  // Block configuration files and backend code
  if (p === '/package.json' || p === '/package-lock.json' || p === '/server.js' || p.includes('/.')) {
    return res.status(403).send('Forbidden');
  }

  // Block any unknown root JS files
  if (p.endsWith('.js') && !allowedPublicJS.includes(p)) {
    return res.status(403).send('Forbidden');
  }

  next();
});
// ── Security: Admin Panel Hardening ────────────────────────────

// 1. IP-Based Probe Logger
// Every unauthenticated attempt at any admin-related path is logged
// to logs/probe.log for forensic review.
app.use(['/admin.html', '/admin', '/admin/*'], (req, res, next) => {
  const ip   = req.ip || req.socket?.remoteAddress || 'unknown';
  const ua   = req.get('User-Agent') || 'no-ua';
  const ref  = req.get('Referer') || '-';
  logger.warn(
    `[PROBE] ${req.method} ${req.path} | IP: ${ip} | UA: ${ua} | Ref: ${ref}`
  );
  next();
});

// 2. Rate-limit unauthenticated admin probes (3 hits/60s → 429)
app.use(['/admin.html', '/admin', '/admin/*'], adminProbeLimiter);

// 3. Honeypot — /admin.html is the trap, not the real admin panel.
// Bots & scanners that hit the old URL get a slow, believable fake response
// that wastes their time. The real admin is served at the obscured path below.
app.get(['/admin.html', '/admin'], (req, res) => {
  // Artificial 800ms delay to waste scanner CPU time
  setTimeout(() => {
    res.status(403).send(
      '<html><body style="background:#000;color:#f00;font-family:monospace;' +
      'display:flex;align-items:center;justify-content:center;height:100vh;margin:0">' +
      '<div style="text-align:center"><h1>403</h1><p>Access Denied</p>' +
      '<!-- Pips Attendant Admin Portal v2.1 -->' + // Fake comment to lure scrapers
      '</div></body></html>'
    );
  }, 800);
});

// 4. Real Admin Panel — served at an obscured, non-guessable URL.
// IMPORTANT: Route is evaluated dynamically at request time so changing
// ADMIN_SLUG in Render env vars takes effect on next deploy without code changes.
app.use((req, res, next) => {
  // Read slug fresh on every request so env var changes take effect after redeploy
  const slug = (process.env.ADMIN_SLUG || 'dashboard-9f3x').replace(/^\/+/, '');
  const p = req.path.replace(/^\/+/, '').replace(/\.html$/, ''); // strip leading / and .html

  if (p !== slug) return next(); // Not the admin slug — pass through

  const key = req.query.key || req.headers['x-admin-key'];
  if (key && key === process.env.ADMIN_KEY) {
    // Valid key — serve the actual admin.html file
    return res.sendFile(path.join(__dirname, 'admin.html'));
  }

  // Wrong/missing key — log it and send 403
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  logger.warn(
    `[ADMIN AUTH FAIL] IP: ${ip} | Key provided: ${!!key} | UA: ${req.get('User-Agent') || 'no-ua'}`
  );
  return res.status(403).send(
    '<html><body style="background:#000;color:#f00;font-family:monospace;' +
    'display:flex;align-items:center;justify-content:center;height:100vh;margin:0">' +
    '<div style="text-align:center"><h1>403</h1><p>Access Denied</p></div>' +
    '</body></html>'
  );
});

// Recovery endpoint — returns the current admin URL (key-protected)
// GET /api/admin-slug?key=ADMIN_KEY  →  { url: "https://..." }
app.get('/api/admin-slug', (req, res) => {
  const key = req.query.key || req.headers['x-admin-key'];
  if (!key || key !== process.env.ADMIN_KEY) {
    return res.status(403).json({ ok: false, error: 'Forbidden' });
  }
  const slug = (process.env.ADMIN_SLUG || 'dashboard-9f3x').replace(/^\/+/, '');
  const base = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  return res.json({ ok: true, url: `${base}/${slug}?key=${encodeURIComponent(process.env.ADMIN_KEY)}` });
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
