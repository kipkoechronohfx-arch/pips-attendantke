import React from 'react';
import { useAppStore } from '../store/useAppStore';
import { TrendingUp, TrendingDown, Activity, Dot } from 'lucide-react';

export const TickerMarquee: React.FC = () => {
  const { quotes, setSelectedSymbol, setActiveTab } = useAppStore();
  const quoteList = Object.values(quotes);

  const items = quoteList.length > 0 ? quoteList : [
    { symbol: 'EUR/USD', mid: 1.08520, change_24h_pct: 0.28,  spread: 0.8 },
    { symbol: 'GBP/USD', mid: 1.30240, change_24h_pct: -0.15, spread: 1.2 },
    { symbol: 'USD/JPY', mid: 149.250, change_24h_pct: 0.42,  spread: 0.9 },
    { symbol: 'XAU/USD', mid: 2652.50, change_24h_pct: 0.85,  spread: 2.5 },
    { symbol: 'BTC/USD', mid: 67450.0, change_24h_pct: 1.65,  spread: 8.0 },
    { symbol: 'USD/CHF', mid: 0.86540, change_24h_pct: -0.08, spread: 1.4 },
    { symbol: 'AUD/USD', mid: 0.66850, change_24h_pct: 0.19,  spread: 1.1 },
    { symbol: 'GBP/JPY', mid: 194.320, change_24h_pct: 0.31,  spread: 1.8 },
    { symbol: 'EUR/JPY', mid: 161.850, change_24h_pct: -0.12, spread: 1.5 },
    { symbol: 'XAG/USD', mid: 31.550,  change_24h_pct: 1.10,  spread: 2.0 },
  ];

  // Duplicate for seamless infinite loop
  const doubled = [...items, ...items];

  const getDecimals = (symbol: string) =>
    symbol.includes('JPY') ? 3 : symbol.includes('XAU') ? 2 : symbol.includes('XAG') ? 3 : symbol.includes('BTC') ? 1 : 5;

  const handleClick = (symbol: string) => {
    setSelectedSymbol(symbol);
    setActiveTab('charts');
  };

  return (
    <div className="h-9 bg-black/25 backdrop-blur-md border-b border-white/[0.06] flex items-center overflow-hidden select-none text-xs font-mono w-full max-w-full" style={{ contain: 'paint' }}>
      {/* Label Pin */}
      <div className="shrink-0 flex items-center gap-1.5 px-4 h-full bg-gradient-to-r from-black/40 to-transparent border-r border-white/[0.07] z-10">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_#10b981]" />
        <Activity size={12} className="text-amber-400" />
        <span className="text-amber-400 font-sans font-bold uppercase tracking-wider text-[10px]">Live</span>
      </div>

      {/* Scrolling Track — duplicated for seamless loop */}
      <div className="overflow-hidden flex-1 min-w-0 relative h-full flex items-center" style={{ contain: 'paint' }}>
        <div className="ticker-track gap-8 py-1">
          {doubled.map((item, idx) => {
            const isUp = (item.change_24h_pct ?? 0) >= 0;
            const decimals = getDecimals(item.symbol);
            return (
              <button
                key={`${item.symbol}-${idx}`}
                onClick={() => handleClick(item.symbol)}
                className="inline-flex items-center gap-2 cursor-pointer shrink-0 group hover:text-cyan-300 transition-colors px-1"
              >
                <span className="font-bold text-slate-200 group-hover:text-cyan-300 transition-colors text-[11px]">
                  {item.symbol}
                </span>
                <span className="font-semibold text-slate-100 tabular-nums">
                  {item.mid?.toFixed(decimals)}
                </span>
                <span
                  className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-sm ${
                    isUp
                      ? 'text-emerald-400 bg-emerald-500/10'
                      : 'text-rose-400 bg-rose-500/10'
                  }`}
                >
                  {isUp ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
                  {isUp ? '+' : ''}{item.change_24h_pct?.toFixed(2)}%
                </span>
                {/* Separator dot */}
                <span className="text-white/10 text-base leading-none">·</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
