from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text
from app.core.database import Base

class TradingSignal(Base):
    __tablename__ = "trading_signals"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String(20), index=True, nullable=False)
    direction = Column(String(10), nullable=False) # BUY, SELL, NEUTRAL
    timeframe = Column(String(10), default="H1", nullable=False) # M5, M15, M30, H1, H4, D1
    
    entry_price = Column(Float, nullable=False)
    entry_zone_high = Column(Float, nullable=True)
    entry_zone_low = Column(Float, nullable=True)
    stop_loss = Column(Float, nullable=False)
    take_profit_1 = Column(Float, nullable=False)
    take_profit_2 = Column(Float, nullable=True)
    take_profit_3 = Column(Float, nullable=True)
    
    risk_reward_ratio = Column(Float, nullable=False)
    confidence = Column(Integer, default=85) # 0 - 100%
    technical_justification = Column(Text, nullable=True)
    
    status = Column(String(20), default="ACTIVE", index=True) # ACTIVE, HIT_TP1, HIT_TP2, HIT_TP3, STOPPED_OUT, CANCELLED, EXPIRED
    source = Column(String(20), default="AUTO", index=True) # AUTO, ADMIN, ANALYST
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    pnl_pips = Column(Float, default=0.0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    expires_at = Column(DateTime, nullable=True)
    closed_at = Column(DateTime, nullable=True)
