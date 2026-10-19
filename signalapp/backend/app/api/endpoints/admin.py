from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone
from app.core.database import get_db
from app.models.user import User
from app.models.signal import TradingSignal
from app.models.alert import AdminAuditLog
from app.schemas.signal import SignalCreate, SignalUpdate, SignalResponse
from app.api.deps import require_admin
from app.websockets.hub import ws_manager
from app.services.metaapi.executor import auto_execute_signal

router = APIRouter()

@router.post("/signals", response_model=SignalResponse)
async def publish_admin_signal(
    signal_in: SignalCreate,
    background_tasks: BackgroundTasks,
    current_admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Publish a verified manual trading signal directly to the signal feed"""
    # Validation checks
    if signal_in.direction == "BUY":
        if not (signal_in.stop_loss < signal_in.entry_price < signal_in.take_profit_1):
            raise HTTPException(
                status_code=400,
                detail="For BUY setups: Stop Loss must be < Entry Price < Take Profit 1"
            )
        risk = signal_in.entry_price - signal_in.stop_loss
        reward = (signal_in.take_profit_2 or signal_in.take_profit_1) - signal_in.entry_price
    elif signal_in.direction == "SELL":
        if not (signal_in.take_profit_1 < signal_in.entry_price < signal_in.stop_loss):
            raise HTTPException(
                status_code=400,
                detail="For SELL setups: Take Profit 1 must be < Entry Price < Stop Loss"
            )
        risk = signal_in.stop_loss - signal_in.entry_price
        reward = signal_in.entry_price - (signal_in.take_profit_2 or signal_in.take_profit_1)
    else:
        raise HTTPException(status_code=400, detail="Invalid direction")

    rr = round(reward / risk, 2) if risk > 0 else 1.5

    sig = TradingSignal(
        symbol=signal_in.symbol,
        direction=signal_in.direction,
        timeframe=signal_in.timeframe,
        entry_price=signal_in.entry_price,
        entry_zone_high=signal_in.entry_zone_high or signal_in.entry_price,
        entry_zone_low=signal_in.entry_zone_low or signal_in.entry_price,
        stop_loss=signal_in.stop_loss,
        take_profit_1=signal_in.take_profit_1,
        take_profit_2=signal_in.take_profit_2,
        take_profit_3=signal_in.take_profit_3,
        risk_reward_ratio=rr,
        confidence=signal_in.confidence,
        technical_justification=signal_in.technical_justification,
        status="ACTIVE",
        source="ADMIN",
        created_by_id=current_admin.id,
        expires_at=signal_in.expires_at
    )
    db.add(sig)
    
    # Audit log
    audit = AdminAuditLog(
        admin_id=current_admin.id,
        action="PUBLISH_SIGNAL",
        target_type="SIGNAL",
        target_id=str(signal_in.symbol),
        details=f"Published {signal_in.direction} on {signal_in.symbol} @ {signal_in.entry_price}"
    )
    db.add(audit)
    db.commit()
    db.refresh(sig)

    # Broadcast notification
    await ws_manager.broadcast_json({
        "type": "NEW_ADMIN_SIGNAL",
        "data": {
            "id": sig.id,
            "symbol": sig.symbol,
            "direction": sig.direction,
            "entry": sig.entry_price,
            "sl": sig.stop_loss,
            "tp": sig.take_profit_1,
            "source": f"Admin ({current_admin.full_name or 'Senior Desk'})"
        }
    })

    # 🚀 Auto-execute on all connected vault accounts via MetaApi
    background_tasks.add_task(auto_execute_signal, sig.id)

    return sig

@router.put("/signals/{signal_id}", response_model=SignalResponse)
def update_signal(
    signal_id: int,
    signal_up: SignalUpdate,
    current_admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    sig = db.query(TradingSignal).filter(TradingSignal.id == signal_id).first()
    if not sig:
        raise HTTPException(status_code=404, detail="Signal not found")

    if signal_up.status:
        sig.status = signal_up.status
        if signal_up.status in ["CLOSED", "CANCELLED", "HIT_TP1", "STOPPED_OUT"]:
            sig.closed_at = datetime.now(timezone.utc)
    if signal_up.stop_loss:
        sig.stop_loss = signal_up.stop_loss
    if signal_up.take_profit_1:
        sig.take_profit_1 = signal_up.take_profit_1
    if signal_up.technical_justification:
        sig.technical_justification = signal_up.technical_justification

    audit = AdminAuditLog(
        admin_id=current_admin.id,
        action="UPDATE_SIGNAL",
        target_type="SIGNAL",
        target_id=str(signal_id),
        details=f"Updated status to {signal_up.status or sig.status}"
    )
    db.add(audit)
    db.commit()
    db.refresh(sig)
    return sig

@router.get("/audit-logs")
def get_audit_logs(
    limit: int = 50,
    current_admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    logs = db.query(AdminAuditLog).order_by(AdminAuditLog.timestamp.desc()).limit(limit).all()
    return logs
