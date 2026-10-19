from typing import Optional
from pydantic import BaseModel, EmailStr
from datetime import datetime

class UserBase(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None
    timezone: str = "Africa/Nairobi"
    account_currency: str = "USD"

class UserCreate(UserBase):
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    user_id: int
    email: str
    full_name: Optional[str] = None

class TokenPayload(BaseModel):
    sub: Optional[str] = None
    role: Optional[str] = None

class UserResponse(UserBase):
    id: int
    role: str
    is_active: bool
    is_verified: bool
    created_at: datetime

    class Config:
        from_attributes = True
