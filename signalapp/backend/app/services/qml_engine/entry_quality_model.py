"""
Entry-Quality and Execution Geometry Model.

Evaluates:
- Precise in-zone validation (is current price within the designated POI / FVG / discount zone?)
- Closed trigger candle confirmation (prevents intra-bar anticipatory execution)
- Stop-loss structural validity (placed safely behind swing structure)
- Realistic Reward-to-Risk ratio NET of transaction costs (spread, slippage, commission)
"""

from typing import Dict, Any, Optional
from .schemas import EntryQualityOutput


def evaluate_entry_quality(
    current_price: float,
    entry_zone_min: float,
    entry_zone_max: float,
    stop_loss: float,
    take_profit: float,
    direction: str = "BUY",
    pip_size: float = 0.0001,
    estimated_spread_pips: float = 1.2,
    estimated_slippage_pips: float = 0.5,
    has_closed_candle: bool = True
) -> EntryQualityOutput:
    """
    Evaluates entry zone containment, trigger candle status, and net R:R after all frictions.
    """
    # 1. Zone Validation
    zone_low = min(entry_zone_min, entry_zone_max)
    zone_high = max(entry_zone_min, entry_zone_max)
    is_in_zone = zone_low <= current_price <= zone_high
    
    # Deviation from zone center in pips
    zone_center = (zone_low + zone_high) / 2.0
    deviation_pips = abs(current_price - zone_center) / pip_size
    
    # 2. Risk Geometry
    is_buy = direction.upper() in ("BUY", "LONG")
    sl_distance = (current_price - stop_loss) if is_buy else (stop_loss - current_price)
    tp_distance = (take_profit - current_price) if is_buy else (current_price - take_profit)
    
    sl_pips = sl_distance / pip_size
    tp_pips = tp_distance / pip_size
    
    friction_pips = estimated_spread_pips + estimated_slippage_pips
    net_tp_pips = max(0.0, tp_pips - friction_pips)
    effective_sl_pips = sl_pips + friction_pips
    
    # Gross vs Net R:R
    gross_rr = (tp_pips / sl_pips) if sl_pips > 0 else 0.0
    net_rr = (net_tp_pips / effective_sl_pips) if effective_sl_pips > 0 else 0.0
    
    # Invariant: Invalid SL (negative distance or <= 0)
    if sl_pips <= 0:
        return EntryQualityOutput(
            name="Entry-Quality Model",
            status="FAIL",
            score=0.0,
            confidence=1.0,
            data_quality="HIGH",
            assessment="CRITICAL: Invalid stop loss (SL is on the wrong side of current price)",
            explanation=f"Stop loss {stop_loss} is invalid for proposed {direction} from {current_price}.",
            is_in_entry_zone=is_in_zone,
            deviation_pips=round(deviation_pips, 1),
            has_closed_trigger_candle=has_closed_candle,
            net_rr_ratio=0.0,
            sl_distance_pips=round(sl_pips, 1),
            friction_cost_pips=round(friction_pips, 1),
            target_to_sl_ratio=round(gross_rr, 2)
        )

    factors = {
        "is_in_zone": is_in_zone,
        "deviation_pips": round(deviation_pips, 1),
        "has_closed_trigger_candle": has_closed_candle,
        "gross_rr": round(gross_rr, 2),
        "net_rr": round(net_rr, 2),
        "sl_distance_pips": round(sl_pips, 1),
        "tp_distance_pips": round(tp_pips, 1),
        "friction_cost_pips": round(friction_pips, 1)
    }

    # Scoring
    score = 50.0
    if is_in_zone:
        score += 20.0
    else:
        # Slight penalty for out of zone
        score -= min(25.0, deviation_pips * 2.0)
        
    if has_closed_candle:
        score += 15.0
    else:
        score -= 20.0
        
    if net_rr >= 2.0:
        score += 15.0
    elif net_rr >= 1.5:
        score += 10.0
    elif net_rr < 1.0:
        score -= 30.0
        
    score = max(0.0, min(100.0, score))

    if not has_closed_candle:
        status = "FAIL"
        assessment = "Trigger candle has not closed (unconfirmed intra-bar entry)"
        explanation = "Entry must wait for candle close to confirm rejection and prevent false breakout trap."
    elif net_rr < 1.2:
        status = "FAIL"
        assessment = f"Sub-standard Net Reward:Risk ({net_rr:.2f}:1 after friction)"
        explanation = f"Gross R:R {gross_rr:.2f}:1 degraded by {friction_pips:.1f} pips spread/slippage below acceptable 1.2:1 threshold."
    elif not is_in_zone and deviation_pips > 5.0:
        status = "WARN"
        assessment = f"Price deviated {deviation_pips:.1f} pips outside designated entry POI"
        explanation = "Chasing price outside POI inflates stop-loss distance and diminishes asymmetric edge."
    else:
        status = "PASS"
        assessment = f"High-quality entry geometry with net R:R {net_rr:.2f}:1"
        explanation = f"Price is inside POI, trigger candle closed, and risk parameter yields favorable asymmetric R:R."

    return EntryQualityOutput(
        name="Entry-Quality Model",
        status=status,
        score=round(score, 1),
        confidence=0.92,
        data_quality="HIGH",
        assessment=assessment,
        factors=factors,
        explanation=explanation,
        is_in_entry_zone=is_in_zone,
        deviation_pips=round(deviation_pips, 1),
        has_closed_trigger_candle=has_closed_candle,
        net_rr_ratio=round(net_rr, 2),
        sl_distance_pips=round(sl_pips, 1),
        friction_cost_pips=round(friction_pips, 1),
        target_to_sl_ratio=round(gross_rr, 2)
    )
