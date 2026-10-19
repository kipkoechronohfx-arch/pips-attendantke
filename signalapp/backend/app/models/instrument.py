from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime
from app.core.database import Base

class Instrument(Base):
    __tablename__ = "instruments"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String(20), unique=True, index=True, nullable=False) # e.g. EUR/USD
    name = Column(String(100), nullable=False)
    category = Column(String(50), default="FOREX") # FOREX, COMMODITIES, CRYPTO
    pip_size = Column(Float, default=0.0001, nullable=False)
    contract_size = Column(Float, default=100000.0, nullable=False)
    quote_currency = Column(String(10), default="USD", nullable=False)
    base_currency = Column(String(10), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
