const express = require('express');
const router = express.Router();
const { validateUserSession } = require('../middleware/auth');
const db = require('../services/db');

// GET all journal entries for logged-in user
router.get('/', validateUserSession, async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const entries = await db.getJournalEntries(userId);
    res.json({ ok: true, entries });
  } catch (err) {
    console.error('[Journal GET error]', err);
    res.status(500).json({ ok: false, error: 'Failed to fetch journal entries.' });
  }
});

// POST a new journal entry
router.post('/', validateUserSession, async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { asset, type, entry, exit, pl, date } = req.body;
    
    if (!asset || !type || entry === undefined || exit === undefined || pl === undefined) {
      return res.status(400).json({ ok: false, error: 'Missing required fields.' });
    }

    const newEntry = {
      userId,
      asset,
      type,
      entry: Number(entry),
      exit: Number(exit),
      pl: Number(pl),
      date: date || Date.now(),
      createdAt: new Date().toISOString()
    };

    const savedEntry = await db.saveJournalEntry(newEntry);
    res.json({ ok: true, entry: savedEntry });
  } catch (err) {
    console.error('[Journal POST error]', err);
    res.status(500).json({ ok: false, error: 'Failed to save journal entry.' });
  }
});

// DELETE a journal entry
router.delete('/:id', validateUserSession, async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const entryId = req.params.id;
    
    const deleted = await db.deleteJournalEntry(entryId, userId);
    if (deleted) {
      res.json({ ok: true, message: 'Entry deleted.' });
    } else {
      res.status(404).json({ ok: false, error: 'Entry not found or unauthorized.' });
    }
  } catch (err) {
    console.error('[Journal DELETE error]', err);
    res.status(500).json({ ok: false, error: 'Failed to delete journal entry.' });
  }
});

// POST to sync multiple entries from local storage
router.post('/sync', validateUserSession, async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { entries } = req.body;
    
    if (!Array.isArray(entries)) {
      return res.status(400).json({ ok: false, error: 'Entries must be an array.' });
    }

    const { synced } = await db.syncJournalEntries(entries, userId);
    res.json({ ok: true, synced, message: `Successfully synced ${synced} entries.` });
  } catch (err) {
    console.error('[Journal SYNC error]', err);
    res.status(500).json({ ok: false, error: 'Failed to sync journal entries.' });
  }
});

module.exports = router;
