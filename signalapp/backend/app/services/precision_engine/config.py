"""
Precision Entry Engine — Instrument Specifications & Strategy Profile Definitions.

All configurable thresholds live here. No business-logic constants are
hard-coded in the engine modules. Adjust here to tune the system per
instrument, timeframe, or session.
"""

from typing import Dict, Any, List

# ──────────────────────────────────────────────────────────────────────────────
# Instrument Specifications
# pip_size     : value of 1 pip in price units
# tick_size    : minimum price move (= pip_size for FX)
# digits       : decimal places for price rounding
# contract_size: units per 1 standard lot
# max_spread   : maximum permitted spread in pips before gating
# max_stale_s  : maximum age of quote in seconds before considered stale
# ──────────────────────────────────────────────────────────────────────────────
INSTRUMENT_SPECS: Dict[str, Dict[str, Any]] = {
    "EUR/USD": {"pip_size": 0.0001, "tick_size": 0.00001, "digits": 5, "contract_size": 100_000, "max_spread": 2.0,  "max_stale_s": 15},
    "GBP/USD": {"pip_size": 0.0001, "tick_size": 0.00001, "digits": 5, "contract_size": 100_000, "max_spread": 2.5,  "max_stale_s": 15},
    "USD/JPY": {"pip_size": 0.01,   "tick_size": 0.001,   "digits": 3, "contract_size": 100_000, "max_spread": 2.0,  "max_stale_s": 15},
    "USD/CHF": {"pip_size": 0.0001, "tick_size": 0.00001, "digits": 5, "contract_size": 100_000, "max_spread": 2.5,  "max_stale_s": 15},
    "AUD/USD": {"pip_size": 0.0001, "tick_size": 0.00001, "digits": 5, "contract_size": 100_000, "max_spread": 2.5,  "max_stale_s": 15},
    "NZD/USD": {"pip_size": 0.0001, "tick_size": 0.00001, "digits": 5, "contract_size": 100_000, "max_spread": 3.0,  "max_stale_s": 15},
    "USD/CAD": {"pip_size": 0.0001, "tick_size": 0.00001, "digits": 5, "contract_size": 100_000, "max_spread": 2.5,  "max_stale_s": 15},
    "EUR/JPY": {"pip_size": 0.01,   "tick_size": 0.001,   "digits": 3, "contract_size": 100_000, "max_spread": 3.0,  "max_stale_s": 15},
    "GBP/JPY": {"pip_size": 0.01,   "tick_size": 0.001,   "digits": 3, "contract_size": 100_000, "max_spread": 3.5,  "max_stale_s": 15},
    "XAU/USD": {"pip_size": 0.1,    "tick_size": 0.01,    "digits": 2, "contract_size": 100,     "max_spread": 5.0,  "max_stale_s": 10},
    "XAG/USD": {"pip_size": 0.01,   "tick_size": 0.001,   "digits": 3, "contract_size": 5_000,   "max_spread": 6.0,  "max_stale_s": 10},
    "BTC/USD": {"pip_size": 1.0,    "tick_size": 0.1,     "digits": 1, "contract_size": 1,       "max_spread": 20.0, "max_stale_s": 10},
}

def get_spec(symbol: str) -> Dict[str, Any]:
    """Return spec for symbol, falling back to a safe 5-digit FX default."""
    return INSTRUMENT_SPECS.get(symbol, {
        "pip_size": 0.0001, "tick_size": 0.00001, "digits": 5,
        "contract_size": 100_000, "max_spread": 3.0, "max_stale_s": 20,
    })


# ──────────────────────────────────────────────────────────────────────────────
# Strategy Profiles
# Each profile defines the behaviour of Stage B and Stage C for a session.
# ──────────────────────────────────────────────────────────────────────────────
STRATEGY_PROFILES: List[Dict[str, Any]] = [
    {
        "id": "asian_range_break",
        "name": "Asian Range Breakout",
        "session_id": "ASIAN",
        "timezone": "Asia/Tokyo",
        "utc_open": 23,   # previous day
        "utc_close": 8,
        "strategy_type": "RANGE_BREAKOUT",
        "eligible_instruments": ["AUD/USD", "NZD/USD", "USD/JPY", "GBP/JPY", "EUR/JPY", "XAU/USD"],
        "max_spread_pips": 2.5,
        "min_rr": 1.5,
        "min_confluence_score": 60,
        "news_blackout_minutes": 30,
        "setup_expiration_bars": 8,
        "max_entry_deviation_pips": 5.0,
        "description": "Trades breakouts of the Asian range with confirmation on the London open.",
        "rules": [
            "Asian session range identified from 00:00–08:00 UTC",
            "Long: close above Asian High with rejection-candle confirmation on M15",
            "Short: close below Asian Low with rejection-candle confirmation on M15",
            "Stop: 1 ATR beyond the broken boundary",
            "Invalidated if price reverts through the broken level",
        ],
    },
    {
        "id": "london_ob_retest",
        "name": "London Open Order-Block Retest",
        "session_id": "LONDON",
        "timezone": "Europe/London",
        "utc_open": 7,
        "utc_close": 12,
        "strategy_type": "OB_RETEST",
        "eligible_instruments": ["EUR/USD", "GBP/USD", "USD/CHF", "EUR/JPY", "GBP/JPY", "XAU/USD"],
        "max_spread_pips": 2.0,
        "min_rr": 2.0,
        "min_confluence_score": 65,
        "news_blackout_minutes": 30,
        "setup_expiration_bars": 12,
        "max_entry_deviation_pips": 6.0,
        "description": "Identifies H1/H4 order blocks and waits for a clean retest during the London session.",
        "rules": [
            "H4 directional bias required (EMA-20 > EMA-50 for bulls)",
            "Confirmed BOS or CHoCH on H1 required before setup activation",
            "Entry on retest of last bearish/bullish OB with pin-bar confirmation",
            "Stop: 1 ATR below OB low (for longs) / above OB high (for shorts)",
            "Setup expires after 12 bars without retest",
        ],
    },
    {
        "id": "ny_liquidity_sweep",
        "name": "New York Liquidity Sweep & Reversal",
        "session_id": "NEW_YORK",
        "timezone": "America/New_York",
        "utc_open": 13,
        "utc_close": 20,
        "strategy_type": "LIQUIDITY_SWEEP",
        "eligible_instruments": ["EUR/USD", "GBP/USD", "USD/JPY", "USD/CAD", "USD/CHF", "XAU/USD"],
        "max_spread_pips": 2.5,
        "min_rr": 2.0,
        "min_confluence_score": 70,
        "news_blackout_minutes": 30,
        "setup_expiration_bars": 10,
        "max_entry_deviation_pips": 8.0,
        "description": "Fades NY session stop-raids that sweep prior session highs/lows and reject with displacement.",
        "rules": [
            "Liquidity sweep of London high/low or PDH/PDL confirmed by wick beyond level",
            "Rejection candle must close back inside the swept range on M15 or H1",
            "Displacement (large body > 1.5× ATR body average) confirms flip",
            "FVG formed during displacement is the entry zone",
            "Stop: beyond the sweep wick",
            "Invalidated if price makes new high/low beyond the sweep in same session",
        ],
    },
    {
        "id": "ny_london_overlap_momentum",
        "name": "London–New York Overlap Momentum",
        "session_id": "OVERLAP",
        "timezone": "America/New_York",
        "utc_open": 13,
        "utc_close": 17,
        "strategy_type": "TREND_CONTINUATION",
        "eligible_instruments": ["EUR/USD", "GBP/USD", "USD/JPY", "XAU/USD", "GBP/JPY"],
        "max_spread_pips": 2.0,
        "min_rr": 1.5,
        "min_confluence_score": 62,
        "news_blackout_minutes": 20,
        "setup_expiration_bars": 6,
        "max_entry_deviation_pips": 5.0,
        "description": "Trends in the H1 direction confirmed by multi-EMA alignment and MACD histogram acceleration.",
        "rules": [
            "H4 trend and H1 trend must agree (both bullish or both bearish)",
            "EMA-20 > EMA-50 > EMA-200 (bull) or reverse (bear)",
            "MACD histogram in same direction and accelerating",
            "Pullback to H1 EMA-20 with pin-bar or engulfing confirmation",
            "No entry within 30 min of high-impact news",
        ],
    },
]

# Map session_id → profile for quick lookup
PROFILE_MAP: Dict[str, Dict[str, Any]] = {p["id"]: p for p in STRATEGY_PROFILES}
