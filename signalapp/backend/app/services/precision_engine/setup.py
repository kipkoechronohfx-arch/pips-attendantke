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
    Break of Structure: price closes beyond the previous swing high/low.
    Returns dict with direction, level, label or None.
    """
    if len(candles) < 10:
        return None
    swing_high = max(c.high for c in candles[-10:-2])
    swing_low  = min(c.low  for c in candles[-10:-2])
    last = candles[-1]
    if last.close > swing_high:
        return {"direction": "BULLISH", "level": swing_high, "label": f"BOS BULLISH @ {swing_high:.5f}"}
    if last.close < swing_low:
        return {"direction": "BEARISH", "level": swing_low, "label": f"BOS BEARISH @ {swing_low:.5f}"}
    return None


def _detect_choch(candles: List[Candle]) -> Optional[Dict[str, Any]]:
    """
    Change of Character: a BOS in the opposite direction of the recent trend.
    We look at the last 20 candles to determine the prevailing structure.
    """
    if len(candles) < 25:
        return None
    window = candles[-25:]
    highs = [c.high for c in window[:-5]]
    lows  = [c.low  for c in window[:-5]]
    prev_high = max(highs)
    prev_low  = min(lows)
    last = candles[-1]
    # Prevailing bear → CHoCH is a bullish break
    if prev_low < min(c.low for c in candles[-15:-5]):
        if last.close > prev_high:
            return {"direction": "BULLISH", "level": prev_high, "label": f"CHoCH BULLISH @ {prev_high:.5f}"}
    # Prevailing bull → CHoCH is a bearish break
    if prev_high > max(c.high for c in candles[-15:-5]):
        if last.close < prev_low:
            return {"direction": "BEARISH", "level": prev_low, "label": f"CHoCH BEARISH @ {prev_low:.5f}"}
    return None


def _detect_liquidity_sweep(candles: List[Candle], atr: float) -> Optional[Dict[str, Any]]:
    """
    A candle that pierces a recent swing high/low with its wick but closes back
    inside the prior range — indicating a stop-raid and reversal.
    """
    if len(candles) < 15 or atr is None:
        return None
    prior = candles[-15:-3]
    swing_high = max(c.high for c in prior)
    swing_low  = min(c.low  for c in prior)
    sweep_candle = candles[-2]  # must be confirmed (not current)
    last = candles[-1]

    # Bullish sweep: wick above swing high, close back below
    if sweep_candle.high > swing_high and sweep_candle.close < swing_high:
        rejection = last.close < sweep_candle.high  # price rejecting
        return {
            "direction": "BEARISH",
            "swept_level": swing_high,
            "label": f"Liquidity Sweep Above {swing_high:.5f}",
            "rejection": rejection,
        }
    # Bearish sweep: wick below swing low, close back above
    if sweep_candle.low < swing_low and sweep_candle.close > swing_low:
        rejection = last.close > sweep_candle.low
        return {
            "direction": "BULLISH",
            "swept_level": swing_low,
            "label": f"Liquidity Sweep Below {swing_low:.5f}",
            "rejection": rejection,
        }
    return None


def _detect_displacement(candles: List[Candle], atr: float) -> Optional[Dict[str, Any]]:
    """
    Displacement: a candle with a body ≥ 1.5 × ATR, indicating institutional order flow.
    """
    if len(candles) < 3 or atr is None or atr <= 0:
        return None
    c = candles[-2]  # last confirmed closed candle
    body = abs(c.close - c.open)
    if body >= 1.5 * atr:
        direction = "BULLISH" if c.close > c.open else "BEARISH"
        return {"direction": direction, "body_size": body}
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
    setup_type: Optional[str] = None
    direction: Optional[str] = None
    ref_high: Optional[float] = None
    ref_low: Optional[float]  = None
    invalidation: Optional[float] = None

    # ── Score accumulated from detected elements ───────────────────────────────

    # BOS or CHoCH confirms structural flip  (+20 / +25)
    if choch and choch["direction"] != "NEUTRAL":
        score += 25
        direction = "BUY" if choch["direction"] == "BULLISH" else "SELL"
        setup_type = "CHOCH_RETEST"
    elif bos and bos["direction"] != "NEUTRAL":
        score += 20
        direction = "BUY" if bos["direction"] == "BULLISH" else "SELL"
        setup_type = "BOS_CONTINUATION"

    # Liquidity sweep with rejection (+20)
    if liq_sweep:
        score += 20
        if direction is None:
            direction = "BUY" if liq_sweep["direction"] == "BULLISH" else "SELL"
            setup_type = "LIQUIDITY_SWEEP"
        else:
            setup_type = "SWEEP_AND_" + (setup_type or "REVERSAL")

    # Displacement / order-flow impulse (+15)
    if displace:
        score += 15
        if direction is None and displace["direction"] != "NEUTRAL":
            direction = "BUY" if displace["direction"] == "BULLISH" else "SELL"
            setup_type = "DISPLACEMENT"

    # Active FVGs aligned with direction (+10 each, max 20)
    aligned_fvgs = [f for f in fvgs if
                    (direction == "BUY"  and f.direction == "BULLISH") or
                    (direction == "SELL" and f.direction == "BEARISH") or
                    direction is None]
    fvg_bonus = min(len(aligned_fvgs) * 10, 20)
    score += fvg_bonus

    # Order blocks aligned with direction (+10)
    aligned_obs = [o for o in obs if
                   (direction == "BUY"  and o.direction == "BULLISH") or
                   (direction == "SELL" and o.direction == "BEARISH")]
    if aligned_obs:
        score += 10

    # Candlestick pattern confirmation (+8)
    if direction == "BUY" and any("Bullish" in p or "Hammer" in p for p in patterns):
        score += 8
    elif direction == "SELL" and any("Bearish" in p or "Shooting Star" in p for p in patterns):
        score += 8

    # HTF alignment bonus (+10)
    htf_aligned = (
        (direction == "BUY"  and context.h4_bias == "BULLISH" and context.h1_bias == "BULLISH") or
        (direction == "SELL" and context.h4_bias == "BEARISH" and context.h1_bias == "BEARISH")
    )
    if htf_aligned:
        score += 10

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
        else:
            ref_high = round(context.levels.support + atr * 0.5, digits)
            ref_low  = context.levels.support
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
        else:
            ref_low  = round(context.levels.resistance - atr * 0.5, digits)
            ref_high = context.levels.resistance
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
        rejection_codes=rejection_codes,
        rejection_messages=rejection_messages,
    )
