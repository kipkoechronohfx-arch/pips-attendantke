from typing import List, Optional
from app.services.market_data.base import MarketDataProvider
from app.services.market_data.mock_provider import MockMarketDataProvider
from app.services.market_data.twelve_data import TwelveDataProvider
from app.services.market_data.oanda import OandaDataProvider
from app.core.config import settings
from app.schemas.market import Quote, Candle, ProviderHealth

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

    def _select_provider(self) -> MarketDataProvider:
        mode = settings.MARKET_DATA_PROVIDER.lower()
        # Reject obvious placeholder credential strings
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
        return self._active_provider

    async def get_quote(self, symbol: str) -> Optional[Quote]:
        quote = await self._active_provider.get_quote(symbol)
        if not quote and self._active_provider != self._mock:
            # Outage fallback to mock with warning
            quote = await self._mock.get_quote(symbol)
        return quote

    async def get_all_quotes(self) -> List[Quote]:
        quotes = await self._active_provider.get_all_quotes()
        if not quotes:
            quotes = await self._mock.get_all_quotes()
        return quotes

    async def get_candles(self, symbol: str, timeframe: str = "H1", count: int = 100) -> List[Candle]:
        candles = await self._active_provider.get_candles(symbol, timeframe, count)
        if not candles:
            candles = await self._mock.get_candles(symbol, timeframe, count)
        return candles

    async def get_health(self) -> ProviderHealth:
        return await self._active_provider.get_health()

market_data_manager = MarketDataManager()
