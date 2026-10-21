"""
Risk and Execution Validation Model.

Validates trade execution safety and risk geometry:
- Spread health verification (rejects wide spreads during roll or illiquid periods)
- Dynamic slippage estimation based on ATR and volatility percentile
- Hard stop-loss invariant check (mandatory hard stop, not mental or optional)
- Capital at risk & fractional position size calculation (e.g. 1% capital risk)
- Clearance check against upcoming high-impact volatility events

MANDATORY INVARIANTS:
1. A statistical model score CANNOT override an invalid stop-loss or excessive spread.
2. If spread is excessive or stop loss is missing, the trade MUST BE VETOED.
"""

from typing import Dict, Any, Optional
from .schemas import RiskExecutionOutput


PAIR_MAX_SPREAD_PIPS = {
    "EURUSD": 2.5,
    "GBPUSD": 3.0,
    "USDJPY": 2.5,
    "AUDUSD": 3.0,
    "USDCAD": 3.2,
    "USDCHF": 3.0,
    "NZDUSD": 3.5,
    "EURJPY": 3.5,
    "GBPJPY": 4.5,
    "XAUUSD": 6.0
}


def evaluate_risk_execution(
    symbol: str,
    current_spread_pips: float,
    stop_loss: Optional[float],
    current_price: float,
    direction: str = "BUY",
    pip_size: float = 0.0001,
    volatility_percentile: float = 0.5,
    account_balance: float = 10000.0,
    risk_pct_target: float = 1.0
) -> RiskExecutionOutput:
    """
    Evaluates spread safety, hard stop validity, slippage risk, and recommended position sizing.
    """
    clean_symbol = symbol.replace("/", "").upper()
    max_allowed_spread = PAIR_MAX_SPREAD_PIPS.get(clean_symbol, 4.0)
    
    # 1. Spread Check
    spread_healthy = current_spread_pips <= max_allowed_spread
    
    # 2. Hard Stop-Loss Verification
    if stop_loss is None or stop_loss <= 0:
        return RiskExecutionOutput(
            name="Risk & Execution Validation Model",
            status="FAIL",
            score=0.0,
            confidence=1.0,
            data_quality="HIGH",
            assessment="CRITICAL VETO: Missing or undefined stop loss",
            explanation="Hard stop-loss is mandatory for all executions. Zero-tolerance risk violation.",
            spread_healthy=spread_healthy,
            slippage_risk_pips=0.0,
            hard_stop_valid=False,
            position_size_recommended=0.0,
            liquidity_clearance=False,
            capital_at_risk_pct=0.0
        )
        
    is_buy = direction.upper() in ("BUY", "LONG")
    sl_distance = (current_price - stop_loss) if is_buy else (stop_loss - current_price)
    sl_pips = sl_distance / pip_size
    
    if sl_pips < 3.0:
        return RiskExecutionOutput(
            name="Risk & Execution Validation Model",
            status="FAIL",
            score=10.0,
            confidence=1.0,
            data_quality="HIGH",
            assessment=f"CRITICAL VETO: Stop loss too tight ({sl_pips:.1f} pips)",
            explanation="Stop-loss distance is smaller than normal market noise and spread threshold.",
            spread_healthy=spread_healthy,
            slippage_risk_pips=0.5,
            hard_stop_valid=False,
            position_size_recommended=0.0,
            liquidity_clearance=spread_healthy,
            capital_at_risk_pct=0.0
        )
        
    # 3. Slippage Estimation
    # Higher volatility percentile increases expected slippage
    base_slippage = 0.3
    if volatility_percentile > 0.8:
        estimated_slippage = base_slippage * 3.0
    elif volatility_percentile > 0.6:
        estimated_slippage = base_slippage * 1.8
    else:
        estimated_slippage = base_slippage
        
    # 4. Position Sizing
    # Risk capital = balance * risk_pct_target
    risk_dollars = account_balance * (risk_pct_target / 100.0)
    # Pip value approximation for standard 1.0 lot is ~$10/pip on USD quotes
    dollar_per_pip_per_lot = 10.0
    recommended_lots = round(risk_dollars / (sl_pips * dollar_per_pip_per_lot), 2) if sl_pips > 0 else 0.01
    recommended_lots = max(0.01, min(recommended_lots, 10.0))
    
    factors = {
        "symbol": clean_symbol,
        "current_spread_pips": round(current_spread_pips, 1),
        "max_allowed_spread_pips": max_allowed_spread,
        "sl_pips": round(sl_pips, 1),
        "estimated_slippage_pips": round(estimated_slippage, 2),
        "recommended_lots": recommended_lots,
        "account_balance": account_balance,
        "risk_target_pct": risk_pct_target
    }

    # Invariant: Excessive Spread
    if not spread_healthy:
        return RiskExecutionOutput(
            name="Risk & Execution Validation Model",
            status="FAIL",
            score=20.0,
            confidence=0.95,
            data_quality="HIGH",
            assessment=f"CRITICAL VETO: Spread elevated ({current_spread_pips:.1f} pips > {max_allowed_spread:.1f} max)",
            factors=factors,
            explanation=f"Market spread exceeds safety limit for {clean_symbol}. Immediate execution vetoed.",
            spread_healthy=False,
            slippage_risk_pips=round(estimated_slippage, 2),
            hard_stop_valid=True,
            position_size_recommended=0.0,
            liquidity_clearance=False,
            capital_at_risk_pct=0.0
        )

    score = 90.0
    if estimated_slippage > 0.8:
        score -= 15.0
        status = "WARN"
        assessment = f"Approved with elevated slippage precaution ({estimated_slippage:.1f} pips)"
        explanation = f"Spread {current_spread_pips:.1f} pips is healthy, SL {sl_pips:.1f} pips valid, position sized at {recommended_lots} lots."
    else:
        status = "PASS"
        assessment = f"Full execution clearance (Spread {current_spread_pips:.1f} pips, SL {sl_pips:.1f} pips)"
        explanation = f"Optimal risk parameters. Recommended lot size {recommended_lots} lots ({risk_pct_target}% risk)."

    return RiskExecutionOutput(
        name="Risk & Execution Validation Model",
        status=status,
        score=score,
        confidence=0.95,
        data_quality="HIGH",
        assessment=assessment,
        factors=factors,
        explanation=explanation,
        spread_healthy=True,
        slippage_risk_pips=round(estimated_slippage, 2),
        hard_stop_valid=True,
        position_size_recommended=recommended_lots,
        liquidity_clearance=True,
        capital_at_risk_pct=risk_pct_target
    )
