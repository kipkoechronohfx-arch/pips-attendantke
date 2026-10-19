import React, { useRef, useEffect, useState } from 'react';
import { Candle, TradingSignal } from '../types';
import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { Layers, CandlestickChart, TrendingUp } from 'lucide-react';

interface ChartCanvasProps {
  symbol: string;
  activeSignal?: TradingSignal | null;
}

export const ChartCanvas: React.FC<ChartCanvasProps> = ({ symbol, activeSignal }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [timeframe, setTimeframe] = useState<string>('H1');
  const [chartType, setChartType] = useState<'candle' | 'area'>('candle');
  const [showOverlays, setShowOverlays] = useState<boolean>(true);
  const [hoveredCandle, setHoveredCandle] = useState<Candle | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const { quotes } = useAppStore();

  // Load historical candles
  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    api.getCandles(symbol, timeframe, 70)
      .then((data) => {
        if (isMounted) {
          setCandles(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) setLoading(false);
      });
    return () => { isMounted = false; };
  }, [symbol, timeframe]);

  // Redraw canvas whenever candles, chartType, or quotes update
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || candles.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const padding = { top: 25, right: 65, bottom: 30, left: 15 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    // Clear background
    ctx.fillStyle = '#060913';
    ctx.fillRect(0, 0, width, height);

    // Calculate Min & Max price
    let minPrice = Math.min(...candles.map(c => c.low));
    let maxPrice = Math.max(...candles.map(c => c.high));

    // Incorporate active signal levels into scale if overlays enabled
    if (showOverlays && activeSignal) {
      minPrice = Math.min(minPrice, activeSignal.stop_loss, activeSignal.take_profit_1);
      maxPrice = Math.max(maxPrice, activeSignal.stop_loss, activeSignal.take_profit_1);
      if (activeSignal.take_profit_2) maxPrice = Math.max(maxPrice, activeSignal.take_profit_2);
    }

    const priceRange = (maxPrice - minPrice) || 0.001;
    const bufferedMin = minPrice - (priceRange * 0.06);
    const bufferedMax = maxPrice + (priceRange * 0.06);
    const bufferedRange = bufferedMax - bufferedMin;

    const getY = (price: number) => {
      return padding.top + chartH - ((price - bufferedMin) / bufferedRange) * chartH;
    };

    // Draw Grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.fillStyle = '#64748b';

    const gridSteps = 5;
    for (let i = 0; i <= gridSteps; i++) {
      const y = padding.top + (chartH / gridSteps) * i;
      const priceVal = bufferedMax - (bufferedRange / gridSteps) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();

      // Right price axis
      ctx.textAlign = 'left';
      ctx.fillText(priceVal.toFixed(symbol.includes('JPY') ? 3 : symbol.includes('XAU') ? 2 : 5), width - padding.right + 8, y + 3);
    }

    // Candle widths and spacing
    const candleCount = candles.length;
    const stepX = chartW / candleCount;
    const candleW = Math.max(stepX * 0.65, 3);

    if (chartType === 'area') {
      // Draw smooth gradient area
      ctx.beginPath();
      candles.forEach((c, idx) => {
        const x = padding.left + (idx * stepX) + (stepX / 2);
        const y = getY(c.close);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });

      // Close path to bottom
      const lastX = padding.left + ((candles.length - 1) * stepX) + (stepX / 2);
      ctx.lineTo(lastX, padding.top + chartH);
      ctx.lineTo(padding.left + (stepX / 2), padding.top + chartH);
      ctx.closePath();

      const grad = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
      grad.addColorStop(0, 'rgba(56, 189, 248, 0.35)');
      grad.addColorStop(1, 'rgba(56, 189, 248, 0.0)');
      ctx.fillStyle = grad;
      ctx.fill();

      // Stroke Line
      ctx.beginPath();
      candles.forEach((c, idx) => {
        const x = padding.left + (idx * stepX) + (stepX / 2);
        const y = getY(c.close);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      // Draw Candlesticks
      candles.forEach((c, idx) => {
        const xCenter = padding.left + (idx * stepX) + (stepX / 2);
        const isBull = c.close >= c.open;
        const color = isBull ? '#10b981' : '#f43f5e';

        // Draw Wick
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(xCenter, getY(c.high));
        ctx.lineTo(xCenter, getY(c.low));
        ctx.stroke();

        // Draw Body
        const topY = getY(Math.max(c.open, c.close));
        const botY = getY(Math.min(c.open, c.close));
        const bodyH = Math.max(botY - topY, 1.5);

        ctx.fillStyle = color;
        ctx.fillRect(xCenter - (candleW / 2), topY, candleW, bodyH);
      });
    }

    // Draw Signal SL and TP overlays if present
    if (showOverlays && activeSignal) {
      const drawSignalLine = (price: number, label: string, color: string, isDashed: boolean = true) => {
        const y = getY(price);
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        if (isDashed) ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();

        // Label Tag
        ctx.fillStyle = color;
        ctx.font = 'bold 9px JetBrains Mono, monospace';
        ctx.fillRect(width - padding.right + 4, y - 8, 55, 16);
        ctx.fillStyle = '#060913';
        ctx.fillText(label, width - padding.right + 7, y + 4);
        ctx.restore();
      };

      drawSignalLine(activeSignal.entry_price, 'ENTRY', '#38bdf8', false);
      drawSignalLine(activeSignal.stop_loss, 'SL', '#f43f5e', true);
      drawSignalLine(activeSignal.take_profit_1, 'TP1', '#10b981', true);
      if (activeSignal.take_profit_2) {
        drawSignalLine(activeSignal.take_profit_2, 'TP2', '#10b981', true);
      }
    }
  }, [candles, chartType, showOverlays, activeSignal, quotes, symbol]);

  return (
    <div className="bg-[#0f172a] border border-white/[0.08] rounded-2xl p-4 shadow-xl">
      {/* Chart Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-lg font-mono font-extrabold text-slate-100">{symbol}</span>
            <span className="text-xs px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 font-mono font-semibold border border-cyan-500/20">
              {timeframe}
            </span>
          </div>

          {/* Timeframe selector */}
          <div className="flex bg-[#060913] p-1 rounded-xl border border-white/5">
            {['M5', 'M15', 'M30', 'H1', 'H4', 'D1'].map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-2.5 py-1 text-xs font-mono font-semibold rounded-lg transition-all ${
                  timeframe === tf ? 'bg-[#1e293b] text-cyan-400 shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        {/* Style and Overlay toggles */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setChartType(chartType === 'candle' ? 'area' : 'candle')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#060913] hover:bg-[#141f38] border border-white/10 text-xs text-slate-300 font-medium transition-colors"
          >
            <CandlestickChart size={14} className="text-cyan-400" />
            <span>{chartType === 'candle' ? 'Candles' : 'Area'}</span>
          </button>

          {activeSignal && (
            <button
              onClick={() => setShowOverlays(!showOverlays)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors ${
                showOverlays 
                  ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400' 
                  : 'bg-[#060913] border-white/10 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers size={14} />
              <span>Targets</span>
            </button>
          )}
        </div>
      </div>

      {/* Canvas Area */}
      <div className="relative w-full h-[380px] bg-[#060913] rounded-xl border border-white/5 overflow-hidden">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#060913]/80 backdrop-blur-sm z-20">
            <div className="flex items-center gap-2 text-cyan-400 text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
              Streaming Candlesticks...
            </div>
          </div>
        )}
        <canvas ref={canvasRef} className="w-full h-full block" />
      </div>
    </div>
  );
};
