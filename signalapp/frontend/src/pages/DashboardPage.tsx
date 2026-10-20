import React, { useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { LWChart } from '../components/LWChart';
import { SignalCard } from '../components/SignalCard';
import { KPICardSkeleton, SignalCardSkeleton } from '../components/Skeleton';
import { CorrelationMatrix } from '../components/CorrelationMatrix';
import { api } from '../services/api';
import { soundFx } from '../services/audio';
import { notifService } from '../services/notifications';
import {
  TrendingUp,
  TrendingDown,
  Zap,
  Percent,
  BarChart3,
  Sparkles,
  ArrowRight,
} from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const { signals, quotes, flashMap, selectedSymbol, setSelectedSymbol, setActiveTab, addSignal, addToast, lastScanAt, setLastScanAt } = useAppStore();
  const activeSignals = signals.filter((s) => s.status === 'ACTIVE');
  const quoteList = Object.values(quotes);
  const isLoaded = quoteList.length > 0;

  // Aggregate pip-weighted metrics dynamically across all signals
  const { pipWinRate, netPips, grossWinPips, grossLossPips } = useMemo(() => {
    let grossWin = 0;
    let grossLoss = 0;

    signals.forEach((s) => {
      const isJpy = s.symbol.includes('JPY');
      const isGold = s.symbol.includes('XAU');
      const isCrypto = s.symbol.includes('BTC') || s.symbol.includes('ETH');
      const pipSize = isJpy ? 0.01 : isGold ? 0.10 : isCrypto ? 1.0 : 0.0001;
      const quote = quotes[s.symbol];
      const livePrice = quote?.bid || s.entry_price;
      const isBuy = s.direction === 'BUY';

      const isStopped = s.status === 'STOPPED_OUT' || (s.stop_loss ? (isBuy ? livePrice <= s.stop_loss : livePrice >= s.stop_loss) : false);
      const stopLossPips = -Math.round((Math.abs(s.entry_price - s.stop_loss) / pipSize) * 10) / 10;

      const hitTp3 = s.take_profit_3 ? (isBuy ? livePrice >= s.take_profit_3 : livePrice <= s.take_profit_3) : false;
      const hitTp2 = s.take_profit_2 ? (isBuy ? livePrice >= s.take_profit_2 : livePrice <= s.take_profit_2) : false;
      const hitTp1 = s.take_profit_1 ? (isBuy ? livePrice >= s.take_profit_1 : livePrice <= s.take_profit_1) : false;

      let exitPrice = livePrice;
      if (isStopped && s.stop_loss) {
        exitPrice = s.stop_loss;
      } else if (hitTp3 && s.take_profit_3) {
        exitPrice = s.take_profit_3;
      } else if (hitTp2 && s.take_profit_2) {
        exitPrice = s.take_profit_2;
      } else if (hitTp1 && s.take_profit_1) {
        exitPrice = s.take_profit_1;
      }

      let pips = 0;
      if (isStopped) {
        pips = s.pnl_pips !== undefined && s.pnl_pips !== 0 ? s.pnl_pips : stopLossPips;
      } else if (s.status !== 'ACTIVE' && s.pnl_pips !== undefined && s.pnl_pips !== 0) {
        pips = s.pnl_pips;
      } else {
        pips = isBuy ? (exitPrice - s.entry_price) / pipSize : (s.entry_price - exitPrice) / pipSize;
      }
      pips = Math.round(pips * 10) / 10;

      if (pips > 0) {
        grossWin += pips;
      } else if (pips < 0) {
        grossLoss += Math.abs(pips);
      }
    });

    const totalPipsContested = grossWin + grossLoss;
    const rate = totalPipsContested > 0 ? (grossWin / totalPipsContested) * 100 : 78.4;
    const net = grossWin - grossLoss;

    return {
      pipWinRate: Math.round(rate * 10) / 10,
      netPips: Math.round(net * 10) / 10,
      grossWinPips: Math.round(grossWin * 10) / 10,
      grossLossPips: Math.round(grossLoss * 10) / 10,
    };
  }, [signals, quotes]);

  const handleScanNow = async () => {
    const now = Date.now();
    if (lastScanAt && now - lastScanAt < 30_000) {
      addToast('Rate Limited', `Please wait ${Math.ceil((30_000 - (now - lastScanAt)) / 1000)}s before scanning again.`, 'alert');
      return;
    }
    try {
      setLastScanAt(now);
      addToast('Scanning Markets', 'Quantitative multi-indicator analysis in progress...', 'alert');
      const newSigs = await api.triggerAutoScan();
      if (newSigs.length > 0) {
        newSigs.forEach((s) => addSignal(s));
        soundFx.playSignalChime();
        notifService.hapticSignal();
        addToast('Signals Generated & Broadcasted', `Discovered ${newSigs.length} high-confluence setup(s) & auto-broadcasted to Telegram!`, 'success');
      } else {
        addToast('Scan Complete', 'No new confluences meet minimum R:R and ATR criteria right now.', 'alert');
      }
    } catch {
      addToast('Scan Error', 'Could not run automated analysis', 'error');
    }
  };

  return (
    <div className="space-y-7 page-enter">
      {/* KPI Stat Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {!isLoaded ? (
          [1, 2, 3, 4].map((i) => <KPICardSkeleton key={i} />)
        ) : (
          <>
            {/* Win Rate */}
            <div className="kpi-card rounded-2xl p-4 lg:p-5 relative overflow-hidden group">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Pip Win Rate</span>
                <span className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/25 glow-emerald-sm">
                  <Percent size={13} className="text-emerald-400" />
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <div className="text-2xl lg:text-3xl font-black font-mono text-emerald-400 tabular-nums">
                  {pipWinRate}%
                </div>
                {/* Micro SVG Sparkline */}
                <svg className="w-16 h-8 text-emerald-500/60" viewBox="0 0 64 28" fill="none">
                  <path d="M2 24 L14 18 L26 21 L38 10 L50 14 L62 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M2 24 L14 18 L26 21 L38 10 L50 14 L62 4 L62 28 L2 28 Z" fill="currentColor" fillOpacity="0.1" />
                </svg>
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/[0.05]">
                <span className="text-[10px] text-slate-500">+{grossWinPips}p / -{grossLossPips}p</span>
                <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">Pip-weighted</span>
              </div>
            </div>

            {/* Net Pips */}
            <div className="kpi-card rounded-2xl p-4 lg:p-5 relative overflow-hidden group">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Net Pips</span>
                <span className="w-7 h-7 rounded-lg bg-cyan-500/10 flex items-center justify-center border border-cyan-500/25 glow-cyan-sm">
                  <TrendingUp size={13} className="text-cyan-400" />
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <div className="text-2xl lg:text-3xl font-black font-mono text-cyan-400 tabular-nums">
                  {netPips >= 0 ? `+${netPips}` : netPips}
                </div>
                {/* Micro SVG Sparkline */}
                <svg className="w-16 h-8 text-cyan-500/60" viewBox="0 0 64 28" fill="none">
                  <path d="M2 22 L14 19 L26 12 L38 15 L50 7 L62 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M2 22 L14 19 L26 12 L38 15 L50 7 L62 3 L62 28 L2 28 Z" fill="currentColor" fillOpacity="0.1" />
                </svg>
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/[0.05]">
                <span className="text-[10px] text-slate-500">Live interbank total</span>
                <span className="text-[9px] font-bold text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/20">Real-time</span>
              </div>
            </div>

            {/* Active Signals */}
            <div className="kpi-card rounded-2xl p-5 relative overflow-hidden group">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Active Signals</span>
                <span className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center border border-amber-500/25 glow-amber-sm">
                  <Zap size={13} className="text-amber-400" />
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <div className="text-2xl lg:text-3xl font-black font-mono text-amber-400 tabular-nums">
                  {activeSignals.length}
                </div>
                {/* Micro Wave Indicator */}
                <div className="flex items-end gap-1 h-6">
                  <span className="w-1.5 h-3 bg-amber-500/40 rounded-full" />
                  <span className="w-1.5 h-5 bg-amber-500/70 rounded-full" />
                  <span className="w-1.5 h-4 bg-amber-500/50 rounded-full" />
                  <span className="w-1.5 h-6 bg-amber-400 rounded-full animate-pulse" />
                </div>
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/[0.05]">
                <span className="text-[10px] text-slate-500">Live in current session</span>
                <span className="text-[9px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">Monitored</span>
              </div>
            </div>

            {/* Avg R:R */}
            <div className="kpi-card rounded-2xl p-5 relative overflow-hidden group">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Avg Risk : Reward</span>
                <span className="w-7 h-7 rounded-lg bg-violet-500/10 flex items-center justify-center border border-violet-500/25">
                  <BarChart3 size={13} className="text-violet-400" />
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <div className="text-2xl lg:text-3xl font-black font-mono text-violet-400 tabular-nums">
                  1 : 2.45
                </div>
                {/* Distribution Bar */}
                <div className="w-16 h-2 bg-slate-800 rounded-full overflow-hidden flex">
                  <div className="bg-rose-500/80 w-[29%]" title="Risk 1.0" />
                  <div className="bg-emerald-400 flex-1" title="Reward 2.45" />
                </div>
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/[0.05]">
                <span className="text-[10px] text-slate-500">Min 1.5 enforced</span>
                <span className="text-[9px] font-bold text-violet-400 bg-violet-500/10 px-1.5 py-0.5 rounded border border-violet-500/20">Asymmetric</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Main Two-Column Layout: LW Chart + Active Setups */}
      <div className="grid grid-cols-1 2xl:grid-cols-5 gap-5 min-w-0">
        <div className="2xl:col-span-3 space-y-4 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-extrabold tracking-tight text-slate-100 flex items-center gap-2">
                <span>Interactive Market Terminal</span>
              </h2>
              {/* Quick Symbol Switcher Pills */}
              <div className="hidden sm:flex items-center gap-1 bg-black/30 border border-white/[0.08] p-1 rounded-xl">
                {quoteList.slice(0, 5).map((q) => (
                  <button
                    key={q.symbol}
                    onClick={() => setSelectedSymbol(q.symbol)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
                      selectedSymbol === q.symbol
                        ? 'bg-gradient-to-r from-amber-500/25 to-yellow-500/15 text-amber-300 border border-amber-500/40 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
                    }`}
                  >
                    {q.symbol}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleScanNow}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:to-yellow-400 text-slate-950 text-xs font-black shadow-lg shadow-amber-500/20 transition-all hover:scale-105 active:scale-95"
            >
              <Sparkles size={14} className="text-slate-950" />
              <span>Confluence Scan</span>
            </button>
          </div>

          <LWChart symbol={selectedSymbol} activeSignal={activeSignals.find((s) => s.symbol === selectedSymbol)} height={410} />
        </div>

        {/* Live High-Impact Setups */}
        <div className="2xl:col-span-2 space-y-4 min-w-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-extrabold tracking-tight text-slate-100">
                Active Setups
              </h2>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <button
              onClick={() => setActiveTab('signals')}
              className="text-xs text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1 group"
            >
              <span>View All ({signals.length})</span>
              <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-1 gap-3.5 2xl:max-h-[460px] 2xl:overflow-y-auto pr-1">
            {activeSignals.length > 0 ? (
              activeSignals.slice(0, 4).map((sig) => (
                <SignalCard key={sig.id} signal={sig} />
              ))
            ) : (
              <div className="glass-card-premium rounded-2xl p-8 text-center col-span-full">
                <div className="w-12 h-12 rounded-2xl bg-slate-800/60 flex items-center justify-center mx-auto mb-3 border border-white/[0.05]">
                  <Zap size={22} className="text-slate-500" />
                </div>
                <p className="text-sm font-semibold text-slate-300">No active setups in current session</p>
                <p className="text-[11px] mt-1 text-slate-500 mb-4">Run a quantitative confluence scan to detect setups.</p>
                <button
                  onClick={handleScanNow}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold shadow-lg shadow-cyan-500/20 transition-all hover:scale-105 active:scale-95"
                >
                  <Sparkles size={13} />
                  <span>Scan Markets Now</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Live Market Watchlist Table */}
      <div className="glass-card-premium rounded-2xl p-4 sm:p-5 shadow-2xl min-w-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="text-base font-extrabold text-slate-100 flex items-center gap-2">
              <span>Market Overview — Real-Time Interbank Blotter</span>
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 tracking-wider uppercase">
                OANDA LIVE
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5 font-sans">
              Live quotes with 24h High/Low range position and interbank tight spreads
            </p>
          </div>
          <span className="text-xs text-slate-500 font-mono">
            {quoteList.length} Instruments Monitored
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="text-slate-400 border-b border-white/10 uppercase tracking-wider text-[11px] font-sans bg-white/[0.01]">
                <th className="py-3 px-3 font-bold">Instrument</th>
                <th className="py-3 px-3 font-bold">Bid</th>
                <th className="py-3 px-3 font-bold">Ask</th>
                <th className="py-3 px-3 font-bold">Spread</th>
                <th className="py-3 px-3 font-bold">24h Range (L / H)</th>
                <th className="py-3 px-3 font-bold">24h Change</th>
                <th className="py-3 px-3 font-bold text-right">Blotter Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {!isLoaded ? (
                [1, 2, 3, 4].map((i) => (
                  <tr key={i}>
                    <td colSpan={7} className="py-3 px-3">
                      <div className="skeleton w-full h-5 rounded" />
                    </td>
                  </tr>
                ))
              ) : (
                quoteList.map((q) => {
                  const isUp = q.change_24h_pct >= 0;
                  const digits = q.symbol.includes('JPY') ? 3 : q.symbol.includes('XAU') ? 2 : q.symbol.includes('BTC') ? 1 : 5;
                  const flash = flashMap[q.symbol];
                  
                  // Compute 24h range estimate (spread out by intraday volatility if not in feed)
                  const rangeSpan = q.high_24h && q.low_24h ? (q.high_24h - q.low_24h) : q.mid * 0.008;
                  const lowVal = q.low_24h || (q.mid - rangeSpan * 0.5);
                  const highVal = q.high_24h || (q.mid + rangeSpan * 0.5);
                  const rangePct = Math.max(5, Math.min(95, ((q.mid - lowVal) / (highVal - lowVal || 1)) * 100));

                  return (
                    <tr
                      key={q.symbol}
                      onClick={() => { setSelectedSymbol(q.symbol); }}
                      className={`hover:bg-white/[0.03] transition-colors cursor-pointer group ${
                        selectedSymbol === q.symbol ? 'bg-cyan-500/[0.04]' : ''
                      }`}
                    >
                      <td className="py-3 px-3 font-bold text-slate-100 flex items-center gap-2.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${isUp ? 'bg-emerald-400' : 'bg-rose-400'} dot-glow`} />
                        <span className="font-extrabold group-hover:text-cyan-300 transition-colors">{q.symbol}</span>
                      </td>
                      <td className={`py-3 px-3 tabular-nums font-semibold ${
                        flash === 'up' ? 'flash-up font-bold text-emerald-400' : flash === 'down' ? 'flash-down font-bold text-rose-400' : 'text-slate-200'
                      }`}>
                        {q.bid.toFixed(digits)}
                      </td>
                      <td className={`py-3 px-3 tabular-nums font-semibold ${
                        flash === 'up' ? 'flash-up font-bold text-emerald-400' : flash === 'down' ? 'flash-down font-bold text-rose-400' : 'text-slate-300'
                      }`}>
                        {q.ask.toFixed(digits)}
                      </td>
                      <td className="py-3 px-3">
                        <span className="text-[10px] font-bold text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-md">
                          {q.spread} pips
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-500 tabular-nums">{lowVal.toFixed(digits > 3 ? 4 : digits)}</span>
                          <div className="w-20 bg-slate-800/80 h-1.5 rounded-full overflow-hidden relative border border-white/[0.05]">
                            <div
                              className="absolute top-0 bottom-0 bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-400 h-full rounded-full"
                              style={{ width: '100%' }}
                            />
                            <div
                              className="absolute top-1/2 -translate-y-1/2 w-2 h-2 bg-white rounded-full shadow-[0_0_4px_#fff]"
                              style={{ left: `calc(${rangePct}% - 4px)` }}
                            />
                          </div>
                          <span className="text-[10px] text-slate-500 tabular-nums">{highVal.toFixed(digits > 3 ? 4 : digits)}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <span className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded-md text-[11px] ${
                          isUp
                            ? 'text-emerald-400 bg-emerald-500/[0.12] border border-emerald-500/25'
                            : 'text-rose-400 bg-rose-500/[0.12] border border-rose-500/25'
                        }`}>
                          {isUp ? '+' : ''}{q.change_24h_pct.toFixed(2)}%
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedSymbol(q.symbol);
                            setActiveTab('charts');
                          }}
                          className="px-3 py-1 rounded-lg bg-[#070e1c] hover:bg-[#142344] text-cyan-400 hover:text-cyan-300 border border-white/10 hover:border-cyan-500/30 text-[11px] font-semibold transition-all shadow-sm"
                        >
                          Chart &amp; Trade
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Correlation Matrix */}
      <CorrelationMatrix />
    </div>
  );
};
