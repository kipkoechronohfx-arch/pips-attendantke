from fastapi import APIRouter, Depends, HTTPException, Header, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel
import os

from app.core.config import settings
from app.core.database import get_db
from app.models.signal import TradingSignal

router = APIRouter()

def verify_copier_key(
    x_copier_key: Optional[str] = Header(None, alias="X-Copier-Key"),
    api_key: Optional[str] = Query(None, alias="api_key")
):
    key = x_copier_key or api_key
    if not settings.COPIER_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="Trade Copier service is not configured (COPIER_API_KEY unset)"
        )
    if not key or key != settings.COPIER_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid Copier API Key")
    return True

class CopierSignalItem(BaseModel):
    id: int
    raw_symbol: str
    symbol: str
    direction: str
    entry_price: float
    stop_loss: float
    take_profit_1: float
    take_profit_2: Optional[float] = None
    take_profit_3: Optional[float] = None
    risk_reward_ratio: float
    confidence: int
    status: str
    created_at: str

class CopierExecutionReport(BaseModel):
    signal_id: int
    mt5_ticket: int
    symbol: str
    action: str
    lot_size: float
    fill_price: float
    status: str  # EXECUTED, REJECTED, MODIFIED, CLOSED
    broker: Optional[str] = None
    account_login: Optional[int] = None
    notes: Optional[str] = None

@router.get("/pending-signals", response_model=List[CopierSignalItem])
def get_pending_copier_signals(
    limit: int = 20,
    db: Session = Depends(get_db),
    authorized: bool = Depends(verify_copier_key)
):
    """Returns active, unfilled signals formatted for MT5 EA and Python trade copiers"""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=48)
    signals = db.query(TradingSignal).filter(
        TradingSignal.status == "ACTIVE",
        TradingSignal.created_at >= cutoff
    ).order_by(TradingSignal.created_at.desc()).limit(limit).all()

    results = []
    for s in signals:
        clean_sym = s.symbol.replace("/", "").replace("-", "").strip()
        results.append(CopierSignalItem(
            id=s.id,
            raw_symbol=s.symbol,
            symbol=clean_sym,
            direction=s.direction.upper(),
            entry_price=s.entry_price,
            stop_loss=s.stop_loss,
            take_profit_1=s.take_profit_1,
            take_profit_2=s.take_profit_2,
            take_profit_3=s.take_profit_3,
            risk_reward_ratio=s.risk_reward_ratio,
            confidence=s.confidence,
            status=s.status,
            created_at=s.created_at.isoformat() if s.created_at else ""
        ))
    return results

@router.get("/management-actions")
def get_management_actions(
    db: Session = Depends(get_db),
    authorized: bool = Depends(verify_copier_key)
):
    """Returns target milestone reached events (e.g. HIT_TP1 -> Move SL to Breakeven)"""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    signals = db.query(TradingSignal).filter(
        TradingSignal.status.in_(["HIT_TP1", "HIT_TP2", "HIT_TP3", "STOPPED_OUT", "CLOSED"]),
        TradingSignal.created_at >= cutoff
    ).all()

    actions = []
    for s in signals:
        action_type = "TRAIL_BREAKEVEN" if s.status == "HIT_TP1" else ("CLOSE_HALF" if s.status == "HIT_TP2" else "CLOSE_FULL")
        actions.append({
            "signal_id": s.id,
            "symbol": s.symbol.replace("/", ""),
            "status": s.status,
            "action": action_type,
            "entry_price": s.entry_price,
            "pnl_pips": s.pnl_pips
        })
    return actions

@router.post("/report")
def report_copier_execution(
    report: CopierExecutionReport,
    authorized: bool = Depends(verify_copier_key)
):
    """Receives MT5 order fill ticket and execution status"""
    return {
        "status": "ACK",
        "signal_id": report.signal_id,
        "mt5_ticket": report.mt5_ticket,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
