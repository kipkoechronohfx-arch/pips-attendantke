from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime

class Quote(BaseModel):
    symbol: str
    bid: float
    ask: float
    spread: float
    mid: float
    change_24h: float
    change_24h_pct: float
    high_24h: float
    low_24h: float
    timestamp_utc: datetime
    provider: str
    is_live: bool
    data_freshness_seconds: float

class Candle(BaseModel):
    time: int # Unix timestamp in seconds
    open: float
    high: float
    low: float
    close: float
    volume: Optional[float] = 0.0

class ProviderHealth(BaseModel):
    provider_name: str
    status: str # CONNECTED, DEGRADED, OUTAGE
    is_live: bool
    last_update_utc: datetime
    latency_ms: float
    active_symbols: int
