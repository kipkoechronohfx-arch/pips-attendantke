import React, { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { LWChart } from '../components/LWChart';
import { SignalCard } from '../components/SignalCard';
import {
  LineChart,
  Search,
  Star,
  Target,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Info,
  Maximize2,
} from 'lucide-react';

export const ChartsPage: React.FC = () => {
  const {
    selectedSymbol,
    setSelectedSymbol,
    setSelectedAnalysisSymbol,
    quotes,
    signals,
    flashMap,
    favorites,
    toggleFavorite,
  } = useAppStore();

  const [search, setSearch] = useState('');
  const [timeframe, setTimeframe] = useState('H1');

  const quoteList = Object.values(quotes);
  const activeSignal = signals.find((s) => s.symbol === selectedSymbol && s.status === 'ACTIVE');
  const isStarred = favorites.includes(selectedSymbol);

  const filteredQuotes = quoteList.filter((q) =>
    q.symbol.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5 page-enter font-sans">
      {/* ── Symbol Quick Selector & Search Bar ── */}
      <div className="bg-[#0a101f] border border-white/[0.08] rounded-2xl p-3 sm:p-4 shadow-xl space-y-3 font-mono">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Quick Search */}
          <div className="relative min-w-[180px] max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search pair..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-black/40 border border-white/10 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
            />
          </div>

          {/* Timeframe Selector Bar */}
          <div className="flex rounded-xl bg-black/40 border border-white/10 p-0.5 text-xs">
            {['M5', 'M15', 'M30', 'H1', 'H4', 'D1'].map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-3 py-1 rounded-lg font-bold transition-all ${
                  timeframe === tf
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/35 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        {/* Horizontal Quick-Select Pills */}
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {filteredQuotes.map((q) => {
            const isSelected = q.symbol === selectedSymbol;
            const isUp = q.change_24h_pct >= 0;
            const flash = flashMap[q.symbol];
            return (
              <button
                key={q.symbol}
                onClick={() => setSelectedSymbol(q.symbol)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-mono font-semibold transition-all shrink-0 border ${
                  isSelected
                    ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/10 text-cyan-300 border-cyan-500/40 shadow-lg'
                    : 'bg-[#0d1628] text-slate-300 hover:text-slate-100 hover:bg-[#141f38] border-white/5'
                }`}
              >
                <span>{q.symbol}</span>
                <span
                  className={`text-[10px] font-bold tabular-nums ${
                    flash === 'up'
                      ? 'flash-up'
                      : flash === 'down'
                      ? 'flash-down'
                      : isUp
                      ? 'text-emerald-400'
                      : 'text-rose-400'
                  }`}
                >
                  {isUp ? '+' : ''}
                  {q.change_24h_pct?.toFixed(2)}%
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Main Chart Canvas ── */}
      <div className="bg-[#070c18] border border-white/[0.08] rounded-2xl p-4 sm:p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => toggleFavorite(selectedSymbol)}
              className="p-1.5 rounded-lg border border-white/10 text-slate-400 hover:text-amber-400 transition-colors"
            >
              <Star size={15} className={isStarred ? 'fill-amber-400 text-amber-400' : ''} />
            </button>
            <div>
              <h2 className="text-base font-bold font-mono text-white flex items-center gap-2">
                {selectedSymbol} · {timeframe}
              </h2>
              <span className="text-[11px] text-slate-400 font-mono">
                TradingView Lightweight Chart · Realtime Interbank Feed
              </span>
            </div>
          </div>

          {activeSignal && (
            <button
              onClick={() => setSelectedAnalysisSymbol(selectedSymbol)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/35 text-cyan-300 text-xs font-mono font-bold transition-all"
            >
              <Target size={13} />
              <span>Inspect Active Setup</span>
            </button>
          )}
        </div>

        <LWChart symbol={selectedSymbol} timeframe={timeframe} activeSignal={activeSignal} height={520} />
      </div>

      {/* ── Linked Active Signal Card ── */}
      {activeSignal && (
        <div className="space-y-2 font-mono">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block">
            Confirmed Active Setup — {selectedSymbol}
          </span>
          <div className="max-w-2xl">
            <SignalCard signal={activeSignal} />
          </div>
        </div>
      )}
    </div>
  );
};
