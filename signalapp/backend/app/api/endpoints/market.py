from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional, Dict, Any
from app.services.market_data.manager import market_data_manager
from app.schemas.market import Quote, Candle, ProviderHealth

router = APIRouter()

@router.get("/quotes", response_model=List[Quote])
async def get_all_market_quotes():
    """Retrieve live quotes for all tracked forex and commodities pairs."""
    return await market_data_manager.get_all_quotes()

@router.get("/quote/{symbol:path}", response_model=Quote)
async def get_single_quote(symbol: str):
    """Retrieve latest quote for a specific instrument (e.g. EUR/USD, XAU/USD)."""
    quote = await market_data_manager.get_quote(symbol)
    if not quote:
        raise HTTPException(status_code=404, detail=f"Instrument {symbol} not found")
    return quote

@router.get("/candles/{symbol:path}", response_model=List[Candle])
async def get_historical_candles(
    symbol: str,
    timeframe: str = Query("H1", description="Timeframe: M5, M15, M30, H1, H4, D1"),
    count: int = Query(100, ge=10, le=500, description="Number of candles")
):
    """Retrieve historical OHLC candlestick data. The last candle reflects live price."""
    return await market_data_manager.get_candles(symbol, timeframe, count)

@router.get("/tick/{symbol:path}", response_model=Optional[Candle])
async def get_live_tick(
    symbol: str,
    timeframe: str = Query("H1", description="Timeframe for last candle: M5, M15, H1, etc.")
):
    """
    Returns only the **current (last) candle** with a live close price injected from the
    real-time bid/ask mid. Refreshed dynamically every second.
    """
    norm_sym = symbol.replace("_", "/")
    quote = await market_data_manager.get_quote(norm_sym)
    candles = await market_data_manager.get_candles(norm_sym, timeframe, 2)
    if not candles:
        raise HTTPException(status_code=404, detail=f"No candle data for {symbol} · {timeframe}")
    last = candles[-1]
    if quote:
        price = quote.mid
        return Candle(
            time=last.time,
            open=last.open,
            high=max(last.high, price),
            low=min(last.low, price),
            close=price,
            volume=getattr(last, "volume", 0.0)
        )
    return last

@router.get("/status", response_model=Dict[str, Any])
async def get_market_status():
    """Returns the active market data provider, connectivity mode, and data freshness."""
    health = await market_data_manager.get_health()
    provider = market_data_manager.current_provider
    return {
        "provider": health.provider_name,
        "status": health.status,
        "is_live": health.is_live,
        "latency_ms": health.latency_ms,
        "active_symbols": health.active_symbols,
        "provider_class": provider.__class__.__name__,
    }

@router.get("/health", response_model=ProviderHealth)
async def check_market_data_health():
    """Check connectivity and latency of the active market data provider."""
    return await market_data_manager.get_health()
