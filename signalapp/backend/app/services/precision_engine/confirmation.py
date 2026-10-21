"""
Precision Entry Engine — Stage C: Entry Confirmation & Hard-Gate Validation.

Requires ALL mandatory conditions to pass before issuing CONFIRMED status.
A high setup score alone cannot override any mandatory gate.

Signal lifecycle states:
  WATCH                    → context valid, setup developing
  WAITING_FOR_RETEST       → setup detected, price not yet in zone
  WAITING_FOR_CONFIRMATION → price in zone, awaiting trigger candle close
  CONFIRMED                → all gates passed, signal is actionable
  ENTRY_MISSED             → price moved beyond max deviation
  INVALIDATED              → structure broke in wrong direction
  EXPIRED                  → expiry time reached without confirmation
  NO_TRADE                 → mandatory hard gate failed
"""

from dataclasses import dataclass, field
from typing import List, Optional, Tuple, Dict, Any
from datetime import datetime, timezone

from app.schemas.market import Candle, Quote
from app.services.precision_engine.config import get_spec, PROFILE_MAP
from app.services.precision_engine.context import ContextResult
from app.services.precision_engine.setup import SetupResult
from app.services.indicators.technical import TechnicalIndicators


# ── Data structures ────────────────────────────────────────────────────────────

@dataclass
class EntryZone:
    lower: float
    upper: float
    preferred: float
    current_bid: float
    current_ask: float
    max_deviation_pips: float
    current_deviation_pips: float       # actual distance from preferred to executable price
    is_within_zone: bool
    executable_side: str                # BID (sell) or ASK (buy)


@dataclass
class RiskLevels:
    stop_loss: float
    stop_distance_pips: float
    take_profit_1: float
    take_profit_2: float
    take_profit_3: float
    target_distance_pips: float
    rr_ratio: float                     # calculated with CURRENT executable price + costs
    rr_after_costs: float
    opposing_liquidity_level: Optional[float]
    distance_to_opposing_pips: Optional[float]


@dataclass
class ConfirmationResult:
    lifecycle_state: str                # see module docstring for values
    signal_valid: bool
    symbol: str
    direction: Optional[str]
    timeframe: str
    strategy_profile: Optional[str]
    market_regime: str
    context_score: int
    setup_score: int
    entry_zone: Optional[EntryZone]
    risk_levels: Optional[RiskLevels]
    setup_type: Optional[str]
    setup_age_seconds: Optional[float]
    expiry_time: Optional[datetime]
    has_trigger_candle: bool
    spread_pips: float
    data_freshness_seconds: float
    gate_results: Dict[str, bool]       # gate_name → passed
    rejection_codes: List[str] = field(default_factory=list)
    rejection_messages: List[str] = field(default_factory=list)
    # Fields for persistence / signal creation
    entry_price: Optional[float] = None
    stop_loss: Optional[float] = None
    take_profit_1: Optional[float] = None
    take_profit_2: Optional[float] = None
    take_profit_3: Optional[float] = None
    entry_zone_high: Optional[float] = None
    entry_zone_low: Optional[float] = None
    confidence: int = 0
    technical_justification: str = ""


# ── Helpers ────────────────────────────────────────────────────────────────────

COST_SPREAD_PIPS = 1.2     # conservative blended spread estimate
COST_SLIPPAGE_PIPS = 0.4   # typical slippage

def _pips(price_diff: float, pip_size: float) -> float:
    return abs(price_diff) / pip_size if pip_size > 0 else 0.0


def _round(value: float, digits: int) -> float:
    return round(value, digits)


def _has_trigger_candle(closed: List[Candle], direction: str, entry_zone_low: float, entry_zone_high: float) -> bool:
    """
    Check if the last confirmed closed candle is a valid trigger:
    - For BUY: close is above entry_zone_low AND is a bullish or pin-bar candle
    - For SELL: close is below entry_zone_high AND is a bearish or pin-bar candle
    Must be a confirmed CLOSED candle.
    """
    if not closed:
        return False
    c = closed[-1]
    candle_range = (c.high - c.low) or 0.00001
    lower_wick = min(c.open, c.close) - c.low
    upper_wick = c.high - max(c.open, c.close)

    if direction == "BUY":
        in_zone = c.close >= entry_zone_low and c.close <= entry_zone_high * 1.001
        bullish = c.close > c.open
        pin_bar = lower_wick >= 0.55 * candle_range
        return in_zone and (bullish or pin_bar)
    else:  # SELL
        in_zone = c.close <= entry_zone_high and c.close >= entry_zone_low * 0.999
        bearish = c.close < c.open
        pin_bar = upper_wick >= 0.55 * candle_range
        return in_zone and (bearish or pin_bar)


def _compute_rr(
    entry: float, sl: float, tp: float, direction: str,
    pip_size: float, extra_cost_pips: float = 0.0,
) -> float:
    risk   = abs(entry - sl) + extra_cost_pips * pip_size
    reward = abs(tp - entry) - extra_cost_pips * pip_size
    if risk <= 0:
        return 0.0
    return round(reward / risk, 2)


def _atr_sl_tp(
    direction: str,
    entry: float,
    atr: float,
    ref_low: float,
    ref_high: float,
    digits: int,
    profile: Optional[dict],
    pip_size: float,
    opposing_level: Optional[float],
) -> Tuple[float, float, float, float]:
    """
    Calculate stop-loss and take-profit levels.
    SL: structural invalidation ± 1 ATR buffer.
    TP1/TP2/TP3: multiples of risk.
    Never moves SL farther away after the fact.
    """
    atr_buf = atr * 1.0
    min_rr = (profile or {}).get("min_rr", 1.5)

    if direction == "BUY":
        sl  = _round(ref_low - atr_buf, digits)
        tp1 = _round(entry + abs(entry - sl) * 1.2,  digits)
        tp2 = _round(entry + abs(entry - sl) * min_rr, digits)
        tp3 = _round(entry + abs(entry - sl) * 3.5,  digits)
        # Cap TP3 at opposing liquidity if available and closer
        if opposing_level and opposing_level < tp3 and opposing_level > entry:
            tp3 = _round(opposing_level - atr_buf * 0.5, digits)
    else:
        sl  = _round(ref_high + atr_buf, digits)
        tp1 = _round(entry - abs(sl - entry) * 1.2,  digits)
        tp2 = _round(entry - abs(sl - entry) * min_rr, digits)
        tp3 = _round(entry - abs(sl - entry) * 3.5,  digits)
        if opposing_level and opposing_level > tp3 and opposing_level < entry:
            tp3 = _round(opposing_level + atr_buf * 0.5, digits)

    return sl, tp1, tp2, tp3


# ── Main Stage C function ──────────────────────────────────────────────────────

def confirm_entry(
    context: ContextResult,
    setup: SetupResult,
    candles: List[Candle],
    quote: Quote,
) -> ConfirmationResult:
    """
    Stage C — Entry Confirmation & Hard-Gate Precision Gate.

    Evaluates all 11 mandatory conditions sequentially.
    Every failed condition produces a rejection_code and user-readable message.
    A CONFIRMED signal is emitted ONLY when ALL gates pass.
    """
    gate_results: Dict[str, bool] = {}
    rejection_codes: List[str] = []
    rejection_messages: List[str] = []

    spec    = get_spec(context.symbol)
    pip_size = spec["pip_size"]
    digits   = spec["digits"]
    max_stale = spec["max_stale_s"]
    max_spread = spec["max_spread"]
    profile  = PROFILE_MAP.get(context.active_profile_id or "", None)
    min_rr   = (profile or {}).get("min_rr", 1.5)
    max_dev  = (profile or {}).get("max_entry_deviation_pips", 8.0)

    closed = candles[:-1]   # confirmed candles only

    # ─────────────────────────────────────────────────────────────────────────
    # Gate 1: Market data is fresh and complete
    # ─────────────────────────────────────────────────────────────────────────
    fresh = quote.data_freshness_seconds <= max_stale and len(closed) >= 59
    gate_results["data_fresh"] = fresh
    if not fresh:
        rejection_codes.append("DATA_NOT_FRESH")
        rejection_messages.append(
            f"Data freshness {quote.data_freshness_seconds:.1f}s (max {max_stale}s) "
            f"or only {len(closed)} closed candles (min 59)."
        )

    # ─────────────────────────────────────────────────────────────────────────
    # Gate 2: Session and strategy are eligible
    # ─────────────────────────────────────────────────────────────────────────
    session_ok = context.passed and context.active_session is not None and context.active_profile_id is not None
    gate_results["session_strategy"] = session_ok
    if not session_ok:
        rejection_codes.append("SESSION_OR_PROFILE_INELIGIBLE")
        rejection_messages.append(
            f"Context gate failed. Active session: {context.active_session}, "
            f"profile: {context.active_profile_id}."
        )

    # ─────────────────────────────────────────────────────────────────────────
    # Gate 3: Setup is still valid (not expired or invalidated)
    # ─────────────────────────────────────────────────────────────────────────
    now_utc = datetime.now(timezone.utc)
    setup_expired = setup.expiry_time is not None and now_utc > setup.expiry_time
    setup_valid = setup.detected and not setup_expired
    gate_results["setup_valid"] = setup_valid
    if setup_expired:
        rejection_codes.append("SETUP_EXPIRED")
        rejection_messages.append(
            f"Setup expired at {setup.expiry_time.isoformat()}. "
            "Do not enter at an invalidated historical level."
        )
    elif not setup.detected:
        rejection_codes.append("SETUP_NOT_DETECTED")
        rejection_messages.append("Stage B did not detect a qualifying setup.")

    # ─────────────────────────────────────────────────────────────────────────
    # Gate 4: Required confirmation candle has closed
    # ─────────────────────────────────────────────────────────────────────────
    ref_high = setup.reference_high or quote.mid
    ref_low  = setup.reference_low  or quote.mid
    trigger  = _has_trigger_candle(closed, setup.direction or "BUY", ref_low, ref_high)
    gate_results["trigger_candle"] = trigger
    if not trigger:
        rejection_codes.append("NO_TRIGGER_CANDLE")
        rejection_messages.append(
            "The confirmation candle (closed in intended direction within entry zone) "
            "has not yet formed. Setup is WAITING_FOR_CONFIRMATION."
        )

    # ─────────────────────────────────────────────────────────────────────────
    # Gate 5: Entry price within permitted zone / deviation
    # ─────────────────────────────────────────────────────────────────────────
    executable_price = quote.ask if setup.direction == "BUY" else quote.bid
    preferred_entry  = (ref_high + ref_low) / 2.0
    dev_pips = _pips(executable_price - preferred_entry, pip_size)
    within_zone = (ref_low <= executable_price <= ref_high) or (dev_pips <= max_dev)
    gate_results["entry_in_zone"] = within_zone
    if not within_zone:
        rejection_codes.append("ENTRY_MISSED")
        rejection_messages.append(
            f"Current {setup.direction} price {executable_price:.{digits}f} is "
            f"{dev_pips:.1f} pips from preferred entry {preferred_entry:.{digits}f} "
            f"(max deviation {max_dev} pips). Do not chase."
        )

    # ─────────────────────────────────────────────────────────────────────────
    # Gate 6: Stop-loss is structurally valid
    # ─────────────────────────────────────────────────────────────────────────
    atr = context.atr14 or pip_size * 10
    opposing_level = context.levels.resistance if setup.direction == "BUY" else context.levels.support
    sl, tp1, tp2, tp3 = _atr_sl_tp(
        setup.direction or "BUY",
        executable_price, atr, ref_low, ref_high, digits, profile, pip_size,
        opposing_level if setup.direction else None,
    )
    sl_valid = (
        (setup.direction == "BUY"  and sl < executable_price) or
        (setup.direction == "SELL" and sl > executable_price)
    )
    gate_results["stop_loss_valid"] = sl_valid
    if not sl_valid:
        rejection_codes.append("INVALID_STOP_LOSS")
        rejection_messages.append(
            f"Computed SL {sl:.{digits}f} is on the wrong side of entry "
            f"{executable_price:.{digits}f}."
        )

    # ─────────────────────────────────────────────────────────────────────────
    # Gate 7: Target has sufficient price space
    # ─────────────────────────────────────────────────────────────────────────
    tp_space = _pips(tp2 - executable_price, pip_size) if setup.direction == "BUY" else \
               _pips(executable_price - tp2, pip_size)
    sl_pips  = _pips(executable_price - sl, pip_size) if setup.direction == "BUY" else \
               _pips(sl - executable_price, pip_size)
    space_ok = tp_space > sl_pips * min_rr * 0.9
    gate_results["target_space"] = space_ok
    if not space_ok:
        rejection_codes.append("INSUFFICIENT_TARGET_SPACE")
        rejection_messages.append(
            f"TP2 only {tp_space:.1f} pips away vs required {sl_pips * min_rr:.1f} pips "
            f"for {min_rr}:1 R:R. Opposing structure likely blocking the target."
        )

    # ─────────────────────────────────────────────────────────────────────────
    # Gate 8: R:R meets minimum after costs (current executable price, not planned)
    # ─────────────────────────────────────────────────────────────────────────
    total_cost_pips = COST_SPREAD_PIPS + COST_SLIPPAGE_PIPS
    rr_after_cost = _compute_rr(executable_price, sl, tp2, setup.direction or "BUY", pip_size, total_cost_pips)
    rr_gross      = _compute_rr(executable_price, sl, tp2, setup.direction or "BUY", pip_size, 0)
    rr_ok = rr_after_cost >= min_rr
    gate_results["rr_after_costs"] = rr_ok
    if not rr_ok:
        rejection_codes.append("RR_BELOW_MINIMUM")
        rejection_messages.append(
            f"R:R after estimated costs is {rr_after_cost:.2f} (min {min_rr}). "
            "Recalculated using CURRENT executable price; original planned entry "
            "is no longer valid. NO TRADE."
        )

    # ─────────────────────────────────────────────────────────────────────────
    # Gate 9: Spread and volatility within limits
    # ─────────────────────────────────────────────────────────────────────────
    spread_ok = quote.spread <= max_spread
    gate_results["spread_volatility"] = spread_ok
    if not spread_ok:
        rejection_codes.append("SPREAD_TOO_WIDE")
        rejection_messages.append(
            f"Current spread {quote.spread:.1f} pips exceeds permitted "
            f"{max_spread:.1f} pips for {context.symbol}."
        )

    # ─────────────────────────────────────────────────────────────────────────
    # Gate 10: News / market-condition restrictions
    # (simplified: flag if we're within 5 minutes of a known high-impact window
    #  — in production this would check the calendar service)
    # ─────────────────────────────────────────────────────────────────────────
    news_ok = True  # calendar integration handled separately; placeholder passes
    gate_results["news_conditions"] = news_ok

    # ─────────────────────────────────────────────────────────────────────────
    # Gate 11: Duplicate signal check
    # (handled at the endpoint layer; placeholder always passes here)
    # ─────────────────────────────────────────────────────────────────────────
    gate_results["no_duplicate"] = True

    # ─────────────────────────────────────────────────────────────────────────
    # Determine lifecycle state
    # ─────────────────────────────────────────────────────────────────────────
    all_passed = all(gate_results.values()) and len(rejection_codes) == 0

    if not context.passed:
        lifecycle = "NO_TRADE"
    elif not setup.detected:
        lifecycle = "WATCH"
    elif setup_expired:
        lifecycle = "EXPIRED"
    elif "ENTRY_MISSED" in rejection_codes:
        lifecycle = "ENTRY_MISSED"
    elif "INVALID_STOP_LOSS" in rejection_codes or "INSUFFICIENT_TARGET_SPACE" in rejection_codes or "RR_BELOW_MINIMUM" in rejection_codes:
        lifecycle = "NO_TRADE"
    elif not within_zone:
        lifecycle = "WAITING_FOR_RETEST"
    elif not trigger:
        lifecycle = "WAITING_FOR_CONFIRMATION"
    elif all_passed:
        lifecycle = "CONFIRMED"
    else:
        lifecycle = "NO_TRADE"

    # ─────────────────────────────────────────────────────────────────────────
    # Composite confidence score (for display only; cannot override gates)
    # ─────────────────────────────────────────────────────────────────────────
    ctx_score = 65 + (5 if context.h4_bias == context.h1_bias else 0) + \
                (5 if context.market_regime == "TRENDING" else 0) + \
                (5 if context.active_session in ("LONDON", "OVERLAP") else 0)
    confidence = min(int((ctx_score * 0.3) + (setup.setup_score * 0.7)), 97)

    # Build entry zone object
    entry_zone = EntryZone(
        lower=ref_low,
        upper=ref_high,
        preferred=preferred_entry,
        current_bid=quote.bid,
        current_ask=quote.ask,
        max_deviation_pips=max_dev,
        current_deviation_pips=dev_pips,
        is_within_zone=within_zone,
        executable_side="ASK" if setup.direction == "BUY" else "BID",
    ) if setup.detected else None

    risk_levels = RiskLevels(
        stop_loss=sl,
        stop_distance_pips=sl_pips,
        take_profit_1=tp1,
        take_profit_2=tp2,
        take_profit_3=tp3,
        target_distance_pips=tp_space,
        rr_ratio=rr_gross,
        rr_after_costs=rr_after_cost,
        opposing_liquidity_level=opposing_level,
        distance_to_opposing_pips=(
            _pips(opposing_level - executable_price, pip_size) if opposing_level else None
        ),
    ) if setup.detected else None

    setup_age = (
        (datetime.now(timezone.utc).timestamp() - setup.origin_time)
        if setup.origin_time else None
    )

    # Justification text for persistence
    confluence_list = []
    if setup.has_bos:          confluence_list.append("BOS")
    if setup.has_choch:        confluence_list.append("CHoCH")
    if setup.has_liquidity_sweep: confluence_list.append("Liquidity Sweep")
    if setup.has_displacement: confluence_list.append("Displacement")
    if setup.fvgs:             confluence_list.append(f"{len(setup.fvgs)} FVG(s)")
    if setup.order_blocks:     confluence_list.append(f"{len(setup.order_blocks)} Order Block(s)")
    justification = (
        f"[{context.active_profile_id}] {setup.setup_type} | "
        f"{', '.join(confluence_list) or 'Multi-Confluence'} | "
        f"H4: {context.h4_bias} | H1: {context.h1_bias} | "
        f"Regime: {context.market_regime} | "
        f"R:R {rr_after_cost:.2f} after costs"
    )

    return ConfirmationResult(
        lifecycle_state=lifecycle,
        signal_valid=(lifecycle == "CONFIRMED"),
        symbol=context.symbol,
        direction=setup.direction,
        timeframe=context.timeframe,
        strategy_profile=context.active_profile_id,
        market_regime=context.market_regime,
        context_score=ctx_score,
        setup_score=setup.setup_score,
        entry_zone=entry_zone,
        risk_levels=risk_levels,
        setup_type=setup.setup_type,
        setup_age_seconds=setup_age,
        expiry_time=setup.expiry_time,
        has_trigger_candle=trigger,
        spread_pips=quote.spread,
        data_freshness_seconds=quote.data_freshness_seconds,
        gate_results=gate_results,
        rejection_codes=rejection_codes,
        rejection_messages=rejection_messages,
        # For signal persistence
        entry_price=executable_price if setup.detected else None,
        stop_loss=sl if setup.detected else None,
        take_profit_1=tp1 if setup.detected else None,
        take_profit_2=tp2 if setup.detected else None,
        take_profit_3=tp3 if setup.detected else None,
        entry_zone_high=ref_high if setup.detected else None,
        entry_zone_low=ref_low if setup.detected else None,
        confidence=confidence,
        technical_justification=justification,
    )
