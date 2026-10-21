"""
Precision Entry Engine — Stage A: Context Validation.

Determines H4/H1 directional bias, active session, market regime,
and detects key structural levels. Returns a ContextResult that
either passes or fails with machine-readable rejection reasons.

Uses ONLY closed candles and completed higher-timeframe data.
No forward-looking information is used.
"""

from dataclasses import dataclass, field
from typing import List, Optional, Tuple
from datetime import datetime, timezone

from app.schemas.market import Candle, Quote
from app.services.indicators.technical import TechnicalIndicators
from app.services.precision_engine.config import get_spec, STRATEGY_PROFILES


# ── Data structures ────────────────────────────────────────────────────────────

@dataclass
class StructuralLevels:
    support: float
    resistance: float
    pdh: Optional[float]      # previous-day high
    pdl: Optional[float]      # previous-day low
    asian_high: Optional[float]
    asian_low: Optional[float]
    swing_high: Optional[float]
    swing_low: Optional[float]


@dataclass
class ContextResult:
    passed: bool
    symbol: str
    timeframe: str
    h4_bias: Optional[str]          # BULLISH | BEARISH | NEUTRAL
    h1_bias: Optional[str]
    market_regime: str              # TRENDING | RANGING | VOLATILE | UNKNOWN
    active_session: Optional[str]   # ASIAN | LONDON | NEW_YORK | OVERLAP
    active_profile_id: Optional[str]
    levels: StructuralLevels
    atr14: Optional[float]
    rejection_codes: List[str] = field(default_factory=list)
    rejection_messages: List[str] = field(default_factory=list)


# ── Helpers ────────────────────────────────────────────────────────────────────

def _ema_bias(closes: List[float], candles_len: int) -> str:
    """Return BULLISH / BEARISH / NEUTRAL based on EMA-20 vs EMA-50 alignment."""
    ema20 = TechnicalIndicators.ema(closes, 20)
    ema50 = TechnicalIndicators.ema(closes, 50)
    e20, e50 = ema20[-1], ema50[-1]
    if e20 is None or e50 is None:
        return "NEUTRAL"
    if e20 > e50 * 1.0001:
        return "BULLISH"
    if e20 < e50 * 0.9999:
        return "BEARISH"
    return "NEUTRAL"


def _detect_regime(closes: List[float], atr: float) -> str:
    """
    Classify market regime using ATR relative to a recent price range.
    ATR > 1.5× of the 20-bar average ATR → VOLATILE
    Price range / ATR < 1.5 over last 20 bars → RANGING
    Otherwise → TRENDING
    """
    if len(closes) < 25 or atr is None or atr == 0:
        return "UNKNOWN"
    recent = closes[-20:]
    price_range = max(recent) - min(recent)
    ratio = price_range / atr if atr else 0
    if ratio < 1.5:
        return "RANGING"
    if atr > (max(recent) - min(recent)) * 0.12:
        return "VOLATILE"
    return "TRENDING"


def _active_session(utc_hour: int) -> Optional[str]:
    """Determine the dominant trading session from UTC hour."""
    # ASIAN: 23–08 UTC, LONDON: 07–12, OVERLAP: 13–17, NEW_YORK: 13–20
    if 7 <= utc_hour < 13:
        return "LONDON"
    if 13 <= utc_hour < 17:
        return "OVERLAP"
    if 17 <= utc_hour < 20:
        return "NEW_YORK"
    if utc_hour >= 23 or utc_hour < 8:
        return "ASIAN"
    return None


def _select_profile(symbol: str, session: Optional[str]) -> Optional[dict]:
    """
    Return the best matching strategy profile for the symbol and session.
    Priority: exact session + instrument match → session-only match → None.
    """
    candidates = []
    for p in STRATEGY_PROFILES:
        if symbol in p["eligible_instruments"]:
            if p["session_id"] == session or (session == "OVERLAP" and p["session_id"] in ("NEW_YORK", "LONDON")):
                candidates.append(p)
    if candidates:
        # prefer the most specific (OVERLAP > session-only)
        for c in candidates:
            if c["session_id"] == session:
                return c
        return candidates[0]
    # fall back: any profile that covers the symbol
    for p in STRATEGY_PROFILES:
        if symbol in p["eligible_instruments"]:
            return p
    return None


def _structural_levels(candles: List[Candle]) -> StructuralLevels:
    """
    Derive key structural levels from closed candle data.
    All values are computed from candles[-N:] — no current open candle.
    """
    recent_20 = candles[-20:]
    recent_5  = candles[-5:]

    highs_20 = [c.high for c in recent_20]
    lows_20  = [c.low  for c in recent_20]
    resistance = max(highs_20) if highs_20 else 0.0
    support    = min(lows_20)  if lows_20  else 0.0

    # Swing high/low: last 5 candles
    swing_high = max(c.high for c in recent_5) if recent_5 else None
    swing_low  = min(c.low  for c in recent_5) if recent_5 else None

    # Approximate PDH/PDL from the 24 hours prior to the last complete candle
    # (cannot be exact without per-candle timestamps in this simplified model)
    day_candles = candles[-48:-24] if len(candles) >= 48 else None
    pdh = max(c.high for c in day_candles) if day_candles else None
    pdl = min(c.low  for c in day_candles) if day_candles else None

    # Asian range approximation: first 8 candles of the last 24 on H1
    asian_window = candles[-24:-16] if len(candles) >= 24 else None
    asian_high = max(c.high for c in asian_window) if asian_window else None
    asian_low  = min(c.low  for c in asian_window) if asian_window else None

    return StructuralLevels(
        support=support,
        resistance=resistance,
        pdh=pdh,
        pdl=pdl,
        asian_high=asian_high,
        asian_low=asian_low,
        swing_high=swing_high,
        swing_low=swing_low,
    )


# ── Main Stage A function ──────────────────────────────────────────────────────

def validate_context(
    symbol: str,
    timeframe: str,
    candles: List[Candle],          # confirmed closed candles (exclude current open)
    quote: Quote,
    h4_candles: Optional[List[Candle]] = None,  # optional higher-tf confirmation
    max_stale_seconds: int = 20,
) -> ContextResult:
    """
    Stage A — Context Validation.

    Requires:
    - Minimum 60 closed candles (configurable)
    - Quote freshness within max_stale_seconds
    - A recognised trading session
    - A matching strategy profile for the symbol+session

    Returns a ContextResult with pass/fail and all rejection reasons.
    """
    rejection_codes: List[str] = []
    rejection_messages: List[str] = []

    spec = get_spec(symbol)
    digits = spec["digits"]

    # ── Gate 1: Sufficient candle history ─────────────────────────────────────
    if len(candles) < 60:
        rejection_codes.append("INSUFFICIENT_CANDLES")
        rejection_messages.append(
            f"Only {len(candles)} confirmed candles available; 60 required for valid analysis."
        )
        return ContextResult(
            passed=False, symbol=symbol, timeframe=timeframe,
            h4_bias=None, h1_bias=None, market_regime="UNKNOWN",
            active_session=None, active_profile_id=None,
            levels=StructuralLevels(0, 0, None, None, None, None, None, None),
            atr14=None,
            rejection_codes=rejection_codes,
            rejection_messages=rejection_messages,
        )

    # Use all candles EXCEPT the current (potentially open) candle
    closed = candles[:-1]  # exclude last (may be partially formed)
    closes = [c.close for c in closed]

    # ── Gate 2: Data freshness ─────────────────────────────────────────────────
    stale_s = quote.data_freshness_seconds if quote.data_freshness_seconds is not None else 0
    if stale_s > max_stale_seconds:
        rejection_codes.append("STALE_MARKET_DATA")
        rejection_messages.append(
            f"Quote is {stale_s:.1f}s old (max {max_stale_seconds}s). "
            "Cannot confirm entry with stale data."
        )

    # ── Gate 3: Session identification ────────────────────────────────────────
    now_utc = datetime.now(timezone.utc)
    session = _active_session(now_utc.hour)
    if session is None:
        rejection_codes.append("NO_ACTIVE_SESSION")
        rejection_messages.append(
            f"No eligible trading session is active at UTC {now_utc.hour:02d}:00. "
            "Market is in a dead-zone (18–22 UTC)."
        )

    # ── Gate 4: Profile matching ───────────────────────────────────────────────
    profile = _select_profile(symbol, session)
    if profile is None:
        rejection_codes.append("NO_MATCHING_PROFILE")
        rejection_messages.append(
            f"No strategy profile covers {symbol} during the {session} session."
        )

    # ── Compute indicators (always, so diagnostics panel can show them) ────────
    ema20_vals  = TechnicalIndicators.ema(closes, 20)
    ema50_vals  = TechnicalIndicators.ema(closes, 50)
    ema200_vals = TechnicalIndicators.ema(closes, 200) if len(closes) >= 200 else [None]*len(closes)
    atr_vals    = TechnicalIndicators.atr(closed, 14)

    h1_bias = _ema_bias(closes, len(closes))
    atr14   = atr_vals[-1] if atr_vals else None
    regime  = _detect_regime(closes, atr14 or 0)

    # ── H4 bias (from dedicated H4 candles or estimated from last 4 closes) ────
    if h4_candles and len(h4_candles) >= 30:
        h4_closed_closes = [c.close for c in h4_candles[:-1]]
        h4_bias = _ema_bias(h4_closed_closes, len(h4_closed_closes))
    else:
        # Estimate H4 bias using every-4th H1 close
        sampled = closes[::4]
        h4_bias = _ema_bias(sampled, len(sampled)) if len(sampled) >= 10 else "NEUTRAL"

    # ── Gate 5: Contradictory bias ─────────────────────────────────────────────
    if h4_bias != "NEUTRAL" and h1_bias != "NEUTRAL" and h4_bias != h1_bias:
        rejection_codes.append("CONTRADICTORY_HTF_BIAS")
        rejection_messages.append(
            f"H4 bias ({h4_bias}) contradicts H1 bias ({h1_bias}). "
            "Multi-timeframe alignment required before any entry."
        )

    # ── Gate 6: Weekend / market closed ───────────────────────────────────────
    if now_utc.weekday() in (5, 6):  # Saturday or Sunday
        rejection_codes.append("MARKET_CLOSED")
        rejection_messages.append("Market is closed over the weekend. No entries permitted.")

    levels = _structural_levels(closed)

    passed = len(rejection_codes) == 0

    return ContextResult(
        passed=passed,
        symbol=symbol,
        timeframe=timeframe,
        h4_bias=h4_bias,
        h1_bias=h1_bias,
        market_regime=regime,
        active_session=session,
        active_profile_id=profile["id"] if profile else None,
        levels=levels,
        atr14=atr14,
        rejection_codes=rejection_codes,
        rejection_messages=rejection_messages,
    )
