"""
Market Regime Classification Model.

Classifies market state into:
- TRENDING: Strong directional movement (high ADX proxy, clear swing structure).
- RANGING: Low directional movement, price oscillating between bounded swing highs/lows.
- BREAKOUT: Range expansion ratio > 1.8x historical median ATR, high displacement.
- HIGH_VOLATILITY: Volatility percentile > 85th percentile, wild ATR spikes.
- LOW_LIQUIDITY: Abnormally tight ATR (< 15th percentile) or low volume.
- UNKNOWN: Insufficient data or contradictory metrics. Never invent certainty.
"""

from typing import List, Dict, Any, Optional
import math
from .schemas import RegimeModelOutput


def _calculate_atr(candles: List[Dict[str, Any]], period: int = 14) -> List[float]:
    """Calculate Average True Range series."""
    if len(candles) < 2:
        return []
    
    tr_list = []
    for i in range(1, len(candles)):
        c_prev = candles[i - 1]["close"]
        h_curr = candles[i]["high"]
        l_curr = candles[i]["low"]
        tr = max(h_curr - l_curr, abs(h_curr - c_prev), abs(l_curr - c_prev))
        tr_list.append(tr)
    
    if len(tr_list) < period:
        return [sum(tr_list) / max(len(tr_list), 1)]
    
    # Simple rolling ATR
    atrs = []
    curr_atr = sum(tr_list[:period]) / period
    atrs.append(curr_atr)
    for i in range(period, len(tr_list)):
        curr_atr = (curr_atr * (period - 1) + tr_list[i]) / period
        atrs.append(curr_atr)
    return atrs


def _calculate_directional_index(candles: List[Dict[str, Any]], period: int = 14) -> float:
    """Calculate Directional Movement (ADX proxy) 0.0 - 100.0."""
    if len(candles) < period + 1:
        return 20.0
    
    plus_dm_sum = 0.0
    minus_dm_sum = 0.0
    tr_sum = 0.0
    
    for i in range(len(candles) - period, len(candles)):
        h_diff = candles[i]["high"] - candles[i - 1]["high"]
        l_diff = candles[i - 1]["low"] - candles[i]["low"]
        
        plus_dm = h_diff if (h_diff > l_diff and h_diff > 0) else 0.0
        minus_dm = l_diff if (l_diff > h_diff and l_diff > 0) else 0.0
        
        c_prev = candles[i - 1]["close"]
        tr = max(candles[i]["high"] - candles[i]["low"],
                 abs(candles[i]["high"] - c_prev),
                 abs(candles[i]["low"] - c_prev))
        
        plus_dm_sum += plus_dm
        minus_dm_sum += minus_dm
        tr_sum += tr
    
    if tr_sum <= 0:
        return 20.0
    
    plus_di = (plus_dm_sum / tr_sum) * 100.0
    minus_di = (minus_dm_sum / tr_sum) * 100.0
    di_sum = plus_di + minus_di
    if di_sum == 0:
        return 0.0
    dx = abs(plus_di - minus_di) / di_sum * 100.0
    return dx


def evaluate_market_regime(
    candles: List[Dict[str, Any]],
    symbol: str = "UNKNOWN",
    timeframe: str = "M15"
) -> RegimeModelOutput:
    """
    Evaluates market regime using reproducible quantitative features.
    
    Returns structured RegimeModelOutput.
    """
    # 1. Guard against insufficient data
    if not candles or len(candles) < 28:
        return RegimeModelOutput(
            name="Market Regime Model",
            status="UNKNOWN",
            score=50.0,
            confidence=0.1,
            data_quality="INSUFFICIENT",
            assessment="Insufficient historical candles to reliably classify market regime (< 28 bars)",
            explanation="Requires at least 28 bars for ATR median and directional movement calculation. Returning UNKNOWN rather than guessing.",
            regime="UNKNOWN"
        )
    
    # 2. Check candle schema integrity
    required_keys = {"open", "high", "low", "close"}
    if not all(required_keys.issubset(c.keys()) for c in candles[-10:]):
        return RegimeModelOutput(
            name="Market Regime Model",
            status="UNKNOWN",
            score=50.0,
            confidence=0.1,
            data_quality="DEGRADED",
            assessment="Corrupted or incomplete OHLC candle structure",
            explanation="Candles missing required open/high/low/close keys.",
            regime="UNKNOWN"
        )

    # 3. ATR and Volatility Percentile
    atr_series = _calculate_atr(candles, period=14)
    if not atr_series:
        return RegimeModelOutput(
            name="Market Regime Model",
            status="UNKNOWN",
            score=50.0,
            confidence=0.1,
            data_quality="DEGRADED",
            assessment="Failed to compute ATR series",
            explanation="ATR calculation returned empty array.",
            regime="UNKNOWN"
        )
    
    current_atr = atr_series[-1]
    sorted_atrs = sorted(atr_series)
    median_atr = sorted_atrs[len(sorted_atrs) // 2]
    
    # Range expansion ratio
    expansion_ratio = current_atr / median_atr if median_atr > 0 else 1.0
    
    # Percentile rank of current ATR
    rank = sum(1 for a in sorted_atrs if a <= current_atr)
    vol_percentile = rank / len(sorted_atrs)
    
    # 4. Directional Movement (ADX proxy)
    adx_proxy = _calculate_directional_index(candles, period=14)
    
    # 5. Swing Structure / Trend Strength
    recent_closes = [c["close"] for c in candles[-20:]]
    net_movement = recent_closes[-1] - recent_closes[0]
    total_travel = sum(abs(recent_closes[i] - recent_closes[i - 1]) for i in range(1, len(recent_closes)))
    trend_efficiency = abs(net_movement) / total_travel if total_travel > 0 else 0.0
    
    factors = {
        "current_atr": round(current_atr, 5),
        "median_atr": round(median_atr, 5),
        "range_expansion_ratio": round(expansion_ratio, 2),
        "volatility_percentile": round(vol_percentile, 2),
        "adx_proxy": round(adx_proxy, 1),
        "trend_efficiency": round(trend_efficiency, 2)
    }
    
    # 6. Regime Classification Logic
    # Priority 1: High Volatility Spike
    if vol_percentile >= 0.88 or expansion_ratio >= 2.2:
        regime = "HIGH_VOLATILITY"
        status = "WARN"
        score = 65.0
        confidence = 0.85
        assessment = f"Extreme volatility expansion ({expansion_ratio:.2f}x median ATR, {int(vol_percentile*100)}th percentile)"
        explanation = "Wide spread risk and erratic slippage expected. Trade sizing should be reduced."
    
    # Priority 2: Low Liquidity
    elif vol_percentile <= 0.15 or current_atr == 0:
        regime = "LOW_LIQUIDITY"
        status = "WARN"
        score = 40.0
        confidence = 0.80
        assessment = f"Subdued market volatility ({int(vol_percentile*100)}th percentile)"
        explanation = "Compressed range; higher likelihood of fakeouts and choppy sideways action."
        
    # Priority 3: Breakout
    elif expansion_ratio >= 1.6 and adx_proxy >= 25.0 and trend_efficiency >= 0.45:
        regime = "BREAKOUT"
        status = "PASS"
        score = 88.0
        confidence = 0.85
        assessment = f"Momentum breakout confirmed with range expansion {expansion_ratio:.2f}x"
        explanation = "Impulsive move clearing recent ranges with elevated directional momentum."
        
    # Priority 4: Trending
    elif (adx_proxy >= 26.0 or trend_efficiency >= 0.50) and expansion_ratio >= 0.85:
        regime = "TRENDING"
        status = "PASS"
        score = 85.0
        confidence = 0.90
        bias = "BULLISH" if net_movement > 0 else "BEARISH"
        assessment = f"Established {bias} trend with ADX proxy {adx_proxy:.1f} and efficiency {trend_efficiency:.2f}"
        explanation = f"Consistent directional progression with healthy volatility alignment."
        
    # Priority 5: Ranging
    elif adx_proxy < 20.0 and trend_efficiency < 0.30:
        regime = "RANGING"
        status = "PASS"
        score = 72.0
        confidence = 0.82
        assessment = f"Mean-reverting consolidation range (ADX {adx_proxy:.1f}, efficiency {trend_efficiency:.2f})"
        explanation = "Price oscillating between established boundaries. Fade extremes or wait for breakout."
        
    else:
        regime = "RANGING"
        status = "PASS"
        score = 65.0
        confidence = 0.70
        assessment = "Transitional consolidation state with moderate volatility"
        explanation = "Market exhibits neither strong trending momentum nor extreme compression."
        
    return RegimeModelOutput(
        name="Market Regime Model",
        status=status,
        score=score,
        confidence=confidence,
        data_quality="HIGH" if len(candles) >= 50 else "MEDIUM",
        assessment=assessment,
        factors=factors,
        explanation=explanation,
        regime=regime,
        trend_strength=round(trend_efficiency, 2),
        volatility_percentile=round(vol_percentile, 2),
        range_expansion_ratio=round(expansion_ratio, 2),
        adx_proxy=round(adx_proxy, 1)
    )
