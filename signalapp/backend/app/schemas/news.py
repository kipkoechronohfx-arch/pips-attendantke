from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime

class NewsArticleResponse(BaseModel):
    id: int
    title: str
    summary: Optional[str] = None
    source: str
    url: str
    sentiment: str # BULLISH, BEARISH, NEUTRAL
    affected_currencies: str
    published_at: datetime

    class Config:
        from_attributes = True

class EconomicEventResponse(BaseModel):
    id: int
    event_name: str
    country: str
    currency: str
    scheduled_time_utc: datetime
    scheduled_time_local: Optional[str] = None
    impact: str # HIGH, MEDIUM, LOW
    previous: Optional[str] = None
    forecast: Optional[str] = None
    actual: Optional[str] = None
    status: str

    class Config:
        from_attributes = True

class AlertCreate(BaseModel):
    symbol: str
    target_price: float
    condition: str = "ABOVE" # ABOVE, BELOW
    notes: Optional[str] = None

class AlertResponse(BaseModel):
    id: int
    user_id: int
    symbol: str
    target_price: float
    condition: str
    notes: Optional[str] = None
    is_active: bool
    triggered_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True
