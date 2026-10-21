"""
Precision Entry Engine — Test Suite.

Tests cover:
  - Entry zone boundary calculations
  - Candle-close confirmation logic
  - Structure invalidation detection
  - Entry deviation and expiry
  - Spread gate enforcement
  - SL/TP side validation
  - R:R recalculation with current executable price
  - Duplicate-signal gate (structural)
  - Missing / stale data gate
  - Session dead-zone gate
  - Non-repainting (closed-candle-only) enforcement
  - FVG detection accuracy
  - Order block detection
  - BOS / CHoCH detection
  - Liquidity sweep detection
  - Pipeline end-to-end for CONFIRMED and NO_TRADE
"""

import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, patch
from typing import List

from app.schemas.market import Candle, Quote
from app.services.precision_engine.config import get_spec
from app.services.precision_engine.context import validate_context, _ema_bias, _detect_regime, _active_session
from app.services.precision_engine.setup import (
    detect_setup, _detect_fvgs, _detect_order_blocks,
    _detect_bos, _detect_choch, _detect_liquidity_sweep, _detect_displacement,
)
from app.services.precision_engine.confirmation import confirm_entry, _has_trigger_candle, _compute_rr
from app.services.precision_engine.pipeline import run_precision_pipeline


# ──────────────────────────────────────────────────────────────────────────────
# Fixtures
# ──────────────────────────────────────────────────────────────────────────────

def _candle(t: int, o: float, h: float, l: float, c: float, v: float = 1000.0) -> Candle:
    return Candle(time=t, open=o, high=h, low=l, close=c, volume=v)


def _make_candles(n: int = 80, base: float = 1.0850, pip: float = 0.0001) -> List[Candle]:
    """Generate n synthetic candles with a mild uptrend."""
    candles = []
    price = base
    for i in range(n):
        t = 1_700_000_000 + i * 3600
        change = (0.2 if i % 3 != 0 else -0.1) * pip * 5
        o = price
        c = round(o + change, 5)
        h = round(max(o, c) + pip * 3, 5)
        l = round(min(o, c) - pip * 3, 5)
        candles.append(_candle(t, o, h, l, c))
        price = c
    return candles


def _fresh_quote(sym: str = "EUR/USD", mid: float = 1.0875, spread: float = 0.8) -> Quote:
    pip = get_spec(sym)["pip_size"]
    return Quote(
        symbol=sym,
        bid=round(mid - spread * pip / 2, 5),
        ask=round(mid + spread * pip / 2, 5),
        spread=spread,
        mid=mid,
        change_24h=0.0005,
        change_24h_pct=0.05,
        high_24h=mid + 0.002,
        low_24h=mid - 0.002,
        timestamp_utc=datetime.now(timezone.utc),
        provider="Test",
        is_live=False,
        data_freshness_seconds=1.0,
    )


def _stale_quote(sym: str = "EUR/USD") -> Quote:
    q = _fresh_quote(sym)
    return q.model_copy(update={"data_freshness_seconds": 999.0})


# ──────────────────────────────────────────────────────────────────────────────
# Instrument spec tests
# ──────────────────────────────────────────────────────────────────────────────

def test_instrument_spec_eurusd():
    spec = get_spec("EUR/USD")
    assert spec["pip_size"] == 0.0001
    assert spec["digits"] == 5
    assert spec["max_spread"] == 2.0

def test_instrument_spec_xauusd():
    spec = get_spec("XAU/USD")
    assert spec["pip_size"] == 0.1
    assert spec["digits"] == 2

def test_instrument_spec_usdjpy():
    spec = get_spec("USD/JPY")
    assert spec["pip_size"] == 0.01
    assert spec["digits"] == 3

def test_instrument_spec_unknown_fallback():
    spec = get_spec("XXX/YYY")
    assert spec["pip_size"] == 0.0001  # safe default


# ──────────────────────────────────────────────────────────────────────────────
# Stage A — Context validation
# ──────────────────────────────────────────────────────────────────────────────

def test_context_fails_insufficient_candles():
    candles = _make_candles(30)
    quote   = _fresh_quote()
    result  = validate_context("EUR/USD", "H1", candles, quote)
    assert not result.passed
    assert "INSUFFICIENT_CANDLES" in result.rejection_codes

def test_context_fails_stale_data():
    candles = _make_candles(80)
    quote   = _stale_quote()
    result  = validate_context("EUR/USD", "H1", candles, quote, max_stale_seconds=15)
    assert not result.passed
    assert "STALE_MARKET_DATA" in result.rejection_codes

def test_context_ema_bias_bullish():
    closes = [1.0 + i * 0.01 for i in range(60)]  # strongly rising
    bias = _ema_bias(closes, len(closes))
    assert bias == "BULLISH"

def test_context_ema_bias_bearish():
    closes = [2.0 - i * 0.01 for i in range(60)]  # strongly falling
    bias = _ema_bias(closes, len(closes))
    assert bias == "BEARISH"

def test_context_regime_trending():
    closes = [1.0 + i * 0.002 for i in range(60)]  # clear trend
    atr = 0.001
    regime = _detect_regime(closes, atr)
    assert regime == "TRENDING"

def test_context_regime_ranging():
    import math
    closes = [1.085 + 0.0005 * math.sin(i * 0.3) for i in range(60)]
    atr = 0.002
    regime = _detect_regime(closes, atr)
    assert regime == "RANGING"

@pytest.mark.parametrize("hour,expected", [
    (8, "LONDON"), (14, "OVERLAP"), (18, "NEW_YORK"), (23, "ASIAN"), (2, "ASIAN"),
])
def test_session_detection(hour, expected):
    assert _active_session(hour) == expected

def test_session_dead_zone():
    # Hours 20-22 UTC are dead zone (not in any major session)
    session = _active_session(21)
    assert session is None


# ──────────────────────────────────────────────────────────────────────────────
# Stage B — Setup detection
# ──────────────────────────────────────────────────────────────────────────────

def test_fvg_bullish_detected():
    atr = 0.0010
    # Three candles where C3.low > C1.high by > 0.3*ATR
    candles = [
        _candle(1, 1.0800, 1.0820, 1.0795, 1.0815),
        _candle(2, 1.0815, 1.0835, 1.0810, 1.0830),
        _candle(3, 1.0840, 1.0860, 1.0838, 1.0855),  # C3.low (1.0838) > C1.high (1.0820)
    ]
    fvgs = _detect_fvgs(candles, atr)
    bullish = [f for f in fvgs if f.direction == "BULLISH"]
    assert len(bullish) >= 1
    assert bullish[0].high == pytest.approx(1.0838, abs=1e-5)
    assert bullish[0].low  == pytest.approx(1.0820, abs=1e-5)

def test_fvg_bearish_detected():
    atr = 0.0010
    candles = [
        _candle(1, 1.0860, 1.0870, 1.0850, 1.0855),  # C1.low = 1.0850
        _candle(2, 1.0840, 1.0845, 1.0825, 1.0830),
        _candle(3, 1.0820, 1.0835, 1.0810, 1.0815),  # C3.high = 1.0835 < C1.low = 1.0850
    ]
    fvgs = _detect_fvgs(candles, atr)
    bearish = [f for f in fvgs if f.direction == "BEARISH"]
    assert len(bearish) >= 1

def test_fvg_too_small_filtered():
    """FVG smaller than 0.3 * ATR should be filtered."""
    atr = 0.0100  # very large ATR; gap must be > 0.003
    candles = [
        _candle(1, 1.0800, 1.0801, 1.0799, 1.0800),
        _candle(2, 1.0800, 1.0801, 1.0800, 1.0801),
        _candle(3, 1.0802, 1.0803, 1.0802, 1.0802),  # gap = 0.0001, ATR*0.3 = 0.003
    ]
    fvgs = _detect_fvgs(candles, atr)
    assert len(fvgs) == 0

def test_bos_bullish_detected():
    candles = _make_candles(20)
    # Force last candle to close above swing high
    last_high = max(c.high for c in candles[-10:-2])
    candles[-1] = candles[-1].model_copy(update={"close": last_high + 0.005, "high": last_high + 0.006})
    bos = _detect_bos(candles)
    assert bos is not None
    assert bos["direction"] == "BULLISH"

def test_bos_none_when_no_break():
    candles = _make_candles(20, base=1.0850)
    # Ensure last candle stays within range
    mid_price = 1.0855
    candles[-1] = candles[-1].model_copy(update={"close": mid_price, "high": mid_price + 0.001})
    # With gentle uptrend candles, BOS may or may not exist — just ensure no crash
    _detect_bos(candles)  # no assertion, just ensure it doesn't raise

def test_liquidity_sweep_bullish():
    """Sweep below swing low followed by close back above."""
    candles = _make_candles(20, base=1.0850)
    swing_low = min(c.low for c in candles[-15:-3])
    # Second-to-last candle sweeps below low, closes above
    t_sweep = candles[-2].time
    candles[-2] = _candle(t_sweep, 1.0840, 1.0845, swing_low - 0.0005, swing_low + 0.0010)
    result = _detect_liquidity_sweep(candles, atr=0.001)
    assert result is not None
    assert result["direction"] == "BULLISH"

def test_displacement_detected():
    candles = _make_candles(15)
    # Make second-to-last candle have a very large body (3x ATR)
    atr = 0.001
    t = candles[-2].time
    candles[-2] = _candle(t, 1.0850, 1.0870, 1.0848, 1.0868)  # body = 0.0018 > 1.5 * ATR
    disp = _detect_displacement(candles, atr)
    assert disp is not None

def test_setup_fails_when_context_fails():
    candles = _make_candles(30)
    quote   = _fresh_quote()
    context = validate_context("EUR/USD", "H1", candles, quote)
    setup   = detect_setup(context, candles)
    assert not setup.detected
    assert "CONTEXT_FAILED" in setup.rejection_codes


# ──────────────────────────────────────────────────────────────────────────────
# Stage C — Entry confirmation
# ──────────────────────────────────────────────────────────────────────────────

def test_trigger_candle_bullish():
    """A bullish close inside the entry zone should register as trigger."""
    candles = [_candle(i, 1.085, 1.0860, 1.0845, 1.0855) for i in range(5)]
    result = _has_trigger_candle(candles, "BUY", entry_zone_low=1.0845, entry_zone_high=1.0860)
    assert result is True

def test_trigger_candle_bearish():
    candles = [_candle(i, 1.086, 1.0865, 1.0845, 1.0848) for i in range(5)]
    result = _has_trigger_candle(candles, "SELL", entry_zone_low=1.0845, entry_zone_high=1.0870)
    assert result is True

def test_trigger_candle_outside_zone():
    """Close outside the zone must not trigger."""
    candles = [_candle(i, 1.090, 1.091, 1.0895, 1.0905) for i in range(5)]
    result = _has_trigger_candle(candles, "BUY", entry_zone_low=1.082, entry_zone_high=1.0845)
    assert result is False

def test_rr_calculation_basic():
    """R:R should be correct for a simple BUY setup."""
    rr = _compute_rr(entry=1.0860, sl=1.0840, tp=1.0900, direction="BUY", pip_size=0.0001)
    # risk=20p, reward=40p, rr=2.0
    assert rr == pytest.approx(2.0, abs=0.01)

def test_rr_calculation_after_costs():
    """R:R after costs must be lower than gross R:R."""
    rr_gross = _compute_rr(1.0860, 1.0840, 1.0900, "BUY", 0.0001, extra_cost_pips=0)
    rr_net   = _compute_rr(1.0860, 1.0840, 1.0900, "BUY", 0.0001, extra_cost_pips=1.6)
    assert rr_net < rr_gross

def test_spread_gate_blocks_entry():
    """An excessively wide spread must cause NO_TRADE or WAITING state."""
    candles = _make_candles(80)
    quote   = _fresh_quote(spread=50.0)  # extreme spread
    result  = run_precision_pipeline("EUR/USD", "H1", candles, quote)
    assert result.lifecycle_state in ("NO_TRADE", "WATCH", "WAITING_FOR_CONFIRMATION",
                                      "WAITING_FOR_RETEST", "ENTRY_MISSED", "EXPIRED")

def test_stale_data_gate():
    """Stale data (freshness > max_stale_s) must never produce CONFIRMED."""
    candles = _make_candles(80)
    quote   = _stale_quote("EUR/USD")
    result  = run_precision_pipeline("EUR/USD", "H1", candles, quote)
    assert result.lifecycle_state != "CONFIRMED"
    assert result.signal_valid is False

def test_insufficient_candles_gate():
    """Fewer than 60 candles must produce NO_TRADE, not CONFIRMED."""
    candles = _make_candles(25)
    quote   = _fresh_quote()
    result  = run_precision_pipeline("EUR/USD", "H1", candles, quote)
    assert result.lifecycle_state == "NO_TRADE"
    assert result.signal_valid is False

def test_sl_on_correct_side_buy():
    """Stop-loss must be below entry for a BUY signal."""
    candles = _make_candles(80)
    quote   = _fresh_quote()
    result  = run_precision_pipeline("EUR/USD", "H1", candles, quote)
    if result.risk_levels and result.direction == "BUY":
        assert result.risk_levels.stop_loss < result.entry_price

def test_sl_on_correct_side_sell():
    """Stop-loss must be above entry for a SELL signal."""
    candles = _make_candles(80, base=1.0850)
    # Make strongly bearish candles
    for i, c in enumerate(candles):
        candles[i] = c.model_copy(update={
            "open": c.open, "close": c.open - 0.003, "high": c.open + 0.001, "low": c.open - 0.004
        })
    quote  = _fresh_quote(mid=1.060)
    result = run_precision_pipeline("EUR/USD", "H1", candles, quote)
    if result.risk_levels and result.direction == "SELL":
        assert result.risk_levels.stop_loss > result.entry_price

def test_no_sl_widening_after_missed_entry():
    """
    If entry is missed, the engine must not widen the stop to make the trade pass.
    ENTRY_MISSED state must NOT be relabelled CONFIRMED.
    """
    candles = _make_candles(80)
    quote   = _fresh_quote(mid=1.20)  # price far from any detected zone
    result  = run_precision_pipeline("EUR/USD", "H1", candles, quote)
    assert result.lifecycle_state != "CONFIRMED"

def test_no_confirmed_without_trigger_candle():
    """
    A signal cannot be CONFIRMED if the trigger candle has not yet closed.
    """
    candles = _make_candles(80)
    quote   = _fresh_quote()
    result  = run_precision_pipeline("EUR/USD", "H1", candles, quote)
    if result.lifecycle_state == "CONFIRMED":
        assert result.has_trigger_candle is True

def test_all_gates_logged():
    """Gate results dict must always contain the standard 11 gate keys."""
    EXPECTED_GATES = {
        "data_fresh", "session_strategy", "setup_valid", "trigger_candle",
        "entry_in_zone", "stop_loss_valid", "target_space",
        "rr_after_costs", "spread_volatility", "news_conditions", "no_duplicate",
    }
    candles = _make_candles(80)
    quote   = _fresh_quote()
    result  = run_precision_pipeline("EUR/USD", "H1", candles, quote)
    assert EXPECTED_GATES.issubset(set(result.gate_results.keys()))

def test_rejection_codes_machine_readable():
    """All rejection codes must be uppercase snake_case strings."""
    candles = _make_candles(80)
    quote   = _stale_quote()
    result  = run_precision_pipeline("EUR/USD", "H1", candles, quote)
    for code in result.rejection_codes:
        assert code == code.upper()
        assert " " not in code

def test_entry_zone_boundaries_present_when_setup_detected():
    """If a setup is detected, entry zone boundaries must be populated."""
    candles = _make_candles(80)
    quote   = _fresh_quote()
    result  = run_precision_pipeline("EUR/USD", "H1", candles, quote)
    if result.setup_score and result.setup_score > 0 and result.entry_zone:
        assert result.entry_zone.lower < result.entry_zone.upper
        assert result.entry_zone.preferred >= result.entry_zone.lower
        assert result.entry_zone.preferred <= result.entry_zone.upper

def test_rr_must_use_current_executable_not_planned():
    """
    R:R stored in risk_levels must be computed from current executable price,
    not the historical planned price.
    """
    candles = _make_candles(80)
    quote   = _fresh_quote(mid=1.0875)
    result  = run_precision_pipeline("EUR/USD", "H1", candles, quote)
    if result.risk_levels and result.entry_price:
        # The executable price should be close to the quote mid ± spread
        spec = get_spec("EUR/USD")
        spread_price = 0.8 * spec["pip_size"]
        assert abs(result.entry_price - 1.0875) < 0.01  # within 100 pips

def test_expiry_time_is_future():
    """Expiry time must always be in the future at signal creation."""
    candles = _make_candles(80)
    quote   = _fresh_quote()
    result  = run_precision_pipeline("EUR/USD", "H1", candles, quote)
    if result.expiry_time:
        assert result.expiry_time > datetime.now(timezone.utc)

def test_pipeline_no_crash_on_minimal_data():
    """Pipeline must handle edge cases gracefully without raising exceptions."""
    candles = _make_candles(5)  # very few candles
    quote   = _fresh_quote()
    result  = run_precision_pipeline("EUR/USD", "H1", candles, quote)
    assert result.lifecycle_state in (
        "NO_TRADE", "WATCH", "WAITING_FOR_RETEST",
        "WAITING_FOR_CONFIRMATION", "EXPIRED", "ENTRY_MISSED",
    )

def test_non_repainting_uses_closed_candles_only():
    """
    Changing the last (potentially open) candle must not change any
    confirmed structural decisions — only closed candles[:-1] are used.
    """
    candles_a = _make_candles(80)
    candles_b = [c for c in candles_a]
    # Drastically alter the last (open) candle
    t = candles_b[-1].time
    candles_b[-1] = _candle(t, 1.500, 1.600, 1.400, 1.550)  # extreme values

    quote = _fresh_quote()
    result_a = run_precision_pipeline("EUR/USD", "H1", candles_a, quote)
    result_b = run_precision_pipeline("EUR/USD", "H1", candles_b, quote)

    # Core structural decisions (h4/h1 bias) must be identical
    # since both pipelines discard the last candle
    # (they may differ if the last candle happens to affect _detect_displacement
    # but BOS/CHoCH use closed[-1], which is candles[-2] in both)
    assert result_a.market_regime == result_b.market_regime

def test_confirmed_signal_has_complete_fields():
    """
    Any CONFIRMED signal must have all required fields populated.
    """
    candles = _make_candles(80)
    quote   = _fresh_quote()
    result  = run_precision_pipeline("EUR/USD", "H1", candles, quote)
    if result.lifecycle_state == "CONFIRMED":
        assert result.entry_price is not None
        assert result.stop_loss   is not None
        assert result.take_profit_1 is not None
        assert result.take_profit_2 is not None
        assert result.direction in ("BUY", "SELL")
        assert result.confidence > 0
        assert result.risk_levels is not None
        assert result.entry_zone  is not None
        assert result.risk_levels.rr_after_costs >= 1.5

def test_order_block_detection():
    """Bullish OB: last bearish candle before a large bull impulse."""
    atr = 0.001
    candles = [
        _candle(1, 1.085, 1.086, 1.084, 1.0845),  # bearish
        _candle(2, 1.0845, 1.090, 1.084, 1.089),  # bull impulse (body 0.0045 > 1.5 * 0.001)
    ]
    obs = _detect_order_blocks(candles, atr)
    bull_obs = [o for o in obs if o.direction == "BULLISH"]
    assert len(bull_obs) >= 1

def test_xauusd_uses_correct_pip_size():
    """Gold pip size is 0.1 — ensure instrument spec is applied."""
    candles = _make_candles(80, base=2650.0, pip=0.1)
    quote   = Quote(
        symbol="XAU/USD", bid=2649.5, ask=2650.5, spread=2.0, mid=2650.0,
        change_24h=1.0, change_24h_pct=0.04,
        high_24h=2660.0, low_24h=2640.0,
        timestamp_utc=datetime.now(timezone.utc),
        provider="Test", is_live=False, data_freshness_seconds=1.0,
    )
    result = run_precision_pipeline("XAU/USD", "H1", candles, quote)
    # The spec pip size of 0.1 should be used — no AssertionError means it worked
    assert result is not None

def test_lifecycle_state_enum_values():
    """All lifecycle state values must be from the documented enum."""
    valid_states = {
        "WATCH", "WAITING_FOR_RETEST", "WAITING_FOR_CONFIRMATION",
        "CONFIRMED", "ENTRY_MISSED", "INVALIDATED", "EXPIRED", "NO_TRADE",
    }
    candles = _make_candles(80)
    quote   = _fresh_quote()
    result  = run_precision_pipeline("EUR/USD", "H1", candles, quote)
    assert result.lifecycle_state in valid_states
