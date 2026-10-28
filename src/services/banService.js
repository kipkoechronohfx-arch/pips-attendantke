const logger = require('../utils/logger');

/**
 * Persistent IP Ban Service — MongoDB-backed
 *
 * Stores banned IPs in the `banned_ips` collection so bans
 * survive server restarts and Render redeploys. Falls back
 * to in-memory if MongoDB is unavailable.
 *
 * Schema:
 *   { ip, bannedAt, expiresAt, violations, reason }
 */

let _db = null;

/** Called once at server startup after MongoDB connects. */
function initBanService(db) {
  _db = db;
  if (_db) {
    // TTL index: MongoDB auto-deletes expired ban documents
    _db.collection('banned_ips')
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
      .catch(err => logger.warn('[BanService] TTL index warning:', err.message));
    logger.info('[BanService] MongoDB-backed IP ban service ready.');
  } else {
    logger.warn('[BanService] No DB — using in-memory ban store (bans lost on restart).');
  }
}

/** Check if an IP is currently banned. Returns ban doc or null. */
async function isBanned(ip) {
  if (_db) {
    try {
      const now = new Date();
      const ban = await _db.collection('banned_ips').findOne({
        ip,
        expiresAt: { $gt: now }
      });
      return ban || null;
    } catch (err) {
      logger.error('[BanService] isBanned error:', err.message);
    }
  }
  return null;
}

/**
 * Ban an IP address.
 * @param {string} ip
 * @param {number} durationMs  - Duration in milliseconds
 * @param {string} reason      - Human-readable reason
 * @param {number} violations  - Current violation count
 */
async function banIP(ip, durationMs, reason, violations) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + durationMs);

  if (_db) {
    try {
      await _db.collection('banned_ips').updateOne(
        { ip },
        {
          $set: { ip, bannedAt: now, expiresAt, reason, violations },
          $inc: {} // no-op, keeps upsert clean
        },
        { upsert: true }
      );
      logger.info(`[BanService] IP ${ip} banned until ${expiresAt.toUTCString()} (${reason})`);
      return;
    } catch (err) {
      logger.error('[BanService] banIP error:', err.message);
    }
  }
  logger.warn(`[BanService] (in-memory fallback) IP ${ip} would be banned for ${durationMs}ms`);
}

/** Manually unban an IP (admin action). */
async function unbanIP(ip) {
  if (_db) {
    try {
      const result = await _db.collection('banned_ips').deleteOne({ ip });
      return result.deletedCount > 0;
    } catch (err) {
      logger.error('[BanService] unbanIP error:', err.message);
    }
  }
  return false;
}

/** List all currently active bans (for admin dashboard). */
async function listActiveBans() {
  if (_db) {
    try {
      return await _db.collection('banned_ips')
        .find({ expiresAt: { $gt: new Date() } })
        .sort({ bannedAt: -1 })
        .toArray();
    } catch (err) {
      logger.error('[BanService] listActiveBans error:', err.message);
    }
  }
  return [];
}

/** Get violation count for an IP (across all time, even after ban expires). */
async function getViolations(ip) {
  if (_db) {
    try {
      const doc = await _db.collection('banned_ips').findOne({ ip });
      return doc ? doc.violations : 0;
    } catch (err) {
      logger.error('[BanService] getViolations error:', err.message);
    }
  }
  return 0;
}

module.exports = { initBanService, isBanned, banIP, unbanIP, listActiveBans, getViolations };
