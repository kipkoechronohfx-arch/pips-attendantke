from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from typing import List, Dict, Any

from app.core.database import get_db
from app.models.trade_execution import TradeExecution

router = APIRouter()

# Helper to compute equity curve
def _equity_curve(db: Session) -> List[Dict[str, Any]]:
    executions = db.query(TradeExecution).filter(TradeExecution.pnl_usd.isnot(None)).order_by(TradeExecution.created_at).all()
    equity = 0.0
    points = []
    for exec in executions:
        equity += exec.pnl_usd or 0.0
        points.append({"timestamp": exec.created_at.isoformat(), "equity": round(equity, 2)})
    return points

# Helper to compute drawdown series
def _drawdown_series(curve: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    peak = -float('inf')
    max_dd = 0.0
    series = []
    for point in curve:
        equity = point["equity"]
        if equity > peak:
            peak = equity
        drawdown = round(peak - equity, 2)
        if drawdown > max_dd:
            max_dd = drawdown
        series.append({"timestamp": point["timestamp"], "drawdown": drawdown})
    return series

@router.get("/equity-curve", response_model=List[Dict[str, Any]])
def get_equity_curve(db: Session = Depends(get_db)):
    """Return the equity curve (cumulative P&L) over time for all accounts."""
    return _equity_curve(db)

@router.get("/drawdown", response_model=List[Dict[str, Any]])
def get_drawdown(db: Session = Depends(get_db)):
    """Return drawdown series derived from the equity curve."""
    curve = _equity_curve(db)
    return _drawdown_series(curve)

@router.get("/winrate-heatmap", response_model=Dict[str, Any])
def get_winrate_heatmap(db: Session = Depends(get_db)):
    """Calculate win‑rate heatmaps by symbol, hour of day and day of week.
    Returns a dict with keys: 'by_symbol', 'by_hour', 'by_weekday', each containing
    {total: int, win: int, win_rate: float} mappings.
    """
    executions = db.query(TradeExecution).filter(TradeExecution.pnl_usd.isnot(None)).all()
    # By symbol
    sym_stats: Dict[str, Dict[str, int]] = {}
    # By hour (0‑23)
    hour_stats: Dict[int, Dict[str, int]] = {h: {"total": 0, "win": 0} for h in range(24)}
    # By weekday (0=Monday)
    weekday_stats: Dict[int, Dict[str, int]] = {d: {"total": 0, "win": 0} for d in range(7)}

    for exec in executions:
        win = exec.pnl_usd > 0
        # symbol
        s = exec.symbol
        if s not in sym_stats:
            sym_stats[s] = {"total": 0, "win": 0}
        sym_stats[s]["total"] += 1
        if win:
            sym_stats[s]["win"] += 1
        # hour
        hour = exec.created_at.hour
        hour_stats[hour]["total"] += 1
        if win:
            hour_stats[hour]["win"] += 1
        # weekday
        wd = exec.created_at.weekday()
        weekday_stats[wd]["total"] += 1
        if win:
            weekday_stats[wd]["win"] += 1

    def calc_rate(d: Dict[str, int]) -> float:
        return round((d["win"] / d["total"]) * 100, 2) if d["total"] > 0 else 0.0

    result = {
        "by_symbol": {sym: {"total": v["total"], "win": v["win"], "win_rate": calc_rate(v)} for sym, v in sym_stats.items()},
        "by_hour": {str(h): {"total": v["total"], "win": v["win"], "win_rate": calc_rate(v)} for h, v in hour_stats.items()},
        "by_weekday": {str(d): {"total": v["total"], "win": v["win"], "win_rate": calc_rate(v)} for d, v in weekday_stats.items()},
    }
    return result

@router.get("/risk-of-ruin", response_model=Dict[str, float])
def calculate_risk_of_ruin(
    equity: float,
    risk_percent: float,
    win_rate: float,
    payoff_ratio: float,
    db: Session = Depends(get_db),
):
    """Calculate a simple risk‑of‑ruin estimate.
    Parameters are expressed as percentages (e.g., win_rate=55 for 55%).
    """
    if equity <= 0 or risk_percent <= 0 or win_rate <= 0 or win_rate >= 100 or payoff_ratio <= 0:
        raise HTTPException(status_code=400, detail="Invalid parameters for risk of ruin calculation")
    # Convert percentages to fractions
    win = win_rate / 100.0
    risk_per_trade = equity * (risk_percent / 100.0)
    # Edge‑case protection
    if risk_per_trade == 0:
        raise HTTPException(status_code=400, detail="Risk per trade evaluates to zero")
    # Kelly fraction (optional, but used for illustration)
    kelly = win - ((1 - win) / payoff_ratio)
    # Simplified risk of ruin formula (Miller’s approximation)
    # R = (1 - (win * payoff_ratio) / ((1 - win) + win * payoff_ratio)) ** (equity / risk_per_trade)
    numerator = win * payoff_ratio
    denominator = (1 - win) + win * payoff_ratio
    prob_success = numerator / denominator
    ruin_prob = (1 - prob_success) ** (equity / risk_per_trade)
    return {"risk_of_ruin": round(ruin_prob * 100, 4)}
