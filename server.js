/**
 * ============================================================
 *  Pips_attendant — Express Backend Server
 * ============================================================
 *  Handles:
 *   - Serving the static frontend files
 *   - Securely proxying Telegram API calls (bot token never exposed)
 *   - Server-side VIP password verification
 *   - Dynamic database storage via MongoDB Atlas (with local file fallback)
 *   - One-time local data migration on cluster connection
 *   - Persistent server-side session signing keys
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
const { MongoClient } = require('mongodb');
const webpush = require('web-push');

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:support@pipsattendant.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

const app = express();
app.set('trust proxy', 1); // Trust Render's load balancer for rate limiting
const PORT = process.env.PORT || 3000;

// Persistent Server Session Signing Secret (Fixes cold start session invalidation bug)
const serverSecret = process.env.SERVER_SECRET || 'pips-attendant-local-secret-key-2026';

// ── Paths (Used for migrations and local fallback) ───────────
const DATA_DIR     = path.join(__dirname, 'data');
const SIGNALS_FILE = path.join(DATA_DIR, 'signals.json');
const SUBS_FILE    = path.join(DATA_DIR, 'subscribers.json');
const VIP_DOCS_DIR = path.join(DATA_DIR, 'vip_documents');
const CONFIG_FILE  = path.join(DATA_DIR, 'config.json');
const PAYMENTS_FILE= path.join(DATA_DIR, 'payments.json');
const TODAYS_SETUP_FILE = path.join(DATA_DIR, 'todays_setup.json');
const TODAYS_SETUP_RESULTS_FILE = path.join(DATA_DIR, 'todays_setup_results.json');

// Ensure local fallback folders exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(VIP_DOCS_DIR)) fs.mkdirSync(VIP_DOCS_DIR);

// ── MongoDB Atlas Integration & Fallback Mode ─────────────────
const MONGODB_URI = process.env.MONGODB_URI;
let db = null;
let client = null;

async function connectDB() {
  if (!MONGODB_URI || MONGODB_URI.includes('your_mongodb_atlas_uri_here')) {
    console.warn('\n[Database Warning] MONGODB_URI is not configured. Running in Local File Mode.\n');
    return;
  }

  try {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db('pips_attendant');
    console.log('\n========================================');
    console.log('  Connected successfully to MongoDB Atlas');
    console.log('========================================\n');
    
    // Automatically run migrations when database connects successfully
    await runMigrations();
  } catch (err) {
    console.error('[MongoDB connection failed]', err.message);
    console.log('Retrying DB connection in 5 seconds...');
    setTimeout(connectDB, 5000);
  }
}
connectDB();

// Database Collections accessors
const getSignalsColl = () => db.collection('signals');
const getSubsColl = () => db.collection('subscribers');
const getPaymentsColl = () => db.collection('payments');
const getConfigsColl = () => db.collection('config');
const getDocsColl = () => db.collection('vip_documents');
const getSetupColl = () => db.collection('todays_setup');
const getSetupResultsColl = () => db.collection('todays_setup_results');
const getPerformanceColl = () => db.collection('performance_logs');
const getPushSubsColl = () => db.collection('push_subscriptions');

// ── One-Time Auto-Migration Script ───────────────────────────
async function runMigrations() {
  console.log('[Migration] Checking for local data to migrate to MongoDB Atlas...');

  // Helper to safely read files for migration
  const readRawJSON = (file) => {
    try {
      if (fs.existsSync(file)) {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
      }
    } catch {}
    return null;
  };

  // 1. Migrate Configuration
  const localConfig = readRawJSON(CONFIG_FILE);
  if (localConfig && localConfig.vipPassword) {
    try {
      await getConfigsColl().updateOne(
        { type: 'app_config' },
        { $set: { vipPassword: localConfig.vipPassword } },
        { upsert: true }
      );
      console.log('[Migration] VIP password configuration successfully migrated.');
      fs.renameSync(CONFIG_FILE, CONFIG_FILE + '.migrated');
    } catch (err) {
      console.error('[Migration Error] Config migration failed:', err.message);
    }
  }

  // 2. Migrate Signals history
  const localSignals = readRawJSON(SIGNALS_FILE);
  if (Array.isArray(localSignals) && localSignals.length > 0) {
    try {
      const count = await getSignalsColl().countDocuments();
      if (count === 0) {
        await getSignalsColl().insertMany(localSignals);
        console.log(`[Migration] Migrated ${localSignals.length} signals history to MongoDB.`);
      }
      fs.renameSync(SIGNALS_FILE, SIGNALS_FILE + '.migrated');
    } catch (err) {
      console.error('[Migration Error] Signals migration failed:', err.message);
    }
  }

  // 3. Migrate Subscribers list
  const localSubs = readRawJSON(SUBS_FILE);
  if (Array.isArray(localSubs) && localSubs.length > 0) {
    try {
      const count = await getSubsColl().countDocuments();
      if (count === 0) {
        await getSubsColl().insertMany(localSubs);
        console.log(`[Migration] Migrated ${localSubs.length} subscribers list to MongoDB.`);
      }
      fs.renameSync(SUBS_FILE, SUBS_FILE + '.migrated');
    } catch (err) {
      console.error('[Migration Error] Subscribers migration failed:', err.message);
    }
  }

  // 4. Migrate Payments record
  const localPayments = readRawJSON(PAYMENTS_FILE);
  if (localPayments && Object.keys(localPayments).length > 0) {
    try {
      const operations = Object.keys(localPayments).map(ref => ({
        updateOne: {
          filter: { reference: ref },
          update: { $set: { reference: ref, ...localPayments[ref] } },
          upsert: true
        }
      }));
      await getPaymentsColl().bulkWrite(operations);
      console.log(`[Migration] Migrated ${operations.length} payment records to MongoDB.`);
      fs.renameSync(PAYMENTS_FILE, PAYMENTS_FILE + '.migrated');
    } catch (err) {
      console.error('[Migration Error] Payments migration failed:', err.message);
    }
  }

  // 5. Migrate Today's Setup
  const localSetup = readRawJSON(TODAYS_SETUP_FILE);
  if (localSetup && localSetup.image) {
    try {
      await getSetupColl().updateOne(
        { type: 'todays_setup' },
        { $set: { type: 'todays_setup', ...localSetup } },
        { upsert: true }
      );
      console.log("[Migration] Today's setup image successfully migrated.");
      fs.renameSync(TODAYS_SETUP_FILE, TODAYS_SETUP_FILE + '.migrated');
    } catch (err) {
      console.error('[Migration Error] Today\'s setup migration failed:', err.message);
    }
  }

  // 5b. Migrate Today's Setup Results
  const localSetupResults = readRawJSON(TODAYS_SETUP_RESULTS_FILE);
  if (localSetupResults && localSetupResults.image) {
    try {
      await getSetupResultsColl().updateOne(
        { type: 'todays_setup_results' },
        { $set: { type: 'todays_setup_results', ...localSetupResults } },
        { upsert: true }
      );
      console.log("[Migration] Today's setup results image successfully migrated.");
      fs.renameSync(TODAYS_SETUP_RESULTS_FILE, TODAYS_SETUP_RESULTS_FILE + '.migrated');
    } catch (err) {
      console.error('[Migration Error] Today\'s setup results migration failed:', err.message);
    }
  }

  // 6. Migrate VIP PDF/ZIP documents (saves files from deletion on Render free restarts)
  if (fs.existsSync(VIP_DOCS_DIR)) {
    try {
      const files = fs.readdirSync(VIP_DOCS_DIR);
      let migratedCount = 0;

      for (const filename of files) {
        const filePath = path.join(VIP_DOCS_DIR, filename);
        if (fs.statSync(filePath).isFile() && !filename.endsWith('.migrated')) {
          const fileBuffer = fs.readFileSync(filePath);
          let mime = 'application/octet-stream';
          if (filename.endsWith('.pdf')) mime = 'application/pdf';
          else if (filename.endsWith('.zip')) mime = 'application/zip';

          const fileData = `data:${mime};base64,` + fileBuffer.toString('base64');
          
          await getDocsColl().updateOne(
            { filename },
            { 
              $set: { 
                filename, 
                fileData, 
                sizeBytes: fileBuffer.length,
                modifiedAt: new Date().toISOString() 
              } 
            },
            { upsert: true }
          );
          migratedCount++;
        }
      }

      if (migratedCount > 0) {
        console.log(`[Migration] Migrated ${migratedCount} VIP guides & documents to MongoDB Atlas.`);
      }

      // Archive local files
      files.forEach(filename => {
        const filePath = path.join(VIP_DOCS_DIR, filename);
        if (fs.statSync(filePath).isFile() && !filename.endsWith('.migrated')) {
          fs.renameSync(filePath, filePath + '.migrated');
        }
      });
    } catch (err) {
      console.error('[Migration Error] Documents migration failed:', err.message);
    }
  }

  console.log('[Migration] Database migration check completed.');
}

// ── JSON Local Fallback Helpers ──────────────────────────────
function readJSON(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return []; }
}
function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// ── Unified Database/File Adapter Layers ─────────────────────
async function getAppConfig() {
  if (db) {
    try {
      let config = await getConfigsColl().findOne({ type: 'app_config' });
      if (!config) {
        config = { type: 'app_config', vipPassword: process.env.VIP_PASSWORD || 'PIPSVIP2026' };
        await getConfigsColl().insertOne(config);
      }
      return config;
    } catch (err) {
      console.error('[DB Config Error]', err.message);
    }
  }
  // Local File Fallback
  let fileConfig = {};
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      fileConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch {}
  const vipPassword = fileConfig.vipPassword || process.env.VIP_PASSWORD || 'PIPSVIP2026';
  return { ...fileConfig, vipPassword };
}

async function saveAppConfig(config) {
  if (db) {
    try {
      await getConfigsColl().updateOne(
        { type: 'app_config' },
        { $set: config },
        { upsert: true }
      );
      return true;
    } catch (err) {
      console.error('[DB Config Save Error]', err.message);
      return false;
    }
  }
  // Local File Fallback
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    return true;
  } catch {
    return false;
  }
}

async function getSignals(limit) {
  if (db) {
    try {
      return await getSignalsColl()
        .find({})
        .sort({ sentAt: -1 })
        .limit(limit)
        .toArray();
    } catch (err) {
      console.error('[DB Signals Error]', err.message);
    }
  }
  // Fallback
  const signals = readJSON(SIGNALS_FILE);
  return signals.slice(0, limit);
}

async function addSignal(signal) {
  if (db) {
    try {
      await getSignalsColl().insertOne(signal);
      return;
    } catch (err) {
      console.error('[DB Add Signal Error]', err.message);
    }
  }
  // Fallback
  const signals = readJSON(SIGNALS_FILE);
  signals.unshift(signal);
  if (signals.length > 100) signals.pop();
  writeJSON(SIGNALS_FILE, signals);
}

async function getSubscribers() {
  if (db) {
    try {
      return await getSubsColl().find({}).toArray();
    } catch (err) {
      console.error('[DB Subs Error]', err.message);
    }
  }
  return readJSON(SUBS_FILE);
}

async function addSubscriber(sub) {
  if (db) {
    try {
      await getSubsColl().insertOne(sub);
      return;
    } catch (err) {
      console.error('[DB Add Sub Error]', err.message);
    }
  }
  const subscribers = readJSON(SUBS_FILE);
  subscribers.push(sub);
  writeJSON(SUBS_FILE, subscribers);
}

async function getSubscriberByTelegram(telegram) {
  if (db) {
    try {
      return await getSubsColl().findOne({ telegram });
    } catch (err) {
      console.error('[DB Get Sub Error]', err.message);
    }
  }
  const subscribers = readJSON(SUBS_FILE);
  return subscribers.find(s => s.telegram === telegram);
}

async function getPayment(ref) {
  if (db) {
    try {
      return await getPaymentsColl().findOne({ reference: ref });
    } catch (err) {
      console.error('[DB Payment Find Error]', err.message);
    }
  }
  const payments = readJSON(PAYMENTS_FILE);
  return payments[ref];
}

// Find a payment record by its unique subscriber access code
async function getPaymentByAccessCode(code) {
  if (db) {
    try {
      return await getPaymentsColl().findOne({ accessCode: code });
    } catch (err) {
      console.error('[DB Payment Code Lookup Error]', err.message);
    }
  }
  // Local File Fallback: scan all payments for the matching code
  const payments = readJSON(PAYMENTS_FILE);
  return Object.values(payments).find(p => p.accessCode === code) || null;
}

async function savePayment(ref, paymentData) {
  if (db) {
    try {
      await getPaymentsColl().updateOne(
        { reference: ref },
        { $set: { reference: ref, ...paymentData } },
        { upsert: true }
      );
      return;
    } catch (err) {
      console.error('[DB Payment Save Error]', err.message);
    }
  }
  const payments = readJSON(PAYMENTS_FILE);
  payments[ref] = paymentData;
  writeJSON(PAYMENTS_FILE, payments);
}

async function getTodaysSetup() {
  let setup = null;
  if (db) {
    try {
      setup = await getSetupColl().findOne({ type: 'todays_setup' });
    } catch (err) {
      console.error('[DB Setup Find Error]', err.message);
    }
  } else {
    setup = readJSON(TODAYS_SETUP_FILE);
  }
  // Setup persists until admin manually removes it — no auto-expiry
  return setup;
}

async function getAdminTodaysSetup() {
  let setup = null;
  if (db) {
    try {
      setup = await getSetupColl().findOne({ type: 'todays_setup' });
    } catch (err) {
      console.error('[DB Setup Find Error]', err.message);
    }
  } else {
    setup = readJSON(TODAYS_SETUP_FILE);
  }
  return setup;
}

async function saveTodaysSetup(setupData) {
  if (db) {
    try {
      await getSetupColl().updateOne(
        { type: 'todays_setup' },
        { $set: { type: 'todays_setup', ...setupData } },
        { upsert: true }
      );
      return;
    } catch (err) {
      console.error('[DB Setup Save Error]', err.message);
    }
  }
  writeJSON(TODAYS_SETUP_FILE, setupData);
}

async function getTodaysSetupResults() {
  let setup = null;
  if (db) {
    try {
      setup = await getSetupResultsColl().findOne({ type: 'todays_setup_results' });
    } catch (err) {
      console.error('[DB Setup Results Find Error]', err.message);
    }
  } else {
    setup = readJSON(TODAYS_SETUP_RESULTS_FILE);
  }
  return setup;
}

async function getAdminTodaysSetupResults() {
  let setup = null;
  if (db) {
    try {
      setup = await getSetupResultsColl().findOne({ type: 'todays_setup_results' });
    } catch (err) {
      console.error('[DB Setup Results Find Error]', err.message);
    }
  } else {
    setup = readJSON(TODAYS_SETUP_RESULTS_FILE);
  }
  return setup;
}

async function saveTodaysSetupResults(setupData) {
  if (db) {
    try {
      await getSetupResultsColl().updateOne(
        { type: 'todays_setup_results' },
        { $set: { type: 'todays_setup_results', ...setupData } },
        { upsert: true }
      );
      return;
    } catch (err) {
      console.error('[DB Setup Results Save Error]', err.message);
    }
  }
  writeJSON(TODAYS_SETUP_RESULTS_FILE, setupData);
}

async function getVipDocuments() {
  if (db) {
    try {
      return await getDocsColl()
        .find({})
        .project({ fileData: 0 }) // Exclude large raw contents from array lists
        .toArray();
    } catch (err) {
      console.error('[DB Docs Find Error]', err.message);
    }
  }
  // Local File Fallback
  try {
    const files = fs.readdirSync(VIP_DOCS_DIR);
    return files
      .filter(f => !f.endsWith('.migrated'))
      .map(filename => {
        const filePath = path.join(VIP_DOCS_DIR, filename);
        const stats = fs.statSync(filePath);
        return {
          filename,
          sizeBytes: stats.size,
          modifiedAt: stats.mtime.toISOString()
        };
      });
  } catch {
    return [];
  }
}

async function getVipDocument(filename) {
  if (db) {
    try {
      return await getDocsColl().findOne({ filename });
    } catch (err) {
      console.error('[DB Doc Query Error]', err.message);
    }
  }
  // Local File Fallback
  try {
    const safeFilename = path.basename(filename);
    const filePath = path.resolve(VIP_DOCS_DIR, safeFilename);
    if (fs.existsSync(filePath) && filePath.startsWith(VIP_DOCS_DIR)) {
      const stats = fs.statSync(filePath);
      const buffer = fs.readFileSync(filePath);
      return {
        filename: safeFilename,
        fileData: `data:application/octet-stream;base64,` + buffer.toString('base64'),
        sizeBytes: stats.size
      };
    }
  } catch {}
  return null;
}

async function saveVipDocument(filename, fileData) {
  if (db) {
    try {
      const base64Clean = fileData.replace(/^data:.*;base64,/, '');
      const buffer = Buffer.from(base64Clean, 'base64');
      await getDocsColl().updateOne(
        { filename },
        { 
          $set: { 
            filename, 
            fileData, 
            sizeBytes: buffer.length,
            modifiedAt: new Date().toISOString() 
          } 
        },
        { upsert: true }
      );
      return;
    } catch (err) {
      console.error('[DB Doc Save Error]', err.message);
    }
  }
  // Local File Fallback
  try {
    const safeFilename = path.basename(filename);
    const filePath = path.resolve(VIP_DOCS_DIR, safeFilename);
    const base64Clean = fileData.replace(/^data:.*;base64,/, '');
    const buffer = Buffer.from(base64Clean, 'base64');
    fs.writeFileSync(filePath, buffer);
  } catch (err) {
    console.error('[Local File Save Error]', err.message);
  }
}

async function deleteVipDocument(filename) {
  if (db) {
    try {
      const res = await getDocsColl().deleteOne({ filename });
      return res.deletedCount > 0;
    } catch (err) {
      console.error('[DB Doc Delete Error]', err.message);
    }
  }
  // Local File Fallback
  try {
    const safeFilename = path.basename(filename);
    const filePath = path.resolve(VIP_DOCS_DIR, safeFilename);
    if (fs.existsSync(filePath) && filePath.startsWith(VIP_DOCS_DIR)) {
      fs.unlinkSync(filePath);
      return true;
    }
  } catch {}
  return false;
}

// ── Validation Middlewares ──────────────────────────────────
function validateAdminKey(req, res, next) {
  const key = req.headers['x-admin-key'];
  const expectedKey = process.env.ADMIN_KEY || 'pips-admin-2026';
  if (key !== expectedKey) {
    return res.status(403).json({ ok: false, error: 'Forbidden. Invalid admin key.' });
  }
  next();
}

function validateVipSession(req, res, next) {
  const token = req.headers['x-vip-token'] || req.query.token;
  if (!token) return res.status(401).json({ error: 'Missing token.' });
  try {
    const [expires, hmac] = token.split('.');
    if (Date.now() > Number(expires)) return res.status(401).json({ error: 'Token expired.' });
    const expectedHmac = crypto.createHmac('sha256', serverSecret).update(String(expires)).digest('hex');
    if (hmac !== expectedHmac) return res.status(401).json({ error: 'Invalid token.' });
    next();
  } catch { return res.status(401).json({ error: 'Invalid token format.' }); }
}

// Ensure dummy files exist only inside local fallback so local devs get instant files
function checkOrCreateDummyFiles() {
  const dummyDocs = [
    { name: 'smart-money-concepts-guide.pdf', content: 'PDF Dummy Content: Smart Money Concepts Guide' },
    { name: 'risk-management-workbook.pdf', content: 'PDF Dummy Content: Risk Management Workbook' },
    { name: 'high-probability-setups-playbook.pdf', content: 'PDF Dummy Content: High Probability Setups Playbook' },
    { name: 'custom-ema-settings-pack.zip', content: 'ZIP Dummy Content: Custom EMA Settings Pack' },
    { name: 'session-kill-zones-cheat-sheet.pdf', content: 'PDF Dummy Content: Session Kill Zones Cheat Sheet' }
  ];
  dummyDocs.forEach(doc => {
    const filePath = path.join(VIP_DOCS_DIR, doc.name);
    // Don't re-create if the .migrated or the active file already exists
    if (!fs.existsSync(filePath) && !fs.existsSync(filePath + '.migrated')) {
      fs.writeFileSync(filePath, doc.content);
    }
  });
}
checkOrCreateDummyFiles();

// ── Middlewares ──────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '15mb' })); // Allow larger payloads for base64 PDF uploads

// Stricter rate limiter specifically for VIP password verification
const vipAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 password attempts per window
  message: { ok: false, error: 'Too many password attempts. Try again in 15 minutes.' }
});

// Block access to sensitive server files
app.use((req, res, next) => {
  const forbiddenFiles = ['.env', 'server.js', 'package.json', 'package-lock.json', '.gitignore'];
  const requestedFile = path.basename(req.path).toLowerCase();
  if (forbiddenFiles.includes(requestedFile) || req.path.startsWith('/data')) {
    return res.status(403).json({ error: 'Access Denied' });
  }
  next();
});

app.use(express.static(__dirname)); // Serve static HTML/CSS/JS frontend files

// ── Helper API Functions ─────────────────────────────────────
function getCredentials(body) {
  return {
    token:  body.token  || process.env.TELEGRAM_BOT_TOKEN,
    chatId: body.chatId || process.env.TELEGRAM_CHAT_ID,
  };
}
function now() {
  return new Date().toISOString();
}

// Generate a unique subscriber access code in format PIPS-XXXXXX
// Uses unambiguous characters (no 0/O, 1/I confusion)
function generateAccessCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'PIPS-';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// ════════════════════════════════════════════════════════════
//  ROUTES
// ════════════════════════════════════════════════════════════

// ── GET /api/performance/stats ──────────────────────────────
app.get('/api/performance/stats', async (req, res) => {
  if (!db) return res.json({ ok: false, error: 'Database not connected' });
  try {
    const logs = await getPerformanceColl().find({}).toArray();
    let totalPips = 0;
    let wins = 0;
    logs.forEach(log => {
      totalPips += Number(log.pips) || 0;
      if (log.result === 'Win') wins++;
    });
    const winRate = logs.length > 0 ? Math.round((wins / logs.length) * 100) : 0;
    res.json({ ok: true, totalTrades: logs.length, totalPips, winRate, recent: logs.slice(-5).reverse() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/performance ───────────────────────────────────
app.post('/api/performance', validateAdminKey, async (req, res) => {
  if (!db) return res.status(500).json({ ok: false, error: 'Database not connected' });
  const { asset, type, result, pips } = req.body;
  if (!asset || !type || !result || pips === undefined) return res.status(400).json({ ok: false, error: 'Missing fields' });
  
  try {
    await getPerformanceColl().insertOne({ asset, type, result, pips: Number(pips), date: now() });
    res.json({ ok: true, message: 'Performance logged successfully.' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/push/subscribe ────────────────────────────────
app.post('/api/push/subscribe', async (req, res) => {
  if (!db) return res.status(500).json({ ok: false, error: 'Database not connected' });
  const subscription = req.body;
  if (!subscription || !subscription.endpoint) return res.status(400).json({ ok: false, error: 'Invalid subscription' });
  
  try {
    // Upsert subscription based on endpoint
    await getPushSubsColl().updateOne(
      { endpoint: subscription.endpoint },
      { $set: subscription },
      { upsert: true }
    );
    res.status(201).json({ ok: true, message: 'Subscribed to push notifications.' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Health check ─────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: now(), service: 'pips-attendant-api', dbConnected: !!db });
});

// ── POST /api/broadcast ──────────────────────────────────────
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
    if (imageBase64) {
      // 1. Send photo with caption
      const photoRes = await fetch(`${TG_BASE}/sendPhoto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          photo: imageBase64,
          caption: text || '',
          parse_mode: 'Markdown',
        }),
      });
      const photoData = await photoRes.json();

      if (!photoData.ok) {
        // Fallback to text-only message
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

    if (stickerId) {
      // 3. Send sticker
      const stickerRes = await fetch(`${TG_BASE}/sendSticker`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, sticker: stickerId }),
      });
      const stickerData = await stickerRes.json();
      if (!stickerData.ok) throw new Error(stickerData.description);
    }

    // 4. Log signal history using Adapter
    try {
      await addSignal({ id: Date.now(), type, text: text || '', sentAt: now() });
    } catch (logErr) {
      console.warn('[warning] Failed to log signal:', logErr.message);
    }

    // 5. Send Web Push Notifications
    if (db) {
      try {
        const subscriptions = await getPushSubsColl().find({}).toArray();
        const pushPayload = JSON.stringify({
          title: 'New VIP Signal Alert!',
          body: text ? text.substring(0, 100) + '...' : 'A new signal or update was just posted.',
          icon: '/favicon.png',
          url: '/'
        });
        
        const pushPromises = subscriptions.map(sub => 
          webpush.sendNotification(sub, pushPayload).catch(err => {
            if (err.statusCode === 404 || err.statusCode === 410) {
              console.log('Subscription expired, removing:', sub.endpoint);
              return getPushSubsColl().deleteOne({ endpoint: sub.endpoint });
            }
          })
        );
        await Promise.all(pushPromises);
        console.log(`[Push] Sent to ${subscriptions.length} clients.`);
      } catch (pushErr) {
        console.warn('[Push Error]', pushErr.message);
      }
    }

    res.json({ ok: true, message: 'Broadcast sent and logged.' });
  } catch (err) {
    console.error('[broadcast error]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/signals ─────────────────────────────────────────
app.get('/api/signals', async (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const signals = await getSignals(limit);
  res.json({ ok: true, signals });
});

// ── POST /api/pay-vip ─────────────────────────────────────────
app.post('/api/pay-vip', async (req, res) => {
  const { phone } = req.body;
  const { PAYHERO_API_USER, PAYHERO_API_PASS, PAYHERO_CHANNEL_ID } = process.env;

  if (!phone) return res.status(400).json({ ok: false, error: 'Phone number is required.' });
  if (!PAYHERO_API_USER || !PAYHERO_API_PASS || !PAYHERO_CHANNEL_ID) {
    return res.status(500).json({ ok: false, error: 'Payment gateway not configured.' });
  }

  const ref = `VIP_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  try {
    const auth = Buffer.from(`${PAYHERO_API_USER}:${PAYHERO_API_PASS}`).toString('base64');
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
        amount: 5000,
        phone_number: phone,
        channel_id: PAYHERO_CHANNEL_ID,
        provider: 'm-pesa',
        external_reference: ref,
        callback_url: callback_url
      })
    });

    const data = await response.json();
    if (data.success || response.ok) {
      await savePayment(ref, { status: 'Pending', phone, timestamp: now() });
      res.json({ ok: true, reference: ref, message: 'Check your phone for the M-Pesa PIN prompt.' });
    } else {
      throw new Error(data.message || 'Payment initiation failed');
    }
  } catch (error) {
    console.error('[payhero error]', error);
    res.status(500).json({ ok: false, error: 'Failed to initiate payment. Please try again.' });
  }
});

// ── GET /api/todays-setup (VIP ONLY) ──────────────────────────
app.get('/api/todays-setup', validateVipSession, async (req, res) => {
  const setup = await getTodaysSetup();
  if (setup && setup.image) {
    res.json({ ok: true, setup });
  } else {
    res.json({ ok: false, error: 'No setup available for today yet.' });
  }
});

// ── ADMIN: GET TODAY'S SETUP ───────────────────────────────────
app.get('/api/admin/todays-setup', validateAdminKey, async (req, res) => {
  try {
    const setup = await getAdminTodaysSetup();
    if (setup && setup.image) {
      res.json({ ok: true, setup });
    } else {
      res.json({ ok: false, error: 'No setup available.' });
    }
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── ADMIN: UPLOAD TODAY'S SETUP ───────────────────────────────
app.post('/api/upload-todays-setup', validateAdminKey, async (req, res) => {
  const { image, filename } = req.body;
  
  if (!image || !image.startsWith('data:image/')) {
    return res.status(400).json({ ok: false, error: 'Invalid image format. Must be an image.' });
  }

  const setupData = {
    image,
    filename: filename || 'todays-setup.png',
    timestamp: new Date().toISOString()
  };

  await saveTodaysSetup(setupData);
  res.json({ ok: true, message: "Today's setup updated successfully!" });
});

// ── ADMIN: DELETE TODAY'S SETUP ───────────────────────────────
app.delete('/api/todays-setup', validateAdminKey, async (req, res) => {
  if (db) {
    try {
      await getSetupColl().deleteOne({ type: 'todays_setup' });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  }
  // Local fallback wipe
  try {
    if (fs.existsSync(TODAYS_SETUP_FILE)) {
      fs.unlinkSync(TODAYS_SETUP_FILE);
    }
  } catch(e) {}
  res.json({ ok: true, message: "Today's setup removed successfully!" });
});

// ── GET /api/todays-setup-results (VIP ONLY) ──────────────────
app.get('/api/todays-setup-results', validateVipSession, async (req, res) => {
  const setup = await getTodaysSetupResults();
  if (setup && setup.image) {
    res.json({ ok: true, setup });
  } else {
    res.json({ ok: false, error: 'No setup results available for today yet.' });
  }
});

// ── ADMIN: GET TODAY'S SETUP RESULTS ──────────────────────────
app.get('/api/admin/todays-setup-results', validateAdminKey, async (req, res) => {
  try {
    const setup = await getAdminTodaysSetupResults();
    if (setup && setup.image) {
      res.json({ ok: true, setup });
    } else {
      res.json({ ok: false, error: 'No setup results available.' });
    }
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── ADMIN: UPLOAD TODAY'S SETUP RESULTS ───────────────────────
app.post('/api/upload-todays-setup-results', validateAdminKey, async (req, res) => {
  const { image, filename } = req.body;
  
  if (!image || !image.startsWith('data:image/')) {
    return res.status(400).json({ ok: false, error: 'Invalid image format. Must be an image.' });
  }

  const setupData = {
    image,
    filename: filename || 'todays-setup-results.png',
    timestamp: new Date().toISOString()
  };

  await saveTodaysSetupResults(setupData);
  res.json({ ok: true, message: "Today's setup results updated successfully!" });
});

// ── ADMIN: DELETE TODAY'S SETUP RESULTS ───────────────────────
app.delete('/api/todays-setup-results', validateAdminKey, async (req, res) => {
  if (db) {
    try {
      await getSetupResultsColl().deleteOne({ type: 'todays_setup_results' });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  }
  // Local fallback wipe
  try {
    if (fs.existsSync(TODAYS_SETUP_RESULTS_FILE)) {
      fs.unlinkSync(TODAYS_SETUP_RESULTS_FILE);
    }
  } catch(e) {}
  res.json({ ok: true, message: "Today's setup results removed successfully!" });
});

// ── POST /api/payhero-webhook ─────────────────────────────────
app.post('/api/payhero-webhook', async (req, res) => {
  try {
    const body = req.body;
    console.log('[Payhero Webhook Received]', body);

    const ref = body.external_reference || (body.response && body.response.ExternalReference);
    const status = body.status || (body.response && body.response.Status) || 'Failed';

    if (ref) {
      const payment = await getPayment(ref);
      if (payment) {
        const statusStr = String(status).toLowerCase();
        const isSuccess = ['success', 'completed', 'successful'].includes(statusStr) || body.status === true || body.success === true;
        payment.status = isSuccess ? 'Success' : 'Failed';
        payment.rawWebhook = body;
        await savePayment(ref, payment);
      }
    }
    res.status(200).json({ received: true });
  } catch (err) {
    console.error('[webhook error]', err);
    res.status(500).send('Error');
  }
});

// ── GET /api/check-payment/:ref ───────────────────────────────
app.get('/api/check-payment/:ref', async (req, res) => {
  const { ref } = req.params;
  const payment = await getPayment(ref);

  if (!payment) return res.status(404).json({ ok: false, error: 'Transaction not found.' });

  if (payment.status === 'Success') {
    // Generate unique subscriber access code on first successful payment check
    if (!payment.accessCode) {
      payment.accessCode = generateAccessCode();
      payment.accessCodeExpiry = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
      await savePayment(ref, payment);
      console.log(`[Access Code] Generated ${payment.accessCode} for ref ${ref} (expires ${new Date(payment.accessCodeExpiry).toLocaleDateString()})`);
    }

    const expires = Date.now() + 30 * 24 * 60 * 60 * 1000;
    const hmac = crypto.createHmac('sha256', serverSecret).update(String(expires)).digest('hex');
    const sessionToken = `${expires}.${hmac}`;

    res.json({
      ok: true,
      status: 'Success',
      sessionToken,
      accessCode: payment.accessCode,
      accessCodeExpiry: payment.accessCodeExpiry
    });
  } else {
    res.json({ ok: true, status: payment.status });
  }
});

// ── POST /api/verify-access-code ────────────────────────────
// Allows returning subscribers to re-authenticate with their unique code
app.post('/api/verify-access-code', vipAuthLimiter, async (req, res) => {
  const { code } = req.body;

  if (!code) return res.status(400).json({ ok: false, error: 'No access code provided.' });

  const cleanCode = code.toUpperCase().trim();
  const payment = await getPaymentByAccessCode(cleanCode);

  if (!payment) {
    return res.status(401).json({ ok: false, error: 'Invalid access code. Please check and try again.' });
  }

  if (!payment.accessCodeExpiry || Date.now() > payment.accessCodeExpiry) {
    const expiredOn = payment.accessCodeExpiry ? new Date(payment.accessCodeExpiry).toLocaleDateString('en-KE') : 'unknown date';
    return res.status(401).json({ ok: false, error: `Access code expired on ${expiredOn}. Please renew your VIP subscription.` });
  }

  // Valid & not expired — issue a fresh session token
  const expires = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const hmac = crypto.createHmac('sha256', serverSecret).update(String(expires)).digest('hex');
  const sessionToken = `${expires}.${hmac}`;

  console.log(`[Access Code] Subscriber logged in with code ${cleanCode}`);
  res.json({ ok: true, sessionToken });
});

// ── POST /api/verify-vip ──────────────────────────────────────
app.post('/api/verify-vip', vipAuthLimiter, async (req, res) => {
  const { password } = req.body;
  const config = await getAppConfig();
  const correct = config.vipPassword || 'PIPSVIP2026';

  if (!password) return res.status(400).json({ ok: false, error: 'No password provided.' });

  if (password.toUpperCase() === correct.toUpperCase()) {
    const expires = Date.now() + 30 * 24 * 60 * 60 * 1000; 
    const hmac = crypto.createHmac('sha256', serverSecret).update(String(expires)).digest('hex');
    const sessionToken = `${expires}.${hmac}`;
    res.json({ ok: true, sessionToken });
  } else {
    res.status(401).json({ ok: false, error: 'Incorrect password.' });
  }
});

// ── GET /api/download-vip ─────────────────────────────────────
app.get('/api/download-vip', async (req, res) => {
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

  // 2. Load the VIP document
  try {
    const doc = await getVipDocument(file);
    if (!doc) {
      return res.status(404).json({ error: 'Requested file not found.' });
    }

    const base64Clean = doc.fileData.replace(/^data:.*;base64,/, '');
    const buffer = Buffer.from(base64Clean, 'base64');

    // Clean filename to prevent path traversal
    const safeFilename = path.basename(doc.filename);

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/redirect-vip-telegram ────────────────────────────
app.get('/api/redirect-vip-telegram', (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send('Missing session token.');

  try {
    const [expires, hmac] = token.split('.');
    if (!expires || !hmac) return res.status(401).send('Invalid token format.');
    if (Date.now() > Number(expires)) return res.status(401).send('Session expired. Please log in again.');

    const expectedHmac = crypto.createHmac('sha256', serverSecret).update(String(expires)).digest('hex');
    if (hmac !== expectedHmac) return res.status(401).send('Invalid token signature.');
  } catch (err) {
    return res.status(401).send('Token verification failed.');
  }

  res.redirect('https://t.me/pipsattendant');
});

// ── POST /api/subscribe ───────────────────────────────────────
app.post('/api/subscribe', async (req, res) => {
  const { name, telegram, email } = req.body;

  if (!name && !telegram && !email) {
    return res.status(400).json({ ok: false, error: 'Provide at least a name or contact.' });
  }

  try {
    if (telegram) {
      const existing = await getSubscriberByTelegram(telegram);
      if (existing) {
        return res.json({ ok: true, message: 'Already subscribed!' });
      }
    }

    await addSubscriber({ name, telegram, email, joinedAt: now() });
    res.json({ ok: true, message: 'Subscribed successfully!' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/subscribers ──────────────────────────────────────
app.get('/api/subscribers', validateAdminKey, async (req, res) => {
  try {
    const subscribers = await getSubscribers();
    res.json({ ok: true, count: subscribers.length, subscribers });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/vip-documents ────────────────────────────────────
app.get('/api/vip-documents', validateAdminKey, async (req, res) => {
  try {
    const documents = await getVipDocuments();
    res.json({ ok: true, documents });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/upload-vip-document ─────────────────────────────
app.post('/api/upload-vip-document', validateAdminKey, async (req, res) => {
  const { filename, fileData } = req.body;

  if (!filename || !fileData) {
    return res.status(400).json({ ok: false, error: 'Missing filename or fileData.' });
  }

  if (fileData.length > 14 * 1024 * 1024) {
    return res.status(400).json({ ok: false, error: 'File size exceeds 10MB limit.' });
  }

  try {
    await saveVipDocument(filename, fileData);
    res.json({ ok: true, message: `File ${filename} uploaded successfully.` });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── DELETE /api/delete-vip-document/:filename ─────────────────
app.delete('/api/delete-vip-document/:filename', validateAdminKey, async (req, res) => {
  const { filename } = req.params;
  if (!filename) return res.status(400).json({ ok: false, error: 'Missing filename.' });

  try {
    const deleted = await deleteVipDocument(filename);
    if (deleted) {
      res.json({ ok: true, message: `File ${filename} deleted successfully.` });
    } else {
      res.status(404).json({ ok: false, error: 'File not found.' });
    }
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/update-vip-password ─────────────────────────────
app.post('/api/update-vip-password', validateAdminKey, async (req, res) => {
  const { vipPassword } = req.body;

  if (!vipPassword || vipPassword.trim().length < 4) {
    return res.status(400).json({ ok: false, error: 'Password must be at least 4 characters.' });
  }

  try {
    const config = await getAppConfig();
    config.vipPassword = vipPassword.trim();

    if (await saveAppConfig(config)) {
      res.json({ ok: true, message: 'VIP password updated successfully.' });
    } else {
      res.status(500).json({ ok: false, error: 'Failed to save configuration.' });
    }
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/engagement ─────────────────────────────────────
app.post('/api/engagement', async (req, res) => {
  req.body.type = 'engagement';
  return app._router.handle(
    Object.assign(req, { url: '/api/broadcast', path: '/api/broadcast' }),
    res,
    () => {}
  );
});

// ── POST /api/live ───────────────────────────────────────────
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
