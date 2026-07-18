const express = require('express');
const router = express.Router();
const { getUserById, saveUser } = require('../services/db');
const { validateUserSession } = require('../middleware/auth');
const crypto = require('crypto');

// Generate a unique 8-char referral code from user id + random
function generateReferralCode(userId) {
  const base = String(userId).slice(-4);
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `PA-${base}-${rand}`;
}

// GET /api/partner/stats
router.get('/stats', validateUserSession, async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const currentUser = await getUserById(userId);
    if (!currentUser) return res.status(404).json({ error: 'User not found' });
    
    let referralCode = currentUser.referralCode;

    // Auto-generate and save referral code if missing
    if (!referralCode || referralCode === 'N/A') {
      referralCode = generateReferralCode(userId);
      currentUser.referralCode = referralCode;
      try {
        await saveUser(currentUser);
      } catch (saveErr) {
        console.error('[Partner] Failed to save referral code:', saveErr.message);
        // Non-fatal – still return the generated code for this session
      }
    }

    const totalClicks  = currentUser.referralClicks  || 0;
    const paidSignups  = currentUser.referralCount   || 0;
    const totalEarnings = currentUser.referralEarnings || (paidSignups * 5);

    // Use the canonical domain so the link always says www.pipsattendant.com
    const host = req.get('host');
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const referralLink = `${protocol}://${host}/?ref=${referralCode}`;

    res.json({
      ok: true,
      stats: {
        referralCode,
        referralLink,
        totalClicks,
        paidSignups,
        totalEarnings,
        pendingPayout: totalEarnings
      }
    });
  } catch (err) {
    console.error('[Partner Stats Error]', err);
    res.status(500).json({ error: 'Failed to fetch partner stats' });
  }
});

module.exports = router;
