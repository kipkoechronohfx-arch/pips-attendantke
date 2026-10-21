import time
import asyncio
import logging
from typing import List, Optional
from app.services.market_data.base import MarketDataProvider
from app.services.market_data.mock_provider import MockMarketDataProvider
from app.services.market_data.twelve_data import TwelveDataProvider
from app.services.market_data.oanda import OandaDataProvider
from app.core.config import settings
from app.schemas.market import Quote, Candle, ProviderHealth

logger = logging.getLogger(__name__)

class MarketDataManager:
    def __init__(self):
        self._mock = MockMarketDataProvider()
        self._twelve = TwelveDataProvider(settings.TWELVE_DATA_API_KEY)
        self._oanda = OandaDataProvider(
            settings.OANDA_API_TOKEN,
            settings.OANDA_ACCOUNT_ID,
            is_practice=settings.OANDA_IS_PRACTICE
        )
        self._active_provider: MarketDataProvider = self._select_provider()
        self._consecutive_failures: int = 0
        self._circuit_open_until: float = 0.0

    def _select_provider(self) -> MarketDataProvider:
        mode = settings.MARKET_DATA_PROVIDER.lower()
        _PLACEHOLDERS = {"", "YOUR_OANDA_API_TOKEN_HERE", "YOUR_OANDA_ACCOUNT_ID_HERE", "replace-me"}
        oanda_token_valid = settings.OANDA_API_TOKEN not in _PLACEHOLDERS
        oanda_acct_valid  = settings.OANDA_ACCOUNT_ID not in _PLACEHOLDERS
        if mode == "oanda" and oanda_token_valid and oanda_acct_valid:
            return self._oanda
        if mode == "twelvedata" and settings.TWELVE_DATA_API_KEY:
            return self._twelve
        return self._mock

    @property
    def current_provider(self) -> MarketDataProvider:
        if self._is_circuit_open():
            return self._mock
        return self._active_provider

    def _is_circuit_open(self) -> bool:
        if self._active_provider == self._mock:
            return False
        return time.time() < self._circuit_open_until

    def _record_failure(self):
        self._consecutive_failures += 1
        if self._consecutive_failures >= 2:
            self._circuit_open_until = time.time() + 30.0
            logger.warning("[MarketDataManager] Live provider circuit breaker OPEN for 30s. Fast-fallback active.")

    def _record_success(self):
        self._consecutive_failures = 0
        self._circuit_open_until = 0.0

    async def get_quote(self, symbol: str) -> Optional[Quote]:
        if self._is_circuit_open():
            return await self._mock.get_quote(symbol)

        try:
            quote = await asyncio.wait_for(self._active_provider.get_quote(symbol), timeout=2.5)
            if quote:
                self._record_success()
                return quote
            self._record_failure()
        except Exception:
            self._record_failure()

        return await self._mock.get_quote(symbol)

    async def get_all_quotes(self) -> List[Quote]:
        if self._is_circuit_open():
            return await self._mock.get_all_quotes()

        try:
            quotes = await asyncio.wait_for(self._active_provider.get_all_quotes(), timeout=3.0)
            if quotes:
                self._record_success()
                return quotes
            self._record_failure()
        except Exception:
            self._record_failure()

        return await self._mock.get_all_quotes()

    async def get_candles(self, symbol: str, timeframe: str = "H1", count: int = 100) -> List[Candle]:
        if self._is_circuit_open():
            return await self._mock.get_candles(symbol, timeframe, count)

        try:
            candles = await asyncio.wait_for(self._active_provider.get_candles(symbol, timeframe, count), timeout=3.5)
            if candles:
                self._record_success()
                return candles
            self._record_failure()
        except Exception:
            self._record_failure()

        return await self._mock.get_candles(symbol, timeframe, count)

    async def get_health(self) -> ProviderHealth:
        if self._is_circuit_open():
            return await self._mock.get_health()
        try:
            return await asyncio.wait_for(self._active_provider.get_health(), timeout=2.0)
        except Exception:
            return await self._mock.get_health()

market_data_manager = MarketDataManager()
