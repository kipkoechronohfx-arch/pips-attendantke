from fastapi import APIRouter, HTTPException, Query
from typing import List
from app.services.market_data.manager import market_data_manager
from app.schemas.market import Quote, Candle, ProviderHealth

router = APIRouter()

@router.get("/quotes", response_model=List[Quote])
async def get_all_market_quotes():
    """Retrieve streaming/simulated quotes for all tracked forex and commodities pairs"""
    return await market_data_manager.get_all_quotes()

@router.get("/quote/{symbol:path}", response_model=Quote)
async def get_single_quote(symbol: str):
    """Retrieve latest quote for a specific instrument (e.g. EUR/USD, XAU/USD)"""
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
    """Retrieve historical OHLC candlestick data for technical analysis and charts"""
    return await market_data_manager.get_candles(symbol, timeframe, count)

@router.get("/health", response_model=ProviderHealth)
async def check_market_data_health():
    """Check connectivity and latency of the active market data provider"""
    return await market_data_manager.get_health()
