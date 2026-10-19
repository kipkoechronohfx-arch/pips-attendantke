import time
import random
from datetime import datetime, timezone
from typing import List, Dict, Optional, Any
from app.services.market_data.base import MarketDataProvider
from app.schemas.market import Quote, Candle, ProviderHealth

DEFAULT_INSTRUMENTS: Dict[str, Dict[str, Any]] = {
    "EUR/USD": {"base": 1.08520, "spread_pips": 0.8, "pip": 0.0001, "digits": 5, "contract_size": 100000, "category": "FOREX", "quote": "USD"},
    "GBP/USD": {"base": 1.30240, "spread_pips": 1.2, "pip": 0.0001, "digits": 5, "contract_size": 100000, "category": "FOREX", "quote": "USD"},
    "USD/JPY": {"base": 149.250, "spread_pips": 0.9, "pip": 0.01, "digits": 3, "contract_size": 100000, "category": "FOREX", "quote": "JPY"},
    "USD/CHF": {"base": 0.86540, "spread_pips": 1.4, "pip": 0.0001, "digits": 5, "contract_size": 100000, "category": "FOREX", "quote": "CHF"},
    "AUD/USD": {"base": 0.66850, "spread_pips": 1.1, "pip": 0.0001, "digits": 5, "contract_size": 100000, "category": "FOREX", "quote": "USD"},
    "NZD/USD": {"base": 0.60520, "spread_pips": 1.6, "pip": 0.0001, "digits": 5, "contract_size": 100000, "category": "FOREX", "quote": "USD"},
    "USD/CAD": {"base": 1.37850, "spread_pips": 1.3, "pip": 0.0001, "digits": 5, "contract_size": 100000, "category": "FOREX", "quote": "CAD"},
    "EUR/JPY": {"base": 161.850, "spread_pips": 1.5, "pip": 0.01, "digits": 3, "contract_size": 100000, "category": "FOREX", "quote": "JPY"},
    "GBP/JPY": {"base": 194.320, "spread_pips": 1.8, "pip": 0.01, "digits": 3, "contract_size": 100000, "category": "FOREX", "quote": "JPY"},
    "XAU/USD": {"base": 2652.50, "spread_pips": 2.5, "pip": 0.1, "digits": 2, "contract_size": 100, "category": "METALS", "quote": "USD"},
    "XAG/USD": {"base": 31.550, "spread_pips": 2.0, "pip": 0.01, "digits": 3, "contract_size": 5000, "category": "METALS", "quote": "USD"},
    "BTC/USD": {"base": 67450.0, "spread_pips": 8.0, "pip": 1.0, "digits": 1, "contract_size": 1, "category": "CRYPTO", "quote": "USD"},
}

class MockMarketDataProvider(MarketDataProvider):
    """
    Development Mock Provider with Brownian random-walk micro-volatility.
    Explicitly labeled as simulated with is_live=False.
    Never manufactures fake live prices or misrepresents data sources.
    """
    def __init__(self):
        self._current_prices: Dict[str, float] = {
            sym: data["base"] for sym, data in DEFAULT_INSTRUMENTS.items()
        }
        self._open_prices: Dict[str, float] = {
            sym: data["base"] * (1 + random.uniform(-0.004, 0.004)) for sym, data in DEFAULT_INSTRUMENTS.items()
        }
        self._last_tick_time = time.time()

    @property
    def provider_name(self) -> str:
        return "Mock Market Data Provider (Simulated Development Feed)"

    @property
    def is_live_feed(self) -> bool:
        return False

    def _tick_prices(self):
        now = time.time()
        elapsed = now - self._last_tick_time
        if elapsed > 0.4:
            for sym, cfg in DEFAULT_INSTRUMENTS.items():
                pip = cfg["pip"]
                jitter = random.choice([-1.5, -1.0, -0.5, 0.0, 0.5, 1.0, 1.5]) * pip * random.uniform(0.3, 1.1)
                diff = self._current_prices[sym] - cfg["base"]
                drift = -0.05 * diff
                self._current_prices[sym] = round(self._current_prices[sym] + jitter + drift, cfg["digits"])
            self._last_tick_time = now

    async def get_quote(self, symbol: str) -> Optional[Quote]:
        self._tick_prices()
        cfg = DEFAULT_INSTRUMENTS.get(symbol)
        if not cfg:
            return None

        mid = self._current_prices[symbol]
        spread_amt = cfg["spread_pips"] * cfg["pip"]
        bid = round(mid - (spread_amt / 2.0), cfg["digits"])
        ask = round(mid + (spread_amt / 2.0), cfg["digits"])
        open_p = self._open_prices[symbol]
        change_24h = round(mid - open_p, cfg["digits"])
        pct = round((change_24h / open_p) * 100, 2)

        return Quote(
            symbol=symbol,
            bid=bid,
            ask=ask,
            spread=round(cfg["spread_pips"], 1),
            mid=mid,
            change_24h=change_24h,
            change_24h_pct=pct,
            high_24h=round(max(mid, open_p) * 1.003, cfg["digits"]),
            low_24h=round(min(mid, open_p) * 0.997, cfg["digits"]),
            timestamp_utc=datetime.now(timezone.utc),
            provider=self.provider_name,
            is_live=self.is_live_feed,
            data_freshness_seconds=0.1
        )

    async def get_candles(self, symbol: str, timeframe: str = "H1", limit: int = 100) -> List[Candle]:
        cfg = DEFAULT_INSTRUMENTS.get(symbol, {"base": 1.0850, "pip": 0.0001, "digits": 5})
        pip = cfg["pip"]
        digits = cfg["digits"]

        interval_map = {"M5": 300, "M15": 900, "M30": 1800, "H1": 3600, "H4": 14400, "D1": 86400}
        interval_secs = interval_map.get(timeframe, 3600)
        now = int(time.time())

        candles = []
        price = self._current_prices.get(symbol, cfg["base"])
        for i in range(limit):
            t = now - ((limit - 1 - i) * interval_secs)
            c_open = price
            change = random.gauss(0, 14 * pip)
            c_close = c_open + change
            c_high = max(c_open, c_close) + abs(random.gauss(0, 7 * pip))
            c_low = min(c_open, c_close) - abs(random.gauss(0, 7 * pip))
            candles.append(Candle(
                time=t,
                open=round(c_open, digits),
                high=round(c_high, digits),
                low=round(c_low, digits),
                close=round(c_close, digits),
                volume=round(random.uniform(500, 5000), 2)
            ))
            price = c_close

        return candles

    async def get_instruments(self) -> List[Dict[str, Any]]:
        return [
            {"symbol": k, **v} for k, v in DEFAULT_INSTRUMENTS.items()
        ]

    async def get_market_status(self) -> Dict[str, Any]:
        now_utc = datetime.now(timezone.utc)
        weekday = now_utc.weekday()
        is_weekend = weekday in [5, 6] # Saturday or Sunday
        return {
            "is_market_open": not is_weekend,
            "current_session": "London / New York Overlap" if 13 <= now_utc.hour <= 17 else "Asian Session",
            "server_time_utc": now_utc.isoformat(),
            "weekend_closed": is_weekend
        }

    async def get_provider_health(self) -> ProviderHealth:
        return ProviderHealth(
            provider_name=self.provider_name,
            status="CONNECTED",
            is_live=self.is_live_feed,
            last_update_utc=datetime.now(timezone.utc),
            latency_ms=3.5,
            active_symbols=len(DEFAULT_INSTRUMENTS)
        )

    async def get_health(self) -> ProviderHealth:
        """Alias for manager compatibility"""
        return await self.get_provider_health()

    async def get_all_quotes(self) -> List["Quote"]:
        """Return live-ticked quotes for all default instruments"""
        self._tick_prices()
        quotes = []
        for symbol in DEFAULT_INSTRUMENTS:
            q = await self.get_quote(symbol)
            if q:
                quotes.append(q)
        return quotes
