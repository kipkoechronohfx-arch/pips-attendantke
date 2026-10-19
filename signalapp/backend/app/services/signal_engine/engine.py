from typing import List, Optional, Dict
from datetime import datetime, timezone, timedelta
from app.schemas.market import Candle, Quote
from app.schemas.signal import SignalCreate
from app.services.indicators.technical import TechnicalIndicators

class AutomaticSignalEngine:
    """
    Configurable Quantitative Technical Analysis & Signal Generation Engine.
    Uses multi-indicator confluence: EMA Trend + RSI Momentum + MACD + ATR Dynamic Exits.
    """
    def __init__(self, min_rr_ratio: float = 1.5, confidence_threshold: int = 75):
        self.min_rr_ratio = min_rr_ratio
        self.confidence_threshold = confidence_threshold

    def analyze_market_structure(self, symbol: str, timeframe: str, candles: List[Candle], current_quote: Quote) -> Optional[SignalCreate]:
        if len(candles) < 60:
            return None

        closes = [c.close for c in candles]
        curr_price = current_quote.mid

        # 1. Calculate Indicators
        ema20 = TechnicalIndicators.ema(closes, 20)
        ema50 = TechnicalIndicators.ema(closes, 50)
        ema200 = TechnicalIndicators.ema(closes, 200) if len(closes) >= 200 else [None] * len(closes)
        rsi_vals = TechnicalIndicators.rsi(closes, 14)
        macd_data = TechnicalIndicators.macd(closes, 12, 26, 9)
        atr_vals = TechnicalIndicators.atr(candles, 14)
        support, resistance = TechnicalIndicators.support_resistance(candles, 25)

        latest_ema20 = ema20[-1]
        latest_ema50 = ema50[-1]
        latest_rsi = rsi_vals[-1]
        latest_atr = atr_vals[-1]
        latest_macd_hist = macd_data["histogram"][-1]

        if None in [latest_ema20, latest_ema50, latest_rsi, latest_atr, latest_macd_hist]:
            return None

        # Determine precision digits based on symbol
        digits = 5
        if "JPY" in symbol:
            digits = 3
        elif "XAU" in symbol or "BTC" in symbol:
            digits = 2

        direction = None
        reasons = []
        confidence = 70

        # Bullish Confluence Condition:
        # EMA20 > EMA50, RSI between 45 and 68 (momentum expanding, not overbought), MACD histogram positive
        if latest_ema20 > latest_ema50 and 42.0 <= latest_rsi <= 68.0 and latest_macd_hist > 0:
            direction = "BUY"
            reasons.append("EMA 20/50 Golden Trend Alignment")
            reasons.append(f"RSI Momentum Bullish ({latest_rsi:.1f})")
            reasons.append("MACD Histogram Expanding Positive")
            if curr_price > support:
                reasons.append(f"Price holding above Support zone ({support:.{digits}f})")
            confidence += 15

        # Bearish Confluence Condition:
        # EMA20 < EMA50, RSI between 32 and 58 (bearish momentum, not oversold), MACD histogram negative
        elif latest_ema20 < latest_ema50 and 32.0 <= latest_rsi <= 58.0 and latest_macd_hist < 0:
            direction = "SELL"
            reasons.append("EMA 20/50 Death Cross / Downward Alignment")
            reasons.append(f"RSI Momentum Bearish ({latest_rsi:.1f})")
            reasons.append("MACD Histogram Contracting Negative")
            if curr_price < resistance:
                reasons.append(f"Price rejected below Resistance zone ({resistance:.{digits}f})")
            confidence += 15

        if not direction:
            return None

        # 2. Dynamic ATR Exits
        atr_buffer = latest_atr * 1.5
        if direction == "BUY":
            entry = curr_price
            sl = round(entry - atr_buffer, digits)
            tp1 = round(entry + (atr_buffer * 1.0), digits)
            tp2 = round(entry + (atr_buffer * 2.0), digits)
            tp3 = round(entry + (atr_buffer * 3.0), digits)
            risk = entry - sl
            reward = tp2 - entry
        else:
            entry = curr_price
            sl = round(entry + atr_buffer, digits)
            tp1 = round(entry - (atr_buffer * 1.0), digits)
            tp2 = round(entry - (atr_buffer * 2.0), digits)
            tp3 = round(entry - (atr_buffer * 3.0), digits)
            risk = sl - entry
            reward = entry - tp2

        if risk <= 0:
            return None

        rr_ratio = round(reward / risk, 2)
        if rr_ratio < self.min_rr_ratio:
            return None

        justification = (
            f"Confluence Setup ({timeframe}): " + "; ".join(reasons) +
            f". Targets projected using 14-period ATR ({latest_atr:.{digits}f}). "
            f"Analytical signal only, not guaranteed advice."
        )

        expires_at = datetime.now(timezone.utc) + timedelta(hours=12)

        return SignalCreate(
            symbol=symbol,
            direction=direction,
            timeframe=timeframe,
            entry_price=entry,
            entry_zone_high=round(entry + (0.3 * atr_buffer), digits),
            entry_zone_low=round(entry - (0.3 * atr_buffer), digits),
            stop_loss=sl,
            take_profit_1=tp1,
            take_profit_2=tp2,
            take_profit_3=tp3,
            confidence=min(confidence, 95),
            technical_justification=justification,
            expires_at=expires_at
        )

auto_signal_engine = AutomaticSignalEngine()
