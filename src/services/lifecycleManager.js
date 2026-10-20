/**
 * Setup Lifecycle & State Management
 * Implements a robust state machine for trading setups:
 * WATCH → CONFIRMED → ACTIVE → TP1_HIT / TP2_HIT / TP3_HIT / SL_HIT
 * Terminal States: INVALIDATED, EXPIRED, CANCELLED, TP3_HIT, SL_HIT.
 * Enforces idempotent alert delivery and strictly conservative execution in ambiguous conditions.
 */

'use strict';

const crypto = require('crypto');

const LIFECYCLE_STATES = {
  WATCH: 'WATCH',
  CONFIRMED: 'CONFIRMED',
  ACTIVE: 'ACTIVE',
  TP1_HIT: 'TP1_HIT',
  TP2_HIT: 'TP2_HIT',
  TP3_HIT: 'TP3_HIT',
  SL_HIT: 'SL_HIT',
  INVALIDATED: 'INVALIDATED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
};

const TERMINAL_STATES = [
  LIFECYCLE_STATES.SL_HIT,
  LIFECYCLE_STATES.TP3_HIT,
  LIFECYCLE_STATES.INVALIDATED,
  LIFECYCLE_STATES.EXPIRED,
  LIFECYCLE_STATES.CANCELLED,
];

// In-memory registry of dispatched notifications (prevent duplicate broadcasts)
const dispatchedAlertRegistry = new Map();

/**
 * Generates a deterministic, stable setup identifier based on structural anchors.
 */
function generateSetupId({ symbol, strategy, direction, timeframe, anchorTime }) {
  const normSym = symbol.replace('/', '').toUpperCase();
  const roundedTime = Math.floor(new Date(anchorTime || Date.now()).getTime() / (15 * 60 * 1000)) * (15 * 60 * 1000);
  const rawKey = `${normSym}_${strategy}_${direction}_${timeframe}_${roundedTime}`;
  const hash = crypto.createHash('sha1').update(rawKey).digest('hex').slice(0, 10);
  return `STP_${normSym}_${strategy}_${hash}`;
}

/**
 * Checks whether an alert for this setup and state transition was already dispatched.
 */
function hasAlertBeenDispatched(setupId, state) {
  const key = `${setupId}:${state}`;
  return dispatchedAlertRegistry.has(key);
}

/**
 * Records that an alert for this setup and state transition has been dispatched.
 */
function recordAlertDispatched(setupId, state) {
  const key = `${setupId}:${state}`;
  dispatchedAlertRegistry.set(key, Date.now());
  // Prune registry entries older than 24h
  if (dispatchedAlertRegistry.size > 2000) {
    const cutoff = Date.now() - 24 * 3600 * 1000;
    for (const [k, ts] of dispatchedAlertRegistry.entries()) {
      if (ts < cutoff) dispatchedAlertRegistry.delete(k);
    }
  }
}

/**
 * Evaluates state transition for a setup given current market action.
 * Strict conservative backtest rule: In ambiguous conditions (both SL and TP touched in same candle),
 * NEVER assume the favorable outcome — always mark as SL_HIT.
 */
function updateSetupState(setup, candleOrTick, options = {}) {
  const currentState = setup.lifecycle_state || LIFECYCLE_STATES.WATCH;
  if (TERMINAL_STATES.includes(currentState)) {
    return { setup, transitioned: false, newState: currentState, reason: 'Already in terminal state' };
  }

  const { high, low, close } = candleOrTick;
  const isBuy = setup.direction === 'BUY';
  const now = options.currentTime || new Date();
  let newState = currentState;
  let reason = '';

  // ── 1. From WATCH State ──────────────────────────────────────────────────
  if (currentState === LIFECYCLE_STATES.WATCH) {
    // Check expiration
    if (setup.expires_at && new Date(setup.expires_at) <= now) {
      newState = LIFECYCLE_STATES.EXPIRED;
      reason = 'Setup expired before trigger fired';
    }
    // Check invalidation level
    else if (setup.invalidation_level) {
      const isInvalidated = isBuy ? low <= setup.invalidation_level : high >= setup.invalidation_level;
      if (isInvalidated) {
        newState = LIFECYCLE_STATES.INVALIDATED;
        reason = `Price violated structural invalidation level (${setup.invalidation_level})`;
      }
    }
  }

  // ── 2. From CONFIRMED State ──────────────────────────────────────────────
  else if (currentState === LIFECYCLE_STATES.CONFIRMED) {
    // Check if price touched entry zone to activate
    const zoneHigh = setup.entry_zone_high || setup.entry_price;
    const zoneLow = setup.entry_zone_low || setup.entry_price;
    const touchedEntry = low <= zoneHigh && high >= zoneLow;

    // Check if price blew through SL before entering
    const blewPastSL = isBuy ? low <= setup.stop_loss : high >= setup.stop_loss;
    if (blewPastSL) {
      newState = LIFECYCLE_STATES.INVALIDATED;
      reason = 'Price breached stop level before valid fill';
    } else if (touchedEntry) {
      newState = LIFECYCLE_STATES.ACTIVE;
      reason = `Price entered execution zone [${zoneLow} - ${zoneHigh}]`;
    }
  }

  // ── 3. From ACTIVE State ─────────────────────────────────────────────────
  else if (currentState === LIFECYCLE_STATES.ACTIVE || currentState.startsWith('TP')) {
    // Ambiguous exit check: Both stop and target touched in the same period
    const touchedSL = isBuy ? low <= setup.stop_loss : high >= setup.stop_loss;
    const touchedTP1 = isBuy ? high >= setup.take_profit_1 : low <= setup.take_profit_1;

    if (touchedSL && touchedTP1) {
      // Conservative backtest rule: assume adverse order of events
      newState = LIFECYCLE_STATES.SL_HIT;
      reason = 'Conservative resolution: Stop and Target touched simultaneously — resolved as SL';
    } else if (touchedSL) {
      newState = LIFECYCLE_STATES.SL_HIT;
      reason = `Stop loss touched at ${setup.stop_loss}`;
    } else if (setup.take_profit_3 && (isBuy ? high >= setup.take_profit_3 : low <= setup.take_profit_3)) {
      newState = LIFECYCLE_STATES.TP3_HIT;
      reason = `Target 3 reached at ${setup.take_profit_3}`;
    } else if (setup.take_profit_2 && (isBuy ? high >= setup.take_profit_2 : low <= setup.take_profit_2)) {
      newState = LIFECYCLE_STATES.TP2_HIT;
      reason = `Target 2 reached at ${setup.take_profit_2}`;
    } else if (setup.take_profit_1 && (isBuy ? high >= setup.take_profit_1 : low <= setup.take_profit_1)) {
      if (currentState === LIFECYCLE_STATES.ACTIVE) {
        newState = LIFECYCLE_STATES.TP1_HIT;
        reason = `Target 1 reached at ${setup.take_profit_1} (stop moved to break-even)`;
      }
    }
  }

  const transitioned = newState !== currentState;
  const updated = {
    ...setup,
    lifecycle_state: newState,
    history: [
      ...(setup.history || []),
      ...(transitioned ? [{ from: currentState, to: newState, at: now.toISOString(), reason }] : []),
    ],
    updated_at: now.toISOString(),
  };

  return { setup: updated, transitioned, newState, reason };
}

module.exports = {
  LIFECYCLE_STATES,
  TERMINAL_STATES,
  generateSetupId,
  hasAlertBeenDispatched,
  recordAlertDispatched,
  updateSetupState,
};
