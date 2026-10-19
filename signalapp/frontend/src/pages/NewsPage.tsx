import React, { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { ExternalLink, TrendingUp, TrendingDown, MinusCircle, Newspaper } from 'lucide-react';

export const NewsPage: React.FC = () => {
  const { news } = useAppStore();
  const [currencyFilter, setCurrencyFilter] = useState('ALL');

  const filtered = news.filter((item) => {
    if (currencyFilter === 'ALL') return true;
    return item.affected_currencies.includes(currencyFilter);
  });

  return (
    <div className="space-y-6 page-enter">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-slate-100 flex items-center gap-2.5">
            <Newspaper size={24} className="text-cyan-400" />
            <span>Forex &amp; Financial Intelligence Wire</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 uppercase tracking-wider">
              REAL-TIME
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Algorithmic sentiment scoring and currency impact classification on macroeconomic breaking news
          </p>
        </div>

        {/* Currency Filter Tabs */}
        <div className="flex gap-1.5 bg-[#050914] p-1.5 rounded-2xl border border-white/[0.08] font-mono text-xs font-bold">
          {['ALL', 'USD', 'EUR', 'GBP', 'JPY', 'XAU'].map((c) => (
            <button
              key={c}
              onClick={() => setCurrencyFilter(c)}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                currencyFilter === c 
                  ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* News Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {filtered.map((item) => {
          const isBull = item.sentiment === 'BULLISH';
          const isBear = item.sentiment === 'BEARISH';
          return (
            <div
              key={item.id}
              className="glass-card-premium rounded-2xl p-5 flex flex-col justify-between transition-all group card-hover relative overflow-hidden"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 dot-glow" />
                    <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider font-mono">
                      {item.source}
                    </span>
                  </div>
                  <span className={`inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full border ${
                    isBull 
                      ? 'bg-emerald-500/[0.12] text-emerald-400 border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.15)]' 
                      : isBear 
                      ? 'bg-rose-500/[0.12] text-rose-400 border-rose-500/30 shadow-[0_0_10px_rgba(244,63,94,0.15)]' 
                      : 'bg-slate-800 text-slate-400 border-white/5'
                  }`}>
                    {isBull && <TrendingUp size={11} strokeWidth={2.5} />}
                    {isBear && <TrendingDown size={11} strokeWidth={2.5} />}
                    {!isBull && !isBear && <MinusCircle size={11} />}
                    {item.sentiment}
                  </span>
                </div>

                <h3 className="text-base font-bold text-slate-100 group-hover:text-cyan-300 transition-colors leading-snug mb-2.5">
                  {item.title}
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed line-clamp-3">
                  {item.summary}
                </p>
              </div>

              <div className="flex items-center justify-between pt-4 mt-4 border-t border-white/[0.06] text-xs">
                <div className="flex items-center gap-2 font-mono">
                  <span className="text-slate-500 text-[11px]">Currencies:</span>
                  <div className="flex gap-1">
                    {item.affected_currencies.split(',').map((curr) => (
                      <span key={curr.trim()} className="font-bold text-slate-200 bg-[#060913] px-2 py-0.5 rounded text-[10px] border border-white/10">
                        {curr.trim()}
                      </span>
                    ))}
                  </div>
                </div>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-cyan-400 hover:text-cyan-300 font-semibold group-hover:underline text-xs"
                >
                  <span>Read Wire</span>
                  <ExternalLink size={12} />
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
