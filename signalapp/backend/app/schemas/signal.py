from typing import Optional, List
from pydantic import BaseModel, Field
from datetime import datetime

class SignalBase(BaseModel):
    symbol: str
    direction: str = Field(..., description="BUY, SELL, or NEUTRAL")
    timeframe: str = "H1"
    entry_price: float
    entry_zone_high: Optional[float] = None
    entry_zone_low: Optional[float] = None
    stop_loss: float
    take_profit_1: float
    take_profit_2: Optional[float] = None
    take_profit_3: Optional[float] = None
    confidence: int = Field(85, ge=0, le=100)
    technical_justification: Optional[str] = None
    expires_at: Optional[datetime] = None

class SignalCreate(SignalBase):
    pass

class SignalUpdate(BaseModel):
    status: Optional[str] = None
    stop_loss: Optional[float] = None
    take_profit_1: Optional[float] = None
    take_profit_2: Optional[float] = None
    take_profit_3: Optional[float] = None
    technical_justification: Optional[str] = None

class SignalResponse(SignalBase):
    id: int
    risk_reward_ratio: float
    status: str
    source: str
    pnl_pips: float
    created_at: datetime
    closed_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class SignalPerformanceStats(BaseModel):
    total_signals: int
    active_signals: int
    closed_signals: int
    winning_signals: int
    losing_signals: int
    win_rate_percentage: float
    profit_factor: float
    average_rr_ratio: float
    total_net_pips: float
    max_drawdown_pips: float
    performance_by_pair: dict
    performance_by_timeframe: dict
