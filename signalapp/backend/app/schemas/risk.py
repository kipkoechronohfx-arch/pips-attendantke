from typing import Optional
from pydantic import BaseModel, Field

class RiskCalculationRequest(BaseModel):
    account_balance: float = Field(..., gt=0, description="Account balance in account currency")
    account_currency: str = Field("USD", description="Base account currency")
    risk_percentage: float = Field(..., gt=0, le=100, description="Risk percentage per trade (e.g. 1.0 = 1%)")
    symbol: str = Field(..., description="Currency pair or commodity, e.g. EUR/USD, XAU/USD")
    entry_price: float = Field(..., gt=0, description="Intended entry price")
    stop_loss_price: float = Field(..., gt=0, description="Stop loss price")
    take_profit_price: Optional[float] = Field(None, description="Optional target price for R:R calculation")
    leverage: int = Field(100, ge=1, le=2000, description="Account leverage")
    spread_pips: Optional[float] = Field(0.0, ge=0, description="Current broker spread in pips")
    commission_per_lot: Optional[float] = Field(0.0, ge=0, description="Commission round turn per standard lot")

class RiskCalculationResponse(BaseModel):
    symbol: str
    account_balance: float
    account_currency: str
    risk_percentage: float
    planned_risk_amount: float
    stop_loss_pips: float
    pip_value_standard_lot: float
    recommended_standard_lots: float
    recommended_mini_lots: float
    recommended_micro_lots: float
    units_contract_size: int
    risk_reward_ratio: Optional[float] = None
    potential_profit_amount: Optional[float] = None
    estimated_margin_required: float
    disclaimer: str = (
        "Calculated metrics are estimates based on standard pip formulas. "
        "Actual execution results can vary due to market slippage, spread widening during news, "
        "and broker-specific swap or commission rates."
    )
