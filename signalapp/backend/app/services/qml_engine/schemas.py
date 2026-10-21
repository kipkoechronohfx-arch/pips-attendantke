"""
Quantitative Market Logic (QML) Engine — Data Schemas.

All QML models return structured, immutable dataclasses containing:
- Model identity and status
- Numerical score and confidence
- Input data quality grade
- Explicit contributing factors
- Human-readable explanation
- UTC timestamp
"""

from dataclasses import dataclass, field
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone


@dataclass
class ModelOutput:
    name: str
    status: str                         # "PASS", "WARN", "FAIL", "UNKNOWN"
    score: float                        # 0.0 - 100.0
    confidence: float                   # 0.0 - 1.0
    data_quality: str                   # "HIGH", "MEDIUM", "DEGRADED", "INSUFFICIENT"
    assessment: str
    factors: Dict[str, Any] = field(default_factory=dict)
    explanation: str = ""
    timestamp_utc: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass
class RegimeModelOutput(ModelOutput):
    regime: str = "UNKNOWN"             # TRENDING, RANGING, BREAKOUT, HIGH_VOLATILITY, LOW_LIQUIDITY, UNKNOWN
    trend_strength: float = 0.0         # 0.0 - 1.0
    volatility_percentile: float = 0.0  # 0.0 - 1.0
    range_expansion_ratio: float = 1.0  # current ATR vs historical median ATR
    adx_proxy: float = 0.0


@dataclass
class MTFAlignmentOutput(ModelOutput):
    h4_bias: str = "NEUTRAL"            # BULLISH, BEARISH, NEUTRAL
    h1_bias: str = "NEUTRAL"            # BULLISH, BEARISH, NEUTRAL
    m15_setup_quality: float = 0.0      # 0.0 - 100.0
    m5_trigger_aligned: bool = False
    conflicting_signals: List[str] = field(default_factory=list)
    concurrence_ratio: float = 0.0      # 0.0 - 1.0


@dataclass
class LiquidityStructureOutput(ModelOutput):
    has_sweep: bool = False
    bos_confirmed: bool = False
    choch_confirmed: bool = False
    displacement_ratio: float = 0.0     # body size / ATR
    fvg_retest_status: str = "NONE"     # TESTED, FRESH, NONE
    distance_to_opposing_pips: Optional[float] = None
    liquidity_pool_above: Optional[float] = None
    liquidity_pool_below: Optional[float] = None


@dataclass
class EntryQualityOutput(ModelOutput):
    is_in_entry_zone: bool = False
    deviation_pips: float = 0.0
    has_closed_trigger_candle: bool = False
    net_rr_ratio: float = 0.0           # net after friction
    sl_distance_pips: float = 0.0
    friction_cost_pips: float = 0.0
    target_to_sl_ratio: float = 0.0


@dataclass
class SessionIntelligenceOutput(ModelOutput):
    active_session: str = "ASIAN"       # LONDON, OVERLAP, NEW_YORK, ASIAN, DEAD_ZONE
    session_eligibility: bool = False
    historical_session_win_rate: float = 0.0
    dst_adjusted: bool = True
    regime_session_fit: str = "MODERATE"


@dataclass
class StatisticalOutcomeOutput(ModelOutput):
    win_probability: float = 0.50       # calibrated probability (0.0 - 1.0)
    calibrated_brier_score: float = 0.18# calibration metric (lower is better, < 0.25 beats coin-flip)
    expectancy_r: float = 0.0           # expected value in R after friction
    sample_size: int = 0                # out-of-sample sample size
    model_version: str = "QML-v2.1"
    is_calibrated: bool = True
    in_sample_accuracy: float = 0.0
    out_of_sample_accuracy: float = 0.0
    feature_importances: Dict[str, float] = field(default_factory=dict)
    horizon_bars: int = 12


@dataclass
class RiskExecutionOutput(ModelOutput):
    spread_healthy: bool = True
    slippage_risk_pips: float = 0.0
    hard_stop_valid: bool = True
    position_size_recommended: float = 1.0
    liquidity_clearance: bool = True
    capital_at_risk_pct: float = 1.0


@dataclass
class QMLSynthesis:
    symbol: str
    timeframe: str
    composite_qml_score: float          # 0.0 - 100.0
    statistical_edge: Optional[float]   # in R
    regime: str
    alignment: str
    overall_data_quality: str
    models: Dict[str, Any]              # model_name -> ModelOutput dict
    model_accept: bool
    veto_reasons: List[str] = field(default_factory=list)
    evaluated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
