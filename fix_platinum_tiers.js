require('dotenv').config();
const { MongoClient } = require('mongodb');

const PLATINUM_PLANS = ['1month_platinum', '3months_platinum', 'lifetime_platinum'];

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db();
  const users = db.collection('users');
  const payments = db.collection('payments');

  console.log('--- Pips Attendant: Fix Platinum Tiers ---\n');

  // Step 1: Find all payments that used a platinum plan and were redeemed
  const platPayments = await payments.find({
    plan: { $in: PLATINUM_PLANS },
    usedBy: { $exists: true, $ne: null }
  }).toArray();

  console.log(`Found ${platPayments.length} redeemed platinum payment(s).`);

  let fixed = 0;
  for (const p of platPayments) {
    const userId = p.usedBy;
    // Find user by _id string or id field
    let user = null;
    try {
      const { ObjectId } = require('mongodb');
      const isObjectId = /^[a-f\d]{24}$/i.test(String(userId));
      if (isObjectId) {
        user = await users.findOne({ _id: new ObjectId(userId) });
      }
      if (!user) {
        user = await users.findOne({ $or: [{ _id: String(userId) }, { id: String(userId) }] });
      }
    } catch(e) {
      user = await users.findOne({ $or: [{ _id: String(userId) }, { id: String(userId) }] });
    }

    if (!user) {
      console.log(`  ⚠️  Could not find user for payment ${p._id} (userId: ${userId})`);
      continue;
    }

    if (user.subscriptionTier === 'Platinum') {
      console.log(`  ✅ ${user.email} — already Platinum`);
      continue;
    }

    await users.updateOne(
      { _id: user._id },
      { $set: { subscriptionTier: 'Platinum' } }
    );
    console.log(`  🔧 Fixed: ${user.email} → Platinum`);
    fixed++;
  }

  // Step 2: Also catch any active users with no tier set (fallback)
  const activeNoTier = await users.find({
    subscriptionExpiry: { $gt: Date.now() },
    subscriptionTier: { $exists: false }
  }).toArray();

  console.log(`\nFound ${activeNoTier.length} active user(s) with no tier set — defaulting to Gold.`);
  for (const u of activeNoTier) {
    await users.updateOne({ _id: u._id }, { $set: { subscriptionTier: 'Gold' } });
    console.log(`  🔧 ${u.email} → Gold (default)`);
    fixed++;
  }

  console.log(`\n✅ Done. Fixed ${fixed} user(s).`);
  await client.close();
}

run().catch(e => { console.error(e); process.exit(1); });
