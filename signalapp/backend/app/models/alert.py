from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text
from app.core.database import Base

class PriceAlert(Base):
    __tablename__ = "price_alerts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    symbol = Column(String(20), nullable=False, index=True)
    target_price = Column(Float, nullable=False)
    condition = Column(String(10), default="ABOVE") # ABOVE, BELOW
    notes = Column(String(200), nullable=True)
    is_active = Column(Boolean, default=True)
    triggered_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class AdminAuditLog(Base):
    __tablename__ = "admin_audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    admin_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    action = Column(String(100), nullable=False) # PUBLISH_SIGNAL, UPDATE_SIGNAL, CANCEL_SIGNAL, MANAGE_USER, etc.
    target_type = Column(String(50), nullable=False) # SIGNAL, USER, CONFIG
    target_id = Column(String(50), nullable=True)
    details = Column(Text, nullable=True)
    ip_address = Column(String(50), nullable=True)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
