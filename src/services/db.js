const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

const DATA_DIR     = path.join(process.cwd(), 'data');
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
const JOURNAL_FILE = path.join(DATA_DIR, 'journal.json');
const PROP_FIRM_FILE = path.join(DATA_DIR, 'prop_firm_accounts.json');

// Ensure local fallback folders exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(VIP_DOCS_DIR)) fs.mkdirSync(VIP_DOCS_DIR);

let db = null;
let client = null;

async function connectDB() {
  const MONGODB_URI = process.env.MONGODB_URI;
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
    await runMigrations();
    await ensureIndexes();
  } catch (err) {
    console.error('[MongoDB connection failed]', err.message);
    console.log('Retrying DB connection in 5 seconds...');
    setTimeout(connectDB, 5000);
  }
}

async function closeDB() {
  if (client) {
    await client.close();
    db = null;
    client = null;
  }
}

async function ensureIndexes() {
  if (!db) return;
  try {
    console.log('[Database] Ensuring indexes...');
    await getUsersColl().createIndex({ email: 1 }, { unique: true, sparse: true });
    await getUsersColl().createIndex({ id: 1 }, { unique: true, sparse: true });
    await getSubsColl().createIndex({ telegram: 1 }, { unique: true, sparse: true });
    await getPaymentsColl().createIndex({ reference: 1 }, { unique: true, sparse: true });
    await getPaymentsColl().createIndex({ accessCode: 1 }, { sparse: true });
    await getTicketsColl().createIndex({ userEmail: 1 });
    await getChatColl().createIndex({ timestamp: -1 });
    console.log('[Database] Indexes ensured successfully.');
  } catch (err) {
    console.error('[Database Warning] Failed to create indexes:', err.message);
  }
}

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
const getJournalColl = () => db.collection('journal_entries');
const getPropFirmColl = () => db.collection('prop_firm_accounts');

async function runMigrations() {
  console.log('[Migration] Checking for local data to migrate to MongoDB Atlas...');

  const readRawJSON = (file) => {
    try {
      if (fs.existsSync(file)) {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
      }
    } catch {}
    return null;
  };

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
      console.error("[Migration Error] Today's setup migration failed:", err.message);
    }
  }

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
      console.error("[Migration Error] Today's setup results migration failed:", err.message);
    }
  }

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
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    return true;
  } catch {
    return false;
  }
}

async function getSignals(limit) {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 0;
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

async function getPaymentByAccessCode(code) {
  if (db) {
    try {
      return await getPaymentsColl().findOne({ accessCode: code });
    } catch (err) {
      console.error('[DB Payment Code Lookup Error]', err.message);
    }
  }
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

async function getAllPayments() {
  if (db) {
    try {
      return await getPaymentsColl().find({}).toArray();
    } catch (err) {
      console.error('[DB All Payments Error]', err.message);
    }
  }
  const raw = readJSON(PAYMENTS_FILE);
  // JSON file stores as object map: { ref: paymentObj }
  if (Array.isArray(raw)) return raw;
  return Object.values(raw);
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
  return setup;
}

async function getAdminTodaysSetup() {
  return getTodaysSetup();
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
  return getTodaysSetupResults();
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
        .project({ fileData: 0 })
        .toArray();
    } catch (err) {
      console.error('[DB Docs Find Error]', err.message);
    }
  }
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

async function getUserById(id) {
  if (!id) return null;
  if (db) {
    try {
      const { ObjectId } = require('mongodb');
      // IDs can be either MongoDB ObjectIds or string-format (USER_xxx)
      const isObjectId = /^[a-f\d]{24}$/i.test(String(id));
      if (isObjectId) {
        const user = await getUsersColl().findOne({ _id: new ObjectId(id) });
        if (user) return user;
      }
      // Fallback: search by string id field (for legacy USER_xxx format)
      return await getUsersColl().findOne({ id: String(id) }) || null;
    } catch (err) {
      console.error('[DB Get User By Id Error]', err.message);
    }
  }
  const users = readJSON(USERS_FILE);
  return users.find(u => u._id === id || u.id === id) || null;
}

async function getUserByEmail(email) {
  if (db) {
    try {
      return await getUsersColl().findOne({ email });
    } catch (err) {
      console.error('[DB Get User By Email Error]', err.message);
    }
  }
  const users = readJSON(USERS_FILE);
  return users.find(u => u.email === email);
}

async function saveUser(user) {
  if (db) {
    try {
      if (user._id) {
        const { ObjectId } = require('mongodb');
        const id = user._id;
        delete user._id;
        await getUsersColl().updateOne({ _id: new ObjectId(id) }, { $set: user });
        user._id = id;
      } else {
        const result = await getUsersColl().insertOne(user);
        user._id = result.insertedId.toString();
      }
      return user;
    } catch (err) {
      console.error('[DB Save User Error]', err.message);
    }
  }
  const users = readJSON(USERS_FILE);
  if (user._id) {
    const index = users.findIndex(u => u._id === user._id);
    if (index !== -1) users[index] = user;
    else users.push(user);
  } else {
    user._id = Date.now().toString();
    users.push(user);
  }
  writeJSON(USERS_FILE, users);
  return user;
}

async function getPushSubscriptions() {
  if (db) {
    try {
      return await getPushSubsColl().find({}).toArray();
    } catch (err) {
      console.error('[DB Push Subs Error]', err.message);
    }
  }
  return [];
}

async function addPushSubscription(sub) {
  if (db) {
    try {
      await getPushSubsColl().insertOne(sub);
    } catch (err) {
      console.error('[DB Add Push Sub Error]', err.message);
    }
  }
}

async function deletePushSubscription(sub) {
  if (db) {
    try {
      await getPushSubsColl().deleteOne({ endpoint: sub.endpoint });
    } catch (err) {
      console.error('[DB Delete Push Sub Error]', err.message);
    }
  }
}

async function getCryptoRequests() {
  if(db) return await getCryptoRequestsColl().find({}).sort({ timestamp: -1 }).toArray();
  return [];
}
async function saveCryptoRequest(req) {
  if(db) await getCryptoRequestsColl().insertOne(req);
}

async function updateCryptoRequest(id, update) {
  if(db) {
    const { ObjectId } = require('mongodb');
    await getCryptoRequestsColl().updateOne({ _id: new ObjectId(id) }, { $set: update });
  }
}

async function getPromos() {
  if(db) return await getPromosColl().find({}).toArray();
  return [];
}

async function savePromo(promo) {
  if(db) await getPromosColl().updateOne({ code: promo.code }, { $set: promo }, { upsert: true });
}

async function getPromoByCode(code) {
  if(db) return await getPromosColl().findOne({ code });
  return null;
}

async function deletePromo(code) {
  if(db) await getPromosColl().deleteOne({ code });
}

async function getTickets() {
  if(db) return await getTicketsColl().find({}).sort({ createdAt: -1 }).toArray();
  return [];
}

async function getUserTickets(email) {
  if(db) return await getTicketsColl().find({ userEmail: email }).sort({ createdAt: -1 }).toArray();
  return [];
}

async function saveTicket(ticket) {
  if(db) {
    if(ticket._id) {
       const { ObjectId } = require('mongodb');
       const id = ticket._id; delete ticket._id;
       await getTicketsColl().updateOne({ _id: new ObjectId(id) }, { $set: ticket });
       ticket._id = id;
    } else {
       const res = await getTicketsColl().insertOne(ticket);
       ticket._id = res.insertedId;
    }
    return ticket;
  }
  return ticket;
}

async function logPerformanceAction(log) {
  if (db) {
    try {
      await getPerformanceColl().insertOne({ ...log, timestamp: Date.now() });
    } catch (err) {}
  }
}

async function getPerformanceLogs() {
  if (db) {
    try {
      return await getPerformanceColl().find({}).sort({ timestamp: -1 }).toArray();
    } catch (err) {}
  }
  return [];
}

async function getUsers() {
  if (db) {
    try {
      return await getUsersColl().find({}).toArray();
    } catch (err) {}
  }
  return readJSON(USERS_FILE);
}

// ── Journal Operations ──────────────────────────────────────
async function getJournalEntries(userId) {
  if (db) {
    try {
      return await getJournalColl().find({ userId }).sort({ date: -1 }).toArray();
    } catch (err) {}
  }
  const journal = readJSON(JOURNAL_FILE);
  return journal.filter(j => j.userId === userId).sort((a, b) => b.date - a.date);
}

async function saveJournalEntry(entry) {
  if (db) {
    try {
      if (entry._id) {
        const { ObjectId } = require('mongodb');
        const id = entry._id;
        delete entry._id;
        await getJournalColl().updateOne({ _id: new ObjectId(id) }, { $set: entry });
        entry._id = id;
      } else {
        const result = await getJournalColl().insertOne(entry);
        entry._id = result.insertedId.toString();
      }
      return entry;
    } catch (err) {}
  }
  const journal = readJSON(JOURNAL_FILE);
  if (entry._id) {
    const index = journal.findIndex(j => j._id === entry._id);
    if (index !== -1) journal[index] = entry;
    else journal.push(entry);
  } else {
    entry._id = Date.now().toString() + Math.random().toString(36).substring(2, 9);
    journal.push(entry);
  }
  writeJSON(JOURNAL_FILE, journal);
  return entry;
}

async function deleteJournalEntry(entryId, userId) {
  if (db) {
    try {
      const { ObjectId } = require('mongodb');
      const isObjectId = /^[a-f\d]{24}$/i.test(String(entryId));
      let query = { userId };
      if (isObjectId) query._id = new ObjectId(entryId);
      else query._id = entryId;
      
      const res = await getJournalColl().deleteOne(query);
      return res.deletedCount > 0;
    } catch (err) {}
  }
  let journal = readJSON(JOURNAL_FILE);
  const initialLength = journal.length;
  journal = journal.filter(j => !(j._id === entryId && j.userId === userId));
  writeJSON(JOURNAL_FILE, journal);
  return journal.length < initialLength;
}

async function syncJournalEntries(entries, userId) {
  if (!entries || !entries.length) return { synced: 0 };
  let synced = 0;
  for (const localEntry of entries) {
    delete localEntry._id;
    localEntry.userId = userId;
    await saveJournalEntry(localEntry);
    synced++;
  }
  return { synced };
}

// ── Prop Firm Account Operations ─────────────────────────────
async function getPropFirmAccount(userId) {
  if (db) {
    try {
      return await getPropFirmColl().findOne({ userId: String(userId) });
    } catch (err) {}
  }
  const accounts = readJSON(PROP_FIRM_FILE);
  return accounts.find(a => a.userId === String(userId)) || null;
}

async function getAllPropFirmAccounts() {
  if (db) {
    try {
      return await getPropFirmColl().find({}).sort({ updatedAt: -1 }).toArray();
    } catch (err) {}
  }
  return readJSON(PROP_FIRM_FILE);
}

async function savePropFirmAccount(accountData) {
  if (db) {
    try {
      await getPropFirmColl().updateOne(
        { userId: accountData.userId },
        { $set: accountData },
        { upsert: true }
      );
      return;
    } catch (err) { console.error('[DB PropFirm Save Error]', err.message); }
  }
  let accounts = readJSON(PROP_FIRM_FILE);
  const idx = accounts.findIndex(a => a.userId === accountData.userId);
  if (idx > -1) accounts[idx] = accountData;
  else accounts.push(accountData);
  writeJSON(PROP_FIRM_FILE, accounts);
}

async function deletePropFirmAccount(userId) {
  if (db) {
    try {
      await getPropFirmColl().deleteOne({ userId: String(userId) });
      return;
    } catch (err) {}
  }
  let accounts = readJSON(PROP_FIRM_FILE);
  accounts = accounts.filter(a => a.userId !== String(userId));
  writeJSON(PROP_FIRM_FILE, accounts);
}

async function getLeaderboardData() {
  const users = await getUsers();
  const optedInUsers = users.filter(u => u.leaderboardOptIn === true);
  
  const leaderboard = [];
  
  for (const user of optedInUsers) {
    const userId = user._id ? user._id.toString() : user.id;
    const entries = await getJournalEntries(userId);
    if (!entries || entries.length === 0) continue;
    
    let totalPL = 0;
    let wins = 0;
    let losses = 0;
    
    entries.forEach(e => {
      const pl = Number(e.pl) || 0;
      totalPL += pl;
      if (pl > 0) wins++;
      else if (pl < 0) losses++;
    });
    
    const totalTrades = wins + losses;
    const winRate = totalTrades > 0 ? Math.round((wins / totalTrades) * 100) : 0;
    
    leaderboard.push({
      userId,
      name: user.name || 'Anonymous Trader',
      netPL: totalPL,
      winRate,
      totalTrades
    });
  }
  
  return leaderboard.sort((a, b) => b.netPL - a.netPL).slice(0, 10);
}

module.exports = {
  connectDB, closeDB,
  getAppConfig, saveAppConfig,
  getSignals, addSignal,
  getSubscribers, addSubscriber, getSubscriberByTelegram,
  addWhatsApp, getWhatsAppList,
  addChatMessage, getChatMessages,
  getPayment, getPaymentByAccessCode, savePayment, getAllPayments,
  getTodaysSetup, getAdminTodaysSetup, saveTodaysSetup,
  getTodaysSetupResults, getAdminTodaysSetupResults, saveTodaysSetupResults,
  getVipDocuments, getVipDocument, saveVipDocument, deleteVipDocument,
  getUserById, getUserByEmail, saveUser, getUsers,
  getPushSubscriptions, addPushSubscription, deletePushSubscription,
  getCryptoRequests, saveCryptoRequest, updateCryptoRequest,
  getPromos, savePromo, getPromoByCode, deletePromo,
  getTickets, getUserTickets, saveTicket,
  logPerformanceAction, getPerformanceLogs,
  getJournalEntries, saveJournalEntry, deleteJournalEntry, syncJournalEntries, getLeaderboardData,
  getPropFirmAccount, getAllPropFirmAccounts, savePropFirmAccount, deletePropFirmAccount
};
