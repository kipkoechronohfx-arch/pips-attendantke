from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Float, Text
from app.core.database import Base


class MT5Account(Base):
    """Stores client broker credentials (password encrypted) for cloud copy-trading"""
    __tablename__ = "mt5_accounts"

    id = Column(Integer, primary_key=True, index=True)
    client_email = Column(String(255), nullable=False, index=True)
    nickname = Column(String(100), nullable=True)           # e.g. "My Exness Prop"
    broker_name = Column(String(100), nullable=False)       # e.g. "Exness"
    mt5_server = Column(String(200), nullable=False)        # e.g. "Exness-MT5Real6"
    mt5_login = Column(String(50), nullable=False)          # account number
    encrypted_password = Column(Text, nullable=False)       # AES-256 encrypted
    risk_percent = Column(Float, default=1.0)               # 1.0 = 1% per trade
    is_active = Column(Boolean, default=True)
    auto_breakeven = Column(Boolean, default=True)
    status = Column(String(30), default="PENDING")          # PENDING, CONNECTED, ERROR, DISCONNECTED
    last_equity = Column(Float, nullable=True)
    last_balance = Column(Float, nullable=True)
    last_connected_at = Column(DateTime, nullable=True)
    error_message = Column(Text, nullable=True)
    # MetaApi provisioned account UUID (set after first successful connection)
    metaapi_account_id = Column(String(64), nullable=True, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))
