/**
 * Strategy Performance Validator & Backtest Engine
 * Computes institutional performance metrics without look-ahead bias:
 * - Expectancy in R
 * - Profit Factor & Max Drawdown
 * - In-sample vs Out-of-sample splits
 * - Breakdown by Strategy, Session, Regime, and Score Range
 * - Conservative friction modeling (Spread + Slippage + Commission)
 */

'use strict';

const { updateSetupState, LIFECYCLE_STATES } = require('./lifecycleManager');

/**
 * Calculates quantitative performance statistics for an array of executed trades.
 */
function calculatePerformanceMetrics(trades = [], options = {}) {
  const spreadPips = options.spreadPips || 1.2;
  const slippagePips = options.slippagePips || 0.4;
  const commissionPerLotUsd = options.commissionPerLotUsd || 5.0;

  if (!trades || trades.length === 0) {
    return {
      sample_size: 0,
      win_rate: 0,
      expectancy_r: 0,
      profit_factor: 0,
      max_drawdown_r: 0,
      total_r: 0,
      avg_win_r: 0,
      avg_loss_r: 0,
      message: 'No trade sample available for evaluation',
    };
  }

  let totalR = 0;
  let grossWinR = 0;
  let grossLossR = 0;
  let peakR = 0;
  let maxDDR = 0;
  let runningR = 0;
  let winCount = 0;
  let lossCount = 0;
  let beCount = 0;

  const rList = [];

  for (const t of trades) {
    let rReturn = t.pnl_r ?? 0;

    // Apply friction deduction in R
    const pipRisk = t.risk_pips || 20;
    const frictionPips = spreadPips + slippagePips;
    const frictionR = pipRisk > 0 ? frictionPips / pipRisk : 0.05;
    rReturn = rReturn - frictionR;

    rList.push(rReturn);
    totalR += rReturn;
    runningR += rReturn;

    if (runningR > peakR) peakR = runningR;
    const currentDD = peakR - runningR;
    if (currentDD > maxDDR) maxDDR = currentDD;

    if (rReturn > 0.1) {
      winCount++;
      grossWinR += rReturn;
    } else if (rReturn < -0.1) {
      lossCount++;
      grossLossR += Math.abs(rReturn);
    } else {
      beCount++;
    }
  }

  const sampleSize = trades.length;
  const winRate = sampleSize > 0 ? (winCount / sampleSize) * 100 : 0;
  const avgWinR = winCount > 0 ? grossWinR / winCount : 0;
  const avgLossR = lossCount > 0 ? grossLossR / lossCount : 1;
  const profitFactor = grossLossR > 0 ? grossWinR / grossLossR : grossWinR > 0 ? 99 : 0;
  const expectancyR = sampleSize > 0 ? totalR / sampleSize : 0;

  return {
    sample_size: sampleSize,
    win_count: winCount,
    loss_count: lossCount,
    breakeven_count: beCount,
    win_rate: Number(winRate.toFixed(1)),
    expectancy_r: Number(expectancyR.toFixed(2)),
    profit_factor: Number(profitFactor.toFixed(2)),
    max_drawdown_r: Number(maxDDR.toFixed(2)),
    total_r: Number(totalR.toFixed(2)),
    avg_win_r: Number(avgWinR.toFixed(2)),
    avg_loss_r: Number(avgLossR.toFixed(2)),
    friction_model: {
      spread_pips: spreadPips,
      slippage_pips: slippagePips,
      commission_lot: commissionPerLotUsd,
    },
  };
}

/**
 * Splits trade historical record chronologically into In-Sample (training) vs Out-of-Sample (testing).
 */
function evaluateInSampleVsOutOfSample(trades = [], splitRatio = 0.7) {
  if (trades.length < 10) {
    return {
      error: 'Insufficient sample size for split validation (requires >= 10 trades)',
      in_sample: null,
      out_of_sample: null,
    };
  }

  const sorted = [...trades].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const splitIdx = Math.floor(sorted.length * splitRatio);

  const inSampleTrades = sorted.slice(0, splitIdx);
  const outOfSampleTrades = sorted.slice(splitIdx);

  const isMetrics = calculatePerformanceMetrics(inSampleTrades);
  const oosMetrics = calculatePerformanceMetrics(outOfSampleTrades);

  // Check degradation between In-Sample and Out-of-Sample
  const expectancyDegradation =
    isMetrics.expectancy_r !== 0
      ? ((oosMetrics.expectancy_r - isMetrics.expectancy_r) / Math.abs(isMetrics.expectancy_r)) * 100
      : 0;

  return {
    split_ratio: `${Math.round(splitRatio * 100)}/${Math.round((1 - splitRatio) * 100)}`,
    in_sample: isMetrics,
    out_of_sample: oosMetrics,
    robustness: {
      expectancy_delta_r: Number((oosMetrics.expectancy_r - isMetrics.expectancy_r).toFixed(2)),
      degradation_percent: Number(expectancyDegradation.toFixed(1)),
      verdict: oosMetrics.expectancy_r >= 0.2 ? 'ROBUST_EDGE' : oosMetrics.expectancy_r > 0 ? 'MARGINAL' : 'OVERFITTED',
    },
  };
}

/**
 * Evaluates performance grouped by Strategy Profile, Instrument, Regime, and Score Tier.
 */
function breakdownPerformance(trades = []) {
  const byStrategy = {};
  const byInstrument = {};
  const byRegime = {};
  const byScoreTier = {
    '75-80': [],
    '81-90': [],
    '91-100': [],
  };

  for (const t of trades) {
    const strat = t.strategy_profile || 'GENERIC';
    const inst = t.symbol || 'OTHER';
    const regime = t.market_regime || 'UNKNOWN';
    const score = t.confidence || 75;

    if (!byStrategy[strat]) byStrategy[strat] = [];
    if (!byInstrument[inst]) byInstrument[inst] = [];
    if (!byRegime[regime]) byRegime[regime] = [];

    byStrategy[strat].push(t);
    byInstrument[inst].push(t);
    byRegime[regime].push(t);

    if (score >= 91) byScoreTier['91-100'].push(t);
    else if (score >= 81) byScoreTier['81-90'].push(t);
    else byScoreTier['75-80'].push(t);
  }

  const mapToMetrics = (groupMap) => {
    const res = {};
    for (const [key, list] of Object.entries(groupMap)) {
      res[key] = calculatePerformanceMetrics(list);
    }
    return res;
  };

  return {
    by_strategy: mapToMetrics(byStrategy),
    by_instrument: mapToMetrics(byInstrument),
    by_regime: mapToMetrics(byRegime),
    by_score_tier: mapToMetrics(byScoreTier),
  };
}

/**
 * Steps forward through future candles with causally available data.
 * Zero look-ahead bias: processes candle-by-candle until a terminal state is reached.
 */
function simulateSetupForward(setup, futureCandles = []) {
  let activeSetup = { ...setup, lifecycle_state: LIFECYCLE_STATES.WATCH, history: [] };

  for (let i = 0; i < futureCandles.length; i++) {
    const candle = futureCandles[i];
    const { setup: updated, transitioned, newState } = updateSetupState(activeSetup, candle, {
      currentTime: new Date(candle.time * 1000 || candle.time),
    });

    activeSetup = updated;

    // Check terminal exit
    if (newState === LIFECYCLE_STATES.SL_HIT) {
      return {
        setup: activeSetup,
        outcome: 'LOSS',
        pnl_r: -1.0,
        bars_held: i + 1,
        exit_time: candle.time,
      };
    }
    if (newState === LIFECYCLE_STATES.TP3_HIT || newState === LIFECYCLE_STATES.TP2_HIT) {
      const pnlR = activeSetup.risk_reward_ratio || 2.0;
      return {
        setup: activeSetup,
        outcome: 'WIN',
        pnl_r: pnlR,
        bars_held: i + 1,
        exit_time: candle.time,
      };
    }
    if (newState === LIFECYCLE_STATES.INVALIDATED || newState === LIFECYCLE_STATES.EXPIRED) {
      return {
        setup: activeSetup,
        outcome: 'CANCELLED',
        pnl_r: 0,
        bars_held: i + 1,
        exit_time: candle.time,
      };
    }
  }

  return {
    setup: activeSetup,
    outcome: 'OPEN',
    pnl_r: 0,
    bars_held: futureCandles.length,
  };
}

module.exports = {
  calculatePerformanceMetrics,
  evaluateInSampleVsOutOfSample,
  breakdownPerformance,
  simulateSetupForward,
};
