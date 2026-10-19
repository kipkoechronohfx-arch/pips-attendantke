import pytest
from app.services.indicators.technical import TechnicalIndicators
from app.schemas.market import Candle

def test_sma_calculation():
    data = [1.0, 2.0, 3.0, 4.0, 5.0]
    sma3 = TechnicalIndicators.sma(data, 3)
    assert sma3[0] is None
    assert sma3[1] is None
    assert sma3[2] == pytest.approx(2.0)
    assert sma3[3] == pytest.approx(3.0)
    assert sma3[4] == pytest.approx(4.0)

def test_ema_calculation():
    data = [10.0, 11.0, 12.0, 13.0, 14.0, 15.0]
    ema3 = TechnicalIndicators.ema(data, 3)
    assert ema3[2] == pytest.approx(11.0)
    # Next EMA = (13 - 11) * 0.5 + 11 = 12.0
    assert ema3[3] == pytest.approx(12.0)

def test_rsi_bounds():
    # Monotonically increasing prices should have high RSI
    up_data = [10.0 + i * 0.5 for i in range(30)]
    rsi_up = TechnicalIndicators.rsi(up_data, 14)
    assert rsi_up[-1] is not None
    assert rsi_up[-1] > 80.0

    # Monotonically decreasing prices should have low RSI
    down_data = [30.0 - i * 0.5 for i in range(30)]
    rsi_down = TechnicalIndicators.rsi(down_data, 14)
    assert rsi_down[-1] is not None
    assert rsi_down[-1] < 20.0

def test_bollinger_bands():
    data = [10.0] * 30
    bb = TechnicalIndicators.bollinger_bands(data, 20, 2.0)
    assert bb["middle"][-1] == pytest.approx(10.0)
    assert bb["upper"][-1] == pytest.approx(10.0)
    assert bb["lower"][-1] == pytest.approx(10.0)

def test_atr_positive():
    candles = [
        Candle(time=i, open=1.0800, high=1.0850, low=1.0790, close=1.0840, volume=100)
        for i in range(25)
    ]
    atr = TechnicalIndicators.atr(candles, 14)
    assert atr[-1] is not None
    assert atr[-1] > 0.0
