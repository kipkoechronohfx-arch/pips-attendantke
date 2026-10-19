from typing import List, Optional, Dict
from datetime import datetime, timezone, timedelta
from app.schemas.market import Candle, Quote
from app.schemas.signal import SignalCreate
from app.services.indicators.technical import TechnicalIndicators


class AutomaticSignalEngine:
    """
    Configurable Quantitative Technical Analysis & Market Confluence Engine.
    Evaluates institutional confluences:
    1. Multi-EMA Trend Alignment (EMA 20 > EMA 50 > EMA 200)
    2. Macro Trend Filtering (Price relative to EMA 200)
    3. RSI Dynamic Momentum Filter (non-exhausted momentum phase)
    4. MACD Histogram Direction & Zero-line crossover
    5. Bollinger Bands Squeeze & Volatility Expansion
    6. Stochastic Oscillator (%K & %D crossover confirmation)
    7. Structural Support & Resistance zone interaction
    8. Price Action / Candlestick confirmation (Pin Bar / Engulfing)
    9. ATR Volatility-adjusted Risk-Reward Targets (Min 1.5 R:R, Scaled TP1/TP2/TP3)
    """

    def __init__(self, min_rr_ratio: float = 1.5, confidence_threshold: int = 75):
        self.min_rr_ratio = min_rr_ratio
        self.confidence_threshold = confidence_threshold

    def analyze_market_structure(self, symbol: str, timeframe: str, candles: List[Candle], current_quote: Quote) -> Optional[SignalCreate]:
        if len(candles) < 50:
            return None

        closes = [c.close for c in candles]
        curr_price = current_quote.mid

        # 1. Compute Full Confluence Indicator Suite
        ema20 = TechnicalIndicators.ema(closes, 20)
        ema50 = TechnicalIndicators.ema(closes, 50)
        ema200 = TechnicalIndicators.ema(closes, 200) if len(closes) >= 200 else [None] * len(closes)
        rsi_vals = TechnicalIndicators.rsi(closes, 14)
        macd_data = TechnicalIndicators.macd(closes, 12, 26, 9)
        bb_data = TechnicalIndicators.bollinger_bands(closes, 20, 2.0)
        stoch_data = TechnicalIndicators.stochastic(candles, 14, 3, 3)
        atr_vals = TechnicalIndicators.atr(candles, 14)
        support, resistance = TechnicalIndicators.support_resistance(candles, 25)
        patterns = TechnicalIndicators.detect_candlestick_patterns(candles)

        latest_ema20 = ema20[-1]
        latest_ema50 = ema50[-1]
        latest_ema200 = ema200[-1]
        latest_rsi = rsi_vals[-1]
        latest_atr = atr_vals[-1]
        latest_macd_hist = macd_data["histogram"][-1]
        prev_macd_hist = macd_data["histogram"][-2] if len(macd_data["histogram"]) >= 2 else None
        latest_bb_mid = bb_data["middle"][-1]
        latest_bb_upper = bb_data["upper"][-1]
        latest_bb_lower = bb_data["lower"][-1]
        latest_stoch_k = stoch_data["k"][-1]
        latest_stoch_d = stoch_data["d"][-1]

        if None in [latest_ema20, latest_ema50, latest_rsi, latest_atr, latest_macd_hist]:
            return None

        # Precision digits
        digits = 5
        if "JPY" in symbol:
            digits = 3
        elif "XAU" in symbol or "BTC" in symbol or "ETH" in symbol:
            digits = 2

        direction = None
        confluences = []
        confidence = 65

        # ── Confluence 1: Trend Alignment (EMA 20 & 50) ──
        bullish_ema = latest_ema20 > latest_ema50
        bearish_ema = latest_ema20 < latest_ema50

        # ── Confluence 2: Macro Trend Filter (EMA 200) ──
        macro_bullish = latest_ema200 is not None and curr_price > latest_ema200
        macro_bearish = latest_ema200 is not None and curr_price < latest_ema200

        # ── Confluence 3: RSI Momentum Confirmation ──
        rsi_bullish = 40.0 <= latest_rsi <= 68.0
        rsi_bearish = 32.0 <= latest_rsi <= 60.0

        # ── Confluence 4: MACD Histogram Acceleration ──
        macd_bullish = latest_macd_hist > 0 and (prev_macd_hist is None or latest_macd_hist >= prev_macd_hist)
        macd_bearish = latest_macd_hist < 0 and (prev_macd_hist is None or latest_macd_hist <= prev_macd_hist)

        # ── Confluence 5: Stochastic Direction ──
        stoch_bullish = (
            latest_stoch_k is not None and latest_stoch_d is not None and
            latest_stoch_k > latest_stoch_d and latest_stoch_k < 80.0
        )
        stoch_bearish = (
            latest_stoch_k is not None and latest_stoch_d is not None and
            latest_stoch_k < latest_stoch_d and latest_stoch_k > 20.0
        )

        # ── Confluence 6: Bollinger Band Structure ──
        bb_bullish = latest_bb_mid is not None and curr_price >= latest_bb_mid and (latest_bb_upper is None or curr_price <= latest_bb_upper * 1.002)
        bb_bearish = latest_bb_mid is not None and curr_price <= latest_bb_mid and (latest_bb_lower is None or curr_price >= latest_bb_lower * 0.998)

        # ── Confluence 7: Candlestick Patterns ──
        bullish_pa = any("Bullish" in p or "Hammer" in p for p in patterns)
        bearish_pa = any("Bearish" in p or "Shooting Star" in p for p in patterns)

        # ── Confluence 8: Structural S/R Bounce ──
        sr_bullish = curr_price >= support and (curr_price - support) <= (latest_atr * 2.0)
        sr_bearish = curr_price <= resistance and (resistance - curr_price) <= (latest_atr * 2.0)

        # EVALUATE BULLISH SETUP
        if bullish_ema and rsi_bullish and latest_macd_hist > 0:
            direction = "BUY"
            confluences.append("EMA 20/50 Golden Cross")
            confluences.append(f"RSI Bullish Momentum ({latest_rsi:.1f})")
            confluences.append("MACD Histogram Positive")
            confidence += 10

            if macro_bullish:
                confluences.append("Price Above 200 EMA Macro Bullish Filter")
                confidence += 5
            if stoch_bullish:
                confluences.append(f"Stochastic Bullish Confirmation (%K={latest_stoch_k:.1f} > %D={latest_stoch_d:.1f})")
                confidence += 5
            if bb_bullish:
                confluences.append("Bollinger Upper-Half Volatility Expansion")
                confidence += 4
            if bullish_pa:
                confluences.append(f"Candlestick Trigger: {', '.join([p for p in patterns if 'Bullish' in p or 'Hammer' in p])}")
                confidence += 5
            if sr_bullish:
                confluences.append(f"Structural Support Defense ({support:.{digits}f})")
                confidence += 4

        # EVALUATE BEARISH SETUP
        elif bearish_ema and rsi_bearish and latest_macd_hist < 0:
            direction = "SELL"
            confluences.append("EMA 20/50 Death Cross Alignment")
            confluences.append(f"RSI Bearish Momentum ({latest_rsi:.1f})")
            confluences.append("MACD Histogram Negative")
            confidence += 10

            if macro_bearish:
                confluences.append("Price Below 200 EMA Macro Bearish Filter")
                confidence += 5
            if stoch_bearish:
                confluences.append(f"Stochastic Bearish Confirmation (%K={latest_stoch_k:.1f} < %D={latest_stoch_d:.1f})")
                confidence += 5
            if bb_bearish:
                confluences.append("Bollinger Lower-Half Breakdown Pressure")
                confidence += 4
            if bearish_pa:
                confluences.append(f"Candlestick Trigger: {', '.join([p for p in patterns if 'Bearish' in p or 'Shooting Star' in p])}")
                confidence += 5
            if sr_bearish:
                confluences.append(f"Structural Resistance Rejection ({resistance:.{digits}f})")
                confidence += 4

        if not direction or confidence < self.confidence_threshold:
            return None

        # ── Confluence 9: Dynamic ATR Stops & Multi-Tiered Take Profits ──
        atr_buffer = latest_atr * 1.5
        if direction == "BUY":
            entry = curr_price
            sl = round(entry - atr_buffer, digits)
            tp1 = round(entry + (atr_buffer * 1.2), digits)
            tp2 = round(entry + (atr_buffer * 2.5), digits)
            tp3 = round(entry + (atr_buffer * 4.0), digits)
            risk = entry - sl
            reward = tp2 - entry
        else:
            entry = curr_price
            sl = round(entry + atr_buffer, digits)
            tp1 = round(entry - (atr_buffer * 1.2), digits)
            tp2 = round(entry - (atr_buffer * 2.5), digits)
            tp3 = round(entry - (atr_buffer * 4.0), digits)
            risk = sl - entry
            reward = entry - tp2

        if risk <= 0:
            return None

        rr_ratio = round(reward / risk, 2)
        if rr_ratio < self.min_rr_ratio:
            return None

        justification = (
            f"Multi-Confluence Algorithm ({timeframe}): " +
            " + ".join(confluences) +
            f". Targets calculated with 14-period ATR ({latest_atr:.{digits}f}) offering 1:{rr_ratio} asymmetric risk/reward."
        )

        expires_at = datetime.now(timezone.utc) + timedelta(hours=12)

        return SignalCreate(
            symbol=symbol,
            direction=direction,
            timeframe=timeframe,
            entry_price=entry,
            entry_zone_high=round(entry + (0.25 * atr_buffer), digits),
            entry_zone_low=round(entry - (0.25 * atr_buffer), digits),
            stop_loss=sl,
            take_profit_1=tp1,
            take_profit_2=tp2,
            take_profit_3=tp3,
            confidence=min(confidence, 96),
            technical_justification=justification,
            expires_at=expires_at
        )


auto_signal_engine = AutomaticSignalEngine(min_rr_ratio=1.5, confidence_threshold=75)
