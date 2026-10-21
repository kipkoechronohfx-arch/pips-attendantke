import React, { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { LWChart } from '../components/LWChart';
import { SignalCard } from '../components/SignalCard';
import { api } from '../services/api';
import { soundFx } from '../services/audio';
import { notifService } from '../services/notifications';
import { SessionState, DiagnosticEntry, FeedHealth } from '../types';
import {
  TrendingUp,
  TrendingDown,
  Zap,
  Percent,
  BarChart3,
  Sparkles,
  ArrowRight,
  Clock,
  Activity,
  Layers,
  ShieldCheck,
  AlertTriangle,
  Target,
  Cpu,
  RefreshCw,
  ExternalLink,
  LineChart,
} from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const {
    signals,
    quotes,
    flashMap,
    selectedSymbol,
    setSelectedSymbol,
    setActiveTab,
    setSelectedAnalysisSymbol,
    addSignal,
    addToast,
    lastScanAt,
    setLastScanAt,
    userTimezone,
  } = useAppStore();

  const [sessionState, setSessionState] = useState<SessionState | null>(null);
  const [feedHealth, setFeedHealth] = useState<FeedHealth | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.getSessionState().then(setSessionState).catch(() => {});
    api.getFeedHealth().then(setFeedHealth).catch(() => {});
    api.getDiagnostics('H1').then(setDiagnostics).catch(() => {});

    const timer = setInterval(() => {
      api.getSessionState().then(setSessionState).catch(() => {});
      api.getDiagnostics('H1').then(setDiagnostics).catch(() => {});
    }, 30000);

    return () => clearInterval(timer);
  }, []);

  const activeSignals = signals.filter((s) => s.status === 'ACTIVE');
  const quoteList = Object.values(quotes);

  const confirmedCount = diagnostics.filter((d) => d.lifecycle_state === 'CONFIRMED').length || activeSignals.length;
  const developingCount = diagnostics.filter((d) => ['WAITING_FOR_RETEST', 'WAITING_FOR_CONFIRMATION'].includes(d.lifecycle_state)).length;
  const staleCount = feedHealth?.instruments?.filter((i) => i.is_stale).length || 0;

  // Market regime counts
  const regimeSummary = useMemo(() => {
    let trending = 0;
    let ranging = 0;
    diagnostics.forEach((d) => {
      if (d.market_regime?.includes('TRENDING')) trending++;
      else ranging++;
    });
    return { trending, ranging };
  }, [diagnostics]);

  // Top eligible setups
  const topEligible = useMemo(() => {
    return [...diagnostics]
      .sort((a, b) => (b.context_score + b.setup_score) - (a.context_score + a.setup_score))
      .slice(0, 4);
  }, [diagnostics]);

  const activeSignalForChart = signals.find((s) => s.symbol === selectedSymbol && s.status === 'ACTIVE');

  const handleScanNow = async () => {
    const now = Date.now();
    if (lastScanAt && now - lastScanAt < 30_000) {
      addToast('Rate Limited', `Please wait ${Math.ceil((30_000 - (now - lastScanAt)) / 1000)}s`, 'alert');
      return;
    }
    setLoading(true);
    setLastScanAt(now);
    addToast('Scanning Markets', 'Evaluating 3-stage precision pipeline...', 'alert');
    try {
      const newSigs = await api.triggerAutoScan();
      if (newSigs.length > 0) {
        newSigs.forEach((s) => addSignal(s));
        soundFx.playSignalChime();
        notifService.hapticSignal();
        addToast('Setups Confirmed', `${newSigs.length} setup(s) processed`, 'success');
      } else {
        addToast('Scan Completed', 'No new setups passed all 11 mandatory gates.', 'alert');
      }
      const freshDiags = await api.getDiagnostics('H1');
      setDiagnostics(freshDiags);
    } catch {
      addToast('Scan Error', 'Failed to communicate with scanner service.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const primarySession = sessionState?.primary_session;

  return (
    <div className="space-y-6 page-enter font-sans">
      {/* ── Active Session & 24h Timeline Bar ── */}
      <div className="bg-[#0a101f] border border-white/[0.08] rounded-2xl p-4 sm:p-5 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
              </span>
              <h2 className="text-base font-bold font-mono text-white uppercase tracking-tight">
                {primarySession ? primarySession.name : 'LONDON / NY OVERLAP'} · ACTIVE
              </h2>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Timezone: {userTimezone} · Institutional order-flow liquidity window
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('scanner')}
              className="px-3 py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-slate-200 text-xs font-mono font-semibold transition-all flex items-center gap-1.5"
            >
              <span>Full Scanner Desk</span>
              <ArrowRight size={13} />
            </button>
            <button
              onClick={handleScanNow}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/35 text-cyan-300 text-xs font-mono font-bold transition-all disabled:opacity-50"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              <span>{loading ? 'Scanning…' : 'Scan'}</span>
            </button>
          </div>
        </div>

        {/* 24-Hour Visual Session Timeline */}
        <div className="space-y-1.5 font-mono">
          <div className="flex justify-between text-[10px] text-slate-500 font-bold uppercase">
            <span>Asian (00:00 - 08:00 UTC)</span>
            <span>London (07:00 - 16:00 UTC)</span>
            <span>NY (13:00 - 22:00 UTC)</span>
          </div>

          <div className="relative h-3 w-full bg-black/50 rounded-full overflow-hidden border border-white/10 flex">
            {/* Asian */}
            <div className="w-[33%] h-full bg-purple-500/30 border-r border-purple-400/20" title="Asian Session" />
            {/* London overlap */}
            <div className="w-[37%] h-full bg-blue-500/40 border-r border-blue-400/20" title="London Session" />
            {/* New York */}
            <div className="w-[30%] h-full bg-amber-500/40" title="New York Session" />
          </div>

          <div className="text-[10px] text-slate-400 text-right">
            <span>High Confluence Overlap: </span>
            <strong className="text-emerald-400">13:00 — 17:00 UTC</strong>
          </div>
        </div>
      </div>

      {/* ── Metric KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 font-mono text-xs">
        {/* Scanned */}
        <div className="bg-[#0b1222] border border-white/[0.08] rounded-2xl p-4 shadow-lg">
          <span className="text-[10px] text-slate-500 uppercase block mb-1">Instruments Scanned</span>
          <div className="text-2xl font-black text-white">{quoteList.length || 28}</div>
          <span className="text-[10px] text-cyan-400 block mt-1">Live Multi-Asset Desk</span>
        </div>

        {/* Confirmed Signals */}
        <div className="bg-[#0b1222] border border-white/[0.08] rounded-2xl p-4 shadow-lg">
          <span className="text-[10px] text-slate-500 uppercase block mb-1">Confirmed Signals</span>
          <div className="text-2xl font-black text-emerald-400">{confirmedCount}</div>
          <span className="text-[10px] text-slate-400 block mt-1">11 hard gates passed</span>
        </div>

        {/* Developing Setups */}
        <div className="bg-[#0b1222] border border-white/[0.08] rounded-2xl p-4 shadow-lg">
          <span className="text-[10px] text-slate-500 uppercase block mb-1">Developing Setups</span>
          <div className="text-2xl font-black text-blue-400">{developingCount}</div>
          <span className="text-[10px] text-slate-400 block mt-1">Awaiting retest / trigger</span>
        </div>

        {/* Feed Health */}
        <div className="bg-[#0b1222] border border-white/[0.08] rounded-2xl p-4 shadow-lg">
          <span className="text-[10px] text-slate-500 uppercase block mb-1">Data Feed Health</span>
          <div className={`text-2xl font-black ${staleCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
            {staleCount > 0 ? `${staleCount} Stale` : '100% Synced'}
          </div>
          <span className="text-[10px] text-slate-400 block mt-1">
            {feedHealth?.provider || 'Interbank'} feed
          </span>
        </div>

        {/* Market Regime */}
        <div className="bg-[#0b1222] border border-white/[0.08] rounded-2xl p-4 shadow-lg col-span-2 lg:col-span-1">
          <span className="text-[10px] text-slate-500 uppercase block mb-1">Market Regime</span>
          <div className="text-base font-black text-cyan-300 mt-1">
            {regimeSummary.trending >= regimeSummary.ranging ? 'TRENDING' : 'COMPRESSION'}
          </div>
          <span className="text-[10px] text-slate-400 block mt-1">
            {regimeSummary.trending} Trend · {regimeSummary.ranging} Range
          </span>
        </div>
      </div>

      {/* ── Top Eligible Setups & Opportunities ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold font-mono text-white flex items-center gap-2">
            <Target size={15} className="text-cyan-400" />
            Top Eligible Opportunities (Ranked by Confluence)
          </h2>
          <span className="text-[11px] text-slate-500 font-mono">
            Zero look-ahead bias · Strict non-repainting
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {topEligible.length === 0 ? (
            <div className="col-span-4 p-8 text-center text-slate-500 font-mono text-xs bg-[#090e1a] rounded-2xl border border-white/5">
              Evaluating live quotes against 11 deterministic gates...
            </div>
          ) : (
            topEligible.map((diag) => {
              const q = quotes[diag.symbol];
              const score = diag.context_score + diag.setup_score;
              const isBuy = diag.direction === 'BUY';
              const digits = diag.symbol.includes('JPY') ? 3 : diag.symbol.includes('XAU') ? 2 : 5;

              return (
                <div
                  key={diag.symbol}
                  onClick={() => setSelectedAnalysisSymbol(diag.symbol)}
                  className="p-4 bg-[#0a101f] hover:bg-[#0f172a] border border-white/[0.08] hover:border-cyan-400/40 rounded-2xl transition-all cursor-pointer group shadow-lg font-mono space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white group-hover:text-cyan-300 transition-colors">
                      {diag.symbol}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                      isBuy ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                    }`}>
                      {diag.direction}
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between">
                    <span className="text-slate-400 text-xs">
                      {q ? q.mid.toFixed(digits) : '—'}
                    </span>
                    <span className="text-emerald-400 font-bold text-sm">
                      {score}/100
                    </span>
                  </div>

                  <div className="pt-2 border-t border-white/[0.05] text-[10px] text-slate-400 flex items-center justify-between">
                    <span>{diag.setup_type || 'OB_RETEST'}</span>
                    <span className="text-cyan-400 group-hover:underline">Inspect →</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Interactive Pro Chart Preview ── */}
      <div className="bg-[#070c18] border border-white/[0.08] rounded-2xl p-4 sm:p-5 space-y-3 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <LineChart size={16} className="text-cyan-400" />
            <h2 className="text-sm font-bold font-mono text-white">
              Chart Analysis — {selectedSymbol}
            </h2>
          </div>

          <div className="flex items-center gap-2 font-mono text-xs">
            {quoteList.slice(0, 6).map((q) => (
              <button
                key={q.symbol}
                onClick={() => setSelectedSymbol(q.symbol)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                  q.symbol === selectedSymbol
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'bg-black/30 text-slate-400 hover:text-white'
                }`}
              >
                {q.symbol}
              </button>
            ))}
          </div>
        </div>

        <LWChart symbol={selectedSymbol} activeSignal={activeSignalForChart} height={420} />
      </div>
    </div>
  );
};
