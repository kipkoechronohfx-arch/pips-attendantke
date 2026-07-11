const express = require('express');
const router = express.Router();
const { getUserById } = require('../services/db');
const { validateUserSession } = require('../middleware/auth');

// GET /api/partner/stats
router.get('/stats', validateUserSession, async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const currentUser = await getUserById(userId);
    if (!currentUser) return res.status(404).json({ error: 'User not found' });
    
    const referralCode = currentUser.referralCode || 'N/A';
    const totalClicks = currentUser.referralClicks || 0;
    const paidSignups = currentUser.referralCount || 0;
    const totalEarnings = currentUser.referralEarnings || (paidSignups * 5);
    
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
