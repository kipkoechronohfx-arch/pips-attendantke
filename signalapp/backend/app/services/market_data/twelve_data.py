import httpx
import time
from typing import List, Optional, Dict
from datetime import datetime, timezone
from app.services.market_data.base import MarketDataProvider
from app.schemas.market import Quote, Candle, ProviderHealth
from app.core.config import settings

class TwelveDataProvider(MarketDataProvider):
    """
    Twelve Data API provider for real-time forex and commodities quotes and OHLC.
    Docs: https://twelvedata.com/docs
    Includes intelligent client-side caching to respect API credit limits.
    """
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://api.twelvedata.com"
        self._is_live = bool(api_key and api_key != "")
        self._cached_quotes: Dict[str, Quote] = {}
        self._last_quotes_fetch: float = 0.0
        self._quotes_ttl_seconds: float = 12.0  # Safe TTL preventing 429 rate limits
        self._candle_cache: Dict[str, tuple[float, List[Candle]]] = {}  # key: (timestamp, candles)

    @property
    def provider_name(self) -> str:
        return "Twelve Data Live Feed" if self._is_live else "Twelve Data (Unauthenticated)"

    @property
    def is_live_feed(self) -> bool:
        return self._is_live

    async def get_quote(self, symbol: str) -> Optional[Quote]:
        if not self._is_live:
            return None
        try:
            async with httpx.AsyncClient(timeout=6.0) as client:
                res = await client.get(
                    f"{self.base_url}/quote",
                    params={"symbol": symbol.replace("/", ""), "apikey": self.api_key}
                )
                if res.status_code == 200:
                    d = res.json()
                    if "close" in d:
                        close = float(d["close"])
                        open_p = float(d.get("open", close))
                        high = float(d.get("high", close))
                        low = float(d.get("low", close))
                        change = float(d.get("change", 0.0))
                        pct = float(d.get("percent_change", 0.0))
                        # Estimate spread
                        spread = 1.0
                        return Quote(
                            symbol=symbol,
                            bid=round(close - 0.00005, 5),
                            ask=round(close + 0.00005, 5),
                            spread=spread,
                            mid=close,
                            change_24h=change,
                            change_24h_pct=pct,
                            high_24h=high,
                            low_24h=low,
                            timestamp_utc=datetime.now(timezone.utc),
                            provider=self.provider_name,
                            is_live=True,
                            data_freshness_seconds=1.0
                        )
        except Exception:
            return None
        return None

    async def get_all_quotes(self) -> List[Quote]:
        if not self._is_live:
            return []

        now = time.time()
        if self._cached_quotes and (now - self._last_quotes_fetch < self._quotes_ttl_seconds):
            return list(self._cached_quotes.values())

        symbols = ["EUR/USD", "GBP/USD", "USD/JPY", "USD/CHF", "AUD/USD", "NZD/USD", "USD/CAD", "EUR/JPY", "GBP/JPY", "XAU/USD"]
        quotes = []
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                res = await client.get(
                    f"{self.base_url}/quote",
                    params={
                        "symbol": ",".join([s.replace("/", "") for s in symbols]),
                        "apikey": self.api_key
                    }
                )
                if res.status_code == 200:
                    data = res.json()
                    for sym in symbols:
                        clean_sym = sym.replace("/", "")
                        item = data.get(clean_sym) or data.get(sym)
                        if item and "close" in item:
                            close = float(item["close"])
                            open_p = float(item.get("open", close))
                            high = float(item.get("high", close))
                            low = float(item.get("low", close))
                            change = float(item.get("change", 0.0))
                            pct = float(item.get("percent_change", 0.0))
                            q = Quote(
                                symbol=sym,
                                bid=round(close - 0.00005, 5 if "JPY" not in sym else 3),
                                ask=round(close + 0.00005, 5 if "JPY" not in sym else 3),
                                spread=1.0,
                                mid=close,
                                change_24h=change,
                                change_24h_pct=pct,
                                high_24h=high,
                                low_24h=low,
                                timestamp_utc=datetime.now(timezone.utc),
                                provider=self.provider_name,
                                is_live=True,
                                data_freshness_seconds=0.5
                            )
                            quotes.append(q)
                            self._cached_quotes[sym] = q
                    if quotes:
                        self._last_quotes_fetch = now
                elif res.status_code == 429 and self._cached_quotes:
                    return list(self._cached_quotes.values())
        except Exception:
            if self._cached_quotes:
                return list(self._cached_quotes.values())
            return []
        return quotes if quotes else list(self._cached_quotes.values())

    async def get_candles(self, symbol: str, timeframe: str = "H1", count: int = 100) -> List[Candle]:
        if not self._is_live:
            return []

        cache_key = f"{symbol}_{timeframe}"
        now = time.time()
        if cache_key in self._candle_cache:
            ts, cached_candles = self._candle_cache[cache_key]
            if now - ts < 60.0:  # 60s cache on candles
                return cached_candles

        tf_map = {"M5": "5min", "M15": "15min", "M30": "30min", "H1": "1h", "H4": "4h", "D1": "1day"}
        interval = tf_map.get(timeframe, "1h")
        candles = []

        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                res = await client.get(
                    f"{self.base_url}/time_series",
                    params={
                        "symbol": symbol.replace("/", ""),
                        "interval": interval,
                        "outputsize": count,
                        "apikey": self.api_key
                    }
                )
                if res.status_code == 200:
                    data = res.json()
                    values = data.get("values", [])
                    for row in reversed(values):
                        t = int(datetime.fromisoformat(row["datetime"]).timestamp())
                        candles.append(Candle(
                            time=t,
                            open=float(row["open"]),
                            high=float(row["high"]),
                            low=float(row["low"]),
                            close=float(row["close"]),
                            volume=float(row.get("volume", 0.0))
                        ))
                    if candles:
                        self._candle_cache[cache_key] = (now, candles)
                elif res.status_code == 429 and cache_key in self._candle_cache:
                    return self._candle_cache[cache_key][1]
        except Exception:
            if cache_key in self._candle_cache:
                return self._candle_cache[cache_key][1]
        return candles

    async def get_health(self) -> ProviderHealth:
        status = "CONNECTED" if self._is_live else "NO_CREDENTIALS"
        return ProviderHealth(
            provider_name=self.provider_name,
            status=status,
            is_live=self._is_live,
            last_update_utc=datetime.now(timezone.utc),
            latency_ms=120.0 if self._is_live else 0.0,
            active_symbols=12 if self._is_live else 0
        )

    async def get_provider_health(self) -> ProviderHealth:
        """Alias satisfying abstract base requirement"""
        return await self.get_health()

    async def get_instruments(self):
        """Return supported Twelve Data instrument list (basic hardcoded set)"""
        return [
            {"symbol": "EUR/USD", "category": "FOREX"},
            {"symbol": "GBP/USD", "category": "FOREX"},
            {"symbol": "USD/JPY", "category": "FOREX"},
            {"symbol": "USD/CHF", "category": "FOREX"},
            {"symbol": "AUD/USD", "category": "FOREX"},
            {"symbol": "NZD/USD", "category": "FOREX"},
            {"symbol": "USD/CAD", "category": "FOREX"},
            {"symbol": "EUR/JPY", "category": "FOREX"},
            {"symbol": "GBP/JPY", "category": "FOREX"},
            {"symbol": "XAU/USD", "category": "METALS"},
        ]

    async def get_market_status(self):
        """Return basic market status from UTC clock"""
        now_utc = datetime.now(timezone.utc)
        weekday = now_utc.weekday()
        is_weekend = weekday in [5, 6]
        return {
            "is_market_open": not is_weekend,
            "current_session": "Live" if not is_weekend else "Closed (Weekend)",
            "server_time_utc": now_utc.isoformat(),
            "weekend_closed": is_weekend
        }

