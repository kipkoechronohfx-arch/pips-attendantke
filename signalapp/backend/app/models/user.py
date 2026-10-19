from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum
import enum
from app.core.database import Base

class UserRole(str, enum.Enum):
    SUPER_ADMIN = "SUPER_ADMIN"
    ADMIN = "ADMIN"
    ANALYST = "ANALYST"
    USER = "USER"

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(100), nullable=True)
    role = Column(String(20), default=UserRole.USER.value, nullable=False)
    timezone = Column(String(50), default="Africa/Nairobi", nullable=False)
    account_currency = Column(String(10), default="USD", nullable=False)
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
