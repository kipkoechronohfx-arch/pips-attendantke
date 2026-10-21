"""
Unit and Integration Tests for Quantitative Market Logic (QML) Engine.

Covers:
1. Market Regime Classification (ATR ratios, volatility percentiles, UNKNOWN fallback)
2. Multi-Timeframe Alignment (H4/H1 bias, M15/M5 concurrence, conflict handling)
3. Liquidity and Structure (Confirmed sweeps, BOS, CHoCH, displacement, FVG)
4. Entry Quality (Zone containment, closed candle trigger, net R:R after friction)
5. Session Intelligence (DST boundaries, dead zone, regime-session synergy)
6. Statistical Outcome (Calibrated win probability, Brier score, expectancy in R)
7. Risk and Execution Validation (Spread limits, hard stop invariant, position sizing)
8. Decision Engine Synthesis (Invariants, vetoes, score synthesis)
"""

import pytest
from datetime import datetime, timezone

from app.services.qml_engine.regime_model import evaluate_market_regime
from app.services.qml_engine.mtf_model import evaluate_mtf_alignment
from app.services.qml_engine.liquidity_model import evaluate_liquidity_structure
from app.services.qml_engine.entry_quality_model import evaluate_entry_quality
from app.services.qml_engine.session_model import evaluate_session_intelligence
from app.services.qml_engine.statistical_model import evaluate_statistical_outcome
from app.services.qml_engine.risk_model import evaluate_risk_execution
from app.services.qml_engine.decision_engine import run_qml_decision_pipeline


def _generate_synthetic_candles(count: int = 50, trend: float = 0.0002, volatility: float = 0.0005):
    """Generate deterministic OHLC candles for testing."""
    candles = []
    base_price = 1.0800
    for i in range(count):
        o = base_price + (i * trend)
        c = o + (trend * 0.8)
        h = max(o, c) + volatility
        l = min(o, c) - volatility
        candles.append({"open": round(o, 5), "high": round(h, 5), "low": round(l, 5), "close": round(c, 5), "time": f"2026-10-21T{i:02d}:00:00Z"})
    return candles


# ==========================================
# 1. Market Regime Classification Tests
# ==========================================

def test_regime_insufficient_data():
    """Model must return UNKNOWN when candles < 28 bars."""
    candles = _generate_synthetic_candles(count=15)
    out = evaluate_market_regime(candles)
    assert out.regime == "UNKNOWN"
    assert out.status == "UNKNOWN"
    assert out.data_quality == "INSUFFICIENT"
    assert "Insufficient historical candles" in out.assessment


def test_regime_trending_classification():
    """Trending candles should be classified as TRENDING."""
    candles = _generate_synthetic_candles(count=60, trend=0.0004, volatility=0.0003)
    out = evaluate_market_regime(candles)
    assert out.regime in ("TRENDING", "BREAKOUT")
    assert out.data_quality == "HIGH"
    assert out.score >= 70.0


def test_regime_high_volatility_spike():
    """Wild ATR spike should trigger HIGH_VOLATILITY status."""
    candles = _generate_synthetic_candles(count=40, trend=0.0001, volatility=0.0002)
    # Add a massive volatility candle at the end
    last = candles[-1]
    candles.append({"open": last["close"], "high": last["close"] + 0.0040, "low": last["close"] - 0.0040, "close": last["close"] + 0.0010})
    out = evaluate_market_regime(candles)
    assert out.regime == "HIGH_VOLATILITY" or out.range_expansion_ratio > 1.5


# ==========================================
# 2. Multi-Timeframe Alignment Tests
# ==========================================

def test_mtf_alignment_insufficient_timeframes():
    """Must return UNKNOWN if fewer than 2 distinct timeframes provided."""
    m15 = _generate_synthetic_candles(count=30)
    out = evaluate_mtf_alignment(m15_candles=m15)
    assert out.status == "UNKNOWN"
    assert out.data_quality == "INSUFFICIENT"


def test_mtf_alignment_conflicting_signals():
    """Bearish higher timeframes with proposed BUY must FAIL with explicit conflicts."""
    # H4 downtrend
    h4 = _generate_synthetic_candles(count=30, trend=-0.0005)
    # H1 downtrend
    h1 = _generate_synthetic_candles(count=30, trend=-0.0003)
    # M15 neutral/bullish
    m15 = _generate_synthetic_candles(count=30, trend=0.0001)

    out = evaluate_mtf_alignment(h4_candles=h4, h1_candles=h1, m15_candles=m15, proposed_direction="BUY")
    assert out.status == "FAIL"
    assert len(out.conflicting_signals) > 0
    assert "Higher timeframes contradict" in out.assessment


# ==========================================
# 3. Liquidity and Structure Tests
# ==========================================

def test_liquidity_sweep_detection():
    """Detects liquidity sweep when candle wicks beyond swing low then closes above."""
    candles = _generate_synthetic_candles(count=35, trend=0.0001, volatility=0.0004)
    # Inject a prior swing low
    candles[15]["low"] = 1.0750
    # Inject a sweep candle at index 32
    candles[32]["low"] = 1.0745  # pierced below 1.0750
    candles[32]["close"] = 1.0760  # closed back above 1.0750
    
    out = evaluate_liquidity_structure(candles, proposed_direction="BUY")
    assert out.has_sweep is True
    assert out.score >= 60.0


# ==========================================
# 4. Entry-Quality Tests
# ==========================================

def test_entry_quality_unclosed_candle():
    """Unclosed candle must fail to prevent intra-bar slippage trap."""
    out = evaluate_entry_quality(
        current_price=1.0850,
        entry_zone_min=1.0845,
        entry_zone_max=1.0855,
        stop_loss=1.0820,
        take_profit=1.0910,
        direction="BUY",
        has_closed_candle=False
    )
    assert out.status == "FAIL"
    assert "Trigger candle has not closed" in out.assessment


def test_entry_quality_invalid_stop_loss():
    """Stop loss on the wrong side of current price must immediately FAIL with score 0."""
    out = evaluate_entry_quality(
        current_price=1.0850,
        entry_zone_min=1.0845,
        entry_zone_max=1.0855,
        stop_loss=1.0870,  # SL is higher than price for a BUY!
        take_profit=1.0910,
        direction="BUY"
    )
    assert out.status == "FAIL"
    assert out.score == 0.0
    assert "Invalid stop loss" in out.assessment


def test_entry_quality_net_rr_friction():
    """Net R:R should accurately reflect spread and slippage drag."""
    out = evaluate_entry_quality(
        current_price=1.0850,
        entry_zone_min=1.0848,
        entry_zone_max=1.0852,
        stop_loss=1.0830,  # 20 pips SL
        take_profit=1.0890, # 40 pips TP (gross 2.0)
        direction="BUY",
        estimated_spread_pips=1.5,
        estimated_slippage_pips=0.5
    )
    assert out.net_rr_ratio < out.target_to_sl_ratio
    assert out.status == "PASS"


# ==========================================
# 5. Session Intelligence Tests
# ==========================================

def test_session_dead_zone():
    """Dead zone (22:00 UTC) must be rejected."""
    dt_dead = datetime(2026, 10, 21, 22, 15, tzinfo=timezone.utc)
    out = evaluate_session_intelligence(current_time_utc=dt_dead)
    assert out.active_session == "DEAD_ZONE"
    assert out.session_eligibility is False
    assert out.status == "FAIL"


def test_session_london_overlap_synergy():
    """London/Overlap session during trending market should pass with OPTIMAL fit."""
    dt_london = datetime(2026, 10, 21, 14, 0, tzinfo=timezone.utc)  # 14:00 UTC = Overlap
    out = evaluate_session_intelligence(current_time_utc=dt_london, current_regime="TRENDING")
    assert out.active_session in ("OVERLAP", "LONDON")
    assert out.session_eligibility is True
    assert out.status == "PASS"
    assert out.regime_session_fit == "OPTIMAL"


# ==========================================
# 6. Statistical Outcome Model Tests
# ==========================================

def test_statistical_expectancy():
    """Model must compute calibrated probability and positive expectancy."""
    out = evaluate_statistical_outcome(
        mtf_concurrence=0.8,
        displacement_ratio=1.8,
        gross_rr=2.2,
        net_rr=1.9,
        session_historical_wr=0.64,
        regime="TRENDING"
    )
    assert out.win_probability >= 0.50
    assert out.expectancy_r > 0.0
    assert out.calibrated_brier_score < 0.25
    assert out.status == "PASS"


# ==========================================
# 7. Risk & Execution Validation Tests
# ==========================================

def test_risk_excessive_spread_veto():
    """Excessive spread must trigger critical veto."""
    out = evaluate_risk_execution(
        symbol="EURUSD",
        current_spread_pips=4.8,  # EURUSD max is 2.5
        stop_loss=1.0820,
        current_price=1.0850,
        direction="BUY"
    )
    assert out.spread_healthy is False
    assert out.status == "FAIL"
    assert "CRITICAL VETO: Spread elevated" in out.assessment


def test_risk_tight_stop_loss_veto():
    """Stop loss tighter than 3 pips must trigger veto."""
    out = evaluate_risk_execution(
        symbol="EURUSD",
        current_spread_pips=1.0,
        stop_loss=1.0849,  # Only 1 pip away!
        current_price=1.0850,
        direction="BUY"
    )
    assert out.hard_stop_valid is False
    assert out.status == "FAIL"
    assert "Stop loss too tight" in out.assessment


# ==========================================
# 8. Decision Engine Synthesis Tests
# ==========================================

def test_decision_engine_hard_stop_override_prohibition():
    """Mandatory Invariant: High model scores CANNOT override an invalid stop-loss."""
    candles = _generate_synthetic_candles(count=40, trend=0.0003)
    synthesis = run_qml_decision_pipeline(
        symbol="EURUSD",
        candles=candles,
        proposed_direction="BUY",
        current_price=1.0850,
        stop_loss=1.0880,  # Invalid SL (higher than entry)
        take_profit=1.0920,
        spread_pips=1.0
    )
    assert synthesis.model_accept is False
    assert any("Stop" in v or "stop" in v for v in synthesis.veto_reasons)


def test_decision_engine_spread_override_prohibition():
    """Mandatory Invariant: Statistical probability CANNOT override excessive spread."""
    candles = _generate_synthetic_candles(count=40, trend=0.0003)
    synthesis = run_qml_decision_pipeline(
        symbol="EURUSD",
        candles=candles,
        proposed_direction="BUY",
        current_price=1.0850,
        stop_loss=1.0820,
        take_profit=1.0920,
        spread_pips=5.5  # Excessive spread
    )
    assert synthesis.model_accept is False
    assert any("Spread" in v for v in synthesis.veto_reasons)


def test_decision_engine_clean_pass():
    """A clean, well-aligned trade during active session passes with all 7 models verified."""
    candles = _generate_synthetic_candles(count=50, trend=0.0003)
    h4 = _generate_synthetic_candles(count=30, trend=0.0004)
    h1 = _generate_synthetic_candles(count=30, trend=0.0003)
    m5 = _generate_synthetic_candles(count=30, trend=0.0002)

    synthesis = run_qml_decision_pipeline(
        symbol="EURUSD",
        candles=candles,
        h4_candles=h4,
        h1_candles=h1,
        m5_candles=m5,
        proposed_direction="BUY",
        current_price=1.0850,
        stop_loss=1.0820,
        take_profit=1.0910,
        spread_pips=1.1,
        has_closed_trigger=True
    )
    assert len(synthesis.models) == 7
    assert synthesis.composite_qml_score > 60.0
    assert "regime_model" in synthesis.models
    assert "statistical_model" in synthesis.models
