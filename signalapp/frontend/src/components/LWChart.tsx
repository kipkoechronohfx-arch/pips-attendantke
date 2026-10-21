import React, { useEffect, useRef, useCallback } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  ColorType,
  CrosshairMode,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  Time,
  LineStyle,
} from 'lightweight-charts';
import { api } from '../services/api';
import { TradingSignal } from '../types';
import { Wifi, WifiOff } from 'lucide-react';

interface Props {
  symbol: string;
  timeframe?: string;
  activeSignal?: TradingSignal;
  height?: number;
}

const TF_OPTIONS = ['M5', 'M15', 'M30', 'H1', 'H4', 'D1'];

export const LWChart: React.FC<Props> = ({
  symbol,
  timeframe: initialTf = 'H1',
  activeSignal,
  height = 440,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const priceLinesRef = useRef<any[]>([]);
  const lastCandleTimeRef = useRef<number | null>(null);
  const [tf, setTf] = React.useState(initialTf);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [isLive, setIsLive] = React.useState<boolean | null>(null);
  const [providerName, setProviderName] = React.useState('');
  const [lastTickAt, setLastTickAt] = React.useState<number | null>(null);

  // ── Sync timeframe prop if changed by parent ─────
  useEffect(() => {
    if (initialTf && initialTf !== tf) {
      setTf(initialTf);
    }
  }, [initialTf]);

  // ── Initialize Chart ────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#94a3b8',
        fontSize: 11,
        fontFamily: "'JetBrains Mono', monospace",
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.03)', style: LineStyle.Dotted },
        horzLines: { color: 'rgba(255,255,255,0.03)', style: LineStyle.Dotted },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(212,175,55,0.5)', labelBackgroundColor: '#0a101f' },
        horzLine: { color: 'rgba(212,175,55,0.5)', labelBackgroundColor: '#0a101f' },
      },
      rightPriceScale: {
        borderColor: 'rgba(255,255,255,0.06)',
        textColor: '#64748b',
        scaleMargins: { top: 0.08, bottom: 0.2 },
      },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.06)',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 3,
      },
      width: containerRef.current.clientWidth,
      height,
    });

    const digits = symbol.includes('JPY') ? 3 : symbol.includes('XAU') ? 2 : symbol.includes('BTC') ? 1 : 5;
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#f43f5e',
      borderUpColor: '#10b981',
      borderDownColor: '#f43f5e',
      wickUpColor: '#10b981',
      wickDownColor: '#f43f5e',
      priceFormat: {
        type: 'price',
        precision: digits,
        minMove: 1 / Math.pow(10, digits),
      },
    });

    const volSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol',
      color: 'rgba(100,116,139,0.3)',
    });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volSeriesRef.current = volSeries;

    // Resize observer
    const ro = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volSeriesRef.current = null;
      priceLinesRef.current = [];
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load Candles ────────────────────────────────
  const loadCandles = useCallback(async () => {
    if (!candleSeriesRef.current || !volSeriesRef.current) return;
    setLoading(true);
    setError('');

    // Update price scale precision if symbol changed
    const digits = symbol.includes('JPY') ? 3 : symbol.includes('XAU') ? 2 : symbol.includes('BTC') ? 1 : 5;
    candleSeriesRef.current.applyOptions({
      priceFormat: {
        type: 'price',
        precision: digits,
        minMove: 1 / Math.pow(10, digits),
      },
    });

    try {
      const candles = await api.getCandles(symbol, tf, 120);
      if (!candles || candles.length === 0) {
        setError(`No candle data available for ${symbol} · ${tf}`);
        return;
      }

      // Deduplicate and ensure strict ascending order by time
      const sortedCandles = [...candles].sort((a, b) => a.time - b.time);
      const uniqueCandles: typeof candles = [];
      const seenTimes = new Set<number>();
      for (const c of sortedCandles) {
        if (!seenTimes.has(c.time)) {
          seenTimes.add(c.time);
          uniqueCandles.push(c);
        }
      }

      const ohlc: CandlestickData[] = uniqueCandles.map((c) => ({
        time: c.time as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));
      const vol = uniqueCandles.map((c) => ({
        time: c.time as Time,
        value: c.volume,
        color: c.close >= c.open ? 'rgba(16,185,129,0.25)' : 'rgba(244,63,94,0.25)',
      }));
      candleSeriesRef.current.setData(ohlc);
      volSeriesRef.current.setData(vol);
      chartRef.current?.timeScale().fitContent();

      // Clear previous price lines
      clearPriceLines();

      // Draw signal levels if active
      if (activeSignal) {
        drawSignalLines(activeSignal);
      }
    } catch {
      setError(`Failed to load candles for ${symbol}`);
    } finally {
      setLoading(false);
    }
  }, [symbol, tf, activeSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadCandles(); }, [loadCandles]);

  // ── Live Tick Polling (2s) ─────────────────────────
  // Uses series.update() on the last candle — much faster than setData().
  // Only runs when a chart is mounted and candles are loaded.
  useEffect(() => {
    if (loading || error) return;

    const applyTick = async () => {
      if (!candleSeriesRef.current || !volSeriesRef.current) return;
      try {
        const tick = await api.getLiveTick(symbol, tf);
        if (!tick) return;
        const t = tick.time as Time;
        candleSeriesRef.current.update({
          time: t,
          open: tick.open,
          high: tick.high,
          low: tick.low,
          close: tick.close,
        });
        volSeriesRef.current.update({
          time: t,
          value: tick.volume,
          color: tick.close >= tick.open ? 'rgba(16,185,129,0.25)' : 'rgba(244,63,94,0.25)',
        });
        lastCandleTimeRef.current = tick.time;
        setLastTickAt(Date.now());
      } catch { /* silent — polling continues */ }
    };

    const tickInterval = setInterval(applyTick, 2000);
    return () => clearInterval(tickInterval);
  }, [symbol, tf, loading, error]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Provider Status Badge ──────────────────────────
  useEffect(() => {
    api.getMarketStatus().then((s) => {
      setIsLive(s.is_live);
      setProviderName(s.provider);
    }).catch(() => {
      setIsLive(false);
      setProviderName('Mock Data');
    });
  }, []);

  // ── Clean Signal Price Lines ────────────────────
  function clearPriceLines() {
    if (!candleSeriesRef.current) return;
    for (const line of priceLinesRef.current) {
      try {
        candleSeriesRef.current.removePriceLine(line);
      } catch {
        // ignore if already removed
      }
    }
    priceLinesRef.current = [];
  }

  // ── Signal Price Lines ──────────────────────────
  function drawSignalLines(sig: TradingSignal) {
    if (!candleSeriesRef.current) return;
    clearPriceLines();

    const p1 = candleSeriesRef.current.createPriceLine({
      price: sig.entry_price,
      color: '#06b6d4',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: 'Entry',
    });
    priceLinesRef.current.push(p1);

    const p2 = candleSeriesRef.current.createPriceLine({
      price: sig.stop_loss,
      color: '#f43f5e',
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      axisLabelVisible: true,
      title: 'SL',
    });
    priceLinesRef.current.push(p2);

    const p3 = candleSeriesRef.current.createPriceLine({
      price: sig.take_profit_1,
      color: '#10b981',
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      axisLabelVisible: true,
      title: 'TP1',
    });
    priceLinesRef.current.push(p3);

    if (sig.take_profit_2) {
      const p4 = candleSeriesRef.current.createPriceLine({
        price: sig.take_profit_2,
        color: '#34d399',
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: 'TP2',
      });
      priceLinesRef.current.push(p4);
    }
  }

  return (
    <div className="glass-card-premium rounded-2xl overflow-hidden w-full min-w-0">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06]">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-mono font-black text-slate-100">{symbol}</span>
          {activeSignal && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
              activeSignal.direction === 'BUY'
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                : 'bg-rose-500/10 text-rose-400 border-rose-500/25'
            }`}>
              {activeSignal.direction} Signal Active
            </span>
          )}
          {/* Live / Mock provider badge */}
          {isLive !== null && (
            <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded border ${
              isLive
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
            }`}>
              {isLive ? <Wifi size={8} /> : <WifiOff size={8} />}
              {isLive ? 'OANDA LIVE' : 'SIMULATED'}
            </span>
          )}
          {lastTickAt && isLive && (
            <span className="text-[9px] text-slate-600 font-mono">
              tick {new Date(lastTickAt).toLocaleTimeString()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {TF_OPTIONS.map((t) => (
            <button
              key={t}
              onClick={() => setTf(t)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold transition-all ${
                tf === t
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
              }`}
            >
              {t}
            </button>
          ))}
          <button
            onClick={loadCandles}
            className="ml-1 p-1.5 rounded-lg text-slate-500 hover:text-cyan-400 hover:bg-white/[0.04] transition-all"
            title="Refresh"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Chart Area */}
      <div className="relative w-full overflow-hidden">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#060913]/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
              <span className="text-[11px] text-slate-500 font-mono">Loading {symbol} · {tf}</span>
            </div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <span className="text-xs text-rose-400">{error}</span>
          </div>
        )}
        <div ref={containerRef} className="w-full overflow-hidden" style={{ height }} />
      </div>

      {/* Legend strip */}
      {activeSignal && (
        <div className="flex items-center gap-5 px-4 py-2 border-t border-white/[0.05] text-[10px] font-mono">
          <span className="flex items-center gap-1.5 text-cyan-400">
            <span className="w-4 h-px border-t-2 border-dashed border-cyan-400" />Entry {activeSignal.entry_price}
          </span>
          <span className="flex items-center gap-1.5 text-rose-400">
            <span className="w-4 h-px border-t border-dotted border-rose-400" />SL {activeSignal.stop_loss}
          </span>
          <span className="flex items-center gap-1.5 text-emerald-400">
            <span className="w-4 h-px border-t border-dotted border-emerald-400" />TP1 {activeSignal.take_profit_1}
          </span>
          {activeSignal.take_profit_2 && (
            <span className="flex items-center gap-1.5 text-emerald-300">
              <span className="w-4 h-px border-t border-dotted border-emerald-300" />TP2 {activeSignal.take_profit_2}
            </span>
          )}
          <span className="ml-auto text-slate-500">R:R 1:{activeSignal.risk_reward_ratio}</span>
        </div>
      )}
    </div>
  );
};
