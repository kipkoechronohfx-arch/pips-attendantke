const express = require('express');
const router = express.Router();
const { getUserById } = require('../services/db');

// Middleware to authenticate VIP session
function validateUserSession(req, res, next) {
  const token = req.headers['x-vip-token'];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const payload = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
    if (!payload.id || !payload.email) throw new Error('Invalid token');
    req.user = payload;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// GET /api/partner/stats
router.get('/stats', validateUserSession, async (req, res) => {
  try {
    const userId = req.user.id;
    const currentUser = await getUserById(userId);
    if (!currentUser) return res.status(404).json({ error: 'User not found' });
    
    const referralCode = currentUser.referralCode || 'N/A';
    const totalClicks = currentUser.referralClicks || 0;
    const paidSignups = currentUser.referralCount || 0;
    const totalEarnings = currentUser.referralEarnings || (paidSignups * 5); // Default $5 per paid referral
    
    // Relative link for web app
    const referralLink = `${req.protocol}://${req.get('host')}/?ref=${referralCode}`;

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
