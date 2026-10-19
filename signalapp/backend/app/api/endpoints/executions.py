"""
Trade Executions API
Endpoints for viewing execution logs and manually triggering signal execution
"""

from typing import List, Optional
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.database import get_db
from app.models.trade_execution import TradeExecution
from app.models.mt5_account import MT5Account
from app.models.signal import TradingSignal
from app.models.user import User, UserRole
from app.api.deps import get_current_user
from app.services.metaapi.executor import auto_execute_signal, execute_signal_on_account

router = APIRouter()


# ─── Schemas ─────────────────────────────────────────────────────────────────

class ExecutionResponse(BaseModel):
    id: int
    signal_id: int
    mt5_account_id: int
    client_email: str
    metaapi_account_id: Optional[str]
    mt5_ticket: Optional[str]
    symbol: str
    direction: str
    lot_size: float
    entry_price: float
    stop_loss: float
    take_profit: float
    risk_percent: float
    balance_at_execution: Optional[float]
    status: str
    fill_price: Optional[float]
    close_price: Optional[float]
    pnl_usd: Optional[float]
    error_message: Optional[str]
    created_at: str
    filled_at: Optional[str]
    closed_at: Optional[str]

    class Config:
        from_attributes = True


def _exec_to_response(e: TradeExecution) -> ExecutionResponse:
    return ExecutionResponse(
        id=e.id,
        signal_id=e.signal_id,
        mt5_account_id=e.mt5_account_id,
        client_email=e.client_email,
        metaapi_account_id=e.metaapi_account_id,
        mt5_ticket=e.mt5_ticket,
        symbol=e.symbol,
        direction=e.direction,
        lot_size=e.lot_size,
        entry_price=e.entry_price,
        stop_loss=e.stop_loss,
        take_profit=e.take_profit,
        risk_percent=e.risk_percent,
        balance_at_execution=e.balance_at_execution,
        status=e.status,
        fill_price=e.fill_price,
        close_price=e.close_price,
        pnl_usd=e.pnl_usd,
        error_message=e.error_message,
        created_at=e.created_at.isoformat() if e.created_at else "",
        filled_at=e.filled_at.isoformat() if e.filled_at else None,
        closed_at=e.closed_at.isoformat() if e.closed_at else None,
    )


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[ExecutionResponse])
def list_executions(
    signal_id: Optional[int] = Query(None),
    account_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    List trade execution logs.
    Regular users see only their own account's executions.
    Admins can see all.
    """
    q = db.query(TradeExecution)
    is_admin = current_user.role in [UserRole.ADMIN.value, UserRole.SUPER_ADMIN.value]

    if not is_admin:
        q = q.filter(TradeExecution.client_email == current_user.email)
    if signal_id is not None:
        q = q.filter(TradeExecution.signal_id == signal_id)
    if account_id is not None:
        q = q.filter(TradeExecution.mt5_account_id == account_id)
    if status:
        q = q.filter(TradeExecution.status == status.upper())

    executions = q.order_by(TradeExecution.created_at.desc()).limit(limit).all()
    return [_exec_to_response(e) for e in executions]


@router.get("/stats")
def execution_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Summary stats: total executions, fills, win rate, total P&L"""
    is_admin = current_user.role in [UserRole.ADMIN.value, UserRole.SUPER_ADMIN.value]
    q = db.query(TradeExecution)
    if not is_admin:
        q = q.filter(TradeExecution.client_email == current_user.email)

    all_execs = q.all()
    total = len(all_execs)
    submitted = sum(1 for e in all_execs if e.status in ("SUBMITTED", "FILLED"))
    rejected = sum(1 for e in all_execs if e.status == "REJECTED")
    closed = [e for e in all_execs if e.status == "CLOSED" and e.pnl_usd is not None]
    total_pnl = sum(e.pnl_usd for e in closed)
    winners = sum(1 for e in closed if (e.pnl_usd or 0) > 0)

    return {
        "total_executions": total,
        "submitted": submitted,
        "rejected": rejected,
        "closed": len(closed),
        "winners": winners,
        "win_rate": round(winners / len(closed) * 100, 1) if closed else 0,
        "total_pnl_usd": round(total_pnl, 2),
    }


@router.post("/execute-signal/{signal_id}")
async def manually_execute_signal(
    signal_id: int,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Manually trigger auto-execution of a specific signal on all active accounts.
    Admins only — fires async in background.
    """
    is_admin = current_user.role in [UserRole.ADMIN.value, UserRole.SUPER_ADMIN.value]
    if not is_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    signal = db.query(TradingSignal).filter(TradingSignal.id == signal_id).first()
    if not signal:
        raise HTTPException(status_code=404, detail="Signal not found")
    if signal.status not in ("ACTIVE",):
        raise HTTPException(status_code=400, detail=f"Signal is {signal.status}, not ACTIVE")

    background_tasks.add_task(auto_execute_signal, signal_id)
    return {
        "status": "queued",
        "signal_id": signal_id,
        "symbol": signal.symbol,
        "direction": signal.direction,
        "message": "Execution queued for all active vault accounts",
    }


@router.post("/execute-signal/{signal_id}/account/{account_id}", response_model=ExecutionResponse)
async def execute_signal_on_single_account(
    signal_id: int,
    account_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Execute a specific signal on a specific vault account.
    User must own the account, or be admin.
    """
    signal = db.query(TradingSignal).filter(TradingSignal.id == signal_id).first()
    if not signal:
        raise HTTPException(status_code=404, detail="Signal not found")

    account = db.query(MT5Account).filter(MT5Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Vault account not found")

    is_admin = current_user.role in [UserRole.ADMIN.value, UserRole.SUPER_ADMIN.value]
    if not is_admin and account.client_email != current_user.email:
        raise HTTPException(status_code=403, detail="Not authorized")

    if not account.is_active:
        raise HTTPException(status_code=400, detail="Account is paused (is_active=False)")

    result = await execute_signal_on_account(db, signal, account)
    return _exec_to_response(result)
