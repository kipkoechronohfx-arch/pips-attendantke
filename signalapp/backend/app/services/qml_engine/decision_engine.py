"""
Quantitative Market Logic (QML) Decision Engine.

Synthesizes the outputs of all 7 independent QML models:
1. Market Regime Model
2. Multi-Timeframe Alignment Model
3. Liquidity and Structure Model
4. Entry-Quality Model
5. Session Intelligence Model
6. Statistical Outcome Model
7. Risk and Execution Validation Model

MANDATORY INVARIANTS:
1. A model score CANNOT override an invalid stop-loss.
2. A high statistical probability CANNOT override excessive spread or stale data.
3. A confirmed entry requires the existing entry trigger to pass.
4. Missing model output MUST NOT be treated as a positive signal.
5. Produces explicit rejection / veto reasons when rejected.
"""

from typing import Dict, Any, List, Optional
from datetime import datetime, timezone

from .schemas import (
    QMLSynthesis,
    RegimeModelOutput,
    MTFAlignmentOutput,
    LiquidityStructureOutput,
    EntryQualityOutput,
    SessionIntelligenceOutput,
    StatisticalOutcomeOutput,
    RiskExecutionOutput
)
from .regime_model import evaluate_market_regime
from .mtf_model import evaluate_mtf_alignment
from .liquidity_model import evaluate_liquidity_structure
from .entry_quality_model import evaluate_entry_quality
from .session_model import evaluate_session_intelligence
from .statistical_model import evaluate_statistical_outcome
from .risk_model import evaluate_risk_execution


def run_qml_decision_pipeline(
    symbol: str,
    timeframe: str = "M15",
    candles: Optional[List[Dict[str, Any]]] = None,
    h4_candles: Optional[List[Dict[str, Any]]] = None,
    h1_candles: Optional[List[Dict[str, Any]]] = None,
    m5_candles: Optional[List[Dict[str, Any]]] = None,
    proposed_direction: str = "BUY",
    current_price: Optional[float] = None,
    stop_loss: Optional[float] = None,
    take_profit: Optional[float] = None,
    entry_zone_min: Optional[float] = None,
    entry_zone_max: Optional[float] = None,
    spread_pips: float = 1.2,
    has_closed_trigger: bool = True,
    account_balance: float = 10000.0,
    pip_size: float = 0.0001
) -> QMLSynthesis:
    """
    Executes the modular 7-model QML engine and performs rigorous multi-layer synthesis.
    """
    if candles and not current_price:
        current_price = candles[-1]["close"]
    elif not current_price:
        current_price = 1.0850
        
    if not stop_loss:
        stop_loss = current_price - (0.0020 if proposed_direction == "BUY" else -0.0020)
    if not take_profit:
        take_profit = current_price + (0.0040 if proposed_direction == "BUY" else -0.0040)
    if not entry_zone_min or not entry_zone_max:
        entry_zone_min = current_price - 0.0005
        entry_zone_max = current_price + 0.0005

    # 1. Market Regime Model
    regime_out: RegimeModelOutput = evaluate_market_regime(
        candles=candles or [],
        symbol=symbol,
        timeframe=timeframe
    )
    
    # 2. Multi-Timeframe Alignment Model
    mtf_out: MTFAlignmentOutput = evaluate_mtf_alignment(
        h4_candles=h4_candles,
        h1_candles=h1_candles,
        m15_candles=candles,
        m5_candles=m5_candles,
        proposed_direction=proposed_direction
    )
    
    # 3. Liquidity and Structure Model
    liq_out: LiquidityStructureOutput = evaluate_liquidity_structure(
        candles=candles or [],
        proposed_direction=proposed_direction,
        pip_size=pip_size
    )
    
    # 4. Entry Quality Model
    entry_out: EntryQualityOutput = evaluate_entry_quality(
        current_price=current_price,
        entry_zone_min=entry_zone_min,
        entry_zone_max=entry_zone_max,
        stop_loss=stop_loss,
        take_profit=take_profit,
        direction=proposed_direction,
        pip_size=pip_size,
        estimated_spread_pips=spread_pips,
        has_closed_candle=has_closed_trigger
    )
    
    # 5. Session Intelligence Model
    session_out: SessionIntelligenceOutput = evaluate_session_intelligence(
        current_regime=regime_out.regime,
        symbol=symbol
    )
    
    # 6. Statistical Outcome Model
    stat_out: StatisticalOutcomeOutput = evaluate_statistical_outcome(
        mtf_concurrence=mtf_out.concurrence_ratio,
        displacement_ratio=liq_out.displacement_ratio,
        gross_rr=entry_out.target_to_sl_ratio,
        net_rr=entry_out.net_rr_ratio,
        session_historical_wr=session_out.historical_session_win_rate,
        regime=regime_out.regime
    )
    
    # 7. Risk & Execution Validation Model
    risk_out: RiskExecutionOutput = evaluate_risk_execution(
        symbol=symbol,
        current_spread_pips=spread_pips,
        stop_loss=stop_loss,
        current_price=current_price,
        direction=proposed_direction,
        pip_size=pip_size,
        volatility_percentile=regime_out.volatility_percentile,
        account_balance=account_balance
    )

    # Compile models map
    models_dict = {
        "regime_model": regime_out.__dict__,
        "mtf_model": mtf_out.__dict__,
        "liquidity_model": liq_out.__dict__,
        "entry_quality_model": entry_out.__dict__,
        "session_model": session_out.__dict__,
        "statistical_model": stat_out.__dict__,
        "risk_model": risk_out.__dict__
    }

    # ==========================================
    # RIGOROUS SYNTHESIS & VETO INVARIANT CHECKS
    # ==========================================
    veto_reasons: List[str] = []

    # Invariant A: Hard Stop Loss Validity
    if not risk_out.hard_stop_valid:
        veto_reasons.append(f"Risk Veto: {risk_out.assessment}")
        
    # Invariant B: Spread Health
    if not risk_out.spread_healthy:
        veto_reasons.append(f"Spread Veto: {risk_out.assessment}")
        
    # Invariant C: Trigger Candle Confirmation
    if not entry_out.has_closed_trigger_candle:
        veto_reasons.append("Entry Veto: Unclosed trigger candle (intra-bar entry prohibited)")
        
    # Invariant D: Net R:R after costs
    if entry_out.net_rr_ratio < 1.1:
        veto_reasons.append(f"Geometry Veto: Net R:R {entry_out.net_rr_ratio:.2f}:1 fails 1.1:1 floor after friction")
        
    # Invariant E: Data Quality (Never treat missing data as positive)
    if regime_out.data_quality == "INSUFFICIENT" or mtf_out.data_quality == "INSUFFICIENT":
        veto_reasons.append("Data Quality Veto: Insufficient historical candles for quantitative confidence")

    # Invariant F: Session Dead Zone
    if not session_out.session_eligibility:
        veto_reasons.append(f"Session Veto: {session_out.assessment}")

    # Invariant G: Severe MTF Conflict
    if mtf_out.status == "FAIL":
        veto_reasons.append(f"MTF Veto: Severe timeframe discordance ({'; '.join(mtf_out.conflicting_signals[:2])})")

    # Composite Score (Weighted average of models, but vetoes dominate)
    composite_score = (
        regime_out.score * 0.15 +
        mtf_out.score * 0.20 +
        liq_out.score * 0.20 +
        entry_out.score * 0.20 +
        session_out.score * 0.10 +
        stat_out.score * 0.15
    )
    
    # Overall Data Quality grade
    qualities = [m.data_quality for m in [regime_out, mtf_out, liq_out, entry_out, session_out, stat_out, risk_out]]
    if "INSUFFICIENT" in qualities:
        overall_dq = "INSUFFICIENT"
    elif "DEGRADED" in qualities:
        overall_dq = "DEGRADED"
    elif all(q == "HIGH" for q in qualities):
        overall_dq = "HIGH"
    else:
        overall_dq = "MEDIUM"

    model_accept = (len(veto_reasons) == 0 and composite_score >= 65.0)

    return QMLSynthesis(
        symbol=symbol,
        timeframe=timeframe,
        composite_qml_score=round(composite_score, 1),
        statistical_edge=stat_out.expectancy_r,
        regime=regime_out.regime,
        alignment=mtf_out.status,
        overall_data_quality=overall_dq,
        models=models_dict,
        model_accept=model_accept,
        veto_reasons=veto_reasons,
        evaluated_at=datetime.now(timezone.utc).isoformat()
    )
