/**
 * Market Structure & Indicator Engine (Node.js)
 * 
 * Implements from closed candle data (no look-ahead):
 *  - EMA, RSI, ATR (standard calculations)
 *  - Market structure: swing highs/lows, HH/HL/LH/LL
 *  - Break of Structure (BOS) and Change of Character (CHoCH)
 *  - Fair Value Gaps (FVG)
 *  - Liquidity sweeps (equal highs/lows, stop-run candidates)
 *  - Order Blocks (OB)
 *  - Candlestick patterns (Engulfing, Pin Bar, Displacement)
 *  - Support/Resistance zones
 *
 * All calculations use candles[0..N-2] as history (candles[N-1] is live/incomplete).
 * Set useClosedOnly=true (default) to exclude the last candle.
 */

'use strict';

// ── EMA ───────────────────────────────────────────────────────────────────────
function calcEMA(closes, period) {
  if (closes.length < period) return new Array(closes.length).fill(null);
  const result = new Array(period - 1).fill(null);
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(ema);
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
    result.push(ema);
  }
  return result;
}

// ── RSI (Wilder's smoothing) ──────────────────────────────────────────────────
function calcRSI(closes, period = 14) {
  if (closes.length <= period) return new Array(closes.length).fill(null);
  const gains = [], losses = [];
  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    gains.push(Math.max(diff, 0));
    losses.push(Math.max(-diff, 0));
  }
  const result = new Array(period).fill(null);
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  }
  return result;
}

// ── ATR (Wilder's ATR) ────────────────────────────────────────────────────────
function calcATR(candles, period = 14) {
  if (candles.length <= period) return new Array(candles.length).fill(null);
  const trs = [candles[0].high - candles[0].low];
  for (let i = 1; i < candles.length; i++) {
    const h = candles[i].high, l = candles[i].low, pc = candles[i - 1].close;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const result = new Array(period - 1).fill(null);
  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(atr);
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
    result.push(atr);
  }
  return result;
}

// ── Swing Highs & Lows ────────────────────────────────────────────────────────
// A swing high is a candle whose high is the highest in a window of `strength` candles
// on each side. Returns array of { idx, price, type:'high'|'low' }
function findSwings(candles, strength = 3) {
  const swings = [];
  for (let i = strength; i < candles.length - strength; i++) {
    const c = candles[i];
    let isHigh = true, isLow = true;
    for (let j = i - strength; j <= i + strength; j++) {
      if (j === i) continue;
      if (candles[j].high > c.high) isHigh = false;
      if (candles[j].low < c.low) isLow = false;
    }
    if (isHigh) swings.push({ idx: i, price: c.high, type: 'high', time: candles[i].time });
    if (isLow) swings.push({ idx: i, price: c.low, type: 'low', time: candles[i].time });
  }
  return swings;
}

// ── Market Structure (HH/HL/LH/LL) ───────────────────────────────────────────
function analyzeMarketStructure(candles, swingStrength = 3) {
  const swings = findSwings(candles, swingStrength);
  const highs = swings.filter((s) => s.type === 'high').slice(-8);
  const lows = swings.filter((s) => s.type === 'low').slice(-8);

  if (highs.length < 2 || lows.length < 2) {
    return { structure: 'RANGING', swings, highs, lows, bos: null, choch: null, trend: 'NEUTRAL' };
  }

  // Determine last 3 highs & lows
  const [lh2, lh1] = highs.slice(-2);
  const [ll2, ll1] = lows.slice(-2);

  const hhPattern = lh1.price > lh2.price; // Higher High
  const hlPattern = ll1.price > ll2.price; // Higher Low
  const lhPattern = lh1.price < lh2.price; // Lower High
  const llPattern = ll1.price < ll2.price; // Lower Low

  let structure = 'RANGING';
  let trend = 'NEUTRAL';
  if (hhPattern && hlPattern) { structure = 'BULLISH'; trend = 'BULLISH'; }
  else if (lhPattern && llPattern) { structure = 'BEARISH'; trend = 'BEARISH'; }

  // BOS: price closes beyond last swing high (bullish BOS) or low (bearish BOS)
  const lastClose = candles[candles.length - 1].close;
  const lastHigh = highs[highs.length - 1]?.price;
  const lastLow = lows[lows.length - 1]?.price;

  let bos = null;
  if (lastHigh && lastClose > lastHigh) {
    bos = { direction: 'BULLISH', level: lastHigh, label: 'BOS' };
  } else if (lastLow && lastClose < lastLow) {
    bos = { direction: 'BEARISH', level: lastLow, label: 'BOS' };
  }

  // CHoCH: a BOS in the opposite direction of the established structure
  let choch = null;
  if (bos && bos.direction === 'BEARISH' && structure === 'BULLISH') {
    choch = { direction: 'BEARISH', level: bos.level, label: 'CHoCH' };
    bos = null;
  } else if (bos && bos.direction === 'BULLISH' && structure === 'BEARISH') {
    choch = { direction: 'BULLISH', level: bos.level, label: 'CHoCH' };
    bos = null;
  }

  return {
    structure,
    trend,
    swings,
    highs,
    lows,
    bos,
    choch,
    last_swing_high: lastHigh || null,
    last_swing_low: lastLow || null,
  };
}

// ── Fair Value Gaps (FVG) ─────────────────────────────────────────────────────
// A bullish FVG: candle[i-2].high < candle[i].low  (gap between top of i-2 and bottom of i)
// A bearish FVG: candle[i-2].low > candle[i].high
function findFVGs(candles) {
  const fvgs = [];
  for (let i = 2; i < candles.length; i++) {
    const c0 = candles[i - 2], c2 = candles[i];
    if (c0.high < c2.low) {
      fvgs.push({
        type: 'BULLISH',
        high: c2.low,
        low: c0.high,
        mid: (c2.low + c0.high) / 2,
        time: candles[i - 1].time,
        idx: i - 1,
        filled: false,
      });
    } else if (c0.low > c2.high) {
      fvgs.push({
        type: 'BEARISH',
        high: c0.low,
        low: c2.high,
        mid: (c0.low + c2.high) / 2,
        time: candles[i - 1].time,
        idx: i - 1,
        filled: false,
      });
    }
  }

  // Mark filled FVGs (price traded through the gap after formation)
  const last5 = candles.slice(-5);
  return fvgs.map((fvg) => {
    const filledCandles = candles.slice(fvg.idx + 1);
    const isFilled = filledCandles.some((c) => {
      if (fvg.type === 'BULLISH') return c.low <= fvg.low;
      return c.high >= fvg.high;
    });
    return { ...fvg, filled: isFilled };
  });
}

// ── Order Blocks ──────────────────────────────────────────────────────────────
// Bullish OB: the last bearish candle before a strong bullish displacement
// Bearish OB: the last bullish candle before a strong bearish displacement
function findOrderBlocks(candles, atr) {
  const obs = [];
  const minDisplacement = atr * 1.5; // displacement must be at least 1.5× ATR
  for (let i = 2; i < candles.length - 1; i++) {
    const c0 = candles[i - 1]; // potential OB candle
    const c1 = candles[i];     // displacement candle

    // Bullish OB: c0 is bearish, c1 is strongly bullish displacement
    if (c0.close < c0.open && c1.close > c1.open) {
      const displacement = c1.close - c1.open;
      if (displacement >= minDisplacement) {
        obs.push({
          type: 'BULLISH',
          high: c0.high,
          low: c0.low,
          mid: (c0.high + c0.low) / 2,
          time: c0.time,
          idx: i - 1,
          mitigated: false,
        });
      }
    }

    // Bearish OB: c0 is bullish, c1 is strongly bearish displacement
    if (c0.close > c0.open && c1.close < c1.open) {
      const displacement = c0.open - c1.close;
      if (displacement >= minDisplacement) {
        obs.push({
          type: 'BEARISH',
          high: c0.high,
          low: c0.low,
          mid: (c0.high + c0.low) / 2,
          time: c0.time,
          idx: i - 1,
          mitigated: false,
        });
      }
    }
  }

  // Mark mitigated OBs (price traded back into the OB zone)
  return obs.map((ob) => {
    const afterCandles = candles.slice(ob.idx + 1);
    const mitigated = afterCandles.some((c) => {
      if (ob.type === 'BULLISH') return c.low <= ob.mid;
      return c.high >= ob.mid;
    });
    return { ...ob, mitigated };
  }).slice(-10); // keep last 10
}

// ── Liquidity Sweep Detection ─────────────────────────────────────────────────
// Equal highs = potential BSL; equal lows = potential SSL
// A sweep occurs when price wicks beyond these levels then closes back inside
function detectLiquiditySweep(candles, equalTolerance = 0.0002) {
  if (candles.length < 10) return { sweep: null, equal_highs: [], equal_lows: [] };

  const last20 = candles.slice(-20);
  const highs = last20.map((c) => c.high);
  const lows = last20.map((c) => c.low);
  const maxH = Math.max(...highs);
  const minL = Math.min(...lows);

  // Equal highs: within tolerance of the recent high
  const equalHighs = [];
  let prevH = null;
  for (const c of last20) {
    if (prevH !== null && Math.abs(c.high - prevH) / prevH < equalTolerance) {
      equalHighs.push(c.high);
    }
    prevH = c.high;
  }

  // Equal lows
  const equalLows = [];
  let prevL = null;
  for (const c of last20) {
    if (prevL !== null && Math.abs(c.low - prevL) / prevL < equalTolerance) {
      equalLows.push(c.low);
    }
    prevL = c.low;
  }

  // Check last 3 candles for a sweep-and-reject
  const recentCandles = candles.slice(-3);
  let sweep = null;

  for (const c of recentCandles) {
    // Bullish sweep: wick below recent low, closes above it (stop hunt on sell stops)
    if (c.low < minL && c.close > minL) {
      sweep = {
        direction: 'BULLISH', // swept sell-side, potential reversal up
        swept_level: minL,
        wick_low: c.low,
        close: c.close,
        label: 'Sell-Side Liquidity Sweep (SSL)',
        rejection: true,
      };
    }
    // Bearish sweep: wick above recent high, closes below it
    if (c.high > maxH && c.close < maxH) {
      sweep = {
        direction: 'BEARISH', // swept buy-side, potential reversal down
        swept_level: maxH,
        wick_high: c.high,
        close: c.close,
        label: 'Buy-Side Liquidity Sweep (BSL)',
        rejection: true,
      };
    }
  }

  return { sweep, equal_highs: equalHighs, equal_lows: equalLows };
}

// ── Displacement Candle Detection ─────────────────────────────────────────────
// A displacement candle is one whose body is >= 1.5× average body size and
// closes in the upper/lower 30% of its range (strong directional intent).
function detectDisplacementCandle(candles) {
  if (candles.length < 5) return null;
  const bodies = candles.slice(-10).map((c) => Math.abs(c.close - c.open));
  const avgBody = bodies.reduce((a, b) => a + b, 0) / bodies.length || 1;

  const last = candles[candles.length - 1];
  const body = Math.abs(last.close - last.open);
  const range = last.high - last.low || 0.0001;
  const isBullish = last.close > last.open;
  const closeRatio = isBullish
    ? (last.close - last.low) / range // how high in the range the close is
    : (last.high - last.close) / range;

  if (body >= avgBody * 1.5 && closeRatio >= 0.7) {
    return {
      direction: isBullish ? 'BULLISH' : 'BEARISH',
      body_size: body,
      range,
      close_ratio: closeRatio,
    };
  }
  return null;
}

// ── Candlestick Patterns ───────────────────────────────────────────────────────
function detectCandlePatterns(candles) {
  if (candles.length < 3) return [];
  const c0 = candles[candles.length - 1];
  const c1 = candles[candles.length - 2];
  const patterns = [];
  const range = c0.high - c0.low || 0.0001;
  const lowerWick = Math.min(c0.open, c0.close) - c0.low;
  const upperWick = c0.high - Math.max(c0.open, c0.close);

  // Bullish Engulfing
  if (c1.close < c1.open && c0.close > c0.open && c0.close > c1.open && c0.open < c1.close) {
    patterns.push({ name: 'Bullish Engulfing', direction: 'BULLISH', strength: 0.8 });
  }
  // Bearish Engulfing
  if (c1.close > c1.open && c0.close < c0.open && c0.close < c1.open && c0.open > c1.close) {
    patterns.push({ name: 'Bearish Engulfing', direction: 'BEARISH', strength: 0.8 });
  }
  // Bullish Pin Bar / Hammer
  if (lowerWick >= 0.6 * range && upperWick <= 0.25 * range) {
    patterns.push({ name: 'Bullish Pin Bar', direction: 'BULLISH', strength: 0.7 });
  }
  // Bearish Pin Bar / Shooting Star
  if (upperWick >= 0.6 * range && lowerWick <= 0.25 * range) {
    patterns.push({ name: 'Bearish Pin Bar', direction: 'BEARISH', strength: 0.7 });
  }
  // Doji (indecision)
  const body = Math.abs(c0.close - c0.open);
  if (body < range * 0.1 && range > 0) {
    patterns.push({ name: 'Doji (Indecision)', direction: 'NEUTRAL', strength: 0.3 });
  }
  return patterns;
}

// ── Previous Day High/Low ─────────────────────────────────────────────────────
function getPreviousDayLevels(candles) {
  if (candles.length < 24) return { pdh: null, pdl: null };
  // Assume H1 candles — last 24 are today, 24-48 are yesterday
  const yesterday = candles.slice(-48, -24);
  const pdh = Math.max(...yesterday.map((c) => c.high));
  const pdl = Math.min(...yesterday.map((c) => c.low));
  return { pdh, pdl };
}

// ── Asian Range (for H1 candles) ──────────────────────────────────────────────
function getAsianRange(candles) {
  // Asian session = roughly 00:00–09:00 UTC (H1 candles)
  const nowSec = Math.floor(Date.now() / 1000);
  const dayStart = nowSec - (nowSec % 86400); // midnight UTC
  const asianOpen = dayStart; // 00:00 UTC
  const asianClose = dayStart + 9 * 3600; // 09:00 UTC

  const asianCandles = candles.filter((c) => c.time >= asianOpen && c.time < asianClose);
  if (asianCandles.length === 0) return { asian_high: null, asian_low: null, asian_range: null };

  const asian_high = Math.max(...asianCandles.map((c) => c.high));
  const asian_low = Math.min(...asianCandles.map((c) => c.low));
  return { asian_high, asian_low, asian_range: asian_high - asian_low };
}

// ── Support / Resistance Zones ────────────────────────────────────────────────
function getSupportResistance(candles, lookback = 30) {
  const recent = candles.slice(-lookback);
  const allHighs = recent.map((c) => c.high).sort((a, b) => a - b);
  const allLows = recent.map((c) => c.low).sort((a, b) => a - b);

  const resistance = allHighs[allHighs.length - 1];
  const support = allLows[0];

  // Key mid-range level
  const midRange = (resistance + support) / 2;

  return { resistance, support, mid_range: midRange };
}

// ── Full Analysis for One Symbol ──────────────────────────────────────────────
/**
 * @param {Array} candles - Array of {time, open, high, low, close, volume}
 *   IMPORTANT: Pass closed candles only (exclude the live/forming candle).
 * @param {number} digits - Price decimal places
 * @returns {Object} Full technical analysis snapshot
 */
function analyzeCandles(candles, digits = 5) {
  if (!candles || candles.length < 20) {
    return { error: 'Insufficient candle data (need >= 20 closed candles)', valid: false };
  }

  // Use only closed candles (exclude last which may be forming)
  const closed = candles.slice(0, -1);
  const closes = closed.map((c) => c.close);
  const n = closed.length;

  // Indicators
  const ema20 = calcEMA(closes, 20);
  const ema50 = calcEMA(closes, 50);
  const ema200 = closes.length >= 200 ? calcEMA(closes, 200) : new Array(n).fill(null);
  const rsi14 = calcRSI(closes, 14);
  const atr14 = calcATR(closed, 14);

  const lastEMA20 = ema20[n - 1];
  const lastEMA50 = ema50[n - 1];
  const lastEMA200 = ema200[n - 1];
  const lastRSI = rsi14[n - 1];
  const lastATR = atr14[n - 1];
  const lastClose = closes[n - 1];
  const prevClose = closes[n - 2];

  if (lastATR === null || lastRSI === null) {
    return { error: 'Indicator computation failed (not enough data)', valid: false };
  }

  // Market structure
  const structure = analyzeMarketStructure(closed, 3);

  // FVGs (last 5 unfilled only)
  const allFVGs = findFVGs(closed);
  const activeFVGs = allFVGs.filter((f) => !f.filled).slice(-5);

  // Order blocks
  const orderBlocks = findOrderBlocks(closed, lastATR);

  // Liquidity
  const liquidity = detectLiquiditySweep(closed);

  // Displacement
  const displacement = detectDisplacementCandle(closed);

  // Candle patterns
  const patterns = detectCandlePatterns(closed);

  // Levels
  const srLevels = getSupportResistance(closed, 30);
  const { pdh, pdl } = getPreviousDayLevels(closed);
  const asianRange = getAsianRange(closed);

  // Trend bias summary
  const emaBias =
    lastEMA20 && lastEMA50
      ? lastEMA20 > lastEMA50
        ? lastEMA200 && lastClose > lastEMA200
          ? 'STRONG_BULL'
          : 'BULL'
        : lastEMA200 && lastClose < lastEMA200
        ? 'STRONG_BEAR'
        : 'BEAR'
      : 'NEUTRAL';

  const rsiBias = lastRSI >= 55 ? 'BULL' : lastRSI <= 45 ? 'BEAR' : 'NEUTRAL';
  const priceBias =
    lastClose > prevClose ? 'BULL' : lastClose < prevClose ? 'BEAR' : 'NEUTRAL';

  // Near FVG? (price within FVG zone)
  const currentPrice = lastClose;
  const nearBullFVG = activeFVGs.some(
    (fvg) => fvg.type === 'BULLISH' && currentPrice >= fvg.low && currentPrice <= fvg.high
  );
  const nearBearFVG = activeFVGs.some(
    (fvg) => fvg.type === 'BEARISH' && currentPrice >= fvg.low && currentPrice <= fvg.high
  );

  // Near OB?
  const nearBullOB = orderBlocks.some(
    (ob) => ob.type === 'BULLISH' && !ob.mitigated && currentPrice >= ob.low && currentPrice <= ob.high
  );
  const nearBearOB = orderBlocks.some(
    (ob) => ob.type === 'BEARISH' && !ob.mitigated && currentPrice >= ob.low && currentPrice <= ob.high
  );

  return {
    valid: true,
    last_close: Number(lastClose.toFixed(digits)),
    indicators: {
      ema20: lastEMA20 ? Number(lastEMA20.toFixed(digits)) : null,
      ema50: lastEMA50 ? Number(lastEMA50.toFixed(digits)) : null,
      ema200: lastEMA200 ? Number(lastEMA200.toFixed(digits)) : null,
      rsi14: lastRSI ? Number(lastRSI.toFixed(2)) : null,
      atr14: lastATR ? Number(lastATR.toFixed(digits)) : null,
    },
    bias: {
      ema: emaBias,
      rsi: rsiBias,
      price: priceBias,
      structure: structure.trend,
    },
    structure,
    fvgs: {
      all_count: allFVGs.length,
      active: activeFVGs,
      near_bull: nearBullFVG,
      near_bear: nearBearFVG,
    },
    order_blocks: {
      all: orderBlocks,
      near_bull: nearBullOB,
      near_bear: nearBearOB,
    },
    liquidity,
    displacement,
    patterns,
    levels: {
      ...srLevels,
      pdh,
      pdl,
      asian_high: asianRange.asian_high,
      asian_low: asianRange.asian_low,
      asian_range: asianRange.asian_range,
    },
  };
}

module.exports = {
  analyzeCandles,
  calcEMA,
  calcRSI,
  calcATR,
  findSwings,
  analyzeMarketStructure,
  findFVGs,
  findOrderBlocks,
  detectLiquiditySweep,
  detectDisplacementCandle,
  detectCandlePatterns,
  getPreviousDayLevels,
  getAsianRange,
  getSupportResistance,
};
