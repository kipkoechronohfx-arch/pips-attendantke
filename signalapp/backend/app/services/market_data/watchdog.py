import asyncio
import logging
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.signal import TradingSignal
from app.services.market_data.manager import market_data_manager
from app.websockets.hub import ws_manager
from app.services.notification_service.dispatcher import notification_dispatcher

logger = logging.getLogger("server_watchdog")

async def run_server_watchdog():
    """Background watchdog daemon: evaluates live interbank ticks against active signals,
    auto-locks realized pips on TP/SL hits, and dispatches real-time alerts.
    """
    logger.info("Forex Signal Pro Server Watchdog initialized.")
    while True:
        db: Session = SessionLocal()
        try:
            active_signals = db.query(TradingSignal).filter(TradingSignal.status.in_(["ACTIVE", "HIT_TP1", "HIT_TP2"])).all()
            for sig in active_signals:
                quote = await market_data_manager.get_quote(sig.symbol)
                if not quote or not quote.mid:
                    continue

                curr_price = quote.mid
                is_buy = sig.direction == "BUY"

                pip_size = 0.0001
                if "JPY" in sig.symbol:
                    pip_size = 0.01
                elif "XAU" in sig.symbol:
                    pip_size = 0.10
                elif "BTC" in sig.symbol or "ETH" in sig.symbol:
                    pip_size = 1.0

                # Check milestones in priority order (TP3 > TP2 > TP1 > SL)
                hit_tp3 = False
                hit_tp2 = False
                hit_tp1 = False
                hit_sl = False

                if sig.take_profit_3:
                    hit_tp3 = curr_price >= sig.take_profit_3 if is_buy else curr_price <= sig.take_profit_3
                if sig.take_profit_2:
                    hit_tp2 = curr_price >= sig.take_profit_2 if is_buy else curr_price <= sig.take_profit_2
                if sig.take_profit_1:
                    hit_tp1 = curr_price >= sig.take_profit_1 if is_buy else curr_price <= sig.take_profit_1
                if sig.stop_loss:
                    hit_sl = curr_price <= sig.stop_loss if is_buy else curr_price >= sig.stop_loss

                new_status = None
                pips = 0.0
                milestone_label = None

                if hit_tp3 and sig.take_profit_3 and sig.status != "HIT_TP3":
                    new_status = "HIT_TP3"
                    milestone_label = "TP3 (MAX TARGET)"
                    exit_price = sig.take_profit_3
                    pips = round((exit_price - sig.entry_price) / pip_size if is_buy else (sig.entry_price - exit_price) / pip_size, 1)
                elif hit_tp2 and sig.take_profit_2 and sig.status not in ["HIT_TP2", "HIT_TP3"]:
                    new_status = "HIT_TP2"
                    milestone_label = "TP2"
                    exit_price = sig.take_profit_2
                    pips = round((exit_price - sig.entry_price) / pip_size if is_buy else (sig.entry_price - exit_price) / pip_size, 1)
                elif hit_tp1 and sig.take_profit_1 and sig.status not in ["HIT_TP1", "HIT_TP2", "HIT_TP3"]:
                    new_status = "HIT_TP1"
                    milestone_label = "TP1"
                    exit_price = sig.take_profit_1
                    pips = round((exit_price - sig.entry_price) / pip_size if is_buy else (sig.entry_price - exit_price) / pip_size, 1)
                elif hit_sl and sig.stop_loss and sig.status != "STOPPED_OUT":
                    new_status = "STOPPED_OUT"
                    exit_price = sig.stop_loss
                    pips = round((exit_price - sig.entry_price) / pip_size if is_buy else (sig.entry_price - exit_price) / pip_size, 1)

                if new_status:
                    sig.status = new_status
                    sig.pnl_pips = pips
                    if new_status in ["HIT_TP3", "STOPPED_OUT"]:
                        sig.closed_at = datetime.now(timezone.utc)
                    db.commit()

                    logger.info(f"[WATCHDOG] Signal #{sig.id} {sig.symbol} hit {new_status} with {pips} pips")

                    # Broadcast to live web & mobile clients
                    await ws_manager.broadcast_json({
                        "type": "SIGNAL_OUTCOME",
                        "data": {
                            "id": sig.id,
                            "symbol": sig.symbol,
                            "status": sig.status,
                            "pnl_pips": sig.pnl_pips,
                            "closed_at": sig.closed_at.isoformat() if sig.closed_at else None
                        }
                    })

                    # Dispatch external alerts
                    if new_status == "STOPPED_OUT":
                        await notification_dispatcher.broadcast_stop_loss(sig, pips)
                    else:
                        await notification_dispatcher.broadcast_target_milestone(sig, milestone_label or new_status, pips)

        except Exception as e:
            logger.error(f"Watchdog evaluation loop error: {e}")
        finally:
            db.close()

        await asyncio.sleep(3.0)
