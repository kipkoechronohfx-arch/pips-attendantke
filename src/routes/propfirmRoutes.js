const express = require('express');
const router = express.Router();
const { validateUserSession, validateAdminSession } = require('../middleware/auth');
const db = require('../services/db');

// ── GET /api/propfirm/status — User's own prop firm challenge status ────────
router.get('/status', validateUserSession, async (req, res) => {
  try {
    const userId = String(req.user._id || req.user.id);
    const account = await db.getPropFirmAccount(userId);
    if (!account) {
      return res.json({ ok: true, account: null, message: 'No prop firm challenge assigned yet.' });
    }
    res.json({ ok: true, account });
  } catch (err) {
    console.error('[PropFirm GET status error]', err);
    res.status(500).json({ ok: false, error: 'Failed to fetch prop firm status.' });
  }
});

// ── GET /api/propfirm/admin/all — Admin: list all accounts ─────────────────
router.get('/admin/all', validateAdminSession, async (req, res) => {
  try {
    const accounts = await db.getAllPropFirmAccounts();
    res.json({ ok: true, count: accounts.length, accounts });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/propfirm/admin/update — Admin: create or update user's challenge ──
router.post('/admin/update', validateAdminSession, async (req, res) => {
  const { userId, firm, phase, targetPercent, currentPercent, maxDrawdown, accountSize, notes, status } = req.body;

  if (!userId) return res.status(400).json({ ok: false, error: 'userId is required.' });
  if (targetPercent !== undefined && (isNaN(Number(targetPercent)) || Number(targetPercent) < 0)) {
    return res.status(400).json({ ok: false, error: 'Invalid targetPercent.' });
  }
  if (currentPercent !== undefined && (isNaN(Number(currentPercent)))) {
    return res.status(400).json({ ok: false, error: 'Invalid currentPercent.' });
  }

  try {
    // Verify user exists
    const user = await db.getUserById(userId);
    if (!user) return res.status(404).json({ ok: false, error: 'User not found.' });

    const accountData = {
      userId: String(userId),
      userEmail: user.email,
      userName: user.name || user.email,
      firm: firm || 'Prop Firm',
      phase: phase || 'Phase 1',
      targetPercent: Number(targetPercent ?? 8),
      currentPercent: Number(currentPercent ?? 0),
      maxDrawdown: Number(maxDrawdown ?? 5),
      accountSize: Number(accountSize ?? 10000),
      notes: notes || '',
      status: status || 'active',   // active | passed | failed
      updatedAt: new Date().toISOString()
    };

    await db.savePropFirmAccount(accountData);
    res.json({ ok: true, message: 'Prop firm account updated successfully.', account: accountData });
  } catch (err) {
    console.error('[PropFirm admin update error]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── DELETE /api/propfirm/admin/:userId — Admin: remove a user's account ────
router.delete('/admin/:userId', validateAdminSession, async (req, res) => {
  try {
    await db.deletePropFirmAccount(req.params.userId);
    res.json({ ok: true, message: 'Account removed.' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
