"""
Precision Entry Engine — Stage B: Setup Detection.

Detects configurable smart-money patterns from confirmed closed candles.
Records origin, direction, formation time, reference levels, and
invalidation conditions. Does NOT authorise entry.

All analysis uses the candles[:-1] slice (closed candles only).
The currently-forming candle is never used for structure decisions.
"""

from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta

from app.schemas.market import Candle
from app.services.indicators.technical import TechnicalIndicators
from app.services.precision_engine.config import get_spec, PROFILE_MAP
from app.services.precision_engine.context import ContextResult


# ── Data structures ────────────────────────────────────────────────────────────

@dataclass
class FVG:
    direction: str       # BULLISH | BEARISH
    high: float
    low: float
    mid: float
    time: int            # Unix timestamp of the forming candle
    filled: bool = False


@dataclass
class OrderBlock:
    direction: str       # BULLISH | BEARISH
    high: float
    low: float
    mid: float
    time: int
    mitigated: bool = False


@dataclass
class SetupResult:
    detected: bool
    symbol: str
    direction: Optional[str]         # BUY | SELL
    setup_type: Optional[str]        # e.g. LIQUIDITY_SWEEP, BOS_RETEST, FVG_RETEST …
    origin_time: Optional[int]       # unix timestamp of setup candle
    expiry_time: Optional[datetime]
    reference_high: Optional[float]  # zone top
    reference_low: Optional[float]   # zone bottom
    invalidation_level: Optional[float]  # price that kills the setup
    fvgs: List[FVG] = field(default_factory=list)
    order_blocks: List[OrderBlock] = field(default_factory=list)
    has_bos: bool = False
    has_choch: bool = False
    has_liquidity_sweep: bool = False
    has_displacement: bool = False
    setup_score: int = 0
    confluences: List[str] = field(default_factory=list)
    rejection_codes: List[str] = field(default_factory=list)
    rejection_messages: List[str] = field(default_factory=list)


# ── Pattern detection helpers ──────────────────────────────────────────────────

def _detect_fvgs(candles: List[Candle], atr: float) -> List[FVG]:
    """
    Fair Value Gaps: three-candle pattern where candle[i-1].high < candle[i+1].low
    (bullish) or candle[i-1].low > candle[i+1].high (bearish).
    Minimum FVG body = 0.3 × ATR to filter noise.
    Only candles[:-1] are passed here.
    """
    fvgs: List[FVG] = []
    min_size = atr * 0.3 if atr else 0
    for i in range(1, len(candles) - 1):
        a, b, c = candles[i - 1], candles[i], candles[i + 1]
        # Bullish FVG
        if c.low > a.high and (c.low - a.high) >= min_size:
            fvgs.append(FVG(
                direction="BULLISH",
                high=c.low, low=a.high, mid=(c.low + a.high) / 2,
                time=b.time
            ))
        # Bearish FVG
        elif a.low > c.high and (a.low - c.high) >= min_size:
            fvgs.append(FVG(
                direction="BEARISH",
                high=a.low, low=c.high, mid=(a.low + c.high) / 2,
                time=b.time
            ))
    return fvgs[-10:]  # keep the 10 most recent


def _detect_order_blocks(candles: List[Candle], atr: float) -> List[OrderBlock]:
    """
    Order Blocks: last bearish candle before a strong bullish impulse (bullish OB)
    or last bullish candle before a strong bearish impulse (bearish OB).
    Impulse is defined as a body ≥ 1.5 × ATR.
    """
    obs: List[OrderBlock] = []
    if atr is None or atr <= 0 or len(candles) < 2:
        return obs
    for i in range(len(candles) - 1):
        body = abs(candles[i + 1].close - candles[i + 1].open)
        if body < 1.5 * atr:
            continue
        is_bull_impulse = candles[i + 1].close > candles[i + 1].open
        prev = candles[i]
        if is_bull_impulse and prev.close < prev.open:   # bearish candle before bull move
            obs.append(OrderBlock(
                direction="BULLISH",
                high=prev.high, low=prev.low, mid=(prev.high + prev.low) / 2,
                time=prev.time
            ))
        elif not is_bull_impulse and prev.close > prev.open:  # bullish candle before bear move
            obs.append(OrderBlock(
                direction="BEARISH",
                high=prev.high, low=prev.low, mid=(prev.high + prev.low) / 2,
                time=prev.time
            ))
    return obs[-8:]


def _detect_bos(candles: List[Candle]) -> Optional[Dict[str, Any]]:
    """
    Break of Structure: price closes beyond the previous swing high/low
    within the recent 6 candles (setup discovery window).
    """
    if len(candles) < 15:
        return None
    for idx in range(-1, -7, -1):
        c = candles[idx]
        prior = candles[-22:idx] if len(candles) >= 22 else candles[:idx]
        if not prior:
            continue
        swing_high = max(x.high for x in prior)
        swing_low  = min(x.low for x in prior)
        if c.close > swing_high:
            return {"direction": "BULLISH", "level": swing_high, "label": f"BOS BULLISH @ {swing_high:.5f}", "bars_ago": abs(idx)}
        elif c.close < swing_low:
            return {"direction": "BEARISH", "level": swing_low, "label": f"BOS BEARISH @ {swing_low:.5f}", "bars_ago": abs(idx)}
    return None


def _detect_choch(candles: List[Candle]) -> Optional[Dict[str, Any]]:
    """
    Change of Character: a structural break in the opposite direction of the prevailing trend
    within the recent 6 candles.
    """
    if len(candles) < 25:
        return None
    for idx in range(-1, -7, -1):
        window = candles[-30:idx] if len(candles) >= 30 else candles[:idx]
        if len(window) < 15:
            continue
        highs = [c.high for c in window[:-5]]
        lows  = [c.low  for c in window[:-5]]
        prev_high = max(highs)
        prev_low  = min(lows)
        c = candles[idx]
        # Prevailing bear -> CHoCH is a bullish break
        if prev_low < min(x.low for x in window[-15:-5]):
            if c.close > prev_high:
                return {"direction": "BULLISH", "level": prev_high, "label": f"CHoCH BULLISH @ {prev_high:.5f}", "bars_ago": abs(idx)}
        # Prevailing bull -> CHoCH is a bearish break
        if prev_high > max(x.high for x in window[-15:-5]):
            if c.close < prev_low:
                return {"direction": "BEARISH", "level": prev_low, "label": f"CHoCH BEARISH @ {prev_low:.5f}", "bars_ago": abs(idx)}
    return None


def _detect_liquidity_sweep(candles: List[Candle], atr: float) -> Optional[Dict[str, Any]]:
    """
    Liquidity sweep: a candle in the recent 6 bars that pierces a swing high/low
    with its wick but closes back inside the prior range.
    """
    if len(candles) < 18 or atr is None:
        return None
    for idx in range(-1, -6, -1):
        sweep_candle = candles[idx]
        prior = candles[-22:idx] if len(candles) >= 22 else candles[:idx]
        if not prior:
            continue
        swing_high = max(c.high for c in prior)
        swing_low  = min(c.low  for c in prior)
        last = candles[-1]

        # Bearish sweep: wick above swing high, close back below
        if sweep_candle.high > swing_high and sweep_candle.close < swing_high:
            rejection = last.close < sweep_candle.high
            return {
                "direction": "BEARISH",
                "swept_level": swing_high,
                "label": f"Liquidity Sweep Above {swing_high:.5f}",
                "rejection": rejection,
                "bars_ago": abs(idx)
            }
        # Bullish sweep: wick below swing low, close back above
        if sweep_candle.low < swing_low and sweep_candle.close > swing_low:
            rejection = last.close > sweep_candle.low
            return {
                "direction": "BULLISH",
                "swept_level": swing_low,
                "label": f"Liquidity Sweep Below {swing_low:.5f}",
                "rejection": rejection,
                "bars_ago": abs(idx)
            }
    return None


def _detect_displacement(candles: List[Candle], atr: float) -> Optional[Dict[str, Any]]:
    """
    Displacement: an institutional order-flow impulse candle with body >= 1.2 * ATR
    within the last 5 closed candles.
    """
    if len(candles) < 5 or atr is None or atr <= 0:
        return None
    for idx in range(-1, -6, -1):
        c = candles[idx]
        body = abs(c.close - c.open)
        if body >= 1.2 * atr:
            direction = "BULLISH" if c.close > c.open else "BEARISH"
            return {"direction": direction, "body_size": body, "bars_ago": abs(idx)}
    return None


# ── Expiry calculation ─────────────────────────────────────────────────────────

TIMEFRAME_MINUTES = {
    "M5": 5, "M15": 15, "M30": 30,
    "H1": 60, "H4": 240, "D1": 1440,
}

def _expiry(timeframe: str, bars: int) -> datetime:
    minutes = TIMEFRAME_MINUTES.get(timeframe, 60)
    return datetime.now(timezone.utc) + timedelta(minutes=minutes * bars)


# ── Main Stage B function ──────────────────────────────────────────────────────

def detect_setup(
    context: ContextResult,
    candles: List[Candle],
) -> SetupResult:
    """
    Stage B — Setup Detection.

    Examines closed candles for one or more qualifying patterns.
    Assigns a setup score per detected pattern. Does NOT authorise entry.
    Returns a SetupResult; detected=True only if a pattern qualifies.
    """
    rejection_codes: List[str] = []
    rejection_messages: List[str] = []

    if not context.passed:
        return SetupResult(
            detected=False,
            symbol=context.symbol,
            direction=None,
            setup_type=None,
            origin_time=None,
            expiry_time=None,
            reference_high=None,
            reference_low=None,
            invalidation_level=None,
            rejection_codes=["CONTEXT_FAILED"],
            rejection_messages=["Stage A context validation did not pass."],
        )

    # Use only closed candles (exclude the potentially open last candle)
    closed = candles[:-1]
    atr = context.atr14 or 0.001

    spec = get_spec(context.symbol)
    digits = spec["digits"]

    # ── Detect all pattern types ───────────────────────────────────────────────
    fvgs       = _detect_fvgs(closed, atr)
    obs        = _detect_order_blocks(closed, atr)
    bos        = _detect_bos(closed)
    choch      = _detect_choch(closed)
    liq_sweep  = _detect_liquidity_sweep(closed, atr)
    displace   = _detect_displacement(closed, atr)
    patterns   = TechnicalIndicators.detect_candlestick_patterns(closed)

    score = 0
    confluences: List[str] = []
    setup_type: Optional[str] = None
    direction: Optional[str] = None
    ref_high: Optional[float] = None
    ref_low: Optional[float]  = None
    invalidation: Optional[float] = None

    # ── 1. Structural Confluences (SMC / ICT) ──────────────────────────────────
    if choch and choch.get("direction") != "NEUTRAL":
        score += 25
        direction = "BUY" if choch["direction"] == "BULLISH" else "SELL"
        setup_type = "CHOCH_RETEST"
        confluences.append(f"CHoCH Flip ({choch['direction']})")
    elif bos and bos.get("direction") != "NEUTRAL":
        score += 20
        direction = "BUY" if bos["direction"] == "BULLISH" else "SELL"
        setup_type = "BOS_CONTINUATION"
        confluences.append(f"BOS Structure Break ({bos['direction']})")

    if liq_sweep:
        score += 20
        confluences.append(f"Liquidity Sweep ({liq_sweep['direction']})")
        if direction is None:
            direction = "BUY" if liq_sweep["direction"] == "BULLISH" else "SELL"
            setup_type = "LIQUIDITY_SWEEP"
        else:
            setup_type = "SWEEP_AND_" + (setup_type or "REVERSAL")

    if displace:
        score += 15
        confluences.append(f"Displacement Impulse ({displace['direction']})")
        if direction is None and displace.get("direction") != "NEUTRAL":
            direction = "BUY" if displace["direction"] == "BULLISH" else "SELL"
            setup_type = "DISPLACEMENT"

    # If direction still not set, evaluate multi-timeframe and trend alignment
    if direction is None:
        if context.h1_bias in ("BULLISH", "BEARISH"):
            direction = "BUY" if context.h1_bias == "BULLISH" else "SELL"
            setup_type = "TREND_CONTINUATION"
        elif context.h4_bias in ("BULLISH", "BEARISH"):
            direction = "BUY" if context.h4_bias == "BULLISH" else "SELL"
            setup_type = "HTF_FLOW"

    # Filter FVGs and OBs aligned with direction
    aligned_fvgs = [f for f in fvgs if
                    (direction == "BUY" and f.direction == "BULLISH") or
                    (direction == "SELL" and f.direction == "BEARISH")]
    fvg_bonus = min(len(aligned_fvgs) * 10, 20)
    if fvg_bonus > 0:
        score += fvg_bonus
        confluences.append(f"{len(aligned_fvgs)} Aligned FVG(s)")

    aligned_obs = [o for o in obs if
                   (direction == "BUY" and o.direction == "BULLISH") or
                   (direction == "SELL" and o.direction == "BEARISH")]
    if aligned_obs:
        score += 10
        confluences.append(f"{len(aligned_obs)} Order Block(s)")

    # ── 2. Quantitative Technical Indicator Confluences ───────────────────────
    closes = [c.close for c in closed]
    curr_price = closed[-1].close if closed else 0.0

    # Trend Alignment (EMA 20 vs 50)
    ema20 = TechnicalIndicators.ema(closes, 20)
    ema50 = TechnicalIndicators.ema(closes, 50)
    if ema20 and ema50 and ema20[-1] is not None and ema50[-1] is not None:
        e20, e50 = ema20[-1], ema50[-1]
        if (direction == "BUY" and e20 > e50) or (direction == "SELL" and e20 < e50):
            score += 10
            confluences.append("EMA 20/50 Trend Cross")

    # Macro 200 EMA Filter
    ema200 = TechnicalIndicators.ema(closes, 200) if len(closes) >= 200 else [None] * len(closes)
    if ema200 and ema200[-1] is not None:
        e200 = ema200[-1]
        if (direction == "BUY" and curr_price > e200) or (direction == "SELL" and curr_price < e200):
            score += 8
            confluences.append("200 EMA Macro Alignment")

    # RSI Momentum Confirmation
    rsi_vals = TechnicalIndicators.rsi(closes, 14)
    if rsi_vals and rsi_vals[-1] is not None:
        r_val = rsi_vals[-1]
        if direction == "BUY" and 40.0 <= r_val <= 70.0:
            score += 8
            confluences.append(f"RSI Bullish Momentum ({r_val:.1f})")
        elif direction == "SELL" and 30.0 <= r_val <= 60.0:
            score += 8
            confluences.append(f"RSI Bearish Momentum ({r_val:.1f})")

    # MACD Histogram Direction
    macd_data = TechnicalIndicators.macd(closes, 12, 26, 9)
    if macd_data and macd_data.get("histogram") and len(macd_data["histogram"]) >= 2:
        m_curr = macd_data["histogram"][-1]
        m_prev = macd_data["histogram"][-2]
        if direction == "BUY" and m_curr is not None and (m_curr > 0 or (m_prev is not None and m_curr > m_prev)):
            score += 7
            confluences.append("MACD Bullish Histogram")
        elif direction == "SELL" and m_curr is not None and (m_curr < 0 or (m_prev is not None and m_curr < m_prev)):
            score += 7
            confluences.append("MACD Bearish Histogram")

    # Candlestick Confirmation
    if direction == "BUY" and any("Bullish" in p or "Hammer" in p for p in patterns):
        score += 8
        matched_pa = [p for p in patterns if "Bullish" in p or "Hammer" in p]
        confluences.append(f"Price Action: {', '.join(matched_pa[:2])}")
    elif direction == "SELL" and any("Bearish" in p or "Shooting Star" in p for p in patterns):
        score += 8
        matched_pa = [p for p in patterns if "Bearish" in p or "Shooting Star" in p]
        confluences.append(f"Price Action: {', '.join(matched_pa[:2])}")

    # HTF Multi-Timeframe Alignment
    htf_aligned = (
        (direction == "BUY"  and context.h4_bias == "BULLISH" and context.h1_bias == "BULLISH") or
        (direction == "SELL" and context.h4_bias == "BEARISH" and context.h1_bias == "BEARISH")
    )
    if htf_aligned:
        score += 10
        confluences.append("H4/H1 Multi-Timeframe Alignment")

    # Structural S/R Defense
    if context.levels:
        if direction == "BUY" and context.levels.support and abs(curr_price - context.levels.support) <= (atr * 2.5):
            score += 8
            confluences.append(f"Support Defense ({context.levels.support:.{digits}f})")
        elif direction == "SELL" and context.levels.resistance and abs(context.levels.resistance - curr_price) <= (atr * 2.5):
            score += 8
            confluences.append(f"Resistance Defense ({context.levels.resistance:.{digits}f})")

    # ── Determine entry reference zone from best available source ──────────────
    profile = PROFILE_MAP.get(context.active_profile_id or "", None)
    expiry_bars = (profile or {}).get("setup_expiration_bars", 10)

    if direction == "BUY":
        if aligned_fvgs:
            best_fvg = aligned_fvgs[-1]
            ref_high = best_fvg.high
            ref_low  = best_fvg.low
        elif aligned_obs:
            best_ob = aligned_obs[-1]
            ref_high = best_ob.high
            ref_low  = best_ob.low
        elif context.levels and context.levels.support:
            ref_high = round(context.levels.support + atr * 0.5, digits)
            ref_low  = context.levels.support
        else:
            ref_high = round(curr_price + atr * 0.25, digits)
            ref_low  = round(curr_price - atr * 0.25, digits)
        invalidation = round(ref_low - atr, digits)

    elif direction == "SELL":
        if aligned_fvgs:
            best_fvg = aligned_fvgs[-1]
            ref_high = best_fvg.high
            ref_low  = best_fvg.low
        elif aligned_obs:
            best_ob = aligned_obs[-1]
            ref_high = best_ob.high
            ref_low  = best_ob.low
        elif context.levels and context.levels.resistance:
            ref_low  = round(context.levels.resistance - atr * 0.5, digits)
            ref_high = context.levels.resistance
        else:
            ref_high = round(curr_price + atr * 0.25, digits)
            ref_low  = round(curr_price - atr * 0.25, digits)
        invalidation = round(ref_high + atr, digits)

    # ── Minimum score threshold ────────────────────────────────────────────────
    min_score = (profile or {}).get("min_confluence_score", 60)
    if score < min_score:
        rejection_codes.append("INSUFFICIENT_SETUP_SCORE")
        rejection_messages.append(
            f"Setup score {score} is below the profile minimum of {min_score}. "
            "No qualifying pattern combination detected."
        )

    if direction is None:
        rejection_codes.append("NO_DIRECTION")
        rejection_messages.append("No directional pattern could be determined from closed candles.")

    detected = (len(rejection_codes) == 0 and direction is not None)
    origin_time = closed[-1].time if closed else None

    return SetupResult(
        detected=detected,
        symbol=context.symbol,
        direction=direction,
        setup_type=setup_type or "MULTI_CONFLUENCE",
        origin_time=origin_time,
        expiry_time=_expiry(context.timeframe, expiry_bars),
        reference_high=ref_high,
        reference_low=ref_low,
        invalidation_level=invalidation,
        fvgs=fvgs,
        order_blocks=obs,
        has_bos=bos is not None,
        has_choch=choch is not None,
        has_liquidity_sweep=liq_sweep is not None,
        has_displacement=displace is not None,
        setup_score=score,
        confluences=confluences,
        rejection_codes=rejection_codes,
        rejection_messages=rejection_messages,
    )
