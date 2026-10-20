/**
 * Hard-Gate No-Trade Engine
 * Enforces zero-tolerance validation before any setup can transition to CONFIRMED.
 * Hard-gate failures ALWAYS override any confluence score.
 */

'use strict';

const REJECTION_CODES = {
  STALE_DATA: 'STALE_DATA',
  INCOMPLETE_CANDLE_DATA: 'INCOMPLETE_CANDLE_DATA',
  MARKET_RESTRICTED: 'MARKET_RESTRICTED',
  SESSION_PROFILE_INELIGIBLE: 'SESSION_PROFILE_INELIGIBLE',
  UNFAVORABLE_REGIME: 'UNFAVORABLE_REGIME',
  NEWS_BLACKOUT: 'NEWS_BLACKOUT',
  SPREAD_TOO_HIGH: 'SPREAD_TOO_HIGH',
  EXCESSIVE_VOLATILITY: 'EXCESSIVE_VOLATILITY',
  NO_ENTRY_CONFIRMATION: 'NO_ENTRY_CONFIRMATION',
  INVALID_STOP: 'INVALID_STOP',
  INVALID_STOP_DISTANCE: 'INVALID_STOP_DISTANCE',
  INSUFFICIENT_RR: 'INSUFFICIENT_RR',
  INSUFFICIENT_TARGET_SPACE: 'INSUFFICIENT_TARGET_SPACE',
  SETUP_EXPIRED: 'SETUP_EXPIRED',
  DUPLICATE_SETUP: 'DUPLICATE_SETUP',
};

/**
 * Validates all hard gates for a signal candidate.
 * Returns { passed: boolean, rejection_reasons: Array<{ code, message }>, details: Object }
 */
function validateHardGates(params) {
  const {
    quote,
    candles,
    sessionState,
    strategyProfile,
    regimeInfo,
    newsEvents = [],
    riskParams,
    entryTrigger,
    targetObstruction,
    existingSetups = [],
    setupId,
    setupTimestamp,
    options = {},
  } = params;

  const rejections = [];
  const maxQuoteAgeSec = options.maxQuoteAgeSec || 120; // 2 minutes max
  const minCandleCount = options.minCandleCount || 20;

  // ── 1. Data Integrity & Freshness ──────────────────────────────────────────
  if (!quote) {
    rejections.push({
      code: REJECTION_CODES.STALE_DATA,
      message: 'Market quote data is completely unavailable',
    });
  } else {
    const quoteAge = quote.data_freshness_seconds ?? (quote.timestamp ? (Date.now() - quote.timestamp) / 1000 : 0);
    if (quoteAge > maxQuoteAgeSec) {
      rejections.push({
        code: REJECTION_CODES.STALE_DATA,
        message: `Market data is stale (${Math.round(quoteAge)}s old, max allowed: ${maxQuoteAgeSec}s)`,
      });
    }
  }

  if (!candles || candles.length < minCandleCount) {
    rejections.push({
      code: REJECTION_CODES.INCOMPLETE_CANDLE_DATA,
      message: `Candle history insufficient (${candles?.length || 0} candles, minimum: ${minCandleCount})`,
    });
  }

  // ── 2. Market Schedule & Session Restrictions ──────────────────────────────
  const now = options.currentTime || new Date();
  const utcH = now.getUTCHours();
  const utcDay = now.getUTCDay();

  if (utcDay === 6 || (utcDay === 0 && utcH < 22)) {
    rejections.push({
      code: REJECTION_CODES.MARKET_RESTRICTED,
      message: 'Global forex market is closed for the weekend',
    });
  } else if (utcDay === 5 && utcH >= 22) {
    rejections.push({
      code: REJECTION_CODES.MARKET_RESTRICTED,
      message: 'Late Friday market close — new entries prohibited',
    });
  } else if (utcH === 21 && now.getUTCMinutes() >= 55) {
    rejections.push({
      code: REJECTION_CODES.MARKET_RESTRICTED,
      message: 'Daily rollover blackout (21:55–22:05 UTC) — high spreads and bank settlement',
    });
  }

  // ── 3. Strategy Profile & Instrument Eligibility ───────────────────────────
  if (strategyProfile) {
    if (!strategyProfile.is_active && !options.allowPrePost) {
      rejections.push({
        code: REJECTION_CODES.SESSION_PROFILE_INELIGIBLE,
        message: `Strategy profile "${strategyProfile.name}" is currently inactive (${strategyProfile.time_label || 'outside hours'})`,
      });
    }
  }

  // ── 4. Market Regime Validation ────────────────────────────────────────────
  if (regimeInfo) {
    if (regimeInfo.regime === 'UNKNOWN') {
      rejections.push({
        code: REJECTION_CODES.UNFAVORABLE_REGIME,
        message: 'Market regime is UNKNOWN due to contradictory price action or indecision',
      });
    } else if (regimeInfo.regime === 'LOW_LIQUIDITY') {
      rejections.push({
        code: REJECTION_CODES.UNFAVORABLE_REGIME,
        message: 'Market regime is LOW_LIQUIDITY — insufficient order flow for clean execution',
      });
    }
  }

  // ── 5. News Blackout Filter ────────────────────────────────────────────────
  if (newsEvents && newsEvents.length > 0 && strategyProfile) {
    const blackoutMs = (strategyProfile.news_blackout_minutes || 30) * 60 * 1000;
    const nowMs = now.getTime();
    const symbol = quote?.symbol || '';

    const activeBlackout = newsEvents.find((evt) => {
      if (evt.impact !== 'HIGH' && evt.impact !== 'CRITICAL') return false;
      // Check currency match
      if (evt.currency && !symbol.includes(evt.currency)) return false;
      const evtTime = new Date(evt.time).getTime();
      return Math.abs(nowMs - evtTime) <= blackoutMs;
    });

    if (activeBlackout) {
      rejections.push({
        code: REJECTION_CODES.NEWS_BLACKOUT,
        message: `News blackout active: ${activeBlackout.title || activeBlackout.event} (${activeBlackout.currency}) within ±${strategyProfile.news_blackout_minutes}m window`,
      });
    }
  }

  // ── 6. Spread & Volatility Limits ──────────────────────────────────────────
  if (quote && strategyProfile) {
    const spreadPips = quote.spread_pips ?? (quote.spread ? quote.spread / (options.pipSize || 0.0001) : null);
    if (spreadPips !== null && spreadPips > strategyProfile.max_spread_pips) {
      rejections.push({
        code: REJECTION_CODES.SPREAD_TOO_HIGH,
        message: `Current spread (${spreadPips.toFixed(1)} pips) exceeds strategy maximum (${strategyProfile.max_spread_pips} pips)`,
      });
    }
  }

  // ── 7. Entry Trigger Confirmation ──────────────────────────────────────────
  if (!entryTrigger || !entryTrigger.confirmed) {
    rejections.push({
      code: REJECTION_CODES.NO_ENTRY_CONFIRMATION,
      message: entryTrigger?.reason || 'Confirmed candle-close trigger condition has not fired',
    });
  }

  // ── 8. Stop Loss Integrity ─────────────────────────────────────────────────
  if (!riskParams || !riskParams.stop_loss || !riskParams.entry_price) {
    rejections.push({
      code: REJECTION_CODES.INVALID_STOP,
      message: 'Stop loss or entry price is not defined',
    });
  } else {
    const isBuy = params.direction === 'BUY';
    const invalidSide = isBuy
      ? riskParams.stop_loss >= riskParams.entry_price
      : riskParams.stop_loss <= riskParams.entry_price;

    if (invalidSide) {
      rejections.push({
        code: REJECTION_CODES.INVALID_STOP,
        message: `Stop loss (${riskParams.stop_loss}) placed on wrong side of entry price (${riskParams.entry_price}) for a ${params.direction} order`,
      });
    }

    const slDistance = Math.abs(riskParams.entry_price - riskParams.stop_loss);
    if (slDistance <= 0.00005) {
      rejections.push({
        code: REJECTION_CODES.INVALID_STOP_DISTANCE,
        message: 'Stop loss distance is unacceptably tight (< 0.5 pips)',
      });
    }
  }

  // ── 9. Reward-to-Risk Ratio Validation ─────────────────────────────────────
  const minRR = strategyProfile?.min_rr || 2.0;
  if (riskParams?.risk_reward_ratio && riskParams.risk_reward_ratio < minRR) {
    rejections.push({
      code: REJECTION_CODES.INSUFFICIENT_RR,
      message: `Reward-to-risk ratio (1:${riskParams.risk_reward_ratio.toFixed(2)}) is below strategy requirement (1:${minRR.toFixed(1)})`,
    });
  }

  // ── 10. Target Space & Opposing Structure Obstruction ──────────────────────
  if (targetObstruction && targetObstruction.obstructed) {
    rejections.push({
      code: REJECTION_CODES.INSUFFICIENT_TARGET_SPACE,
      message: `Target path obstructed by ${targetObstruction.type || 'major level'} at ${targetObstruction.level} before reaching TP`,
    });
  }

  // ── 11. Setup Expiration ───────────────────────────────────────────────────
  if (setupTimestamp && strategyProfile) {
    const maxAgeMs = (strategyProfile.setup_expiration_hours || 4) * 3600 * 1000;
    if (now.getTime() - setupTimestamp > maxAgeMs) {
      rejections.push({
        code: REJECTION_CODES.SETUP_EXPIRED,
        message: `Setup has expired (created > ${strategyProfile.setup_expiration_hours}h ago)`,
      });
    }
  }

  // ── 12. Duplicate Setup Prevention ─────────────────────────────────────────
  if (setupId && existingSetups.length > 0) {
    const isDuplicate = existingSetups.some(
      (s) => s.id === setupId && ['CONFIRMED', 'ACTIVE'].includes(s.lifecycle_state)
    );
    if (isDuplicate) {
      rejections.push({
        code: REJECTION_CODES.DUPLICATE_SETUP,
        message: `Setup ID ${setupId} is already in an active or confirmed state`,
      });
    }
  }

  return {
    passed: rejections.length === 0,
    rejection_reasons: rejections,
    failure_codes: rejections.map((r) => r.code),
    validated_at: now.toISOString(),
  };
}

module.exports = {
  validateHardGates,
  REJECTION_CODES,
};
