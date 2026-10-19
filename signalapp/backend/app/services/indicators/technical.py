import math
from typing import List, Dict, Tuple, Optional
from app.schemas.market import Candle


class TechnicalIndicators:
    """
    Comprehensive quantitative technical indicator library for market scanning and confluence evaluation.
    Supports Moving Averages, RSI, MACD, Bollinger Bands, Stochastic, ATR, Pivots, and Candlestick Patterns.
    """

    @staticmethod
    def sma(values: List[float], period: int) -> List[Optional[float]]:
        """Simple Moving Average"""
        if len(values) < period:
            return [None] * len(values)
        res: List[Optional[float]] = [None] * (period - 1)
        for i in range(period - 1, len(values)):
            window = values[i - period + 1 : i + 1]
            res.append(sum(window) / period)
        return res

    @staticmethod
    def ema(values: List[float], period: int) -> List[Optional[float]]:
        """Exponential Moving Average"""
        if len(values) < period:
            return [None] * len(values)
        res: List[Optional[float]] = [None] * (period - 1)
        first_sma = sum(values[:period]) / period
        res.append(first_sma)
        multiplier = 2.0 / (period + 1.0)
        curr = first_sma
        for i in range(period, len(values)):
            curr = (values[i] - curr) * multiplier + curr
            res.append(curr)
        return res

    @staticmethod
    def rsi(closes: List[float], period: int = 14) -> List[Optional[float]]:
        """Relative Strength Index (Wilder's Smoothing)"""
        if len(closes) <= period:
            return [None] * len(closes)

        gains = []
        losses = []
        for i in range(1, len(closes)):
            diff = closes[i] - closes[i - 1]
            gains.append(max(diff, 0.0))
            losses.append(max(-diff, 0.0))

        res: List[Optional[float]] = [None] * period
        avg_gain = sum(gains[:period]) / period
        avg_loss = sum(losses[:period]) / period

        if avg_loss == 0:
            res.append(100.0)
        else:
            rs = avg_gain / avg_loss
            res.append(100.0 - (100.0 / (1.0 + rs)))

        for i in range(period, len(gains)):
            avg_gain = (avg_gain * (period - 1) + gains[i]) / period
            avg_loss = (avg_loss * (period - 1) + losses[i]) / period
            if avg_loss == 0:
                res.append(100.0)
            else:
                rs = avg_gain / avg_loss
                res.append(100.0 - (100.0 / (1.0 + rs)))
        return res

    @staticmethod
    def macd(closes: List[float], fast: int = 12, slow: int = 26, signal: int = 9) -> Dict[str, List[Optional[float]]]:
        """Moving Average Convergence Divergence (MACD, Signal, Histogram)"""
        fast_ema = TechnicalIndicators.ema(closes, fast)
        slow_ema = TechnicalIndicators.ema(closes, slow)

        macd_line: List[Optional[float]] = []
        for f, s in zip(fast_ema, slow_ema):
            if f is not None and s is not None:
                macd_line.append(f - s)
            else:
                macd_line.append(None)

        valid_macd = [x for x in macd_line if x is not None]
        none_count = len(macd_line) - len(valid_macd)
        signal_valid = TechnicalIndicators.ema(valid_macd, signal)
        signal_line = ([None] * none_count) + signal_valid

        histogram: List[Optional[float]] = []
        for m, sig in zip(macd_line, signal_line):
            if m is not None and sig is not None:
                histogram.append(m - sig)
            else:
                histogram.append(None)

        return {
            "macd": macd_line,
            "signal": signal_line,
            "histogram": histogram
        }

    @staticmethod
    def bollinger_bands(closes: List[float], period: int = 20, num_std: float = 2.0) -> Dict[str, List[Optional[float]]]:
        """Bollinger Bands (Middle, Upper, Lower, Bandwidth Squeeze)"""
        middle = TechnicalIndicators.sma(closes, period)
        upper: List[Optional[float]] = []
        lower: List[Optional[float]] = []
        bandwidth: List[Optional[float]] = []

        for i in range(len(closes)):
            mid = middle[i]
            if mid is None:
                upper.append(None)
                lower.append(None)
                bandwidth.append(None)
            else:
                window = closes[i - period + 1 : i + 1]
                variance = sum((x - mid) ** 2 for x in window) / period
                std = math.sqrt(variance)
                up = mid + (num_std * std)
                lo = mid - (num_std * std)
                upper.append(up)
                lower.append(lo)
                bw = ((up - lo) / mid) * 100 if mid > 0 else 0
                bandwidth.append(bw)

        return {"middle": middle, "upper": upper, "lower": lower, "bandwidth": bandwidth}

    @staticmethod
    def stochastic(candles: List[Candle], k_period: int = 14, d_period: int = 3, smooth_k: int = 3) -> Dict[str, List[Optional[float]]]:
        """Stochastic Oscillator (%K and %D)"""
        if len(candles) < k_period:
            return {"k": [None] * len(candles), "d": [None] * len(candles)}

        raw_k: List[Optional[float]] = [None] * (k_period - 1)
        for i in range(k_period - 1, len(candles)):
            window = candles[i - k_period + 1 : i + 1]
            highest_high = max(c.high for c in window)
            lowest_low = min(c.low for c in window)
            current_close = candles[i].close

            hl_range = highest_high - lowest_low
            if hl_range == 0:
                raw_k.append(50.0)
            else:
                k_val = ((current_close - lowest_low) / hl_range) * 100.0
                raw_k.append(k_val)

        valid_raw = [x for x in raw_k if x is not None]
        none_count = len(raw_k) - len(valid_raw)
        smoothed_k_valid = TechnicalIndicators.sma(valid_raw, smooth_k)
        smoothed_k = ([None] * none_count) + smoothed_k_valid

        valid_k = [x for x in smoothed_k if x is not None]
        none_k_count = len(smoothed_k) - len(valid_k)
        d_valid = TechnicalIndicators.sma(valid_k, d_period)
        d_line = ([None] * none_k_count) + d_valid

        return {"k": smoothed_k, "d": d_line}

    @staticmethod
    def atr(candles: List[Candle], period: int = 14) -> List[Optional[float]]:
        """Average True Range (Wilder's ATR)"""
        if len(candles) <= period:
            return [None] * len(candles)

        tr_list = []
        tr_list.append(candles[0].high - candles[0].low)
        for i in range(1, len(candles)):
            h = candles[i].high
            l = candles[i].low
            prev_c = candles[i - 1].close
            tr = max(h - l, abs(h - prev_c), abs(l - prev_c))
            tr_list.append(tr)

        atr_list: List[Optional[float]] = [None] * (period - 1)
        first_atr = sum(tr_list[:period]) / period
        atr_list.append(first_atr)
        curr = first_atr
        for i in range(period, len(tr_list)):
            curr = (curr * (period - 1) + tr_list[i]) / period
            atr_list.append(curr)

        return atr_list

    @staticmethod
    def support_resistance(candles: List[Candle], lookback: int = 25) -> Tuple[float, float]:
        """Identifies recent structural support and resistance levels"""
        recent = candles[-lookback:] if len(candles) >= lookback else candles
        highs = [c.high for c in recent]
        lows = [c.low for c in recent]
        resistance = max(highs) if highs else 0.0
        support = min(lows) if lows else 0.0
        return support, resistance

    @staticmethod
    def detect_candlestick_patterns(candles: List[Candle]) -> List[str]:
        """
        Detects high-probability price action patterns on latest candles:
        - Bullish/Bearish Engulfing
        - Pin Bar / Hammer / Shooting Star (liquidity wick rejection)
        - Inside Bar Breakout
        """
        if len(candles) < 3:
            return []

        c0 = candles[-1]
        c1 = candles[-2]
        patterns = []

        c0_range = c0.high - c0.low or 0.00001

        # Bullish Engulfing
        if c1.close < c1.open and c0.close > c0.open:
            if c0.close > c1.open and c0.open < c1.close:
                patterns.append("Bullish Engulfing")

        # Bearish Engulfing
        if c1.close > c1.open and c0.close < c0.open:
            if c0.close < c1.open and c0.open > c1.close:
                patterns.append("Bearish Engulfing")

        # Bullish Pin Bar / Hammer (lower wick >= 60% of total range, small body at top)
        lower_wick = min(c0.open, c0.close) - c0.low
        upper_wick = c0.high - max(c0.open, c0.close)
        if lower_wick >= 0.60 * c0_range and upper_wick <= 0.25 * c0_range:
            patterns.append("Bullish Pin Bar Rejection")

        # Bearish Pin Bar / Shooting Star (upper wick >= 60% of total range, small body at bottom)
        if upper_wick >= 0.60 * c0_range and lower_wick <= 0.25 * c0_range:
            patterns.append("Bearish Shooting Star Rejection")

        # Inside Bar Breakout
        if c0.high > c1.high and c1.high <= candles[-3].high and c1.low >= candles[-3].low:
            patterns.append("Inside Bar Bullish Breakout")
        elif c0.low < c1.low and c1.high <= candles[-3].high and c1.low >= candles[-3].low:
            patterns.append("Inside Bar Bearish Breakdown")

        return patterns
