import pytest
from app.services.risk_engine.calculator import risk_engine
from app.schemas.risk import RiskCalculationRequest

def test_eurusd_position_sizing():
    req = RiskCalculationRequest(
        account_balance=10000.0,
        account_currency="USD",
        risk_percentage=1.0, # 1% = $100
        symbol="EUR/USD",
        entry_price=1.08500,
        stop_loss_price=1.08300, # 20 pips distance
        take_profit_price=1.09000, # 50 pips distance
        leverage=100
    )
    res = risk_engine.calculate_position(req)
    assert res.planned_risk_amount == 100.0
    assert res.stop_loss_pips == pytest.approx(20.0, 0.1)
    assert res.pip_value_standard_lot == pytest.approx(10.0, 0.1)
    # 100 USD / (20 pips * 10 USD/pip) = 0.50 lots
    assert res.recommended_standard_lots == pytest.approx(0.50, 0.05)
    assert res.risk_reward_ratio == pytest.approx(2.5, 0.1)

def test_gold_position_sizing():
    req = RiskCalculationRequest(
        account_balance=5000.0,
        account_currency="USD",
        risk_percentage=2.0, # 2% = $100
        symbol="XAU/USD",
        entry_price=2650.00,
        stop_loss_price=2640.00, # $10 move in gold = 100 pips of 0.10
        leverage=100
    )
    res = risk_engine.calculate_position(req)
    assert res.planned_risk_amount == 100.0
    assert res.recommended_standard_lots > 0
    assert res.units_contract_size > 0
