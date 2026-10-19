from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime
from app.core.database import Base

class EconomicEvent(Base):
    __tablename__ = "economic_events"

    id = Column(Integer, primary_key=True, index=True)
    event_name = Column(String(200), nullable=False)
    country = Column(String(50), nullable=False)
    currency = Column(String(10), nullable=False, index=True)
    scheduled_time_utc = Column(DateTime, nullable=False, index=True)
    impact = Column(String(20), default="MEDIUM", index=True) # HIGH, MEDIUM, LOW
    previous = Column(String(50), nullable=True)
    forecast = Column(String(50), nullable=True)
    actual = Column(String(50), nullable=True)
    status = Column(String(20), default="SCHEDULED") # SCHEDULED, RELEASED, REVISED
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
