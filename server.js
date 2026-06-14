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
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fetch = require('node-fetch');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { MongoClient } = require('mongodb');
const webpush = require('web-push');
const cron = require('node-cron');
const TelegramBot = require('node-telegram-bot-api');
const sgMail = require('@sendgrid/mail');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');

// ── Subscription Plans ────────────────────────────────────────
const PLANS = {
  '1month':  { days: 30,  kesPrice: 5000,  usdtPrice: 50  },
  '2months': { days: 60,  kesPrice: 9500,  usdtPrice: 95  },
  '3months': { days: 90,  kesPrice: 14000, usdtPrice: 140 }
};

function getDaysForPlan(plan) {
  return (PLANS[plan] || PLANS['1month']).days;
}

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
const WHATSAPP_FILE = path.join(DATA_DIR, 'whatsapp.json');
const CHAT_FILE = path.join(DATA_DIR, 'chat.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

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
const getWhatsappColl = () => db.collection('whatsapp_subscribers');
const getChatColl = () => db.collection('chat_messages');
const getCryptoRequestsColl = () => db.collection('crypto_payment_requests');
const getUsersColl = () => db.collection('users');
const getPromosColl = () => db.collection('promo_codes');
const getTicketsColl = () => db.collection('support_tickets');
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
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 0; // 0 = no limit in MongoDB
  if (db) {
    try {
      return await getSignalsColl()
        .find({})
        .sort({ sentAt: -1 })
        .limit(safeLimit)
        .toArray();
    } catch (err) {
      console.error('[DB Signals Error]', err.message);
    }
  }
  // Fallback
  const signals = readJSON(SIGNALS_FILE);
  return safeLimit > 0 ? signals.slice(0, safeLimit) : signals;
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

async function addWhatsApp(phone) {
  if (db) {
    try {
      await getWhatsappColl().updateOne({ phone }, { $set: { phone, joinedAt: Date.now() } }, { upsert: true });
      return;
    } catch (err) {
      console.error('[DB WhatsApp Save Error]', err.message);
    }
  }
  const list = readJSON(WHATSAPP_FILE);
  if (!list.find(w => w.phone === phone)) {
    list.push({ phone, joinedAt: Date.now() });
    writeJSON(WHATSAPP_FILE, list);
  }
}

async function getWhatsAppList() {
  if (db) {
    try {
      return await getWhatsappColl().find({}).toArray();
    } catch (err) {
      console.error('[DB WhatsApp Get Error]', err.message);
    }
  }
  return readJSON(WHATSAPP_FILE);
}

async function addChatMessage(msg) {
  const message = { ...msg, timestamp: Date.now() };
  if (db) {
    try {
      await getChatColl().insertOne(message);
      return message;
    } catch (err) {
      console.error('[DB Chat Save Error]', err.message);
    }
  }
  const list = readJSON(CHAT_FILE);
  list.push(message);
  // Keep only last 100 messages
  if (list.length > 100) list.shift();
  writeJSON(CHAT_FILE, list);
  return message;
}

async function getChatMessages() {
  if (db) {
    try {
      return await getChatColl().find({}).sort({ timestamp: -1 }).limit(100).toArray();
    } catch (err) {
      console.error('[DB Chat Get Error]', err.message);
    }
  }
  return readJSON(CHAT_FILE).reverse();
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
    return res.status(403).json({ ok: false, error: 'Unauthorized Access.' });
  }
  next();
}

async function validateVipSession(req, res, next) {
  const token = req.headers['x-vip-token'] || req.query.token;
  if (!token) return res.status(401).json({ error: 'Missing token.' });
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return res.status(401).json({ error: 'Invalid token format.' });
    
    const [payloadStr, hmac] = parts;
    const expectedHmacPayload = crypto.createHmac('sha256', serverSecret).update(payloadStr).digest('hex');
    
    let isUserToken = false;
    let payload = null;
    try {
      const decoded = Buffer.from(payloadStr, 'base64').toString('utf8');
      if (decoded.includes('"id"') && decoded.includes('"exp"')) {
        payload = JSON.parse(decoded);
        isUserToken = true;
      }
    } catch(e) {}

    if (isUserToken) {
      if (hmac !== expectedHmacPayload) return res.status(401).json({ error: 'Invalid token signature.' });
      if (Date.now() > payload.exp) return res.status(401).json({ error: 'Token expired.' });
      
      const user = await getUserById(payload.id);
      if (!user) return res.status(401).json({ error: 'User not found.' });
      
      if (!user.subscriptionExpiry || Date.now() > user.subscriptionExpiry) {
        return res.status(403).json({ error: 'VIP Subscription required.' });
      }
      
      req.user = user;
      return next();
    } else {
      // Legacy token format (ExpiresTimestamp.hmac)
      const expires = Number(parts[0]);
      if (Date.now() > expires) return res.status(401).json({ error: 'Token expired.' });
      const expectedHmacLegacy = crypto.createHmac('sha256', serverSecret).update(String(parts[0])).digest('hex');
      if (parts[1] !== expectedHmacLegacy) return res.status(401).json({ error: 'Invalid token.' });
      req.user = { isLegacyVip: true };
      return next();
    }
  } catch (err) { return res.status(401).json({ error: 'Authentication failed.' }); }
}

async function validateUserSession(req, res, next) {
  const token = req.headers['x-vip-token'] || req.query.token;
  if (!token) return res.status(401).json({ ok: false, error: 'Missing token.' });
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return res.status(401).json({ ok: false, error: 'Invalid token format.' });
    
    const [payloadStr, hmac] = parts;
    const expectedHmacPayload = crypto.createHmac('sha256', serverSecret).update(payloadStr).digest('hex');
    
    if (hmac !== expectedHmacPayload) return res.status(401).json({ ok: false, error: 'Invalid token signature.' });
    
    const decoded = Buffer.from(payloadStr, 'base64').toString('utf8');
    const payload = JSON.parse(decoded);
    
    if (Date.now() > payload.exp) return res.status(401).json({ ok: false, error: 'Token expired.' });
    
    const user = await getUserById(payload.id);
    if (!user) return res.status(401).json({ ok: false, error: 'User not found.' });
    
    req.user = user;
    next();
  } catch (err) { return res.status(401).json({ ok: false, error: 'Authentication failed.' }); }
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
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP to avoid blocking inline scripts/styles for now
}));
app.use(cors());
app.use(express.json({ limit: '15mb' })); // Allow larger payloads for base64 PDF uploads

// Stricter rate limiter specifically for VIP password verification
const vipAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 password attempts per window
  message: { ok: false, error: 'Too many password attempts. Try again in 15 minutes.' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // Limit each IP to 15 login/register attempts per window
  message: { ok: false, error: 'Too many authentication attempts. Try again in 15 minutes.' }
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

// ── NEW: User Accounts & Auth Helpers ─────────────────────────
async function getUserByEmail(email) {
  if (db) {
    try { return await getUsersColl().findOne({ email: email.toLowerCase() }); }
    catch (err) { console.error('[DB Get User Error]', err.message); }
  }
  const users = readJSON(USERS_FILE);
  return users.find(u => u.email === email.toLowerCase()) || null;
}

async function getUserById(id) {
  if (db) {
    try { return await getUsersColl().findOne({ id }); }
    catch (err) { console.error('[DB Get User By ID Error]', err.message); }
  }
  const users = readJSON(USERS_FILE);
  return users.find(u => u.id === id) || null;
}

async function saveUser(user) {
  if (db) {
    try {
      await getUsersColl().updateOne({ id: user.id }, { $set: user }, { upsert: true });
      return;
    } catch (err) { console.error('[DB Save User Error]', err.message); }
  }
  const users = readJSON(USERS_FILE);
  const idx = users.findIndex(u => u.id === user.id);
  if (idx > -1) users[idx] = user;
  else users.push(user);
  writeJSON(USERS_FILE, users);
}

async function getAllUsers() {
  if (db) {
    try { return await getUsersColl().find({}).toArray(); }
    catch (err) { console.error('[DB Get Users Error]', err.message); }
  }
  return readJSON(USERS_FILE);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derivedKey}`;
}

function verifyPassword(password, hash) {
  const [salt, key] = hash.split(':');
  const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
  return key === derivedKey;
}

function generateUserToken(user) {
  const expires = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const payloadStr = JSON.stringify({ id: user.id, email: user.email, exp: expires });
  const payload = Buffer.from(payloadStr).toString('base64');
  const hmac = crypto.createHmac('sha256', serverSecret).update(payload).digest('hex');
  return `${payload}.${hmac}`;
}

// ── Email Integration ──────────────────────────────────────────
sgMail.setApiKey(process.env.SENDGRID_API_KEY || '');

async function sendEmail(to, subject, htmlContent) {
  if (!process.env.SENDGRID_API_KEY || !process.env.SENDGRID_FROM_EMAIL) {
    console.log('\n========================================');
    console.log(`[Email Simulation] To: ${to}\nSubject: ${subject}\nBody: ${htmlContent}`);
    console.log('========================================\n');
    return;
  }
  try {
    await sgMail.send({
      to,
      from: process.env.SENDGRID_FROM_EMAIL,
      subject,
      html: htmlContent
    });
  } catch (error) {
    console.error('[SendGrid Error]', error);
  }
}

// ════════════════════════════════════════════════════════════
//  ROUTES
// ════════════════════════════════════════════════════════════

// ── User Authentication Endpoints ──────────────────────────────
app.post('/api/register', authLimiter, async (req, res) => {
  const { email, password, name, referralCode } = req.body;
  if (!email || !password) return res.status(400).json({ ok: false, error: 'Email and password required.' });
  
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
  if (!passwordRegex.test(password)) {
    return res.status(400).json({ ok: false, error: 'Password must be at least 8 characters long and include an uppercase letter, a lowercase letter, a number, and a special character.' });
  }

  const existingUser = await getUserByEmail(email);
  if (existingUser) return res.status(400).json({ ok: false, error: 'Email already registered.' });

  // Validate referral code
  let referredByUserId = null;
  if (referralCode) {
    const referrer = await getUserById(referralCode);
    if (referrer) referredByUserId = referrer.id;
  }

  const user = {
    id: `USER_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    email: email.toLowerCase().trim(),
    name: name || '',
    passwordHash: hashPassword(password),
    registeredAt: new Date().toISOString(),
    subscriptionExpiry: null,
    referredBy: referredByUserId || null,
    telegramId: null
  };

  await saveUser(user);
  const sessionToken = generateUserToken(user);
  
  // Send Welcome Email asynchronously
  try {
    const welcomeHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <h2 style="color: #fbbf24;">Welcome to Pips Attendant VIP! 🚀</h2>
        <p>Hi ${user.name || 'Trader'},</p>
        <p>Your account has been successfully created. We are thrilled to have you on board!</p>
        <p>To get started, please log in and select a subscription plan. Once subscribed, you will receive exclusive access to our VIP Telegram signals.</p>
        <p>Happy Trading!</p>
        <p>- The Pips Attendant Team</p>
      </div>
    `;
    sendEmail(user.email, 'Welcome to Pips Attendant VIP! 🚀', welcomeHtml).catch(console.error);
  } catch (err) {
    console.error('[Email] Failed to send welcome email', err);
  }

  res.json({ ok: true, sessionToken, user: { id: user.id, email: user.email, name: user.name, subscriptionExpiry: user.subscriptionExpiry, telegramId: user.telegramId } });
});

app.post('/api/login', authLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ ok: false, error: 'Email and password required.' });

  const user = await getUserByEmail(email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ ok: false, error: 'Invalid email or password.' });
  }

  const sessionToken = generateUserToken(user);
  res.json({ ok: true, sessionToken, user: { id: user.id, email: user.email, name: user.name, subscriptionExpiry: user.subscriptionExpiry, telegramId: user.telegramId } });
});

app.get('/api/me', validateUserSession, (req, res) => {
  res.json({
    ok: true,
    user: {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name,
      subscriptionExpiry: req.user.subscriptionExpiry,
      telegramId: req.user.telegramId
    }
  });
});

// ── Password Reset Endpoints ─────────────────────────────────
const resetTokens = new Map(); // Store as { email: { token, exp } }

app.post('/api/forgot-password', authLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ ok: false, error: 'Email required.' });

  const user = await getUserByEmail(email);
  if (!user) {
    // Return OK even if user not found to prevent email enumeration
    return res.json({ ok: true });
  }

  const token = crypto.randomBytes(32).toString('hex');
  resetTokens.set(email.toLowerCase().trim(), {
    token,
    exp: Date.now() + 15 * 60 * 1000 // 15 minutes
  });

  const resetLink = `${process.env.APP_URL || 'http://localhost:' + PORT}/premium.html?resetToken=${token}&email=${encodeURIComponent(email)}`;
  
  await sendEmail(
    user.email,
    'Password Reset Request - Pips_attendant',
    `<h3>Password Reset Request</h3>
     <p>You requested a password reset. Click the link below to set a new password. This link expires in 15 minutes.</p>
     <a href="${resetLink}">Reset Password</a>
     <p>If you didn't request this, you can safely ignore this email.</p>`
  );

  res.json({ ok: true });
});

app.post('/api/reset-password', authLimiter, async (req, res) => {
  const { email, token, newPassword } = req.body;
  if (!email || !token || !newPassword) return res.status(400).json({ ok: false, error: 'Missing fields.' });

  const resetData = resetTokens.get(email.toLowerCase().trim());
  if (!resetData || resetData.token !== token || resetData.exp < Date.now()) {
    return res.status(400).json({ ok: false, error: 'Invalid or expired reset token.' });
  }

  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
  if (!passwordRegex.test(newPassword)) {
    return res.status(400).json({ ok: false, error: 'Password must be at least 8 characters long and include an uppercase letter, a lowercase letter, a number, and a special character.' });
  }

  const user = await getUserByEmail(email);
  if (!user) return res.status(400).json({ ok: false, error: 'User not found.' });

  user.passwordHash = hashPassword(newPassword);
  await saveUser(user);
  resetTokens.delete(email.toLowerCase().trim());

  res.json({ ok: true });
});

// ── Profile Management Endpoints ──────────────────────────────
app.post('/api/change-password', validateUserSession, authLimiter, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) return res.status(400).json({ ok: false, error: 'Missing fields.' });

  const user = await getUserById(req.user.id);
  if (!user) return res.status(404).json({ ok: false, error: 'User not found.' });

  const expectedHash = hashPassword(oldPassword);
  if (user.passwordHash !== expectedHash) {
    return res.status(401).json({ ok: false, error: 'Incorrect old password.' });
  }

  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
  if (!passwordRegex.test(newPassword)) {
    return res.status(400).json({ ok: false, error: 'Password must be at least 8 characters long and include an uppercase letter, a lowercase letter, a number, and a special character.' });
  }

  user.passwordHash = hashPassword(newPassword);
  await saveUser(user);
  res.json({ ok: true, message: 'Password updated successfully.' });
});

app.post('/api/update-profile', validateUserSession, async (req, res) => {
  const { name } = req.body;
  if (!name || name.trim() === '') return res.status(400).json({ ok: false, error: 'Name cannot be empty.' });

  const user = await getUserById(req.user.id);
  if (!user) return res.status(404).json({ ok: false, error: 'User not found.' });

  user.name = name.trim();
  await saveUser(user);
  res.json({ ok: true, message: 'Profile updated successfully.', name: user.name });
});

app.post('/api/redeem-code', validateUserSession, async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ ok: false, error: 'No access code provided.' });

  const cleanCode = code.toUpperCase().trim();
  const payment = await getPaymentByAccessCode(cleanCode);

  if (!payment) return res.status(401).json({ ok: false, error: 'Invalid access code.' });

  // Determine how much time is left on the access code
  const codeExpiry = payment.accessCodeExpiry;
  if (!codeExpiry || Date.now() > codeExpiry) {
    return res.status(400).json({ ok: false, error: 'Access code is expired.' });
  }

  // Extend user subscription
  const user = req.user;
  const currentExpiry = user.subscriptionExpiry && user.subscriptionExpiry > Date.now() ? user.subscriptionExpiry : Date.now();
  // Add 30 days from now, or merge? Let's just add the remaining time of the access code, or a flat 30 days.
  // Actually, just grant them the 30 days from now to be nice/simple.
  user.subscriptionExpiry = Date.now() + 30 * 24 * 60 * 60 * 1000;
  
  await saveUser(user);
  
  // Invalidate the code so it can't be used by another user
  payment.accessCodeExpiry = 0; 
  await savePayment(payment.reference, payment);

  res.json({ ok: true, message: 'Access code redeemed successfully!', user: { id: user.id, email: user.email, name: user.name, subscriptionExpiry: user.subscriptionExpiry } });
});


// ── GET /api/performance/stats ──────────────────────────────
app.get('/api/performance/stats', async (req, res) => {
  if (!db) return res.json({ ok: false, error: 'Database not connected' });
  try {
    const logs = await getPerformanceColl().find({}).toArray();
    let totalPips = 0;
    let pipsGained = 0;
    let pipsLost = 0;
    logs.forEach(log => {
      const p = Number(log.pips) || 0;
      totalPips += p; // net pips overall
      if (log.result === 'Win') {
        pipsGained += Math.abs(p);
      } else if (log.result === 'Loss') {
        pipsLost += Math.abs(p);
      }
    });
    const totalPipMovement = pipsGained + pipsLost;
    const winRate = totalPipMovement > 0 ? Math.round((pipsGained / totalPipMovement) * 100) : 0;
    res.json({ ok: true, totalTrades: logs.length, totalPips, winRate, recent: logs.slice(-5).reverse() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/performance/all ────────────────────────────────
app.get('/api/performance/all', async (req, res) => {
  try {
    let logs = [];
    if (db) {
      logs = await getPerformanceColl().find({}).sort({ date: -1 }).toArray();
    }
    res.json({ ok: true, count: logs.length, logs });
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

// ── GET /api/crypto-wallets ───────────────────────────────────
// Returns USDT wallet addresses from environment variables (safe - no secrets)
app.get('/api/crypto-wallets', (req, res) => {
  res.json({
    ok: true,
    wallets: {
      TRC20: process.env.USDT_WALLET_TRC20 || '',
      BEP20: process.env.USDT_WALLET_BEP20 || '',
      ERC20: process.env.USDT_WALLET_ERC20 || ''
    }
  });
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
    let telegramError = null;
    try {
      if (imageBase64) {
        // 1. Send photo with caption
        // Extract actual MIME type from data URL (e.g. image/jpeg, image/png)
        const mimeMatch = imageBase64.match(/^data:(image\/[\w+.-]+);base64,/);
        const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
        const ext = mimeType.split('/')[1].replace('+xml', '');
        const base64Data = imageBase64.replace(/^data:image\/[\w+.-]+;base64,/, '');
        const imgBuffer = Buffer.from(base64Data, 'base64');

        const form = new FormData();
        form.append('chat_id', chatId);
        form.append('photo', imgBuffer, {
          filename: `image.${ext}`,
          contentType: mimeType,
          knownLength: imgBuffer.length,
        });
        if (text) {
          form.append('caption', text);
          form.append('parse_mode', 'Markdown');
        }

        const photoRes = await fetch(`${TG_BASE}/sendPhoto`, {
          method: 'POST',
          body: form,
          headers: form.getHeaders(),
        });
        const photoData = await photoRes.json();

        if (!photoData.ok) {
          console.error('[Telegram sendPhoto Error]', JSON.stringify(photoData));
          throw new Error(`Telegram image send failed: ${photoData.description || 'Unknown error'}`);
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
    } catch (tgErr) {
      console.warn('[Telegram Broadcast Warning]', tgErr.message);
      telegramError = tgErr.message;
    }

    // 4. Log signal history using Adapter
    try {
      const entryTime = req.body.entryTime || null;
      await addSignal({ id: Date.now(), type, text: text || '', sentAt: now(), entryTime });
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

    res.json({ ok: true, message: 'Broadcast processed' + (telegramError ? ` (Telegram failed: ${telegramError})` : '.') });
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
app.post('/api/pay-vip', validateUserSession, async (req, res) => {
  const { phone, plan, promoCode } = req.body;
  const { PAYHERO_API_USER, PAYHERO_API_PASS, PAYHERO_CHANNEL_ID } = process.env;

  if (!phone) return res.status(400).json({ ok: false, error: 'Phone number is required.' });
  if (!PAYHERO_API_USER || !PAYHERO_API_PASS || !PAYHERO_CHANNEL_ID) {
    return res.status(500).json({ ok: false, error: 'Payment gateway not configured.' });
  }

  // Calculate dynamic amount based on plan
  let finalAmount = PLANS[plan] ? PLANS[plan].kesPrice : PLANS['1month'].kesPrice;
  const selectedPlan = plan || '1month';

  // Apply Promo Code if valid
  if (promoCode) {
    if (promoCode.toUpperCase() === 'COMEBACK10') {
      finalAmount = Math.floor(finalAmount * 0.90);
    } else if (db) {
      const promo = await getPromosColl().findOne({ code: promoCode.toUpperCase(), active: true });
      if (promo) {
        finalAmount = Math.floor(finalAmount * (1 - (promo.discountPercentage / 100)));
      }
    }
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
        amount: finalAmount,
        phone_number: phone,
        channel_id: PAYHERO_CHANNEL_ID,
        provider: 'm-pesa',
        external_reference: ref,
        callback_url: callback_url
      })
    });

    const data = await response.json();
    if (data.success || response.ok) {
      await savePayment(ref, { status: 'Pending', phone, userId: req.user.id, plan: selectedPlan, timestamp: new Date().toISOString() });
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
  if (setup) {
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
  const { image, filename, entryTime } = req.body;
  
  if (image && !image.startsWith('data:image/')) {
    return res.status(400).json({ ok: false, error: 'Invalid image format. Must be an image.' });
  }

  const setupData = {
    image: image || null,
    filename: filename || 'todays-setup.png',
    timestamp: new Date().toISOString(),
    entryTime: entryTime || null
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
app.get('/api/check-payment/:ref', validateUserSession, async (req, res) => {
  const { ref } = req.params;
  const payment = await getPayment(ref);

  if (!payment) return res.status(404).json({ ok: false, error: 'Transaction not found.' });

  // Ensure the user checking the payment is the one who initiated it
  if (payment.userId && payment.userId !== req.user.id) {
    return res.status(403).json({ ok: false, error: 'Unauthorized.' });
  }

  if (payment.status === 'Success') {
    // Extend user's subscription expiry if not already done for this payment
    if (!payment.processedForUser) {
      const user = await getUserById(req.user.id);
      if (user) {
        const days = getDaysForPlan(payment.plan || '1month');
        const currentExpiry = user.subscriptionExpiry && user.subscriptionExpiry > Date.now() ? user.subscriptionExpiry : Date.now();
        user.subscriptionExpiry = currentExpiry + days * 24 * 60 * 60 * 1000;
        await saveUser(user);
        
        payment.processedForUser = true;
        await savePayment(ref, payment);
        console.log(`[Subscription] Granted ${days} days VIP to user ${user.email} via ref ${ref}`);

        // Reward referrer with 5 bonus days
        if (user.referredBy) {
          const referrer = await getUserById(user.referredBy);
          if (referrer && referrer.subscriptionExpiry) {
            referrer.subscriptionExpiry += 5 * 24 * 60 * 60 * 1000;
            await saveUser(referrer);
            console.log(`[Referral] Gave 5 bonus days to referrer ${referrer.email}`);
          }
        }

        // Send Email Receipt
        await sendEmail(
          user.email,
          '✅ VIP Access Granted! - Pips_attendant',
          `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0f1c; color: #ffffff; padding: 30px; border-radius: 12px; border: 1px solid #10b981;">
            <h2 style="color: #10b981; text-align: center;">Payment Successful! 🎉</h2>
            <p>Hello ${user.name || 'Trader'},</p>
            <p>Your M-Pesa payment for <strong>Pips_attendant VIP</strong> has been successfully verified.</p>
            <p>Your account has been granted <strong>${days} Days of VIP Access!</strong></p>
            <p>You can access the VIP portal anytime at <a href="${process.env.APP_URL || 'https://pipsattendant.com'}/premium.html" style="color: #10b981;">pipsattendant.com/premium.html</a>.</p>
            <br><p>Best regards,<br><strong>The Pips_attendant Team</strong></p>
          </div>`
        );
      }
    }

    const user = await getUserById(req.user.id);
    const sessionToken = generateUserToken(user);

    res.json({
      ok: true,
      status: 'Success',
      sessionToken,
      user: { id: user.id, email: user.email, name: user.name, subscriptionExpiry: user.subscriptionExpiry }
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

// ── GET /api/telegram/generate-invite ────────────────────────────
app.get('/api/telegram/generate-invite', validateUserSession, async (req, res) => {
  const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const VIP_CHAT_ID = process.env.TELEGRAM_VIP_CHAT_ID || process.env.TELEGRAM_CHAT_ID;

  if (!TOKEN || !VIP_CHAT_ID) {
    return res.status(500).send('Unable to generate invite link. Please contact support.');
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${TOKEN}/createChatInviteLink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: VIP_CHAT_ID,
        member_limit: 1,
        creates_join_request: false
      })
    });
    
    const data = await response.json();
    console.log('[Telegram] createChatInviteLink response:', JSON.stringify(data));
    if (data.ok && data.result.invite_link) {
      res.redirect(data.result.invite_link);
    } else {
      res.status(500).send('Failed to generate invite link at this time. Please contact support.');
    }
  } catch (err) {
    console.error('[Telegram] Error creating invite link:', err);
    res.status(500).send('Error communicating with Telegram.');
  }
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

let cachedBotUsername = null;

// ── GET /api/telegram/bot-username ────────────────────────────
app.get('/api/telegram/bot-username', async (req, res) => {
  if (cachedBotUsername) {
    return res.json({ ok: true, username: cachedBotUsername });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return res.json({ ok: true, username: 'PipsAttendantBot' });

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = await response.json();
    if (data.ok && data.result.username) {
      cachedBotUsername = data.result.username;
      return res.json({ ok: true, username: cachedBotUsername });
    }
  } catch (e) {
    console.error('[Telegram] Failed to fetch bot username:', e.message);
  }

  res.json({ ok: true, username: 'PipsAttendantBot' });
});

// ── NEW: WhatsApp Endpoints ───────────────────────────────────
app.post('/api/whatsapp-subscribe', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ ok: false, error: 'Phone number required' });
  try {
    await addWhatsApp(phone);
    res.json({ ok: true, message: 'Added to WhatsApp broadcast!' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/whatsapp-list', validateAdminKey, async (req, res) => {
  try {
    const list = await getWhatsAppList();
    res.json({ ok: true, count: list.length, subscribers: list });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── NEW: VIP Chat Endpoints ───────────────────────────────────
app.get('/api/chat/messages', validateVipSession, async (req, res) => {
  try {
    const msgs = await getChatMessages();
    res.json({ ok: true, messages: msgs });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/chat/message', validateVipSession, async (req, res) => {
  const { author, text } = req.body;
  if (!text) return res.status(400).json({ ok: false, error: 'Message required' });
  try {
    const msg = await addChatMessage({ author: author || 'VIP Member', text });
    res.json({ ok: true, message: msg });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── NEW: Signal History Endpoint ───────────────────────────────
app.get('/api/signals/history', async (req, res) => {
  try {
    const signals = await getSignals(100); // fetch up to 100 most recent signals
    // Sort newest first (compare timestamps numerically)
    signals.sort((a, b) => {
      const ta = typeof a.sentAt === 'string' ? new Date(a.sentAt).getTime() : Number(a.sentAt);
      const tb = typeof b.sentAt === 'string' ? new Date(b.sentAt).getTime() : Number(b.sentAt);
      return tb - ta;
    });
    res.json({ ok: true, count: signals.length, signals });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
// ── GET /api/admin/users ──────────────────────────────────────
app.get('/api/admin/users', validateAdminKey, async (req, res) => {
  try {
    const users = await getAllUsers();
    const safeUsers = users.map(u => ({ id: u.id, email: u.email, name: u.name, registeredAt: u.registeredAt, subscriptionExpiry: u.subscriptionExpiry }));
    res.json({ ok: true, count: safeUsers.length, users: safeUsers });
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

// ── Crypto Payment Request DB Helpers ─────────────────────────
const CRYPTO_FILE = path.join(DATA_DIR, 'crypto_requests.json');

async function getCryptoRequests() {
  if (db) {
    try {
      return await getCryptoRequestsColl().find({}).sort({ submittedAt: -1 }).toArray();
    } catch (err) {
      console.error('[DB Crypto Get Error]', err.message);
    }
  }
  return readJSON(CRYPTO_FILE);
}

async function saveCryptoRequest(request) {
  if (db) {
    try {
      await getCryptoRequestsColl().insertOne(request);
      return;
    } catch (err) {
      console.error('[DB Crypto Save Error]', err.message);
    }
  }
  const list = readJSON(CRYPTO_FILE);
  list.push(request);
  writeJSON(CRYPTO_FILE, list);
}

async function updateCryptoRequest(id, updates) {
  if (db) {
    try {
      const { ObjectId } = require('mongodb');
      await getCryptoRequestsColl().updateOne(
        { _id: new ObjectId(id) },
        { $set: updates }
      );
      return true;
    } catch (err) {
      console.error('[DB Crypto Update Error]', err.message);
      return false;
    }
  }
  // Local file fallback
  const list = readJSON(CRYPTO_FILE);
  const idx = list.findIndex(r => r.id === id);
  if (idx === -1) return false;
  list[idx] = { ...list[idx], ...updates };
  writeJSON(CRYPTO_FILE, list);
  return true;
}

// ── POST /api/crypto-payment-request ─────────────────────────
// User submits their USDT TX hash + contact info for admin approval
app.post('/api/crypto-payment-request', validateUserSession, async (req, res) => {
  const { txHash, contactInfo, network, plan, promoCode } = req.body;

  if (!txHash || !txHash.trim()) {
    return res.status(400).json({ ok: false, error: 'Transaction hash is required.' });
  }
  if (!contactInfo || !contactInfo.trim()) {
    return res.status(400).json({ ok: false, error: 'Contact info (Telegram/email) is required.' });
  }

  const cleanHash = txHash.trim();
  const selectedPlan = PLANS[plan] || PLANS['1month'];
  let finalUsdt = selectedPlan.usdtPrice;

  // Apply Promo Code if valid
  if (promoCode) {
    if (promoCode.toUpperCase() === 'COMEBACK10') {
      finalUsdt = Math.floor(finalUsdt * 0.90);
    } else if (db) {
      const promo = await getPromosColl().findOne({ code: promoCode.toUpperCase(), active: true });
      if (promo) {
        finalUsdt = Math.floor(finalUsdt * (1 - (promo.discountPercentage / 100)));
      }
    }
  }

  const request = {
    id: `CRYPTO_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
    txHash: cleanHash,
    network: network || 'TRC20',
    contactInfo: contactInfo.trim(),
    status: 'Pending',
    submittedAt: new Date().toISOString(),
    amount: `$${finalUsdt} USDT`,
    plan: plan || '1month',
    userId: req.user.id
  };

  try {
    await saveCryptoRequest(request);
    console.log(`[Crypto] New payment request from ${contactInfo}: TX ${cleanHash}`);
    res.json({ ok: true, message: 'Payment request submitted! We will verify and issue your access code within 24 hours.', requestId: request.id });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Failed to save request. Please try again.' });
  }
});

// ── GET /api/admin/crypto-requests ───────────────────────────
app.get('/api/admin/crypto-requests', validateAdminKey, async (req, res) => {
  try {
    const requests = await getCryptoRequests();
    res.json({ ok: true, count: requests.length, requests });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/admin/approve-crypto-request ───────────────────
// Admin approves a crypto request and generates an access code
app.post('/api/admin/approve-crypto-request', validateAdminKey, async (req, res) => {
  const { requestId } = req.body;
  if (!requestId) return res.status(400).json({ ok: false, error: 'Request ID required.' });

  try {
    const requests = await getCryptoRequests();
    const found = requests.find(r => r.id === requestId || r._id?.toString() === requestId);
    if (!found) return res.status(404).json({ ok: false, error: 'Request not found.' });

    const userId = found.userId;
    const days = getDaysForPlan(found.plan || '1month');

    if (userId) {
      const user = await getUserById(userId);
      if (user) {
        const currentExpiry = user.subscriptionExpiry && user.subscriptionExpiry > Date.now() ? user.subscriptionExpiry : Date.now();
        user.subscriptionExpiry = currentExpiry + days * 24 * 60 * 60 * 1000;
        await saveUser(user);

        // Reward referrer
        if (user.referredBy) {
          const referrer = await getUserById(user.referredBy);
          if (referrer && referrer.subscriptionExpiry) {
            referrer.subscriptionExpiry += 5 * 24 * 60 * 60 * 1000;
            await saveUser(referrer);
            console.log(`[Referral] Gave 5 bonus days to referrer ${referrer.email}`);
          }
        }
      }
    }

    const ref = found.id || found._id?.toString();
    await savePayment(`CRYPTO_${ref}`, {
      status: 'Success', method: 'crypto', txHash: found.txHash, network: found.network,
      contactInfo: found.contactInfo, userId, plan: found.plan || '1month',
      processedForUser: true, approvedAt: new Date().toISOString(), timestamp: new Date().toISOString()
    });

    const idStr = found._id?.toString() || found.id;
    await updateCryptoRequest(idStr, { status: 'Approved', approvedAt: new Date().toISOString() });

    let emailSent = false;
    if (found.contactInfo && found.contactInfo.includes('@') && !found.contactInfo.startsWith('@')) {
      await sendEmail(
        found.contactInfo, '✅ VIP Access Granted! - Pips_attendant',
        `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0f1c; color: #ffffff; padding: 30px; border-radius: 12px; border: 1px solid #10b981;">
          <h2 style="color: #10b981; text-align: center;">Payment Approved! 🎉</h2>
          <p>Hello,</p>
          <p>Your crypto payment for <strong>Pips_attendant VIP</strong> has been successfully verified.</p>
          <p>Your account has been granted <strong>${days} Days of VIP Access!</strong></p>
          <p>To access the VIP portal, simply log in with your email at <a href="${process.env.APP_URL || 'https://pipsattendant.com'}/premium.html" style="color: #f59e0b;">pipsattendant.com/premium.html</a>.</p>
          <br><p>Best regards,<br><strong>The Pips_attendant Team</strong></p>
        </div>`
      );
      emailSent = true;
    }

    res.json({
      ok: true, contactInfo: found.contactInfo,
      message: emailSent
        ? `VIP granted (${days} days) and receipt EMAILED to ${found.contactInfo}`
        : `VIP granted (${days} days) for user ${userId || 'unknown'}. Please notify: ${found.contactInfo}`
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/admin/reject-crypto-request ────────────────────
app.post('/api/admin/reject-crypto-request', validateAdminKey, async (req, res) => {
  const { requestId } = req.body;
  if (!requestId) return res.status(400).json({ ok: false, error: 'Request ID required.' });

  try {
    const requests = await getCryptoRequests();
    const found = requests.find(r => r.id === requestId || r._id?.toString() === requestId);
    if (!found) return res.status(404).json({ ok: false, error: 'Request not found.' });

    const idStr = found._id?.toString() || found.id;
    await updateCryptoRequest(idStr, { status: 'Rejected', rejectedAt: new Date().toISOString() });

    res.json({ ok: true, message: 'Request rejected.' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// \u2500\u2500 GET /api/plans \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
app.get('/api/plans', (req, res) => {
  res.json({ ok: true, plans: PLANS });
});

// \u2500\u2500 Admin 2FA \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

// GET /api/admin/2fa/setup — Generate new TOTP secret & QR code
app.get('/api/admin/2fa/setup', validateAdminKey, async (req, res) => {
  try {
    const secret = speakeasy.generateSecret({
      name: `Pips_attendant Admin (${req.headers['x-admin-key'].slice(0, 6)}...)`,
      length: 20
    });
    const qrDataUrl = await QRCode.toDataURL(secret.otpauth_url);
    res.json({ ok: true, secret: secret.base32, qrCode: qrDataUrl, otpauthUrl: secret.otpauth_url });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/admin/2fa/verify — Verify a TOTP token against a secret
app.post('/api/admin/2fa/verify', (req, res) => {
  const { secret, token } = req.body;
  if (!secret || !token) return res.status(400).json({ ok: false, error: 'Secret and token required.' });
  const verified = speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token: String(token).replace(/\s/g, ''),
    window: 2
  });
  res.json({ ok: verified, error: verified ? null : 'Invalid or expired token.' });
});

app.get('/api/admin/system-status', validateAdminKey, async (req, res) => {
  res.json({
    ok: true,
    status: {
      mongodb: db ? 'connected' : 'disconnected',
      fallbackMode: !db,
      telegramBot: process.env.TELEGRAM_BOT_TOKEN ? 'configured' : 'missing',
      telegramChatId: process.env.TELEGRAM_CHAT_ID ? 'configured' : 'missing',
      pushNotifications: (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) ? 'configured' : 'missing'
    }
  });
});
// ── Promo Codes API ──────────────────────────────────────────────
async function getPromos() {
  if (db) return await getPromosColl().find({}).toArray();
  return []; // Fallback empty if no DB
}

app.post('/api/admin/promos', validateAdminKey, async (req, res) => {
  const { code, discountPercentage } = req.body;
  if (!code || !discountPercentage) return res.status(400).json({ ok: false, error: 'Missing fields' });
  if (db) {
    await getPromosColl().updateOne(
      { code: code.toUpperCase() },
      { $set: { code: code.toUpperCase(), discountPercentage: Number(discountPercentage), active: true, createdAt: Date.now() } },
      { upsert: true }
    );
  }
  res.json({ ok: true });
});

app.get('/api/admin/promos', validateAdminKey, async (req, res) => {
  const promos = await getPromos();
  res.json({ ok: true, promos });
});

app.delete('/api/admin/promos/:code', validateAdminKey, async (req, res) => {
  if (db) await getPromosColl().deleteOne({ code: req.params.code });
  res.json({ ok: true });
});

app.get('/api/promos/validate/:code', async (req, res) => {
  if (req.params.code.toUpperCase() === 'COMEBACK10') {
    return res.json({ ok: true, discountPercentage: 10 });
  }
  if (!db) return res.status(404).json({ ok: false, error: 'Database offline' });
  const promo = await getPromosColl().findOne({ code: req.params.code.toUpperCase(), active: true });
  if (!promo) return res.status(404).json({ ok: false, error: 'Invalid or expired promo code.' });
  res.json({ ok: true, discountPercentage: promo.discountPercentage });
});

// ── Support Tickets API ──────────────────────────────────────────
async function getTickets() {
  if (db) return await getTicketsColl().find({}).sort({ updatedAt: -1 }).toArray();
  return [];
}

app.post('/api/tickets', validateUserSession, async (req, res) => {
  const { subject, message } = req.body;
  if (!subject || !message) return res.status(400).json({ ok: false, error: 'Missing fields' });

  const { ObjectId } = require('mongodb');
  const ticket = {
    _id: new ObjectId(),
    userId: req.user.id,
    userEmail: req.user.email,
    subject,
    status: 'Open',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [{ sender: 'User', text: message, timestamp: Date.now() }]
  };

  if (db) await getTicketsColl().insertOne(ticket);
  res.json({ ok: true, ticket });
});

app.get('/api/tickets', validateUserSession, async (req, res) => {
  const tickets = db ? await getTicketsColl().find({ userId: req.user.id }).sort({ updatedAt: -1 }).toArray() : [];
  res.json({ ok: true, tickets });
});

app.post('/api/tickets/:id/reply', validateUserSession, async (req, res) => {
  const { message } = req.body;
  const { ObjectId } = require('mongodb');
  if (db) {
    await getTicketsColl().updateOne(
      { _id: new ObjectId(req.params.id), userId: req.user.id },
      { 
        $push: { messages: { sender: 'User', text: message, timestamp: Date.now() } },
        $set: { updatedAt: Date.now() }
      }
    );
  }
  res.json({ ok: true });
});

app.get('/api/admin/tickets', validateAdminKey, async (req, res) => {
  const tickets = await getTickets();
  res.json({ ok: true, tickets });
});

app.post('/api/admin/tickets/:id/reply', validateAdminKey, async (req, res) => {
  const { message } = req.body;
  const { ObjectId } = require('mongodb');
  if (db) {
    await getTicketsColl().updateOne(
      { _id: new ObjectId(req.params.id) },
      { 
        $push: { messages: { sender: 'Admin', text: message, timestamp: Date.now() } },
        $set: { status: 'Answered', updatedAt: Date.now() }
      }
    );
  }
  res.json({ ok: true });
});

app.post('/api/admin/tickets/:id/close', validateAdminKey, async (req, res) => {
  const { ObjectId } = require('mongodb');
  if (db) {
    await getTicketsColl().updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { status: 'Closed', updatedAt: Date.now() } }
    );
  }
  res.json({ ok: true });
});


// ── GET /api/admin/analytics ──────────────────────────────────
app.get('/api/admin/analytics', validateAdminKey, async (req, res) => {
  try {
    const users = await getUsers();
    const now = Date.now();
    
    let totalUsers = users.length;
    let activeVIPs = 0;
    
    // Group users joined by day for the last 7 days
    const last7Days = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now - i * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().split('T')[0];
      last7Days[dateStr] = 0;
    }

    users.forEach(user => {
      if (user.subscriptionExpiry && user.subscriptionExpiry > now) {
        activeVIPs++;
      }
      if (user.createdAt) {
        const dateStr = user.createdAt.split('T')[0];
        if (last7Days[dateStr] !== undefined) {
          last7Days[dateStr]++;
        }
      }
    });

    let totalKES = 0;
    let totalUSDT = 0;
    let mrrKES = 0;
    let mrrUSDT = 0;

    if (db) {
      const mpesaPayments = await getPaymentsColl().find({ status: 'Success' }).toArray();
      const cryptoPayments = await getCryptoRequestsColl().find({ status: 'Approved' }).toArray();
      
      mpesaPayments.forEach(p => {
        const amount = Number(p.amount) || 0;
        totalKES += amount;
        // Simple MRR estimation based on plan
        if (p.plan === '1month') mrrKES += amount;
        if (p.plan === '2months') mrrKES += amount / 2;
        if (p.plan === '3months') mrrKES += amount / 3;
      });

      cryptoPayments.forEach(p => {
        // Since crypto amount isn't explicitly stored currently without the plan mapping, 
        // we map it back from the plan
        let amount = 0;
        if (p.plan === '1month') amount = 50;
        if (p.plan === '2months') amount = 95;
        if (p.plan === '3months') amount = 140;
        
        totalUSDT += amount;
        if (p.plan === '1month') mrrUSDT += amount;
        if (p.plan === '2months') mrrUSDT += amount / 2;
        if (p.plan === '3months') mrrUSDT += amount / 3;
      });
    }

    res.json({
      ok: true,
      totalUsers,
      activeVIPs,
      totalKES,
      totalUSDT,
      mrrKES: Math.round(mrrKES),
      mrrUSDT: Math.round(mrrUSDT),
      chartData: {
        labels: Object.keys(last7Days),
        values: Object.values(last7Days)
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Serve index.html for any unknown routes (SPA fallback) ───

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ── Initialization: Telegram Bot (Webhook Mode) ─────────────────
let bot;

async function handleTelegramUpdate(update) {
  if (!update.message) return;
  const msg = update.message;
  const chatId = msg.chat.id;
  const text = msg.text || '';

  if (text.startsWith('/stats')) {
    try {
      const logs = await getPerformanceLogs();
      let pipsGained = 0, pipsLost = 0;
      let wins = 0, losses = 0;
      logs.forEach(log => {
        if (log.type === 'win') { wins++; pipsGained += (log.pips || 0); }
        else if (log.type === 'loss') { losses++; pipsLost += (log.pips || 0); }
      });
      const totalPips = pipsGained + pipsLost;
      const winRate = totalPips > 0 ? Math.round((pipsGained / totalPips) * 100) : 0;
      const netPips = pipsGained - pipsLost;
      const replyText = `📊 *Pips Attendant Stats*\n\nWin Rate (Pips): ${winRate}%\nNet Pips: ${netPips > 0 ? '+'+netPips : netPips}\nTotal Trades: ${wins + losses}\n\n[Visit Dashboard](https://pips-attendantke.onrender.com)`;
      await sendTelegramMessage(chatId, replyText);
    } catch (err) {
      await sendTelegramMessage(chatId, 'Could not fetch stats at this time.');
    }
  } else if (text.startsWith('/start')) {
    // Check if user is linking their account via /start <userId>
    const parts = text.trim().split(' ');
    if (parts.length === 2) {
      const userId = parts[1];
      const user = await getUserById(userId);
      if (user) {
        user.telegramId = String(chatId);
        await saveUser(user);
        await sendTelegramMessage(chatId, `✅ *Account Linked!*\n\nYour Telegram is now linked to *${user.name || user.email}* on Pips Attendant.\n\nYou will be automatically removed from VIP when your subscription expires.`, { parse_mode: 'Markdown' });
        return;
      }
    }
    await sendTelegramMessage(chatId, '👋 Welcome to *Pips Attendant Bot*!\n\nCommands:\n/stats — View trading stats\n\nTo link your account, use the button in your Pips Attendant profile.', { parse_mode: 'Markdown' });
  }
}

async function sendTelegramMessage(chatId, text, opts = {}) {
  const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!TOKEN) return;
  await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown', disable_web_page_preview: true, ...opts })
  });
}

// Webhook endpoint — Telegram sends updates here
app.post('/telegram-webhook', express.json(), async (req, res) => {
  res.sendStatus(200); // always respond immediately
  try {
    await handleTelegramUpdate(req.body);
  } catch (err) {
    console.error('[Telegram Webhook] Error handling update:', err.message);
  }
});

// Register webhook with Telegram on startup
async function registerTelegramWebhook() {
  const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const BASE_URL = process.env.RENDER_EXTERNAL_URL || process.env.APP_URL;
  if (!TOKEN || !BASE_URL) {
    console.warn('[Telegram Bot] No token or URL set — skipping webhook registration.');
    return;
  }
  const webhookUrl = `${BASE_URL}/telegram-webhook`;
  try {
    const res = await fetch(`https://api.telegram.org/bot${TOKEN}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl, drop_pending_updates: true })
    });
    const data = await res.json();
    if (data.ok) {
      console.log(`[Telegram Bot] Webhook registered: ${webhookUrl}`);
    } else {
      console.error('[Telegram Bot] Webhook registration failed:', data.description);
    }
  } catch (err) {
    console.error('[Telegram Bot] Failed to register webhook:', err.message);
  }
}


// ── Daily Auto-Kick Expired VIP Users ────────────────────────
// Runs every day at 01:00 EAT
cron.schedule('0 1 * * *', async () => {
  const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const VIP_CHAT_ID = process.env.TELEGRAM_VIP_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
  if (!TOKEN || !VIP_CHAT_ID) return;

  console.log('[Cron] Checking for expired VIP users to kick...');
  try {
    const users = await getUsers();
    const now = Date.now();
    let kickCount = 0;
    for (const user of users) {
      if (!user.subscriptionExpiry) continue;

      const timeUntilExpiry = user.subscriptionExpiry - now;
      const daysUntilExpiry = Math.ceil(timeUntilExpiry / (1000 * 60 * 60 * 24));

      // 1. Send "Expiring Soon" Email (Exactly 3 days left)
      if (daysUntilExpiry === 3) {
        try {
          const html = `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
              <h2 style="color: #fbbf24;">Your VIP Access is Expiring Soon! ⏰</h2>
              <p>Hi ${user.name || 'Trader'},</p>
              <p>Just a quick reminder that your VIP subscription will expire in exactly 3 days.</p>
              <p>Don't miss out on upcoming signals! Log in and renew your plan to keep the profits rolling.</p>
              <p>- The Pips Attendant Team</p>
            </div>
          `;
          sendEmail(user.email, 'VIP Expiring Soon ⏰', html).catch(() => {});
        } catch (e) {}
      }

      // 2. Auto-Kick Expired Users
      if (user.telegramId && user.subscriptionExpiry < now) {
        try {
          // Kick (ban then unban = kick without permanent ban)
          await fetch(`https://api.telegram.org/bot${TOKEN}/banChatMember`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: VIP_CHAT_ID, user_id: user.telegramId, revoke_messages: false })
          });
          await fetch(`https://api.telegram.org/bot${TOKEN}/unbanChatMember`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: VIP_CHAT_ID, user_id: user.telegramId, only_if_banned: true })
          });
          console.log(`[Auto-Kick] Kicked ${user.email} (TG: ${user.telegramId}) from VIP group.`);
          kickCount++;

          // Notify the user via Telegram DM
          await sendTelegramMessage(user.telegramId,
            `⚠️ Your Pips Attendant VIP subscription has expired. You have been removed from the VIP group.\n\nRenew at: ${process.env.APP_URL || 'https://pips-attendantke.onrender.com'}/premium.html`);
        } catch (e) {
          console.warn(`[Auto-Kick] Failed to kick ${user.email}:`, e.message);
        }
      }

      // 3. Win-Back Campaign (Exactly 7 days after expiry)
      if (daysUntilExpiry === -7) {
        try {
          const html = `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
              <h2 style="color: #fbbf24;">We Miss You! Here's 10% Off 🎁</h2>
              <p>Hi ${user.name || 'Trader'},</p>
              <p>It's been a week since your VIP access expired. The markets have been crazy, and we want you back!</p>
              <p>Use the promo code <strong>COMEBACK10</strong> at checkout to get 10% off your next subscription plan.</p>
              <p>- The Pips Attendant Team</p>
            </div>
          `;
          sendEmail(user.email, "We Miss You! Here's 10% Off 🎁", html).catch(() => {});
        } catch (e) {}
      }
    }
    console.log(`[Cron] Auto-kick and Drip Campaigns complete. Kicked ${kickCount} user(s).`);
  } catch (err) {
    console.error('[Cron] Auto-kick failed:', err.message);
  }
}, { timezone: 'Africa/Nairobi' });

// Weekly report (Sunday at 23:59 EAT, Server is presumably UTC so 20:59 UTC)
cron.schedule('59 20 * * 0', async () => {
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) return;
  console.log('[Cron] Running weekly performance report...');
  try {
    const logs = await getPerformanceLogs();
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const weeklyLogs = logs.filter(l => l.timestamp >= oneWeekAgo);
    let pipsGained = 0, pipsLost = 0;
    let wins = 0, losses = 0;
    weeklyLogs.forEach(l => {
      if (l.type === 'win') { wins++; pipsGained += (l.pips || 0); }
      else if (l.type === 'loss') { losses++; pipsLost += (l.pips || 0); }
    });
    const totalPips = pipsGained + pipsLost;
    const winRate = totalPips > 0 ? Math.round((pipsGained / totalPips) * 100) : 0;
    const netPips = pipsGained - pipsLost;
    const msg = `🏆 *Weekly Performance Report* 🏆\n\nTrades this week: ${wins + losses}\nWin Rate (Pips): ${winRate}%\nNet Pips Gained: ${netPips > 0 ? '+'+netPips : netPips} pips\n\nLet's crush the coming week! 🚀`;
    const TG_BASE = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
    await fetch(`${TG_BASE}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: msg, parse_mode: 'Markdown' })
    });
  } catch (err) {
    console.error('[Cron] Weekly report failed:', err.message);
  }
}, { timezone: "Africa/Nairobi" }); // Use EAT directly instead of manual UTC calculation if node-cron supports it

// ── Start ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════╗
  ║   Pips_attendant API Server           ║
  ║   Running on http://localhost:${PORT}   ║
  ╚═══════════════════════════════════════╝
  `);
  // Register Telegram webhook after server is listening
  registerTelegramWebhook();
});
