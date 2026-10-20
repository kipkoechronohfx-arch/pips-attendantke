/**
 * Market Regime Classifier
 * Quantitatively classifies market states into:
 * - TRENDING (Trend continuation strategies)
 * - RANGING (Mean reversion / boundary fade strategies)
 * - BREAKOUT (Expansion & retest strategies)
 * - HIGH_VOLATILITY (Defensive / wider stop regime)
 * - LOW_LIQUIDITY (Restricted / low conviction regime)
 * - UNKNOWN (Insufficient or contradictory data - reject setup)
 */

'use strict';

const { calcEMA, calcATR, findSwings } = require('./marketStructure');

const REGIMES = {
  TRENDING: 'TRENDING',
  RANGING: 'RANGING',
  BREAKOUT: 'BREAKOUT',
  HIGH_VOLATILITY: 'HIGH_VOLATILITY',
  LOW_LIQUIDITY: 'LOW_LIQUIDITY',
  UNKNOWN: 'UNKNOWN',
};

/**
 * Classifies the market regime for a set of closed candles.
 * @param {Array} candles - Array of { open, high, low, close, volume }
 * @param {Object} options - Configurable parameters
 * @returns {Object} Regime evaluation details
 */
function classifyRegime(candles, options = {}) {
  const lookback = options.lookback || 50;
  const minCandles = 25;

  if (!candles || candles.length < minCandles) {
    return {
      regime: REGIMES.UNKNOWN,
      confidence: 0,
      reason: 'Insufficient candle data to determine market regime',
      is_tradeable: false,
      strategy_bias: 'NONE',
      metrics: null,
    };
  }

  const window = candles.slice(-lookback);
  const n = window.length;
  const closes = window.map((c) => c.close);
  const highs = window.map((c) => c.high);
  const lows = window.map((c) => c.low);

  // 1. Moving Average Metrics
  const ema20 = calcEMA(closes, 20);
  const ema50 = calcEMA(closes, 50);
  const lastClose = closes[n - 1];
  const lastEMA20 = ema20[n - 1];
  const lastEMA50 = ema50[n - 1];

  const emaSlope20 = ema20[n - 1] && ema20[n - 5] ? (ema20[n - 1] - ema20[n - 5]) / 5 : 0;
  const emaAlignedBull = lastEMA20 && lastEMA50 && lastEMA20 > lastEMA50 && lastClose > lastEMA20;
  const emaAlignedBear = lastEMA20 && lastEMA50 && lastEMA20 < lastEMA50 && lastClose < lastEMA20;

  // 2. ATR & Volatility Distribution
  const atrs = calcATR(window, 14).filter((v) => v !== null);
  const currentATR = atrs[atrs.length - 1] || 0.001;

  // Percentile of current ATR within the lookback window
  const sortedATRs = [...atrs].sort((a, b) => a - b);
  const rank = sortedATRs.findIndex((v) => v >= currentATR);
  const atrPercentile = sortedATRs.length > 0 ? (rank / sortedATRs.length) * 100 : 50;

  // 3. Swing Structure (HH/HL vs LH/LL)
  const swings = findSwings(window, 2);
  const swingHighs = swings.filter((s) => s.type === 'high').slice(-4);
  const swingLows = swings.filter((s) => s.type === 'low').slice(-4);

  let higherHighs = 0;
  let higherLows = 0;
  let lowerHighs = 0;
  let lowerLows = 0;

  for (let i = 1; i < swingHighs.length; i++) {
    if (swingHighs[i].price > swingHighs[i - 1].price) higherHighs++;
    if (swingHighs[i].price < swingHighs[i - 1].price) lowerHighs++;
  }
  for (let i = 1; i < swingLows.length; i++) {
    if (swingLows[i].price > swingLows[i - 1].price) higherLows++;
    if (swingLows[i].price < swingLows[i - 1].price) lowerLows++;
  }

  const isStructuralBull = higherHighs >= 1 && higherLows >= 1 && lowerHighs === 0;
  const isStructuralBear = lowerHighs >= 1 && lowerLows >= 1 && higherHighs === 0;

  // 4. Directional Movement (DMI-style Efficiency Ratio)
  const netMove = Math.abs(lastClose - closes[0]);
  const grossMove = window.slice(1).reduce((acc, c, idx) => acc + Math.abs(c.close - window[idx].close), 0);
  const efficiencyRatio = grossMove > 0 ? netMove / grossMove : 0; // 0 = complete chop, 1 = straight vertical trend

  // 5. Breakout Detection
  // Check if last candle closed outside the 20-period channel with expansion
  const prev20High = Math.max(...highs.slice(-21, -1));
  const prev20Low = Math.min(...lows.slice(-21, -1));
  const lastCandle = window[n - 1];
  const lastBody = Math.abs(lastCandle.close - lastCandle.open);
  const avgBody = window.slice(-10).reduce((acc, c) => acc + Math.abs(c.close - c.open), 0) / 10 || 0.0001;

  const isBullBreakout = lastClose > prev20High && lastBody >= avgBody * 1.4;
  const isBearBreakout = lastClose < prev20Low && lastBody >= avgBody * 1.4;
  const isBreakout = isBullBreakout || isBearBreakout;

  // ── Regime Classification Logic ──────────────────────────────────────────
  let regime = REGIMES.UNKNOWN;
  let direction = 'NEUTRAL';
  let confidence = 50;
  let strategyBias = 'NONE';
  let reasons = [];

  // A. Extreme Volatility check
  if (atrPercentile >= 88) {
    regime = REGIMES.HIGH_VOLATILITY;
    confidence = 55;
    strategyBias = 'DEFENSIVE';
    reasons.push(`ATR is at ${atrPercentile.toFixed(0)}th percentile (extreme volatility)`);
  }
  // B. Low Liquidity check
  else if (atrPercentile <= 12 || efficiencyRatio < 0.12) {
    regime = REGIMES.LOW_LIQUIDITY;
    confidence = 40;
    strategyBias = 'AVOID';
    reasons.push(`Low volatility/stagnation (ATR ${atrPercentile.toFixed(0)}th percentile, efficiency ${efficiencyRatio.toFixed(2)})`);
  }
  // C. Fresh Breakout
  else if (isBreakout) {
    regime = REGIMES.BREAKOUT;
    direction = isBullBreakout ? 'BULLISH' : 'BEARISH';
    confidence = 82;
    strategyBias = 'BREAKOUT_RETEST';
    reasons.push(`Range expansion confirmed (${direction}): close broke 20-bar extreme with ${((lastBody / avgBody) * 100).toFixed(0)}% avg body`);
  }
  // D. Established Trend
  else if ((emaAlignedBull && isStructuralBull) || (efficiencyRatio >= 0.38 && emaAlignedBull)) {
    regime = REGIMES.TRENDING;
    direction = 'BULLISH';
    confidence = Math.min(95, Math.round(50 + efficiencyRatio * 50 + (higherHighs + higherLows) * 5));
    strategyBias = 'TREND_CONTINUATION';
    reasons.push(`Bullish trend confirmed: EMA alignment, higher highs/lows, efficiency ${efficiencyRatio.toFixed(2)}`);
  } else if ((emaAlignedBear && isStructuralBear) || (efficiencyRatio >= 0.38 && emaAlignedBear)) {
    regime = REGIMES.TRENDING;
    direction = 'BEARISH';
    confidence = Math.min(95, Math.round(50 + efficiencyRatio * 50 + (lowerHighs + lowerLows) * 5));
    strategyBias = 'TREND_CONTINUATION';
    reasons.push(`Bearish trend confirmed: EMA alignment, lower highs/lows, efficiency ${efficiencyRatio.toFixed(2)}`);
  }
  // E. Ranging / Mean Reversion
  else if (efficiencyRatio < 0.30 && Math.abs(emaSlope20) < currentATR * 0.1) {
    regime = REGIMES.RANGING;
    direction = 'NEUTRAL';
    confidence = 75;
    strategyBias = 'RANGE_BOUND';
    reasons.push(`Consolidation/Range-bound: flat EMA slope, low directional efficiency (${efficiencyRatio.toFixed(2)})`);
  }
  // F. Fallback: Conflicting or choppy data
  else {
    regime = REGIMES.UNKNOWN;
    confidence = 35;
    strategyBias = 'AVOID';
    reasons.push('Conflicting price action: mixed moving averages and unconfirmed swing sequence');
  }

  return {
    regime,
    direction,
    confidence,
    is_tradeable: regime !== REGIMES.UNKNOWN && regime !== REGIMES.LOW_LIQUIDITY,
    strategy_bias: strategyBias,
    reasons,
    metrics: {
      current_atr: currentATR,
      atr_percentile: Math.round(atrPercentile),
      efficiency_ratio: Number(efficiencyRatio.toFixed(3)),
      ema_slope: Number(emaSlope20.toFixed(6)),
      higher_highs: higherHighs,
      higher_lows: higherLows,
      lower_highs: lowerHighs,
      lower_lows: lowerLows,
      is_breakout: isBreakout,
    },
  };
}

module.exports = {
  classifyRegime,
  REGIMES,
};
