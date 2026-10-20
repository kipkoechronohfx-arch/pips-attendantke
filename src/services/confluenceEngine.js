/**
 * Confluence Scoring Engine — 3-Layer Independent Architecture
 * 
 * Separates:
 * 1. Market Context (HTF trend, regime, session profile, macro levels) -> context_score (0–100)
 * 2. Setup Quality (Liquidity sweep, BOS/CHoCH, FVG/OB retest, target space) -> setup_score (0–100)
 * 3. Entry Trigger (Candle close confirmation, entry zone, spread, SL, R:R) -> entry_status
 * 
 * A high context or setup score NEVER automatically triggers an entry without confirmed trigger.
 * Avoids double-counting correlated momentum indicators.
 */

'use strict';

const { getSessionSuitability } = require('./sessionEngine');

const CONTEXT_WEIGHTS = {
  htf_trend: 35,
  market_regime: 25,
  session_profile: 25,
  macro_levels: 15,
};

const SETUP_WEIGHTS = {
  liquidity_sweep: 30,
  structure_break: 25,
  fvg_ob_retest: 25,
  momentum_uncorrelated: 10,
  target_space: 10,
};

const THRESHOLDS = {
  HIGH_CONFLUENCE: 80,
  WATCHLIST: 65,
  MINIMUM_CONTEXT: 55,
  MINIMUM_SETUP: 60,
};

/**
 * Computes transparent 3-layer confluence analysis.
 */
function computeConfluenceScore(params) {
  const {
    h4Analysis,
    h1Analysis,
    m15Analysis,
    quote,
    sessionState,
    strategyProfile,
    regimeInfo,
    symbol,
    digits = 5,
    entryTrigger,
    targetObstruction,
  } = params;

  const reasons = { bullish: [], bearish: [], rejection: [] };

  // ══════════════════════════════════════════════════════════════════════════
  // LAYER 1: MARKET CONTEXT (0 - 100)
  // ══════════════════════════════════════════════════════════════════════════
  let contextBull = 0;
  let contextBear = 0;
  const contextComponents = {};

  // 1.1 HTF Trend Alignment (Max 35)
  const htfBull = calcHTFAlignment(h4Analysis, h1Analysis, 'BULLISH');
  const htfBear = calcHTFAlignment(h4Analysis, h1Analysis, 'BEARISH');
  contextBull += htfBull;
  contextBear += htfBear;
  contextComponents.htf_trend = { bull: htfBull, bear: htfBear, max: CONTEXT_WEIGHTS.htf_trend };
  if (htfBull >= 20) reasons.bullish.push(`Context: H4/H1 trend alignment (+${htfBull}pts)`);
  if (htfBear >= 20) reasons.bearish.push(`Context: H4/H1 trend alignment (+${htfBear}pts)`);

  // 1.2 Market Regime Alignment (Max 25)
  const regimeScore = calcRegimeScore(regimeInfo);
  contextBull += regimeScore.bull;
  contextBear += regimeScore.bear;
  contextComponents.market_regime = { ...regimeScore, max: CONTEXT_WEIGHTS.market_regime };
  if (regimeScore.label) {
    if (regimeScore.bull > 0) reasons.bullish.push(`Context: ${regimeScore.label} (+${regimeScore.bull}pts)`);
    if (regimeScore.bear > 0) reasons.bearish.push(`Context: ${regimeScore.label} (+${regimeScore.bear}pts)`);
  }

  // 1.3 Session & Strategy Profile Suitability (Max 25)
  const sessionPts = calcSessionScore(symbol, sessionState, strategyProfile);
  contextBull += sessionPts.score;
  contextBear += sessionPts.score;
  contextComponents.session_profile = { score: sessionPts.score, label: sessionPts.label, max: CONTEXT_WEIGHTS.session_profile };
  reasons.bullish.push(`Context: ${sessionPts.label} (+${sessionPts.score}pts)`);
  reasons.bearish.push(`Context: ${sessionPts.label} (+${sessionPts.score}pts)`);

  // 1.4 Macro Liquidity Level Proximity (PDH/PDL/Asian Range) (Max 15)
  const macroLevelPts = calcMacroLevelsScore(h1Analysis, quote);
  contextBull += macroLevelPts.bull;
  contextBear += macroLevelPts.bear;
  contextComponents.macro_levels = { ...macroLevelPts, max: CONTEXT_WEIGHTS.macro_levels };

  // Determine Primary Context Direction
  const contextDirection = contextBull > contextBear ? 'BUY' : contextBear > contextBull ? 'SELL' : 'NEUTRAL';
  const contextScore = Math.min(100, Math.round(contextDirection === 'BUY' ? contextBull : contextBear));

  // ══════════════════════════════════════════════════════════════════════════
  // LAYER 2: SETUP QUALITY (0 - 100)
  // ══════════════════════════════════════════════════════════════════════════
  let setupBull = 0;
  let setupBear = 0;
  const setupComponents = {};

  // 2.1 Liquidity Sweep + Rejection (Max 30)
  const liqSweep = calcLiquiditySweepScore(m15Analysis, h1Analysis);
  setupBull += liqSweep.bull;
  setupBear += liqSweep.bear;
  setupComponents.liquidity_sweep = { ...liqSweep, max: SETUP_WEIGHTS.liquidity_sweep };
  if (liqSweep.bull > 0) reasons.bullish.push(`Setup: ${liqSweep.bull_label} (+${liqSweep.bull}pts)`);
  if (liqSweep.bear > 0) reasons.bearish.push(`Setup: ${liqSweep.bear_label} (+${liqSweep.bear}pts)`);

  // 2.2 Structural Break BOS / CHoCH (Max 25)
  const structBreak = calcStructureBreakScore(m15Analysis, h1Analysis);
  setupBull += structBreak.bull;
  setupBear += structBreak.bear;
  setupComponents.structure_break = { ...structBreak, max: SETUP_WEIGHTS.structure_break };
  if (structBreak.bull > 0) reasons.bullish.push(`Setup: ${structBreak.bull_label} (+${structBreak.bull}pts)`);
  if (structBreak.bear > 0) reasons.bearish.push(`Setup: ${structBreak.bear_label} (+${structBreak.bear}pts)`);

  // 2.3 FVG / Order Block Retest (Max 25)
  const fvgRetest = calcRetestScore(m15Analysis, h1Analysis);
  setupBull += fvgRetest.bull;
  setupBear += fvgRetest.bear;
  setupComponents.fvg_ob_retest = { ...fvgRetest, max: SETUP_WEIGHTS.fvg_ob_retest };
  if (fvgRetest.bull > 0) reasons.bullish.push(`Setup: ${fvgRetest.bull_label} (+${fvgRetest.bull}pts)`);
  if (fvgRetest.bear > 0) reasons.bearish.push(`Setup: ${fvgRetest.bear_label} (+${fvgRetest.bear}pts)`);

  // 2.4 Unified Non-Correlated Momentum (Max 10)
  // Avoid double-counting: combines RSI and EMA momentum into a single capped dimension
  const momentum = calcUncorrelatedMomentum(m15Analysis);
  setupBull += momentum.bull;
  setupBear += momentum.bear;
  setupComponents.momentum = { ...momentum, max: SETUP_WEIGHTS.momentum_uncorrelated };
  if (momentum.bull > 0) reasons.bullish.push(`Setup: ${momentum.bull_label} (+${momentum.bull}pts)`);
  if (momentum.bear > 0) reasons.bearish.push(`Setup: ${momentum.bear_label} (+${momentum.bear}pts)`);

  // 2.5 Target Space & Runway (Max 10)
  const targetSpace = calcTargetSpaceScore(targetObstruction);
  setupBull += targetSpace.bull;
  setupBear += targetSpace.bear;
  setupComponents.target_space = { ...targetSpace, max: SETUP_WEIGHTS.target_space };

  const setupScore = Math.min(100, Math.round(contextDirection === 'BUY' ? setupBull : setupBear));

  // ══════════════════════════════════════════════════════════════════════════
  // TOTAL CONFLUENCE SYNTHESIS (Weighted 40% Context + 60% Setup)
  // ══════════════════════════════════════════════════════════════════════════
  const totalScore = Math.min(100, Math.round(contextScore * 0.40 + setupScore * 0.60));

  // ══════════════════════════════════════════════════════════════════════════
  // LAYER 3: ENTRY TRIGGER VALIDATION
  // ══════════════════════════════════════════════════════════════════════════
  let entryStatus = 'WAITING_TRIGGER';
  let triggerConfirmed = false;

  if (entryTrigger && entryTrigger.confirmed) {
    triggerConfirmed = true;
    entryStatus = 'CONFIRMED';
  } else if (entryTrigger && entryTrigger.invalidated) {
    entryStatus = 'INVALIDATED';
    reasons.rejection.push(entryTrigger.reason || 'Entry condition structurally invalidated');
  } else {
    entryStatus = 'WAITING_TRIGGER';
  }

  // Determine Signal Classification
  let signalClass = 'NO_SIGNAL';
  let passed = false;

  if (contextScore >= THRESHOLDS.MINIMUM_CONTEXT && setupScore >= THRESHOLDS.MINIMUM_SETUP) {
    if (totalScore >= THRESHOLDS.HIGH_CONFLUENCE) {
      signalClass = triggerConfirmed ? 'HIGH_CONFLUENCE' : 'WATCHLIST';
      passed = true;
    } else if (totalScore >= THRESHOLDS.WATCHLIST) {
      signalClass = 'WATCHLIST';
      passed = true;
    }
  }

  return {
    direction: contextDirection,
    context_score: contextScore,
    setup_score: setupScore,
    score: totalScore,
    entry_status: entryStatus,
    trigger_confirmed: triggerConfirmed,
    passed,
    signal_class: signalClass,
    reasons: contextDirection === 'BUY' ? reasons.bullish : reasons.bearish,
    rejection_reasons: reasons.rejection,
    components: {
      context: contextComponents,
      setup: setupComponents,
    },
    confidence_calibration_notice: 'Score is a technical confluence heuristic (0-100). Empirical win probability requires historical sample validation.',
  };
}

// ── Context Helpers ──────────────────────────────────────────────────────────

function calcHTFAlignment(h4, h1, direction) {
  if (!h4?.valid || !h1?.valid) return 0;
  let pts = 0;
  const isBull = direction === 'BULLISH';

  // H4 Trend
  const h4Trend = isBull
    ? ['BULLISH', 'STRONG_BULL'].includes(h4.structure?.trend)
    : ['BEARISH', 'STRONG_BEAR'].includes(h4.structure?.trend);
  if (h4Trend) pts += 15;

  // H1 Trend
  const h1Trend = isBull
    ? ['BULLISH', 'STRONG_BULL'].includes(h1.structure?.trend)
    : ['BEARISH', 'STRONG_BEAR'].includes(h1.structure?.trend);
  if (h1Trend) pts += 12;

  // H1 EMA alignment
  const h1EMA = isBull
    ? h1.bias?.ema === 'BULL' || h1.bias?.ema === 'STRONG_BULL'
    : h1.bias?.ema === 'BEAR' || h1.bias?.ema === 'STRONG_BEAR';
  if (h1EMA) pts += 8;

  return Math.min(pts, CONTEXT_WEIGHTS.htf_trend);
}

function calcRegimeScore(regimeInfo) {
  if (!regimeInfo) return { bull: 10, bear: 10, label: 'Regime unclassified' };

  if (regimeInfo.regime === 'TRENDING') {
    return {
      bull: regimeInfo.direction === 'BULLISH' ? 25 : 0,
      bear: regimeInfo.direction === 'BEARISH' ? 25 : 0,
      label: `Established ${regimeInfo.direction} trend`,
    };
  }
  if (regimeInfo.regime === 'BREAKOUT') {
    return {
      bull: regimeInfo.direction === 'BULLISH' ? 22 : 0,
      bear: regimeInfo.direction === 'BEARISH' ? 22 : 0,
      label: `Confirmed ${regimeInfo.direction} range expansion`,
    };
  }
  if (regimeInfo.regime === 'RANGING') {
    return { bull: 15, bear: 15, label: 'Range-bound consolidation regime' };
  }
  return { bull: 0, bear: 0, label: 'Unfavorable / Low-conviction regime' };
}

function calcSessionScore(symbol, sessionState, strategyProfile) {
  if (strategyProfile && strategyProfile.is_active) {
    const isEligible = strategyProfile.eligible_instruments.some(
      (p) => p.replace('/', '') === symbol.replace('/', '')
    );
    if (isEligible) {
      return { score: 25, label: `${strategyProfile.name} priority asset` };
    }
  }

  const baseSuitability = getSessionSuitability(symbol, sessionState);
  return {
    score: Math.round((baseSuitability / 10) * 20),
    label: `${sessionState?.primary_session?.name || 'Active Session'} alignment`,
  };
}

function calcMacroLevelsScore(h1, quote) {
  if (!h1?.levels || !quote?.mid) return { bull: 5, bear: 5 };
  const p = quote.mid;
  const { pdh, pdl, asian_high, asian_low } = h1.levels;

  let bull = 5, bear = 5;
  if (pdl && Math.abs(p - pdl) / p < 0.0015) bull += 10; // At Previous Day Low support
  if (pdh && Math.abs(p - pdh) / p < 0.0015) bear += 10; // At Previous Day High resistance
  if (asian_low && Math.abs(p - asian_low) / p < 0.0015) bull += 5;
  if (asian_high && Math.abs(p - asian_high) / p < 0.0015) bear += 5;

  return { bull: Math.min(bull, 15), bear: Math.min(bear, 15) };
}

// ── Setup Helpers ────────────────────────────────────────────────────────────

function calcLiquiditySweepScore(m15, h1) {
  const sweep15 = m15?.liquidity?.sweep;
  const sweep60 = h1?.liquidity?.sweep;

  if (sweep15?.direction === 'BULLISH' && sweep15.rejection) {
    return { bull: 30, bear: 0, bull_label: `M15 ${sweep15.label} with rejection`, bear_label: '' };
  }
  if (sweep15?.direction === 'BEARISH' && sweep15.rejection) {
    return { bull: 0, bear: 30, bull_label: '', bear_label: `M15 ${sweep15.label} with rejection` };
  }
  if (sweep60?.direction === 'BULLISH') {
    return { bull: 20, bear: 0, bull_label: `H1 ${sweep60.label}`, bear_label: '' };
  }
  if (sweep60?.direction === 'BEARISH') {
    return { bull: 0, bear: 20, bull_label: '', bear_label: `H1 ${sweep60.label}` };
  }
  return { bull: 0, bear: 0, bull_label: '', bear_label: '' };
}

function calcStructureBreakScore(m15, h1) {
  const bos15 = m15?.structure?.bos;
  const choch15 = m15?.structure?.choch;

  if (choch15?.direction === 'BULLISH') {
    return { bull: 25, bear: 0, bull_label: 'M15 Change of Character (CHoCH)', bear_label: '' };
  }
  if (choch15?.direction === 'BEARISH') {
    return { bull: 0, bear: 25, bull_label: '', bear_label: 'M15 Change of Character (CHoCH)' };
  }
  if (bos15?.direction === 'BULLISH') {
    return { bull: 20, bear: 0, bull_label: 'M15 Break of Structure (BOS)', bear_label: '' };
  }
  if (bos15?.direction === 'BEARISH') {
    return { bull: 0, bear: 20, bull_label: '', bear_label: 'M15 Break of Structure (BOS)' };
  }
  return { bull: 0, bear: 0, bull_label: '', bear_label: '' };
}

function calcRetestScore(m15, h1) {
  const nearBullFVG = m15?.fvgs?.near_bull;
  const nearBearFVG = m15?.fvgs?.near_bear;
  const nearBullOB = m15?.order_blocks?.near_bull;
  const nearBearOB = m15?.order_blocks?.near_bear;

  let bull = 0, bear = 0, bull_label = '', bear_label = '';

  if (nearBullOB && nearBullFVG) {
    bull = 25;
    bull_label = 'Confluent M15 Order Block + FVG discount zone';
  } else if (nearBullOB) {
    bull = 18;
    bull_label = 'M15 Bullish Order Block test';
  } else if (nearBullFVG) {
    bull = 15;
    bull_label = 'M15 Fair Value Gap fill';
  }

  if (nearBearOB && nearBearFVG) {
    bear = 25;
    bear_label = 'Confluent M15 Bearish Order Block + FVG premium zone';
  } else if (nearBearOB) {
    bear = 18;
    bear_label = 'M15 Bearish Order Block test';
  } else if (nearBearFVG) {
    bear = 15;
    bear_label = 'M15 Bearish Fair Value Gap fill';
  }

  return { bull, bear, bull_label, bear_label };
}

/**
 * Combines EMA slope and RSI into a single non-correlated score (capped at 10 pts)
 * to strictly prevent double-counting of correlated momentum indicators.
 */
function calcUncorrelatedMomentum(m15) {
  if (!m15?.indicators) return { bull: 0, bear: 0, bull_label: '', bear_label: '' };
  const rsi = m15.indicators.rsi14;
  const ema20 = m15.indicators.ema20;
  const close = m15.last_close;

  let bull = 0, bear = 0;

  // Bullish momentum
  if (rsi >= 50 && rsi <= 68 && close > ema20) {
    bull = 10; // Healthy bullish momentum without overbought exhaustion
  } else if (rsi > 45 && close > ema20) {
    bull = 6;
  }

  // Bearish momentum
  if (rsi <= 50 && rsi >= 32 && close < ema20) {
    bear = 10;
  } else if (rsi < 55 && close < ema20) {
    bear = 6;
  }

  return {
    bull,
    bear,
    bull_label: bull > 0 ? `Uncorrelated momentum confirmed (RSI ${rsi?.toFixed(0)})` : '',
    bear_label: bear > 0 ? `Uncorrelated momentum confirmed (RSI ${rsi?.toFixed(0)})` : '',
  };
}

function calcTargetSpaceScore(targetObstruction) {
  if (targetObstruction && targetObstruction.obstructed) {
    return { bull: 0, bear: 0 };
  }
  return { bull: 10, bear: 10 };
}

module.exports = {
  computeConfluenceScore,
  CONTEXT_WEIGHTS,
  SETUP_WEIGHTS,
  THRESHOLDS,
};
