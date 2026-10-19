import React from 'react';
import { useAppStore } from '../store/useAppStore';
import { LWChart } from '../components/LWChart';
import { SignalCard } from '../components/SignalCard';

export const ChartsPage: React.FC = () => {
  const { selectedSymbol, setSelectedSymbol, quotes, signals, flashMap } = useAppStore();
  const quoteList = Object.values(quotes);
  const activeSignal = signals.find((s) => s.symbol === selectedSymbol && s.status === 'ACTIVE');

  return (
    <div className="space-y-6 page-enter">
      {/* Symbol Quick Select Bar with flash */}
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {quoteList.map((q) => {
          const isSelected = q.symbol === selectedSymbol;
          const isUp = q.change_24h_pct >= 0;
          const flash = flashMap[q.symbol];
          return (
            <button
              key={q.symbol}
              onClick={() => setSelectedSymbol(q.symbol)}
              className={`flex items-center gap-2.5 px-3.5 py-2 rounded-xl text-xs font-mono font-semibold transition-all shrink-0 border ${
                isSelected
                  ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/10 text-cyan-300 border-cyan-500/40 shadow-lg'
                  : 'bg-[#0d1628] text-slate-300 hover:text-slate-100 hover:bg-[#141f38] border-white/5'
              }`}
            >
              <span>{q.symbol}</span>
              <span className={`text-[10px] font-bold tabular-nums ${
                flash === 'up' ? 'flash-up' : flash === 'down' ? 'flash-down' :
                isUp ? 'text-emerald-400' : 'text-rose-400'
              }`}>
                {isUp ? '+' : ''}{q.change_24h_pct?.toFixed(2)}%
              </span>
            </button>
          );
        })}
      </div>

      {/* TradingView Lightweight Chart */}
      <LWChart symbol={selectedSymbol} activeSignal={activeSignal} height={480} />

      {/* Linked signal card */}
      {activeSignal && (
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest font-mono">
            Active Setup — {selectedSymbol}
          </h3>
          <div className="max-w-2xl">
            <SignalCard signal={activeSignal} />
          </div>
        </div>
      )}
    </div>
  );
};
