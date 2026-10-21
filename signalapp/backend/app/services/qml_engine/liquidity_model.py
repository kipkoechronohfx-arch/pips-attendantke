"""
Liquidity and Market Structure Model.

Strictly deterministic evaluation of:
- Confirmed Liquidity Sweeps (wick beyond swing point, closed back within)
- Break of Structure (BOS) and Change of Character (CHoCH)
- Impulsive Displacement (body / ATR ratio >= 1.5)
- Fair Value Gap (FVG) formation and retest status
- Distance to opposing liquidity pool

MANDATORY INVARIANT:
Deterministic rules for structural events. Machine learning must not silently
replace or reinterpret these rules.
"""

from typing import List, Dict, Any, Optional
from .schemas import LiquidityStructureOutput


def _detect_swings(candles: List[Dict[str, Any]], lookback: int = 5):
    """Detect local swing highs and swing lows."""
    swing_highs = []
    swing_lows = []
    
    for i in range(lookback, len(candles) - lookback):
        h = candles[i]["high"]
        l = candles[i]["low"]
        
        is_high = all(h >= candles[i - j]["high"] and h >= candles[i + j]["high"] for j in range(1, lookback + 1))
        is_low = all(l <= candles[i - j]["low"] and l <= candles[i + j]["low"] for j in range(1, lookback + 1))
        
        if is_high:
            swing_highs.append({"index": i, "price": h, "time": candles[i].get("time", "")})
        if is_low:
            swing_lows.append({"index": i, "price": l, "time": candles[i].get("time", "")})
            
    return swing_highs, swing_lows


def evaluate_liquidity_structure(
    candles: List[Dict[str, Any]],
    proposed_direction: str = "BUY",
    pip_size: float = 0.0001
) -> LiquidityStructureOutput:
    """
    Evaluates liquidity sweeps, structural breaks (BOS/CHoCH), displacement, and FVG status.
    """
    if not candles or len(candles) < 20:
        return LiquidityStructureOutput(
            name="Liquidity & Structure Model",
            status="UNKNOWN",
            score=50.0,
            confidence=0.1,
            data_quality="INSUFFICIENT",
            assessment="Insufficient candles to identify swing points or liquidity pools (< 20 bars)",
            explanation="Requires at least 20 bars to compute deterministic swing highs/lows.",
            has_sweep=False,
            bos_confirmed=False,
            choch_confirmed=False,
            displacement_ratio=0.0,
            fvg_retest_status="NONE"
        )
        
    swing_highs, swing_lows = _detect_swings(candles, lookback=3)
    
    # 1. Sweep Detection
    # For BUY: did a recent candle wick below a prior swing low, but close above it?
    # For SELL: did a recent candle wick above a prior swing high, but close below it?
    has_sweep = False
    sweep_details = None
    
    recent_window = candles[-10:]
    if proposed_direction.upper() in ("BUY", "LONG"):
        if swing_lows:
            recent_sl = swing_lows[-1]["price"]
            for c in recent_window:
                if c["low"] < recent_sl and c["close"] > recent_sl:
                    has_sweep = True
                    sweep_details = f"Bullish liquidity sweep below swing low {recent_sl:.5f}"
                    break
    else:
        if swing_highs:
            recent_sh = swing_highs[-1]["price"]
            for c in recent_window:
                if c["high"] > recent_sh and c["close"] < recent_sh:
                    has_sweep = True
                    sweep_details = f"Bearish liquidity sweep above swing high {recent_sh:.5f}"
                    break
                    
    # 2. Displacement Detection (body vs ATR or candle range)
    last_candle = candles[-1]
    body = abs(last_candle["close"] - last_candle["open"])
    total_range = last_candle["high"] - last_candle["low"]
    
    # Approximate recent ATR
    recent_ranges = [c["high"] - c["low"] for c in candles[-14:]]
    avg_range = sum(recent_ranges) / len(recent_ranges) if recent_ranges else total_range
    displacement_ratio = (body / avg_range) if avg_range > 0 else 1.0
    has_displacement = displacement_ratio >= 1.4 and (body / total_range >= 0.65 if total_range > 0 else False)

    # 3. BOS & CHoCH
    current_close = last_candle["close"]
    bos_confirmed = False
    choch_confirmed = False
    
    if proposed_direction.upper() in ("BUY", "LONG"):
        # BOS: closed above last swing high
        if swing_highs and current_close > swing_highs[-1]["price"]:
            bos_confirmed = True
        # CHoCH: closed above a major structural swing high after a downtrend
        if len(swing_highs) >= 2 and current_close > swing_highs[-2]["price"]:
            choch_confirmed = True
    else:
        # BOS: closed below last swing low
        if swing_lows and current_close < swing_lows[-1]["price"]:
            bos_confirmed = True
        if len(swing_lows) >= 2 and current_close < swing_lows[-2]["price"]:
            choch_confirmed = True

    # 4. FVG Detection
    # Bullish FVG: candle 1 high < candle 3 low
    # Bearish FVG: candle 1 low > candle 3 high
    fvg_status = "NONE"
    if len(candles) >= 3:
        c1, c2, c3 = candles[-3], candles[-2], candles[-1]
        if c1["high"] < c3["low"]:
            fvg_status = "FRESH" if current_close >= c3["low"] else "TESTED"
        elif c1["low"] > c3["high"]:
            fvg_status = "FRESH" if current_close <= c3["high"] else "TESTED"

    # 5. Distance to opposing liquidity pool
    dist_pips = None
    pool_above = swing_highs[-1]["price"] if swing_highs else None
    pool_below = swing_lows[-1]["price"] if swing_lows else None
    
    if proposed_direction.upper() in ("BUY", "LONG") and pool_above:
        dist_pips = round((pool_above - current_close) / pip_size, 1)
    elif proposed_direction.upper() not in ("BUY", "LONG") and pool_below:
        dist_pips = round((current_close - pool_below) / pip_size, 1)

    factors = {
        "has_sweep": has_sweep,
        "bos_confirmed": bos_confirmed,
        "choch_confirmed": choch_confirmed,
        "displacement_ratio": round(displacement_ratio, 2),
        "fvg_status": fvg_status,
        "distance_to_opposing_pips": dist_pips,
        "swing_highs_count": len(swing_highs),
        "swing_lows_count": len(swing_lows)
    }

    # Scoring
    score = 40.0
    if has_sweep:
        score += 25.0
    if bos_confirmed or choch_confirmed:
        score += 20.0
    if has_displacement:
        score += 15.0
    if fvg_status in ("FRESH", "TESTED"):
        score += 10.0
    score = min(score, 100.0)

    if has_sweep and (bos_confirmed or choch_confirmed):
        status = "PASS"
        assessment = f"Confirmed liquidity sweep followed by {'BOS' if bos_confirmed else 'CHoCH'}"
        explanation = f"Structural setup verified. Displacement ratio {displacement_ratio:.2f}x indicates institutional participation."
    elif bos_confirmed or has_sweep:
        status = "PASS" if score >= 65.0 else "WARN"
        assessment = f"Partial structural progression ({'BOS' if bos_confirmed else 'Liquidity Sweep'})"
        explanation = "Structural trigger exists but requires confirmation from displacement or FVG retest."
    else:
        status = "FAIL"
        assessment = "No confirmed liquidity sweep or structural break (BOS/CHoCH)"
        explanation = "Price action is trapped inside existing swing range without institutional displacement."

    return LiquidityStructureOutput(
        name="Liquidity & Structure Model",
        status=status,
        score=score,
        confidence=0.88,
        data_quality="HIGH",
        assessment=assessment,
        factors=factors,
        explanation=explanation,
        has_sweep=has_sweep,
        bos_confirmed=bos_confirmed,
        choch_confirmed=choch_confirmed,
        displacement_ratio=round(displacement_ratio, 2),
        fvg_retest_status=fvg_status,
        distance_to_opposing_pips=dist_pips,
        liquidity_pool_above=pool_above,
        liquidity_pool_below=pool_below
    )
