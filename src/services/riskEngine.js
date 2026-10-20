/**
 * Risk Engine — SL/TP Calculation & Position Sizing
 * 
 * Uses structure-based stop placement with ATR buffer.
 * No arbitrary fixed pips — all levels derived from price structure.
 * Validates R:R before emitting a signal.
 */

'use strict';

// Instrument specs for position sizing
const INSTRUMENT_SPECS = {
  'EUR/USD': { pip_size: 0.0001, pip_value_std_lot: 10, contract_size: 100000, digits: 5 },
  'GBP/USD': { pip_size: 0.0001, pip_value_std_lot: 10, contract_size: 100000, digits: 5 },
  'AUD/USD': { pip_size: 0.0001, pip_value_std_lot: 10, contract_size: 100000, digits: 5 },
  'NZD/USD': { pip_size: 0.0001, pip_value_std_lot: 10, contract_size: 100000, digits: 5 },
  'USD/CHF': { pip_size: 0.0001, pip_value_std_lot: 10.5, contract_size: 100000, digits: 5 },
  'EUR/GBP': { pip_size: 0.0001, pip_value_std_lot: 13, contract_size: 100000, digits: 5 },
  'EUR/JPY': { pip_size: 0.01, pip_value_std_lot: 6.7, contract_size: 100000, digits: 3 },
  'GBP/JPY': { pip_size: 0.01, pip_value_std_lot: 6.7, contract_size: 100000, digits: 3 },
  'USD/JPY': { pip_size: 0.01, pip_value_std_lot: 6.7, contract_size: 100000, digits: 3 },
  'AUD/JPY': { pip_size: 0.01, pip_value_std_lot: 6.7, contract_size: 100000, digits: 3 },
  'XAU/USD': { pip_size: 0.1, pip_value_std_lot: 10, contract_size: 100, digits: 2 },
  'XAG/USD': { pip_size: 0.01, pip_value_std_lot: 50, contract_size: 5000, digits: 3 },
  'BTC/USD': { pip_size: 1, pip_value_std_lot: 1, contract_size: 1, digits: 1 },
};

function getSpec(symbol) {
  return INSTRUMENT_SPECS[symbol] || { pip_size: 0.0001, pip_value_std_lot: 10, contract_size: 100000, digits: 5 };
}

/**
 * Calculate structure-based SL using nearest swing level + ATR buffer.
 * @param {string} direction - 'BUY' | 'SELL'
 * @param {number} entryPrice
 * @param {Object} m15Analysis - analyzeCandles() result
 * @param {number} atrBuffer - multiplier of ATR (default 0.5)
 * @returns {number|null} SL price or null if cannot be computed
 */
function calcStructureSL(direction, entryPrice, m15Analysis, atrBuffer = 0.5) {
  const atr = m15Analysis?.indicators?.atr14;
  if (!atr) return null;

  const spec = { digits: 5 }; // default

  if (direction === 'BUY') {
    // SL below nearest swing low or support
    const swingLow = m15Analysis?.structure?.last_swing_low;
    const support = m15Analysis?.levels?.support;
    const candidate = swingLow || support;
    if (!candidate) return null;

    // SL = just below swing low - ATR buffer
    const sl = candidate - atr * atrBuffer;
    // Sanity: SL must be below entry
    if (sl >= entryPrice) return null;
    return sl;
  } else {
    // SL above nearest swing high or resistance
    const swingHigh = m15Analysis?.structure?.last_swing_high;
    const resistance = m15Analysis?.levels?.resistance;
    const candidate = swingHigh || resistance;
    if (!candidate) return null;

    const sl = candidate + atr * atrBuffer;
    if (sl <= entryPrice) return null;
    return sl;
  }
}

/**
 * Calculate take profit levels using structure targets.
 * TP1 = 1:1 risk, TP2 = 1:2 risk, TP3 = next structural target.
 */
function calcTakeProfits(direction, entryPrice, stopLoss, m15Analysis, digits) {
  const risk = Math.abs(entryPrice - stopLoss);
  if (risk <= 0) return null;

  const atr = m15Analysis?.indicators?.atr14 || risk;

  let tp1, tp2, tp3;
  if (direction === 'BUY') {
    tp1 = entryPrice + risk * 1.0;     // 1:1
    tp2 = entryPrice + risk * 2.0;     // 1:2
    tp3 = entryPrice + risk * 3.5;     // 1:3.5 or next resistance

    // Cap TP3 at resistance if available
    const resistance = m15Analysis?.levels?.resistance;
    if (resistance && resistance > entryPrice) {
      tp3 = Math.min(tp3, resistance);
    }
  } else {
    tp1 = entryPrice - risk * 1.0;
    tp2 = entryPrice - risk * 2.0;
    tp3 = entryPrice - risk * 3.5;

    const support = m15Analysis?.levels?.support;
    if (support && support < entryPrice) {
      tp3 = Math.max(tp3, support);
    }
  }

  return {
    tp1: Number(tp1.toFixed(digits)),
    tp2: Number(tp2.toFixed(digits)),
    tp3: Number(tp3.toFixed(digits)),
    rr1: 1.0,
    rr2: 2.0,
    rr3: Number((Math.abs(tp3 - entryPrice) / risk).toFixed(2)),
  };
}

/**
 * Calculate position size based on account parameters.
 * @param {Object} params
 * @returns {Object} lot_size, risk_amount, sl_pips, tp_pips, etc.
 */
function calcPositionSize({
  symbol,
  entryPrice,
  stopLoss,
  accountBalance = 10000,
  riskPercent = 0.5,
  accountCurrency = 'USD',
}) {
  const spec = getSpec(symbol);
  const riskAmount = accountBalance * (riskPercent / 100);
  const priceDiff = Math.abs(entryPrice - stopLoss);
  const pipsAtRisk = priceDiff / spec.pip_size;

  if (pipsAtRisk <= 0) return null;

  const lotSize = riskAmount / (pipsAtRisk * spec.pip_value_std_lot);
  const roundedLot = Math.max(0.01, Math.round(lotSize * 100) / 100);

  return {
    lot_size: roundedLot,
    risk_amount: Number(riskAmount.toFixed(2)),
    sl_pips: Number(pipsAtRisk.toFixed(1)),
    risk_percent: riskPercent,
    account_balance: accountBalance,
  };
}

/**
 * Full risk calculation for a signal candidate.
 * Returns null if risk parameters are invalid (reject the setup).
 */
function buildRiskParameters({
  symbol,
  direction,
  entryPrice,
  m15Analysis,
  minRR = 2.0,
  atrSlBuffer = 0.5,
  accountBalance = 10000,
  riskPercent = 0.5,
}) {
  const spec = getSpec(symbol);
  const digits = spec.digits;

  // 1. Structure-based SL
  let sl = calcStructureSL(direction, entryPrice, m15Analysis, atrSlBuffer);

  // Fallback: ATR-based SL if no structure found
  if (sl === null) {
    const atr = m15Analysis?.indicators?.atr14;
    if (!atr) return null;
    const atrBuffer = atr * 1.5;
    sl = direction === 'BUY'
      ? entryPrice - atrBuffer
      : entryPrice + atrBuffer;
  }

  sl = Number(sl.toFixed(digits));

  // Validate SL
  if (direction === 'BUY' && sl >= entryPrice) return null;
  if (direction === 'SELL' && sl <= entryPrice) return null;

  // 2. Take profits
  const tps = calcTakeProfits(direction, entryPrice, sl, m15Analysis, digits);
  if (!tps) return null;

  // 3. Validate minimum R:R using TP2
  const risk = Math.abs(entryPrice - sl);
  const reward = Math.abs(tps.tp2 - entryPrice);
  const rrRatio = reward / risk;

  if (rrRatio < minRR) {
    return null; // reject — doesn't meet minimum R:R
  }

  // 4. Position size
  const sizing = calcPositionSize({
    symbol,
    entryPrice,
    stopLoss: sl,
    accountBalance,
    riskPercent,
  });

  // 5. Entry zone (±0.25 ATR from entry)
  const atr = m15Analysis?.indicators?.atr14 || risk / 2;
  const entryZoneBuffer = atr * 0.25;

  return {
    entry_price: Number(entryPrice.toFixed(digits)),
    entry_zone_high: Number((entryPrice + entryZoneBuffer).toFixed(digits)),
    entry_zone_low: Number((entryPrice - entryZoneBuffer).toFixed(digits)),
    stop_loss: sl,
    take_profit_1: tps.tp1,
    take_profit_2: tps.tp2,
    take_profit_3: tps.tp3,
    risk_reward_ratio: Number(rrRatio.toFixed(2)),
    risk_pips: sizing?.sl_pips || 0,
    risk_amount: sizing?.risk_amount || 0,
    lot_size: sizing?.lot_size || 0.01,
    invalidation_level: direction === 'BUY'
      ? Number((sl - atr * 0.5).toFixed(digits))
      : Number((sl + atr * 0.5).toFixed(digits)),
  };
}

module.exports = { buildRiskParameters, calcPositionSize, getSpec, calcStructureSL, INSTRUMENT_SPECS };
