from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone
from app.core.database import get_db
from app.models.signal import TradingSignal
from app.schemas.signal import SignalResponse, SignalPerformanceStats
from app.services.market_data.manager import market_data_manager
from app.services.signal_engine.engine import auto_signal_engine  # legacy engine kept for reference
from app.websockets.hub import ws_manager
from app.services.notification_service.dispatcher import notification_dispatcher
from app.services.metaapi.executor import auto_execute_signal

router = APIRouter()

@router.get("/", response_model=List[SignalResponse])
def get_signals(
    symbol: Optional[str] = None,
    status: Optional[str] = None,
    direction: Optional[str] = None,
    timeframe: Optional[str] = None,
    limit: int = 50,
    db: Session = Depends(get_db)
):
    """Retrieve list of published trading signals with filters"""
    query = db.query(TradingSignal)
    if symbol:
        query = query.filter(TradingSignal.symbol == symbol)
    if status and status != "ALL":
        query = query.filter(TradingSignal.status == status)
    if direction and direction != "ALL":
        query = query.filter(TradingSignal.direction == direction)
    if timeframe and timeframe != "ALL":
        query = query.filter(TradingSignal.timeframe == timeframe)
    
    return query.order_by(TradingSignal.created_at.desc()).limit(limit).all()

@router.get("/detail/{signal_id}", response_model=SignalResponse)
def get_signal_detail(signal_id: int, db: Session = Depends(get_db)):
    """Retrieve a single trading signal by ID"""
    signal = db.query(TradingSignal).filter(TradingSignal.id == signal_id).first()
    if not signal:
        raise HTTPException(status_code=404, detail="Signal not found")
    return signal

import time

_last_scan_timestamp = 0.0

@router.post("/auto-scan", response_model=List[SignalResponse])
async def trigger_auto_signal_scan(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Executes the three-stage precision-entry pipeline across all tracked instruments.
    Only signals that pass ALL 11 mandatory hard gates (lifecycle_state == CONFIRMED)
    are persisted. Signals in any other lifecycle state (WATCH, WAITING_FOR_RETEST,
    WAITING_FOR_CONFIRMATION, EXPIRED, NO_TRADE, ENTRY_MISSED) are not stored.

    Rate limited to 1 scan per 10 seconds to protect compute resources.
    """
    from app.services.precision_engine.pipeline import run_precision_pipeline

    global _last_scan_timestamp
    now = time.time()
    if now - _last_scan_timestamp < 10.0:
        remaining = int(10.0 - (now - _last_scan_timestamp))
        raise HTTPException(
            status_code=429,
            detail=f"Precision engine cooling down. Please wait {remaining}s before the next scan."
        )
    _last_scan_timestamp = now

    instruments = ["EUR/USD", "GBP/USD", "USD/JPY", "XAU/USD", "XAG/USD",
                   "GBP/JPY", "USD/CHF", "AUD/USD", "USD/CAD", "BTC/USD"]
    new_signals = []

    for sym in instruments:
        # Gate: prevent duplicate active signal for same symbol
        existing = db.query(TradingSignal).filter(
            TradingSignal.symbol == sym,
            TradingSignal.status == "ACTIVE"
        ).first()
        if existing:
            continue

        quote   = await market_data_manager.get_quote(sym)
        candles = await market_data_manager.get_candles(sym, timeframe="H1", count=100)
        if not quote or not candles or len(candles) < 20:
            continue

        # Run three-stage precision pipeline
        result = run_precision_pipeline(sym, "H1", candles, quote)

        # ONLY persist CONFIRMED signals
        if result.lifecycle_state != "CONFIRMED" or not result.signal_valid:
            continue

        # Validate all required fields before persistence
        if None in [result.entry_price, result.stop_loss, result.take_profit_1,
                    result.take_profit_2, result.entry_zone_high, result.entry_zone_low]:
            continue

        risk   = abs(result.entry_price - result.stop_loss)
        reward = abs(result.take_profit_2 - result.entry_price)
        rr     = round(reward / risk, 2) if risk > 0 else 1.5

        sig = TradingSignal(
            symbol=sym,
            direction=result.direction,
            timeframe="H1",
            entry_price=result.entry_price,
            entry_zone_high=result.entry_zone_high,
            entry_zone_low=result.entry_zone_low,
            stop_loss=result.stop_loss,
            take_profit_1=result.take_profit_1,
            take_profit_2=result.take_profit_2,
            take_profit_3=result.take_profit_3,
            risk_reward_ratio=rr,
            confidence=result.confidence,
            technical_justification=result.technical_justification,
            status="ACTIVE",
            source="AUTO",
            expires_at=result.expiry_time,
        )
        db.add(sig)
        db.commit()
        db.refresh(sig)
        new_signals.append(sig)

        # Broadcast to connected WebSocket clients
        await ws_manager.broadcast_json({
            "type": "NEW_SIGNAL",
            "data": {
                "id": sig.id,
                "symbol": sig.symbol,
                "direction": sig.direction,
                "entry": sig.entry_price,
                "sl": sig.stop_loss,
                "tp": sig.take_profit_1,
                "source": sig.source,
                "lifecycle_state": result.lifecycle_state,
                "context_score": result.context_score,
                "setup_score": result.setup_score,
                "strategy_profile": result.strategy_profile,
                "gate_results": result.gate_results,
            }
        })

        # Dispatch Telegram & Discord instant alerts
        await notification_dispatcher.broadcast_new_signal(sig)

        # Auto-execute on all connected vault accounts via MetaApi
        background_tasks.add_task(auto_execute_signal, sig.id)

    return new_signals


@router.get("/stats/performance", response_model=SignalPerformanceStats)
def get_signal_performance_stats(db: Session = Depends(get_db)):
    """Calculate transparent performance metrics from database signal history"""
    all_signals = db.query(TradingSignal).all()
    total = len(all_signals)
    active = len([s for s in all_signals if s.status == "ACTIVE"])
    closed = len([s for s in all_signals if s.status in ["HIT_TP1", "HIT_TP2", "HIT_TP3", "STOPPED_OUT", "CLOSED"]])
    
    winning = [s for s in all_signals if s.status in ["HIT_TP1", "HIT_TP2", "HIT_TP3"] or s.pnl_pips > 0]
    losing  = [s for s in all_signals if s.status == "STOPPED_OUT" or s.pnl_pips < 0]
    
    win_count  = len(winning)
    loss_count = len(losing)

    gross_win = 0.0
    gross_loss = 0.0
    total_pnl  = 0.0

    for s in all_signals:
        pip_size = (0.01 if "JPY" in s.symbol
                    else (0.10 if "XAU" in s.symbol
                          else (1.0 if "BTC" in s.symbol or "ETH" in s.symbol
                                else 0.0001)))
        is_buy = s.direction == "BUY"
        if s.status == "STOPPED_OUT" and s.stop_loss:
            pips = s.pnl_pips if (s.pnl_pips is not None and s.pnl_pips != 0.0) else round(
                (s.stop_loss - s.entry_price) / pip_size if is_buy else (s.entry_price - s.stop_loss) / pip_size, 1)
        else:
            pips = s.pnl_pips or 0.0
            if pips == 0.0 and s.status != "ACTIVE":
                if s.status == "HIT_TP3" and s.take_profit_3:
                    pips = round((s.take_profit_3 - s.entry_price) / pip_size if is_buy else (s.entry_price - s.take_profit_3) / pip_size, 1)
                elif s.status == "HIT_TP2" and s.take_profit_2:
                    pips = round((s.take_profit_2 - s.entry_price) / pip_size if is_buy else (s.entry_price - s.take_profit_2) / pip_size, 1)
                elif s.status == "HIT_TP1" and s.take_profit_1:
                    pips = round((s.take_profit_1 - s.entry_price) / pip_size if is_buy else (s.entry_price - s.take_profit_1) / pip_size, 1)
        total_pnl += pips
        if pips > 0:
            gross_win += pips
        elif pips < 0:
            gross_loss += abs(pips)

    total_pip_volume = gross_win + gross_loss
    win_rate = round((gross_win / total_pip_volume * 100), 1) if total_pip_volume > 0 else 0.0
    profit_factor = round(gross_win / gross_loss, 2) if gross_loss > 0 else 0.0
    avg_rr = round(sum([s.risk_reward_ratio for s in all_signals]) / total, 2) if total > 0 else 0.0

    by_pair = {}
    for s in all_signals:
        by_pair[s.symbol] = by_pair.get(s.symbol, 0) + 1

    by_tf = {}
    for s in all_signals:
        by_tf[s.timeframe] = by_tf.get(s.timeframe, 0) + 1

    return SignalPerformanceStats(
        total_signals=total,
        active_signals=active,
        closed_signals=closed,
        winning_signals=win_count,
        losing_signals=loss_count,
        win_rate_percentage=win_rate,
        profit_factor=profit_factor,
        average_rr_ratio=avg_rr,
        total_net_pips=round(total_pnl, 1),
        max_drawdown_pips=0.0,
        performance_by_pair=by_pair,
        performance_by_timeframe=by_tf
    )


@router.post("/{signal_id}/close", response_model=SignalResponse)
async def close_signal_endpoint(
    signal_id: int,
    status: Optional[str] = Query("CLOSED", description="Target status: CLOSED, HIT_TP1, HIT_TP2, or STOPPED_OUT"),
    pnl: Optional[float] = Query(None, description="Optional locked PnL pips"),
    db: Session = Depends(get_db)
):
    """Closes an active trading signal, freezes its realized PnL, and broadcasts update to clients"""
    sig = db.query(TradingSignal).filter(TradingSignal.id == signal_id).first()
    if not sig:
        raise HTTPException(status_code=404, detail="Signal not found")

    quote = await market_data_manager.get_quote(sig.symbol)
    curr_price = quote.mid if quote else sig.entry_price

    pip_size = 0.0001
    if "JPY" in sig.symbol:
        pip_size = 0.01
    elif "XAU" in sig.symbol:
        pip_size = 0.10
    elif "BTC" in sig.symbol or "ETH" in sig.symbol:
        pip_size = 1.0

    if status == "STOPPED_OUT":
        exit_price = sig.stop_loss
        if sig.direction == "BUY":
            realized_pips = round((exit_price - sig.entry_price) / pip_size, 1)
        else:
            realized_pips = round((sig.entry_price - exit_price) / pip_size, 1)
    elif pnl is not None:
        realized_pips = pnl
    else:
        if status == "HIT_TP3" and sig.take_profit_3:
            exit_price = sig.take_profit_3
        elif status == "HIT_TP2" and sig.take_profit_2:
            exit_price = sig.take_profit_2
        elif status == "HIT_TP1":
            exit_price = sig.take_profit_1
        else:
            exit_price = curr_price
        if sig.direction == "BUY":
            realized_pips = round((exit_price - sig.entry_price) / pip_size, 1)
        else:
            realized_pips = round((sig.entry_price - exit_price) / pip_size, 1)

    sig.status = status or "CLOSED"
    sig.pnl_pips = realized_pips
    sig.closed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(sig)

    await ws_manager.broadcast_json({
        "type": "SIGNAL_OUTCOME",
        "data": {
            "id": sig.id,
            "symbol": sig.symbol,
            "status": sig.status,
            "pnl_pips": sig.pnl_pips,
            "closed_at": sig.closed_at.isoformat()
        }
    })

    return sig
