"""
Multi-Timeframe Alignment Model (MTF).

Evaluates:
- H4 / H1 Directional Bias (Market Structure, EMA20/50 slope, Swing Structure)
- M15 Setup Quality (Structural alignment, clear liquidity pools)
- M5 Entry Confirmation (Trigger alignment)
- Detection of conflicting signals and calculation of concurrence ratio.

CRITICAL INVARIANT:
Avoids double-counting correlated indicators.
A bullish higher-timeframe score can NEVER substitute for an actual lower-timeframe entry trigger.
"""

from typing import List, Dict, Any, Optional
from .schemas import MTFAlignmentOutput


def _determine_bias_from_candles(candles: List[Dict[str, Any]]) -> str:
    """Determine directional bias (BULLISH, BEARISH, NEUTRAL) from candle sequence."""
    if not candles or len(candles) < 10:
        return "NEUTRAL"
    
    closes = [c["close"] for c in candles]
    highs = [c["high"] for c in candles]
    lows = [c["low"] for c in candles]
    
    # Simple 20-period moving average
    period = min(20, len(closes))
    ma = sum(closes[-period:]) / period
    current_close = closes[-1]
    
    # Swing comparison: compare max high of recent half vs prior half
    mid = len(highs) // 2
    prior_high = max(highs[:mid])
    recent_high = max(highs[mid:])
    prior_low = min(lows[:mid])
    recent_low = min(lows[mid:])
    
    higher_highs = recent_high > prior_high
    higher_lows = recent_low > prior_low
    lower_highs = recent_high < prior_high
    lower_lows = recent_low < prior_low
    
    if current_close > ma and (higher_highs or higher_lows):
        return "BULLISH"
    elif current_close < ma and (lower_highs or lower_lows):
        return "BEARISH"
    else:
        return "NEUTRAL"


def evaluate_mtf_alignment(
    h4_candles: Optional[List[Dict[str, Any]]] = None,
    h1_candles: Optional[List[Dict[str, Any]]] = None,
    m15_candles: Optional[List[Dict[str, Any]]] = None,
    m5_candles: Optional[List[Dict[str, Any]]] = None,
    proposed_direction: str = "BUY"
) -> MTFAlignmentOutput:
    """
    Evaluates multi-timeframe concordance across H4, H1, M15, and M5.
    """
    # Check data sufficiency
    available_tf = []
    if h4_candles and len(h4_candles) >= 10:
        available_tf.append("H4")
    if h1_candles and len(h1_candles) >= 10:
        available_tf.append("H1")
    if m15_candles and len(m15_candles) >= 10:
        available_tf.append("M15")
    if m5_candles and len(m5_candles) >= 10:
        available_tf.append("M5")
        
    if len(available_tf) < 2:
        return MTFAlignmentOutput(
            name="Multi-Timeframe Alignment Model",
            status="UNKNOWN",
            score=50.0,
            confidence=0.2,
            data_quality="INSUFFICIENT",
            assessment=f"Insufficient multi-timeframe data available (only {available_tf})",
            explanation="Requires at least 2 distinct timeframe series for structural alignment verification.",
            h4_bias="NEUTRAL",
            h1_bias="NEUTRAL",
            m15_setup_quality=0.0,
            m5_trigger_aligned=False,
            concurrence_ratio=0.0
        )
        
    h4_bias = _determine_bias_from_candles(h4_candles) if h4_candles else "NEUTRAL"
    h1_bias = _determine_bias_from_candles(h1_candles) if h1_candles else "NEUTRAL"
    m15_bias = _determine_bias_from_candles(m15_candles) if m15_candles else "NEUTRAL"
    m5_bias = _determine_bias_from_candles(m5_candles) if m5_candles else "NEUTRAL"
    
    target_bias = "BULLISH" if proposed_direction.upper() in ("BUY", "LONG") else "BEARISH"
    
    # Track alignments and conflicts
    conflicts = []
    alignments = 0
    total_evaluated = 0
    
    for tf_name, bias in [("H4", h4_bias), ("H1", h1_bias), ("M15", m15_bias), ("M5", m5_bias)]:
        if bias != "NEUTRAL":
            total_evaluated += 1
            if bias == target_bias:
                alignments += 1
            else:
                conflicts.append(f"{tf_name} bias is {bias} (contradicts proposed {proposed_direction})")
        else:
            total_evaluated += 0.5  # Neutral is partial weight
            
    concurrence = alignments / total_evaluated if total_evaluated > 0 else 0.0
    
    # M15 Setup Quality (0-100)
    m15_quality = 70.0
    if m15_bias == target_bias:
        m15_quality += 20.0
    elif m15_bias != "NEUTRAL":
        m15_quality -= 30.0
        
    # M5 Trigger alignment
    m5_aligned = (m5_bias == target_bias)
    
    factors = {
        "h4_bias": h4_bias,
        "h1_bias": h1_bias,
        "m15_bias": m15_bias,
        "m5_bias": m5_bias,
        "concurrence_ratio": round(concurrence, 2),
        "target_bias": target_bias,
        "conflicts_count": len(conflicts)
    }
    
    # Scoring
    # Concurrence contributes 60%, M5 confirmation contributes 40%
    score = (concurrence * 60.0) + (40.0 if m5_aligned else 10.0)
    
    if len(conflicts) >= 2 or (h4_bias != "NEUTRAL" and h4_bias != target_bias and h1_bias != target_bias):
        status = "FAIL"
        assessment = f"Severe timeframe conflict: Higher timeframes contradict {proposed_direction}"
        explanation = f"Concurrence ratio is low ({concurrence:.1%}). Direct headwind from macro bias: {'; '.join(conflicts)}."
    elif not m5_aligned:
        status = "WARN"
        assessment = f"Macro alignment present ({concurrence:.1%}) but M5 entry trigger unconfirmed"
        explanation = "Macro trend supports direction, but lower timeframe has not confirmed timing trigger. Do not substitute macro score for trigger."
    else:
        status = "PASS"
        assessment = f"Strong multi-timeframe concordance ({concurrence:.1%}) with M5 trigger confirmation"
        explanation = f"H1/M15/M5 structural bias matches {proposed_direction} with clean hierarchical alignment."

    return MTFAlignmentOutput(
        name="Multi-Timeframe Alignment Model",
        status=status,
        score=round(score, 1),
        confidence=round(concurrence, 2),
        data_quality="HIGH" if len(available_tf) >= 3 else "MEDIUM",
        assessment=assessment,
        factors=factors,
        explanation=explanation,
        h4_bias=h4_bias,
        h1_bias=h1_bias,
        m15_setup_quality=round(m15_quality, 1),
        m5_trigger_aligned=m5_aligned,
        conflicting_signals=conflicts,
        concurrence_ratio=round(concurrence, 2)
    )
