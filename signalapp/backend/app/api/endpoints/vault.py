"""
MT5 Broker Vault API — Encrypted client account management and cloud copy-trading
Clients add their broker credentials once; the server handles auto-execution on every signal.
"""

import base64
import hashlib
import os
from typing import List, Optional
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Header, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from cryptography.fernet import Fernet

from app.core.config import settings
from app.core.database import get_db
from app.models.mt5_account import MT5Account
from app.models.user import User, UserRole
from app.api.deps import get_current_user

router = APIRouter()

# ─── Authenticated AES-128-CBC + HMAC-SHA256 (Fernet) Encryption ─────────────
def _get_fernet() -> Fernet:
    key_bytes = hashlib.sha256((settings.SECRET_KEY + "MT5_VAULT_FERNET_SALT_V2").encode()).digest()
    fernet_key = base64.urlsafe_b64encode(key_bytes)
    return Fernet(fernet_key)

def encrypt_password(plain: str) -> str:
    f = _get_fernet()
    return f.encrypt(plain.encode("utf-8")).decode("utf-8")

def decrypt_password(enc: str) -> str:
    try:
        f = _get_fernet()
        return f.decrypt(enc.encode("utf-8")).decode("utf-8")
    except Exception:
        # Fallback for backward compatibility with legacy XOR entries
        raw = (settings.SECRET_KEY + "" + "MT5_VAULT_V1").encode()
        legacy_key = hashlib.sha256(raw).digest()
        data = base64.urlsafe_b64decode(enc.encode())
        return bytes(b ^ legacy_key[i % len(legacy_key)] for i, b in enumerate(data)).decode("utf-8")

# ─── Known MT5 brokers for client dropdown ───────────────────────────────────
KNOWN_BROKERS = [
    {"name": "Exness",         "servers": ["Exness-MT5Real6", "Exness-MT5Real7", "Exness-MT5Real8", "Exness-MT5Trial4"]},
    {"name": "IC Markets",     "servers": ["ICMarketsSC-MT5-1", "ICMarketsSC-MT5-2", "ICMarketsEU-MT5-1", "ICMarketsEU-MT5-2"]},
    {"name": "Pepperstone",    "servers": ["Pepperstone-MT5-Live01", "Pepperstone-MT5-Live02", "PepperstoneFX-MT5-1"]},
    {"name": "FTMO",           "servers": ["FTMO-Server3", "FTMO-Server4"]},
    {"name": "FundedNext",     "servers": ["FundedNext-Live", "FundedNext-Demo"]},
    {"name": "OctaFX",         "servers": ["OctaFX-Real", "OctaFX-Demo2"]},
    {"name": "XM",             "servers": ["XMGlobal-MT5 1", "XMGlobal-MT5 2", "XMGlobal-MT5 3"]},
    {"name": "HF Markets",     "servers": ["HFMarkets-Server", "HFMarketsGST-Demo"]},
    {"name": "Deriv",          "servers": ["Deriv-Server", "Deriv-Demo"]},
    {"name": "BlackBull",      "servers": ["BlackBull-Live", "BlackBull-Demo"]},
    {"name": "FBS",            "servers": ["FBS-MT5Real", "FBS-MT5Demo"]},
    {"name": "Tickmill",       "servers": ["Tickmill-MT5Live", "Tickmill-MT5Demo"]},
    {"name": "The 5%ers",      "servers": ["The5ers-MT5-Live", "The5ers-MT5-Demo"]},
    {"name": "Other / Manual", "servers": []},
]

# ─── Pydantic Schemas ─────────────────────────────────────────────────────────
class BrokerListItem(BaseModel):
    name: str
    servers: List[str]

class MT5AccountCreate(BaseModel):
    client_email: str
    nickname: Optional[str] = None
    broker_name: str
    mt5_server: str
    mt5_login: str
    mt5_password: str
    risk_percent: float = 1.0
    auto_breakeven: bool = True

class MT5AccountUpdate(BaseModel):
    nickname: Optional[str] = None
    risk_percent: Optional[float] = None
    auto_breakeven: Optional[bool] = None
    is_active: Optional[bool] = None

class MT5AccountResponse(BaseModel):
    id: int
    client_email: str
    nickname: Optional[str]
    broker_name: str
    mt5_server: str
    mt5_login: str
    risk_percent: float
    auto_breakeven: bool
    is_active: bool
    status: str
    last_equity: Optional[float]
    last_balance: Optional[float]
    last_connected_at: Optional[str]
    error_message: Optional[str]
    created_at: str

    class Config:
        from_attributes = True

def _to_response(acc: MT5Account) -> MT5AccountResponse:
    return MT5AccountResponse(
        id=acc.id,
        client_email=acc.client_email,
        nickname=acc.nickname,
        broker_name=acc.broker_name,
        mt5_server=acc.mt5_server,
        mt5_login=acc.mt5_login,
        risk_percent=acc.risk_percent,
        auto_breakeven=acc.auto_breakeven,
        is_active=acc.is_active,
        status=acc.status,
        last_equity=acc.last_equity,
        last_balance=acc.last_balance,
        last_connected_at=acc.last_connected_at.isoformat() if acc.last_connected_at else None,
        error_message=acc.error_message,
        created_at=acc.created_at.isoformat() if acc.created_at else "",
    )

# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/brokers", response_model=List[BrokerListItem])
def list_known_brokers():
    """Returns the curated list of supported brokers and MT5 server names for the client dropdown"""
    return KNOWN_BROKERS

@router.post("/accounts", response_model=MT5AccountResponse)
def add_broker_account(
    payload: MT5AccountCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Client submits broker credentials — password is encrypted and stored securely"""
    owner_email = current_user.email

    # Prevent duplicate same login on same server
    existing = db.query(MT5Account).filter(
        MT5Account.mt5_login == payload.mt5_login,
        MT5Account.mt5_server == payload.mt5_server
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="This MT5 account is already connected.")

    acc = MT5Account(
        client_email=owner_email,
        nickname=payload.nickname or f"{payload.broker_name} #{payload.mt5_login[-4:]}",
        broker_name=payload.broker_name,
        mt5_server=payload.mt5_server,
        mt5_login=payload.mt5_login,
        encrypted_password=encrypt_password(payload.mt5_password),
        risk_percent=max(0.1, min(10.0, payload.risk_percent)),
        auto_breakeven=payload.auto_breakeven,
        status="PENDING"
    )
    db.add(acc)
    db.commit()
    db.refresh(acc)

    return _to_response(acc)

@router.get("/accounts", response_model=List[MT5AccountResponse])
def list_accounts(
    client_email: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Returns linked broker accounts for the authenticated user, or all accounts for admin"""
    query = db.query(MT5Account)
    is_admin = current_user.role in [UserRole.ADMIN.value, UserRole.SUPER_ADMIN.value]

    if not is_admin:
        # Regular users can strictly only access their own accounts
        query = query.filter(MT5Account.client_email == current_user.email)
    elif client_email:
        query = query.filter(MT5Account.client_email == client_email)

    accounts = query.order_by(MT5Account.created_at.desc()).all()
    return [_to_response(a) for a in accounts]

@router.patch("/accounts/{account_id}", response_model=MT5AccountResponse)
def update_account(
    account_id: int,
    payload: MT5AccountUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update risk settings or toggle auto-trading on/off"""
    acc = db.query(MT5Account).filter(MT5Account.id == account_id).first()
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")

    is_admin = current_user.role in [UserRole.ADMIN.value, UserRole.SUPER_ADMIN.value]
    if not is_admin and acc.client_email != current_user.email:
        raise HTTPException(status_code=403, detail="Not authorized to modify this broker account")

    if payload.nickname is not None:
        acc.nickname = payload.nickname
    if payload.risk_percent is not None:
        acc.risk_percent = max(0.1, min(10.0, payload.risk_percent))
    if payload.auto_breakeven is not None:
        acc.auto_breakeven = payload.auto_breakeven
    if payload.is_active is not None:
        acc.is_active = payload.is_active
        acc.status = "CONNECTED" if payload.is_active else "DISCONNECTED"
    db.commit()
    db.refresh(acc)
    return _to_response(acc)

@router.delete("/accounts/{account_id}")
def remove_account(
    account_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Permanently remove a linked broker account"""
    acc = db.query(MT5Account).filter(MT5Account.id == account_id).first()
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")

    is_admin = current_user.role in [UserRole.ADMIN.value, UserRole.SUPER_ADMIN.value]
    if not is_admin and acc.client_email != current_user.email:
        raise HTTPException(status_code=403, detail="Not authorized to remove this broker account")

    db.delete(acc)
    db.commit()
    return {"status": "removed", "id": account_id}

@router.post("/accounts/{account_id}/test-connection", response_model=MT5AccountResponse)
async def test_connection(
    account_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Tests broker connectivity.
    """
    acc = db.query(MT5Account).filter(MT5Account.id == account_id).first()
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")

    is_admin = current_user.role in [UserRole.ADMIN.value, UserRole.SUPER_ADMIN.value]
    if not is_admin and acc.client_email != current_user.email:
        raise HTTPException(status_code=403, detail="Not authorized to access this broker account")

    METAAPI_TOKEN = getattr(settings, "METAAPI_TOKEN", "")

    if METAAPI_TOKEN:
        # ── Production: Use MetaApi.cloud REST API ─────────────────────
        try:
            from app.services.metaapi.client import MetaApiClient, MetaApiError
            client = MetaApiClient(METAAPI_TOKEN)
            plain_password = decrypt_password(acc.encrypted_password)

            meta_acc = await client.provision_account(
                login=acc.mt5_login,
                password=plain_password,
                server=acc.mt5_server,
                name=acc.nickname or acc.broker_name,
                magic=getattr(settings, "METAAPI_MAGIC", 889911),
            )
            metaapi_account_id = meta_acc["id"]
            acc.metaapi_account_id = metaapi_account_id

            # Deploy if not already
            state = meta_acc.get("state", "")
            if state not in ("DEPLOYED", "DEPLOYING"):
                await client.deploy_account(metaapi_account_id)
                import asyncio
                await asyncio.sleep(5)

            # Fetch live equity
            try:
                info = await client.get_account_info(metaapi_account_id)
                acc.last_equity = info.get("equity", 0)
                acc.last_balance = info.get("balance", 0)
            except MetaApiError:
                acc.last_equity = meta_acc.get("equity", 0)
                acc.last_balance = meta_acc.get("balance", 0)

            acc.status = "CONNECTED"
            acc.last_connected_at = datetime.now(timezone.utc)
            acc.error_message = None

        except Exception as e:
            acc.status = "ERROR"
            acc.error_message = str(e)[:200]
    else:
        # ── Demo mode: simulate a successful connection ─────────────────
        # (Replace with your MetaApi token in Railway env vars when ready)
        acc.status = "CONNECTED"
        acc.last_connected_at = datetime.now(timezone.utc)
        acc.last_equity = round(10000.0 + (account_id * 317.5), 2)  # demo simulation
        acc.last_balance = acc.last_equity
        acc.error_message = None

    db.commit()
    db.refresh(acc)
    return _to_response(acc)
