"""
MetaApi Auto-Execution Worker
Runs as a background asyncio task.
On every new ACTIVE signal, fires trades into all connected vault accounts.
Also periodically syncs equity and marks executions CLOSED when signal closes.
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.mt5_account import MT5Account
from app.models.signal import TradingSignal
from app.models.trade_execution import TradeExecution
from app.services.metaapi.client import MetaApiClient, MetaApiError

logger = logging.getLogger("metaapi.executor")

# ─── Singleton client ────────────────────────────────────────────────────────
from app.services.brokers import BrokerManager

# BrokerManager will provide a client for the appropriate broker
_broker_manager = BrokerManager()

def get_client(broker_name: str, require_demo: bool = False) -> Optional[MetaApiClient]:
    """Return a MetaApiClient for the given broker.

    In demo mode (settings.METAAPI_TOKEN is missing) the manager will still
    create a client via the token; the `require_demo` flag forces sandbox servers.
    """
    if not settings.METAAPI_TOKEN:
        return None
    try:
        return _broker_manager.get_client(broker_name, require_demo=require_demo)
    except Exception as e:
        logger.error(f"[BrokerManager] Failed to get client for {broker_name}: {e}")
        return None


# ─── Execute a single signal on a single vault account ───────────────────────

async def execute_signal_on_account(
    db: Session,
    signal: TradingSignal,
    account: MT5Account,
) -> TradeExecution:
    """
    Provisions the MetaApi account (if needed), calculates lot size,
    places a limit order, and records the execution.
    """
    client = get_client(account.broker_name)

    # Create pending execution log first
    exec_log = TradeExecution(
        signal_id=signal.id,
        mt5_account_id=account.id,
        client_email=account.client_email,
        symbol=signal.symbol,
        direction=signal.direction,
        entry_price=signal.entry_price,
        stop_loss=signal.stop_loss,
        take_profit=signal.take_profit_1,
        risk_percent=account.risk_percent,
        lot_size=0.01,
        status="PENDING",
    )
    db.add(exec_log)
    db.commit()
    db.refresh(exec_log)

    if client is None:
        # Demo mode: simulate a successful fill
        _simulate_fill(db, exec_log, account)
        return exec_log

    try:
        # 1. Provision / retrieve MetaApi account
        plain_password = _decrypt(account.encrypted_password)
        meta_acc = await client.provision_account(
            login=account.mt5_login,
            password=plain_password,
            server=account.mt5_server,
            name=account.nickname or account.broker_name,
            magic=settings.METAAPI_MAGIC,
        )
        metaapi_account_id = meta_acc["id"]
        exec_log.metaapi_account_id = metaapi_account_id

        # 2. Deploy if not already deployed
        state = meta_acc.get("state", "")
        if state not in ("DEPLOYED", "DEPLOYING"):
            await client.deploy_account(metaapi_account_id)
            await asyncio.sleep(5)  # brief wait for deployment

        # 3. Fetch live account info for balance-based lot sizing
        try:
            acc_info = await client.get_account_info(metaapi_account_id)
            balance = acc_info.get("balance", account.last_balance or 10000.0)
            equity = acc_info.get("equity", balance)
            # Sync equity back to vault
            account.last_equity = equity
            account.last_balance = balance
            account.last_connected_at = datetime.now(timezone.utc)
            account.status = "CONNECTED"
            account.error_message = None
            exec_log.balance_at_execution = balance
        except MetaApiError:
            balance = account.last_balance or 10000.0
            exec_log.balance_at_execution = balance

        # 4. Calculate lot size
        sym_clean = signal.symbol.replace("/", "").replace("-", "")
        lot_size = MetaApiClient.calculate_lot_size(
            account_balance=balance,
            risk_percent=account.risk_percent,
            entry_price=signal.entry_price,
            stop_loss=signal.stop_loss,
            symbol=sym_clean,
        )
        exec_log.lot_size = lot_size

        # 5. Place order
        result = await client.place_order(
            metaapi_account_id=metaapi_account_id,
            symbol=sym_clean,
            direction=signal.direction,
            volume=lot_size,
            entry_price=signal.entry_price,
            stop_loss=signal.stop_loss,
            take_profit=signal.take_profit_1,
            magic=settings.METAAPI_MAGIC,
            comment=f"FSP-{signal.id}",
        )

        exec_log.mt5_ticket = str(result.get("orderId", result.get("positionId", "")))
        exec_log.status = "SUBMITTED"
        exec_log.filled_at = datetime.now(timezone.utc)

        logger.info(
            f"[Executor] Signal #{signal.id} → {account.broker_name} "
            f"({account.mt5_login}): {lot_size} lots @ {signal.entry_price}"
        )

    except MetaApiError as e:
        exec_log.status = "REJECTED"
        exec_log.error_message = f"MetaApi {e.status}: {e.detail}"
        account.status = "ERROR"
        account.error_message = exec_log.error_message[:200]
        logger.warning(f"[Executor] Signal #{signal.id} REJECTED for {account.mt5_login}: {e}")

    except Exception as e:
        exec_log.status = "REJECTED"
        exec_log.error_message = str(e)[:300]
        logger.error(f"[Executor] Unexpected error: {e}", exc_info=True)

    finally:
        db.commit()
        db.refresh(exec_log)

    return exec_log


def _simulate_fill(db: Session, exec_log: TradeExecution, account: MT5Account) -> None:
    """Demo mode: simulate a successful fill with random ticket number"""
    import random
    balance = account.last_balance or 10000.0
    lot_size = MetaApiClient.calculate_lot_size(
        account_balance=balance,
        risk_percent=account.risk_percent,
        entry_price=exec_log.entry_price,
        stop_loss=exec_log.stop_loss,
        symbol=exec_log.symbol,
    )
    exec_log.lot_size = lot_size
    exec_log.balance_at_execution = balance
    exec_log.mt5_ticket = str(random.randint(100_000, 999_999))
    exec_log.status = "SUBMITTED"
    exec_log.fill_price = exec_log.entry_price
    exec_log.filled_at = datetime.now(timezone.utc)
    exec_log.metaapi_account_id = "DEMO-MODE"
    db.commit()


def _decrypt(encrypted_password: str) -> str:
    """Reuse vault Fernet decryption"""
    import base64, hashlib
    from cryptography.fernet import Fernet
    key_bytes = hashlib.sha256(
        (settings.SECRET_KEY + "MT5_VAULT_FERNET_SALT_V2").encode()
    ).digest()
    fernet_key = base64.urlsafe_b64encode(key_bytes)
    f = Fernet(fernet_key)
    try:
        return f.decrypt(encrypted_password.encode("utf-8")).decode("utf-8")
    except Exception:
        # Legacy XOR fallback
        raw = (settings.SECRET_KEY + "MT5_VAULT_V1").encode()
        legacy_key = hashlib.sha256(raw).digest()
        data = base64.urlsafe_b64decode(encrypted_password.encode())
        return bytes(b ^ legacy_key[i % len(legacy_key)] for i, b in enumerate(data)).decode("utf-8")


# ─── Auto-fire on all active accounts for a new signal ───────────────────────

async def auto_execute_signal(signal_id: int) -> None:
    """
    Called by the watchdog when a new signal is published.
    Fires the signal into every active, connected vault account concurrently.
    """
    client_available = bool(settings.METAAPI_TOKEN)
    db: Session = SessionLocal()
    try:
        signal = db.query(TradingSignal).filter(TradingSignal.id == signal_id).first()
        if not signal or signal.status not in ("ACTIVE",):
            return

        accounts = db.query(MT5Account).filter(
            MT5Account.is_active == True,
            MT5Account.status.in_(["CONNECTED", "PENDING"]),
        ).all()

        if not accounts:
            logger.info(f"[Executor] Signal #{signal_id}: no active vault accounts to execute on.")
            return

        # Check if already executed for this signal on each account
        existing = {
            e.mt5_account_id
            for e in db.query(TradeExecution).filter(
                TradeExecution.signal_id == signal_id,
                TradeExecution.status.in_(["SUBMITTED", "FILLED"]),
            ).all()
        }

        targets = [a for a in accounts if a.id not in existing]
        if not targets:
            return

        logger.info(
            f"[Executor] Signal #{signal_id} ({signal.symbol} {signal.direction}): "
            f"executing on {len(targets)} account(s) | MetaApi={'LIVE' if client_available else 'DEMO'}"
        )

        # Execute concurrently across all accounts
        tasks = [execute_signal_on_account(db, signal, acc) for acc in targets]
        await asyncio.gather(*tasks, return_exceptions=True)

    except Exception as e:
        logger.error(f"[Executor] auto_execute_signal error: {e}", exc_info=True)
    finally:
        db.close()


# ─── Periodic Equity Sync ─────────────────────────────────────────────────────

async def equity_sync_worker() -> None:
    """
    Runs every 5 minutes.
    For all CONNECTED accounts, fetches live equity/balance from MetaApi and saves to DB.
    In demo mode, simulates small equity drift.
    """
    while True:
        await asyncio.sleep(300)  # sync every 5 minutes
        # Obtain client per account inside the loop
        db: Session = SessionLocal()
        try:
            accounts = db.query(MT5Account).filter(
                MT5Account.is_active == True,
                MT5Account.status == "CONNECTED",
            ).all()

            for acc in accounts:
                try:
                    client = get_client(acc.broker_name)
                        if client and acc.metaapi_account_id:
                            info = await client.get_account_info(acc.metaapi_account_id)
                            acc.last_equity = info.get("equity", acc.last_equity)
                            acc.last_balance = info.get("balance", acc.last_balance)
                        acc.last_connected_at = datetime.now(timezone.utc)
                    else:
                        # Demo: small drift
                        import random
                        drift = random.uniform(-50, 150)
                        acc.last_equity = round((acc.last_equity or 10000) + drift, 2)
                        acc.last_balance = acc.last_equity
                        acc.last_connected_at = datetime.now(timezone.utc)
                except Exception as e:
                    logger.warning(f"[EquitySync] Failed for {acc.mt5_login}: {e}")

            db.commit()
        except Exception as e:
            logger.error(f"[EquitySync] Worker error: {e}", exc_info=True)
        finally:
            db.close()
