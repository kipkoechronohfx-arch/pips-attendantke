from abc import ABC, abstractmethod
from typing import List, Dict, Optional, Any
from app.schemas.market import Quote, Candle, ProviderHealth

class MarketDataProvider(ABC):
    """
    Core Market Data Provider Interface for Forex Signal Pro.
    Supports development testing, Twelve Data, and commercial licensed providers.
    """
    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Human-readable provider identifier"""
        pass

    @property
    @abstractmethod
    def is_live_feed(self) -> bool:
        """True only if connected to an authentic licensed real-time exchange/broker feed"""
        pass

    @abstractmethod
    async def get_quote(self, symbol: str) -> Optional[Quote]:
        """Fetch current bid, ask, spread, mid, and 24h change for a symbol"""
        pass

    @abstractmethod
    async def get_candles(self, symbol: str, timeframe: str = "H1", limit: int = 100) -> List[Candle]:
        """Fetch historical OHLCV candlestick data"""
        pass

    @abstractmethod
    async def get_instruments(self) -> List[Dict[str, Any]]:
        """Fetch list of supported instruments, contract sizes, and pip specifications"""
        pass

    @abstractmethod
    async def get_market_status(self) -> Dict[str, Any]:
        """Fetch market session status (Tokyo, London, New York open/closed) and weekend state"""
        pass

    @abstractmethod
    async def get_provider_health(self) -> ProviderHealth:
        """Check provider connectivity, API credit usage, latency, and status"""
        pass
