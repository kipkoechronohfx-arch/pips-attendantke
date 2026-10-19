import math
from typing import Dict, Any
from app.schemas.risk import RiskCalculationRequest, RiskCalculationResponse

# Instrument specifications
INSTRUMENT_SPECS = {
    "EUR/USD": {"pip_size": 0.0001, "contract_size": 100000, "quote": "USD"},
    "GBP/USD": {"pip_size": 0.0001, "contract_size": 100000, "quote": "USD"},
    "AUD/USD": {"pip_size": 0.0001, "contract_size": 100000, "quote": "USD"},
    "NZD/USD": {"pip_size": 0.0001, "contract_size": 100000, "quote": "USD"},
    "USD/CAD": {"pip_size": 0.0001, "contract_size": 100000, "quote": "CAD"},
    "USD/CHF": {"pip_size": 0.0001, "contract_size": 100000, "quote": "CHF"},
    "USD/JPY": {"pip_size": 0.01, "contract_size": 100000, "quote": "JPY"},
    "EUR/JPY": {"pip_size": 0.01, "contract_size": 100000, "quote": "JPY"},
    "GBP/JPY": {"pip_size": 0.01, "contract_size": 100000, "quote": "JPY"},
    "XAU/USD": {"pip_size": 0.10, "contract_size": 100, "quote": "USD"},    # 100 oz standard lot
    "XAG/USD": {"pip_size": 0.01, "contract_size": 5000, "quote": "USD"},   # 5000 oz standard lot
    "BTC/USD": {"pip_size": 1.00, "contract_size": 1, "quote": "USD"},
}

class RiskManagementEngine:
    @staticmethod
    def calculate_position(req: RiskCalculationRequest) -> RiskCalculationResponse:
        spec = INSTRUMENT_SPECS.get(req.symbol, {"pip_size": 0.0001, "contract_size": 100000, "quote": "USD"})
        pip_size = spec["pip_size"]
        contract_size = spec["contract_size"]
        quote_curr = spec["quote"]

        # 1. Planned dollar risk
        planned_risk = round(req.account_balance * (req.risk_percentage / 100.0), 2)

        # 2. Stop loss distance in pips
        price_diff = abs(req.entry_price - req.stop_loss_price)
        sl_pips = round(price_diff / pip_size, 1)

        if sl_pips <= 0:
            sl_pips = 1.0

        # Account for spread if provided
        effective_sl_pips = sl_pips + (req.spread_pips or 0.0)

        # 3. Pip value per standard lot (1.0 lot) in USD
        if quote_curr == "USD":
            # For 1 standard lot: pip_size * contract_size
            pip_value_std = pip_size * contract_size # e.g. 0.0001 * 100,000 = $10.00; for gold 0.10 * 100 = $10.00
        elif quote_curr == "JPY":
            # 1 pip in JPY = pip_size * 100,000 = 1,000 JPY. In USD: 1,000 / entry_price
            pip_value_std = (pip_size * contract_size) / req.entry_price
        elif quote_curr in ["CAD", "CHF"]:
            pip_value_std = (pip_size * contract_size) / req.entry_price
        else:
            pip_value_std = 10.0

        # 4. Standard lots needed to risk exactly planned_risk
        # Risk = Lots * effective_sl_pips * pip_value_std + (Lots * commission_per_lot)
        risk_per_lot = (effective_sl_pips * pip_value_std) + (req.commission_per_lot or 0.0)
        
        if risk_per_lot > 0:
            raw_lots = planned_risk / risk_per_lot
        else:
            raw_lots = 0.01

        # Lots rounding
        std_lots = round(raw_lots, 2)
        mini_lots = round(raw_lots * 10, 1)
        micro_lots = round(raw_lots * 100, 0)
        units = int(raw_lots * contract_size)

        # 5. Risk to reward and potential profit
        rr_ratio = None
        potential_profit = None
        if req.take_profit_price:
            tp_diff = abs(req.take_profit_price - req.entry_price)
            tp_pips = tp_diff / pip_size
            if sl_pips > 0:
                rr_ratio = round(tp_pips / sl_pips, 2)
                potential_profit = round(raw_lots * tp_pips * pip_value_std, 2)

        # 6. Estimated required margin
        # Margin = (Units * Entry Price) / Leverage
        est_margin = round((raw_lots * contract_size * req.entry_price) / max(req.leverage, 1), 2)

        return RiskCalculationResponse(
            symbol=req.symbol,
            account_balance=req.account_balance,
            account_currency=req.account_currency,
            risk_percentage=req.risk_percentage,
            planned_risk_amount=planned_risk,
            stop_loss_pips=sl_pips,
            pip_value_standard_lot=round(pip_value_std, 2),
            recommended_standard_lots=std_lots,
            recommended_mini_lots=mini_lots,
            recommended_micro_lots=micro_lots,
            units_contract_size=units,
            risk_reward_ratio=rr_ratio,
            potential_profit_amount=potential_profit,
            estimated_margin_required=est_margin
        )

risk_engine = RiskManagementEngine()
