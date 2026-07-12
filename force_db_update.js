const { MongoClient } = require('mongodb');
async function run() {
  const uri = 'mongodb+srv://pips_user:Snipydollar738@clusterpips.cpozaqe.mongodb.net/pips_attendant?retryWrites=true&w=majority&appName=Clusterpips';
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('pips_attendant');
  const coll = db.collection('users');
  
  const users = await coll.find({}).toArray();
  console.log('--- ALL USERS IN DB ---');
  for (const u of users) {
    console.log(u.email, '|', u.name, '|', u.subscriptionTier);
    if (u.email === 'kipkoechronohfx@gmail.com' || (u.name && u.name.includes('Sniper Dollar'))) {
      await coll.updateOne({ _id: u._id }, { $set: { subscriptionTier: 'Platinum' } });
      console.log('>>> FORCED UPGRADE TO PLATINUM FOR', u.email);
    }
  }
  await client.close();
}
run().catch(console.error);
