import math
from typing import List, Dict, Tuple, Optional
from app.schemas.market import Candle

class TechnicalIndicators:
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
        # First EMA is SMA of first 'period' values
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
        """Relative Strength Index (Wilder's RSI)"""
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
        """Moving Average Convergence Divergence"""
        fast_ema = TechnicalIndicators.ema(closes, fast)
        slow_ema = TechnicalIndicators.ema(closes, slow)
        
        macd_line: List[Optional[float]] = []
        for f, s in zip(fast_ema, slow_ema):
            if f is not None and s is not None:
                macd_line.append(f - s)
            else:
                macd_line.append(None)

        # Filter valid macd points for signal line
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
        """Bollinger Bands (Middle, Upper, Lower)"""
        middle = TechnicalIndicators.sma(closes, period)
        upper: List[Optional[float]] = []
        lower: List[Optional[float]] = []

        for i in range(len(closes)):
            mid = middle[i]
            if mid is None:
                upper.append(None)
                lower.append(None)
            else:
                window = closes[i - period + 1 : i + 1]
                variance = sum((x - mid) ** 2 for x in window) / period
                std = math.sqrt(variance)
                upper.append(mid + (num_std * std))
                lower.append(mid - (num_std * std))

        return {"middle": middle, "upper": upper, "lower": lower}

    @staticmethod
    def atr(candles: List[Candle], period: int = 14) -> List[Optional[float]]:
        """Average True Range"""
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
    def support_resistance(candles: List[Candle], lookback: int = 20) -> Tuple[float, float]:
        """Identifies recent swing highs and swing lows"""
        recent = candles[-lookback:] if len(candles) >= lookback else candles
        highs = [c.high for c in recent]
        lows = [c.low for c in recent]
        resistance = max(highs) if highs else 0.0
        support = min(lows) if lows else 0.0
        return support, resistance
