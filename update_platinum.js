require('dotenv').config();
const { MongoClient } = require('mongodb');

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db();
  
  // Update all users who have an active subscription expiry to be Platinum
  const res = await db.collection('users').updateMany(
    { subscriptionExpiry: { $gt: Date.now() } },
    { $set: { subscriptionTier: 'Platinum' } }
  );
  
  console.log('Updated', res.modifiedCount, 'active VIP users to Platinum');
  
  // Also check the specific user you might be testing, e.g. the last 5
  const users = await db.collection('users').find({}).sort({_id:-1}).limit(5).toArray();
  console.log('Recent 5 users DB state:');
  console.log(users.map(u => ({ email: u.email, tier: u.subscriptionTier, active: u.subscriptionExpiry > Date.now() })));
  
  await client.close();
}
run().catch(console.dir);
