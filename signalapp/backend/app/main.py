import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import Base, engine, SessionLocal
from app.models.user import User, UserRole
from app.models.signal import TradingSignal
from app.core.security import get_password_hash
from app.websockets.hub import ws_manager
from app.services.market_data.manager import market_data_manager

# API Routers
from app.api.endpoints.auth import router as auth_router
from app.api.endpoints.market import router as market_router
from app.api.endpoints.signals import router as signals_router
from app.api.endpoints.admin import router as admin_router
from app.api.endpoints.copier import router as copier_router
from app.api.endpoints.vault import router as vault_router
from app.api.endpoints.misc import news_router, calendar_router, risk_router, alerts_router
from app.api.endpoints.executions import router as executions_router
from app.api.endpoints.scanner import router as scanner_router

# Background Price Streaming Task
streaming_task = None

async def market_data_broadcaster():
    """Background streaming worker: pushes live quotes AND last-candle ticks to WebSocket clients."""
    from app.services.market_data.oanda import OandaDataProvider
    TICK_SYMBOLS = ["XAU/USD", "EUR/USD", "GBP/USD", "USD/JPY", "GBP/JPY"]
    cycle = 0
    while True:
        try:
            if ws_manager.active_connections:
                # Always push quotes
                quotes = await market_data_manager.get_all_quotes()
                await ws_manager.broadcast_json({
                    "type": "QUOTES_UPDATE",
                    "data": [q.model_dump(mode="json") for q in quotes]
                })

                # Every 3rd cycle (~6s) push candle ticks for key symbols
                if cycle % 3 == 0:
                    provider = market_data_manager.current_provider
                    if isinstance(provider, OandaDataProvider) and provider.is_live_feed:
                        ticks = []
                        for sym in TICK_SYMBOLS:
                            candles = await market_data_manager.get_candles(sym, "M5", 2)
                            if candles:
                                last = candles[-1]
                                ticks.append({
                                    "symbol": sym,
                                    "timeframe": "M5",
                                    "time": last.time,
                                    "open": last.open,
                                    "high": last.high,
                                    "low": last.low,
                                    "close": last.close,
                                    "volume": last.volume
                                })
                        if ticks:
                            await ws_manager.broadcast_json({"type": "CANDLE_TICK", "data": ticks})
        except Exception:
            pass
        cycle += 1
        await asyncio.sleep(1.0)

def init_seed_data():
    """Initializes default admin and seed trading signals if database is newly initialized"""
    Base.metadata.create_all(bind=engine)
    db: Session = SessionLocal()
    try:
        # 1. Seed Super Admin
        admin = db.query(User).filter(User.email == "admin@forexsignalpro.com").first()
        if not admin:
            admin = User(
                email="admin@forexsignalpro.com",
                hashed_password=get_password_hash(settings.INITIAL_ADMIN_PASSWORD),
                full_name="Chief Market Analyst",
                role=UserRole.SUPER_ADMIN.value,
                timezone="Africa/Nairobi",
                account_currency="USD",
                is_active=True,
                is_verified=True
            )
            db.add(admin)

        db.commit()
    except Exception as e:
        db.rollback()
    finally:
        db.close()

from app.services.market_data.watchdog import run_server_watchdog
from app.services.metaapi.executor import equity_sync_worker

# Background Tasks
streaming_task = None
watchdog_task = None
equity_sync_task = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    init_seed_data()
    global streaming_task, watchdog_task, equity_sync_task
    streaming_task = asyncio.create_task(market_data_broadcaster())
    watchdog_task = asyncio.create_task(run_server_watchdog())
    equity_sync_task = asyncio.create_task(equity_sync_worker())
    yield
    # Shutdown
    if streaming_task:
        streaming_task.cancel()
    if watchdog_task:
        watchdog_task.cancel()
    if equity_sync_task:
        equity_sync_task.cancel()

from starlette.middleware.base import BaseHTTPMiddleware
from fastapi import Request, Response
from app.core.rate_limit import AuthRateLimitMiddleware

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        return response

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Professional Institutional Forex Signals & Financial News API",
    lifespan=lifespan
)

# Authentication Brute-Force & Rate Limiting Guard (intercepts /auth/login, /auth/token, /auth/register)
app.add_middleware(AuthRateLimitMiddleware)

# Security Headers
app.add_middleware(SecurityHeadersMiddleware)

# Explicit CORS Whitelist
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Mount API Routers
app.include_router(auth_router, prefix=f"{settings.API_V1_STR}/auth", tags=["Authentication"])
app.include_router(market_router, prefix=f"{settings.API_V1_STR}/market", tags=["Market Data"])
app.include_router(signals_router, prefix=f"{settings.API_V1_STR}/signals", tags=["Signals"])
app.include_router(admin_router, prefix=f"{settings.API_V1_STR}/admin", tags=["Admin Studio"])
app.include_router(news_router, prefix=f"{settings.API_V1_STR}/news", tags=["News"])
app.include_router(calendar_router, prefix=f"{settings.API_V1_STR}/calendar", tags=["Economic Calendar"])
app.include_router(risk_router, prefix=f"{settings.API_V1_STR}/risk", tags=["Risk Management"])
app.include_router(alerts_router, prefix=f"{settings.API_V1_STR}/alerts", tags=["Price Alerts"])
app.include_router(copier_router, prefix=f"{settings.API_V1_STR}/copier", tags=["MT5 Trade Copier"])
app.include_router(vault_router, prefix=f"{settings.API_V1_STR}/vault", tags=["MT5 Broker Vault"])
app.include_router(executions_router, prefix=f"{settings.API_V1_STR}/executions", tags=["Trade Executions"])
app.include_router(scanner_router, prefix=f"{settings.API_V1_STR}/scanner", tags=["Precision Scanner"])

@app.get("/health")
def api_health():
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "timezone": settings.DEFAULT_TIMEZONE
    }

@app.websocket("/ws/feed")
async def websocket_feed(websocket: WebSocket):
    """Real-time streaming WebSocket endpoint for live quotes and immediate signal broadcast"""
    await ws_manager.connect(websocket)
    try:
        while True:
            # Keep-alive ping/pong
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception:
        ws_manager.disconnect(websocket)
