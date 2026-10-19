from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text, Boolean
from app.core.database import Base


class TradeExecution(Base):
    """
    Records every trade execution attempt made via MetaApi cloud.
    One signal can have multiple executions (one per connected vault account).
    """
    __tablename__ = "trade_executions"

    id = Column(Integer, primary_key=True, index=True)

    # Source signal
    signal_id = Column(Integer, ForeignKey("trading_signals.id"), nullable=False, index=True)

    # Vault account that executed
    mt5_account_id = Column(Integer, ForeignKey("mt5_accounts.id"), nullable=False, index=True)
    client_email = Column(String(255), nullable=False, index=True)

    # MetaApi references
    metaapi_account_id = Column(String(64), nullable=True)   # MetaApi provisioned account UUID
    mt5_ticket = Column(String(30), nullable=True)           # MT5 order/position ticket

    # Trade details at time of execution
    symbol = Column(String(20), nullable=False)
    direction = Column(String(10), nullable=False)           # BUY | SELL
    lot_size = Column(Float, nullable=False)
    entry_price = Column(Float, nullable=False)
    stop_loss = Column(Float, nullable=False)
    take_profit = Column(Float, nullable=False)
    risk_percent = Column(Float, nullable=False)
    balance_at_execution = Column(Float, nullable=True)

    # Execution outcome
    status = Column(String(30), default="PENDING", index=True)
    # PENDING | SUBMITTED | FILLED | REJECTED | CLOSED | CANCELLED
    fill_price = Column(Float, nullable=True)
    close_price = Column(Float, nullable=True)
    pnl_usd = Column(Float, nullable=True)
    error_message = Column(Text, nullable=True)

    # Timestamps
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    filled_at = Column(DateTime, nullable=True)
    closed_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))
