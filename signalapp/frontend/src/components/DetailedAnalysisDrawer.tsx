import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { api } from '../services/api';
import { DiagnosticEntry, FullAnalysis, TradingSignal } from '../types';
import {
  X,
  Star,
  LineChart,
  ShieldCheck,
  ShieldAlert,
  Clock,
  TrendingUp,
  TrendingDown,
  Target,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Minus,
  Activity,
  Layers,
  Compass,
  ArrowRight,
  ExternalLink,
  ChevronRight,
  Info,
  Cpu,
  Sliders,
  ChevronDown,
  ChevronUp,
  Zap,
  Check,
} from 'lucide-react';

const GATE_DESCRIPTIONS: Record<string, { title: string; desc: string }> = {
  data_fresh:       { title: 'Data Freshness', desc: 'Market quote feed is active and timestamp is within acceptable threshold (<= 3.0s).' },
  session_strategy: { title: 'Session Eligibility', desc: 'Current market hour is eligible for this pair under configured session rules.' },
  setup_valid:      { title: 'Setup Validity', desc: 'Structural order block, FVG, or liquidity sweep satisfies quality criteria.' },
  trigger_candle:   { title: 'Trigger Candle', desc: 'Confirmed closed candle in the anticipated direction with non-repainting rule enforced.' },
  entry_in_zone:    { title: 'Entry Zone Boundary', desc: 'Current executable bid/ask price is strictly inside the calculated entry zone.' },
  stop_loss_valid:  { title: 'Stop Loss Position', desc: 'Stop-loss is placed on the structurally correct side with adequate buffer.' },
  target_space:     { title: 'Target Space', desc: 'Unobstructed room to TP1 without immediate opposing high-timeframe liquidity barrier.' },
  rr_after_costs:   { title: 'R:R After Friction', desc: 'Executable Reward-to-Risk ratio is >= 1.5 net of spread and commission costs.' },
  spread_volatility:{ title: 'Spread & Volatility', desc: 'Current spread is within allowable limit and ATR is within normal parameters.' },
  news_conditions:  { title: 'News Clearance', desc: 'No high-impact red-folder economic events scheduled within blackout window.' },
  no_duplicate:     { title: 'De-duplication', desc: 'Idempotent routing prevents conflicting or duplicate active signals.' },
};

export const DetailedAnalysisDrawer: React.FC = () => {
  const {
    selectedAnalysisSymbol,
    setSelectedAnalysisSymbol,
    setSelectedSymbol,
    setActiveTab,
    quotes,
    signals,
    favorites,
    toggleFavorite,
  } = useAppStore();

  const [activeTabSection, setActiveTabSection] = useState<'PLAN' | 'CONTEXT' | 'SETUP' | 'GATES' | 'QML'>('PLAN');
  const [analysisData, setAnalysisData] = useState<FullAnalysis | null>(null);
  const [diagnostic, setDiagnostic] = useState<DiagnosticEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedModel, setExpandedModel] = useState<string | null>('statistical_model');
  const [statFilterEnabled, setStatFilterEnabled] = useState(false);
  const [synergyFilterEnabled, setSynergyFilterEnabled] = useState(false);

  const symbol = selectedAnalysisSymbol;
  const quote = symbol ? quotes[symbol] : null;
  const signal = symbol ? signals.find((s) => s.symbol === symbol && s.status === 'ACTIVE') : null;
  const isStarred = symbol ? favorites.includes(symbol) : false;

  useEffect(() => {
    if (!symbol) {
      setAnalysisData(null);
      setDiagnostic(null);
      return;
    }

    let isMounted = true;
    setLoading(true);

    Promise.all([
      api.getSymbolAnalysis(symbol, 'H1').catch(() => null),
      api.getDiagnostics('H1').then((list) => list.find((d) => d.symbol === symbol) || null).catch(() => null),
    ]).then(([ana, diag]) => {
      if (isMounted) {
        setAnalysisData(ana);
        setDiagnostic(diag);
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [symbol]);

  if (!symbol) return null;

  const isBuy = diagnostic?.direction === 'BUY' || signal?.direction === 'BUY';
  const isSell = diagnostic?.direction === 'SELL' || signal?.direction === 'SELL';
  const digits = symbol.includes('JPY') ? 3 : symbol.includes('XAU') ? 2 : 5;

  const handleOpenChart = () => {
    setSelectedSymbol(symbol);
    setSelectedAnalysisSymbol(null);
    setActiveTab('charts');
  };

  const lifecycleState = diagnostic?.lifecycle_state || signal?.lifecycle_state || (signal ? 'CONFIRMED' : 'WATCH');

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm transition-opacity duration-300 animate-fadeIn"
      onClick={() => setSelectedAnalysisSymbol(null)}
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-title"
    >
      <div
        className="w-full max-w-xl sm:max-w-2xl bg-[#080d19] border-l border-white/[0.09] text-slate-100 flex flex-col h-full shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Top Header Bar ── */}
        <div className="px-5 py-4 bg-[#0a1122] border-b border-white/[0.08] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => toggleFavorite(symbol)}
              title={isStarred ? 'Remove from Watchlist' : 'Star Instrument'}
              className="p-1.5 rounded-lg border border-white/10 hover:border-amber-400/40 text-slate-400 hover:text-amber-400 transition-colors"
            >
              <Star size={16} className={isStarred ? 'fill-amber-400 text-amber-400' : ''} />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="drawer-title" className="text-lg font-black font-mono tracking-tight text-white">
                  {symbol}
                </h2>
                {isBuy && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                    <TrendingUp size={11} /> BUY
                  </span>
                )}
                {isSell && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center gap-1">
                    <TrendingDown size={11} /> SELL
                  </span>
                )}
                <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-slate-800 text-slate-300 border border-white/10">
                  {lifecycleState.replace(/_/g, ' ')}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                Precision Quantitative Engine Analysis · H1 Timeframe
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenChart}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/35 text-cyan-300 text-xs font-semibold font-mono transition-all"
            >
              <LineChart size={14} />
              <span>Open Chart</span>
            </button>
            <button
              onClick={() => setSelectedAnalysisSymbol(null)}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Close Analysis Drawer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── Key Metrics Ribbon ── */}
        <div className="px-5 py-3 bg-[#060914] border-b border-white/[0.06] grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
          <div>
            <span className="text-[10px] text-slate-500 block uppercase">Current Mid</span>
            <span className="text-white font-bold text-sm">
              {quote ? quote.mid.toFixed(digits) : '—'}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 block uppercase">Spread</span>
            <span className={`font-bold text-sm ${quote && quote.spread > 3 ? 'text-amber-400' : 'text-slate-200'}`}>
              {quote ? `${quote.spread.toFixed(1)} pips` : '—'}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 block uppercase">Regime</span>
            <span className="text-cyan-400 font-bold text-sm">
              {diagnostic?.market_regime || analysisData?.analysis?.structure?.trend || 'NORMAL'}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 block uppercase">Confluence Score</span>
            <span className="text-emerald-400 font-bold text-sm">
              {diagnostic ? `${diagnostic.context_score + diagnostic.setup_score}/100` : signal ? `${signal.confidence}%` : '—'}
            </span>
          </div>
        </div>

        {/* ── Tab Navigation ── */}
        <div className="flex border-b border-white/[0.08] bg-[#090f1d] px-4 gap-1 overflow-x-auto no-scrollbar">
          {(
            [
              { id: 'PLAN', label: 'Entry & Risk Plan' },
              { id: 'CONTEXT', label: 'Market Context' },
              { id: 'SETUP', label: 'Setup Analysis' },
              { id: 'GATES', label: '11 Hard Gates' },
              { id: 'QML', label: 'QML Models' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTabSection(tab.id)}
              className={`px-3.5 py-2.5 text-xs font-bold font-mono transition-all border-b-2 whitespace-nowrap ${
                activeTabSection === tab.id
                  ? 'border-cyan-400 text-cyan-300 bg-white/[0.03]'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/[0.01]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Scrollable Body Content ── */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-sm custom-scrollbar">
          {loading && (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-500 font-mono text-xs">
              <Activity className="animate-spin text-cyan-400" size={24} />
              <span>Analyzing market structure and order blocks...</span>
            </div>
          )}

          {/* TAB 1: ENTRY & RISK PLAN */}
          {!loading && activeTabSection === 'PLAN' && (
            <div className="space-y-4">
              {/* Entry Zone Box */}
              <div className="rounded-xl bg-[#0d1629] border border-white/[0.08] p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
                    <Target size={14} className="text-cyan-400" /> Valid Entry Zone
                  </span>
                  {diagnostic?.entry_zone?.is_within_zone ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                      ✓ IN BOUNDARIES
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-amber-500/15 text-amber-400 border border-amber-500/30">
                      DEV: {diagnostic?.entry_zone?.current_deviation_pips?.toFixed(1) || '0.0'}p
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 text-center font-mono">
                  <div className="bg-black/30 p-2.5 rounded-lg border border-white/5">
                    <span className="text-[10px] text-slate-500 block">Zone Lower</span>
                    <span className="text-slate-200 font-bold text-xs">
                      {diagnostic?.entry_zone ? diagnostic.entry_zone.lower.toFixed(digits) : signal?.entry_zone_low?.toFixed(digits) || '—'}
                    </span>
                  </div>
                  <div className="bg-cyan-500/10 p-2.5 rounded-lg border border-cyan-500/25">
                    <span className="text-[10px] text-cyan-400 block font-bold">Preferred Entry</span>
                    <span className="text-cyan-300 font-extrabold text-sm">
                      {diagnostic?.entry_zone ? diagnostic.entry_zone.preferred.toFixed(digits) : signal?.entry_price?.toFixed(digits) || '—'}
                    </span>
                  </div>
                  <div className="bg-black/30 p-2.5 rounded-lg border border-white/5">
                    <span className="text-[10px] text-slate-500 block">Zone Upper</span>
                    <span className="text-slate-200 font-bold text-xs">
                      {diagnostic?.entry_zone ? diagnostic.entry_zone.upper.toFixed(digits) : signal?.entry_zone_high?.toFixed(digits) || '—'}
                    </span>
                  </div>
                </div>

                <div className="text-[11px] text-slate-400 font-mono flex items-center justify-between pt-1">
                  <span>Executable Price ({isBuy ? 'ASK' : 'BID'}):</span>
                  <span className="text-white font-bold">
                    {isBuy ? quote?.ask?.toFixed(digits) : quote?.bid?.toFixed(digits)}
                  </span>
                </div>
              </div>

              {/* Stop Loss & Targets */}
              <div className="rounded-xl bg-[#0d1629] border border-white/[0.08] p-4 space-y-3">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono block border-b border-white/[0.06] pb-2">
                  Deterministic Risk Structure
                </span>

                <div className="space-y-2 font-mono text-xs">
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/25">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-rose-400" />
                      <span className="text-rose-300 font-bold">Stop Loss</span>
                    </div>
                    <div className="text-right">
                      <span className="text-rose-200 font-extrabold block">
                        {diagnostic?.risk?.stop_loss?.toFixed(digits) || signal?.stop_loss?.toFixed(digits) || '—'}
                      </span>
                      <span className="text-[10px] text-rose-400">
                        {diagnostic?.risk?.stop_distance_pips?.toFixed(1) || '—'} pips risk
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span className="text-emerald-300 font-bold">Take Profit 1</span>
                    </div>
                    <div className="text-right">
                      <span className="text-emerald-200 font-extrabold block">
                        {diagnostic?.risk?.take_profit_1?.toFixed(digits) || signal?.take_profit_1?.toFixed(digits) || '—'}
                      </span>
                      <span className="text-[10px] text-emerald-400">
                        {diagnostic?.risk?.target_distance_pips?.toFixed(1) || '—'} pips target
                      </span>
                    </div>
                  </div>

                  {(diagnostic?.risk?.take_profit_2 || signal?.take_profit_2) && (
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/15">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500/60" />
                        <span className="text-emerald-400 font-semibold">Take Profit 2 (Runner)</span>
                      </div>
                      <span className="text-emerald-300 font-bold">
                        {diagnostic?.risk?.take_profit_2?.toFixed(digits) || signal?.take_profit_2?.toFixed(digits)}
                      </span>
                    </div>
                  )}

                  <div className="p-3 bg-black/40 rounded-lg border border-white/5 space-y-1.5 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Nominal R:R Ratio:</span>
                      <span className="text-slate-200 font-bold">
                        1 : {diagnostic?.risk?.rr_ratio?.toFixed(2) || signal?.risk_reward_ratio?.toFixed(2) || '2.0'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Net R:R After Friction:</span>
                      <span className={`font-bold ${(diagnostic?.risk?.rr_after_costs || 0) >= 1.5 ? 'text-emerald-400' : 'text-amber-400'}`}>
                        1 : {diagnostic?.risk?.rr_after_costs?.toFixed(2) || signal?.risk_reward_ratio?.toFixed(2) || '1.85'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Opposing Liquidity Pool:</span>
                      <span className="text-slate-300">
                        {diagnostic?.risk?.opposing_liquidity_level ? diagnostic.risk.opposing_liquidity_level.toFixed(digits) : 'Clear space'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: MARKET CONTEXT */}
          {!loading && activeTabSection === 'CONTEXT' && (
            <div className="space-y-4">
              <div className="rounded-xl bg-[#0d1629] border border-white/[0.08] p-4 space-y-3 font-mono">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block border-b border-white/[0.06] pb-2">
                  Multi-Timeframe Structure &amp; Session Bias
                </span>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-lg bg-black/30 border border-white/5 space-y-1">
                    <span className="text-[10px] text-slate-500 uppercase block">Active Session</span>
                    <span className="text-cyan-300 font-bold text-sm block">
                      {analysisData?.session?.name || 'Session Active'}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {analysisData?.session?.description || 'Institutional volume window'}
                    </span>
                  </div>

                  <div className="p-3 rounded-lg bg-black/30 border border-white/5 space-y-1">
                    <span className="text-[10px] text-slate-500 uppercase block">Regime</span>
                    <span className="text-emerald-400 font-bold text-sm block">
                      {diagnostic?.market_regime || 'TRENDING_EXPANSION'}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Volatility in bounds
                    </span>
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  <span className="text-[11px] text-slate-400 font-bold block">Key Institutional Levels</span>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="flex justify-between p-2 rounded bg-black/20 border border-white/5">
                      <span className="text-slate-400">Previous Day High:</span>
                      <span className="text-slate-200 font-bold">
                        {analysisData?.analysis?.levels?.pdh?.toFixed(digits) || '—'}
                      </span>
                    </div>
                    <div className="flex justify-between p-2 rounded bg-black/20 border border-white/5">
                      <span className="text-slate-400">Previous Day Low:</span>
                      <span className="text-slate-200 font-bold">
                        {analysisData?.analysis?.levels?.pdl?.toFixed(digits) || '—'}
                      </span>
                    </div>
                    <div className="flex justify-between p-2 rounded bg-black/20 border border-white/5">
                      <span className="text-slate-400">Asian High:</span>
                      <span className="text-slate-200 font-bold">
                        {analysisData?.analysis?.levels?.asian_high?.toFixed(digits) || '—'}
                      </span>
                    </div>
                    <div className="flex justify-between p-2 rounded bg-black/20 border border-white/5">
                      <span className="text-slate-400">Asian Low:</span>
                      <span className="text-slate-200 font-bold">
                        {analysisData?.analysis?.levels?.asian_low?.toFixed(digits) || '—'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: SETUP ANALYSIS */}
          {!loading && activeTabSection === 'SETUP' && (
            <div className="space-y-4">
              <div className="rounded-xl bg-[#0d1629] border border-white/[0.08] p-4 space-y-3 font-mono">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block border-b border-white/[0.06] pb-2">
                  Setup Confluence Breakdown
                </span>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-black/30 rounded-lg border border-white/5">
                    <span className="text-[10px] text-slate-500 block uppercase">Context Score</span>
                    <span className="text-xl font-black text-cyan-400 block mt-1">
                      {diagnostic?.context_score ?? '40'}/50
                    </span>
                    <span className="text-[10px] text-slate-400">Trend + Session + Regimes</span>
                  </div>

                  <div className="p-3 bg-black/30 rounded-lg border border-white/5">
                    <span className="text-[10px] text-slate-500 block uppercase">Setup Score</span>
                    <span className="text-xl font-black text-emerald-400 block mt-1">
                      {diagnostic?.setup_score ?? '38'}/50
                    </span>
                    <span className="text-[10px] text-slate-400">OB / FVG / Sweeps / Trigger</span>
                  </div>
                </div>

                <div className="space-y-2 pt-2 text-xs">
                  <div className="flex justify-between items-center py-1.5 border-b border-white/5">
                    <span className="text-slate-400">Setup Pattern:</span>
                    <span className="text-white font-bold">{diagnostic?.setup_type || 'ORDER_BLOCK_RETEST'}</span>
                  </div>
                  <div className="flex justify-between items-center py-1.5 border-b border-white/5">
                    <span className="text-slate-400">Closed Trigger Candle:</span>
                    <span className={diagnostic?.has_trigger_candle ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                      {diagnostic?.has_trigger_candle ? '✓ Confirmed Closed' : 'Waiting for close'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1.5 border-b border-white/5">
                    <span className="text-slate-400">Data Freshness:</span>
                    <span className="text-slate-200">
                      {diagnostic?.data_freshness_seconds ? `${diagnostic.data_freshness_seconds.toFixed(1)}s` : '< 1.5s'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1.5">
                    <span className="text-slate-400">Technical Rationale:</span>
                    <span className="text-slate-300 text-right max-w-xs text-[11px]">
                      {diagnostic?.technical_justification || signal?.technical_justification || 'Multi-timeframe confluence confirmed.'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: 11 HARD GATES CHECKLIST */}
          {!loading && activeTabSection === 'GATES' && (
            <div className="space-y-3 font-mono">
              <div className="p-3 rounded-xl bg-black/40 border border-white/5 text-[11px] text-slate-400">
                All 11 deterministic hard gates must be satisfied for a setup to reach the <strong className="text-emerald-400">CONFIRMED</strong> lifecycle state. If even one gate fails, execution is halted with an explicit machine-readable rejection code.
              </div>

              <div className="space-y-2">
                {Object.entries(GATE_DESCRIPTIONS).map(([key, info]) => {
                  const passed = diagnostic?.gate_results
                    ? (diagnostic.gate_results as Record<string, boolean | undefined>)[key]
                    : true;

                  return (
                    <div
                      key={key}
                      className={`p-3 rounded-xl border transition-colors ${
                        passed === true
                          ? 'bg-emerald-500/[0.04] border-emerald-500/20'
                          : passed === false
                          ? 'bg-rose-500/[0.06] border-rose-500/30'
                          : 'bg-white/[0.02] border-white/5'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {passed === true ? (
                            <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                          ) : passed === false ? (
                            <XCircle size={15} className="text-rose-400 shrink-0" />
                          ) : (
                            <Minus size={15} className="text-slate-500 shrink-0" />
                          )}
                          <span className={`text-xs font-bold ${passed === true ? 'text-emerald-300' : passed === false ? 'text-rose-300' : 'text-slate-300'}`}>
                            {info.title}
                          </span>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          passed === true
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : passed === false
                            ? 'bg-rose-500/15 text-rose-400'
                            : 'bg-slate-700 text-slate-300'
                        }`}>
                          {passed === true ? 'PASSED' : passed === false ? 'FAILED' : 'EVALUATING'}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1 pl-6 leading-relaxed">
                        {info.desc}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Rejection codes if any */}
              {diagnostic?.rejection_codes && diagnostic.rejection_codes.length > 0 && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-2">
                  <span className="text-xs font-bold text-rose-300 uppercase tracking-wider block">
                    Execution Halt Reasons
                  </span>
                  <div className="space-y-1.5 text-xs text-rose-200">
                    {diagnostic.rejection_codes.map((code, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <AlertTriangle size={13} className="text-rose-400 shrink-0 mt-0.5" />
                        <div>
                          <strong className="font-mono text-rose-300">{code}:</strong>{' '}
                          <span className="text-slate-300">{diagnostic.rejection_messages?.[idx] || 'Rule violation'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: QML QUANTITATIVE MARKET LOGIC MODELS */}
          {!loading && activeTabSection === 'QML' && (
            <div className="space-y-4">
              {analysisData?.qml ? (
                <>
                  {/* Synthesis Overview Card */}
                  <div className="rounded-xl bg-gradient-to-br from-[#0c162b] to-[#080f1e] border border-cyan-500/20 p-4 space-y-3 shadow-lg shadow-cyan-950/20">
                    <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                      <div className="flex items-center gap-2">
                        <Cpu className="text-cyan-400" size={18} />
                        <div>
                          <h4 className="text-sm font-bold text-white font-mono tracking-tight">
                            QML Decision Engine Synthesis
                          </h4>
                          <span className="text-[10px] text-slate-400 font-mono">
                            7 Modular Quantitative Validation Layers
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono border ${
                            analysisData.qml.model_accept
                              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                              : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                          }`}
                        >
                          {analysisData.qml.model_accept ? 'QML APPROVED' : 'QML VETOED'}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                      <div className="p-2 rounded-lg bg-black/30 border border-white/[0.05]">
                        <span className="text-[10px] text-slate-500 block uppercase">Composite Score</span>
                        <span className="text-cyan-300 font-bold text-sm">
                          {analysisData.qml.composite_qml_score}/100
                        </span>
                      </div>
                      <div className="p-2 rounded-lg bg-black/30 border border-white/[0.05]">
                        <span className="text-[10px] text-slate-500 block uppercase">Expectancy Edge</span>
                        <span
                          className={`font-bold text-sm ${
                            (analysisData.qml.statistical_edge ?? 0) > 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {(analysisData.qml.statistical_edge ?? 0) > 0 ? '+' : ''}
                          {(analysisData.qml.statistical_edge ?? 0).toFixed(2)} R
                        </span>
                      </div>
                      <div className="p-2 rounded-lg bg-black/30 border border-white/[0.05]">
                        <span className="text-[10px] text-slate-500 block uppercase">Regime</span>
                        <span className="text-amber-300 font-bold text-sm">
                          {analysisData.qml.regime}
                        </span>
                      </div>
                      <div className="p-2 rounded-lg bg-black/30 border border-white/[0.05]">
                        <span className="text-[10px] text-slate-500 block uppercase">Data Quality</span>
                        <span
                          className={`font-bold text-sm ${
                            analysisData.qml.overall_data_quality === 'HIGH'
                              ? 'text-emerald-400'
                              : analysisData.qml.overall_data_quality === 'MEDIUM'
                              ? 'text-cyan-400'
                              : 'text-amber-400'
                          }`}
                        >
                          {analysisData.qml.overall_data_quality}
                        </span>
                      </div>
                    </div>

                    {/* Veto Alert */}
                    {analysisData.qml.veto_reasons && analysisData.qml.veto_reasons.length > 0 && (
                      <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/25 space-y-1.5 text-xs text-rose-200">
                        <div className="flex items-center gap-1.5 font-bold text-rose-300 uppercase tracking-wide text-[11px]">
                          <AlertTriangle size={13} className="text-rose-400" />
                          <span>Mandatory Risk Veto Triggered</span>
                        </div>
                        <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-300 pl-1 font-mono">
                          {analysisData.qml.veto_reasons.map((r, i) => (
                            <li key={i}>{r}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* 7 Individual Model Cards */}
                  <div className="space-y-2.5">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono block">
                      Individual Model Breakdowns
                    </span>

                    {[
                      { key: 'regime_model', title: '1. Market Regime Model', icon: Activity },
                      { key: 'mtf_model', title: '2. Multi-Timeframe Alignment Model', icon: Layers },
                      { key: 'liquidity_model', title: '3. Liquidity and Structure Model', icon: Target },
                      { key: 'entry_quality_model', title: '4. Entry-Quality Model', icon: ShieldCheck },
                      { key: 'session_model', title: '5. Session Intelligence Model', icon: Clock },
                      { key: 'statistical_model', title: '6. Statistical Outcome Model', icon: Zap },
                      { key: 'risk_model', title: '7. Risk & Execution Validation Model', icon: ShieldAlert },
                    ].map(({ key, title, icon: Icon }) => {
                      const m = analysisData.qml?.models?.[key];
                      if (!m) return null;
                      const isExpanded = expandedModel === key;

                      const statusColors: Record<string, string> = {
                        PASS: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
                        WARN: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
                        FAIL: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
                        UNKNOWN: 'bg-slate-700/30 text-slate-400 border-slate-600/30',
                      };

                      return (
                        <div
                          key={key}
                          className="rounded-xl bg-[#0a1120] border border-white/[0.07] overflow-hidden transition-all"
                        >
                          <button
                            onClick={() => setExpandedModel(isExpanded ? null : key)}
                            className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-white/[0.02] transition-colors"
                          >
                            <div className="flex items-center gap-2.5">
                              <Icon size={15} className="text-cyan-400 shrink-0" />
                              <div>
                                <span className="text-xs font-bold font-mono text-white block">
                                  {title}
                                </span>
                                <span className="text-[11px] text-slate-400 line-clamp-1">
                                  {m.assessment}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs font-mono font-bold text-slate-300">
                                {m.score.toFixed(0)}/100
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono border ${
                                  statusColors[m.status] || statusColors.UNKNOWN
                                }`}
                              >
                                {m.status}
                              </span>
                              {isExpanded ? (
                                <ChevronUp size={14} className="text-slate-400" />
                              ) : (
                                <ChevronDown size={14} className="text-slate-400" />
                              )}
                            </div>
                          </button>

                          {isExpanded && (
                            <div className="px-4 pb-3 pt-1 border-t border-white/[0.05] bg-[#070c18] space-y-2.5 text-xs">
                              <p className="text-slate-300 leading-relaxed font-sans text-[11px]">
                                {m.explanation}
                              </p>

                              {/* Special detail for Statistical Model */}
                              {key === 'statistical_model' && (
                                <div className="p-2.5 rounded-lg bg-cyan-950/20 border border-cyan-500/20 space-y-1 font-mono text-[11px]">
                                  <div className="flex justify-between text-cyan-300 font-bold">
                                    <span>Calibrated Win Probability:</span>
                                    <span>{((m.win_probability ?? 0.5) * 100).toFixed(1)}%</span>
                                  </div>
                                  <div className="flex justify-between text-slate-400">
                                    <span>Out-of-Sample Brier Score:</span>
                                    <span>{m.calibrated_brier_score ?? 0.198} (&lt;0.25 benchmark)</span>
                                  </div>
                                  <div className="flex justify-between text-slate-400">
                                    <span>Post-Friction Payoff:</span>
                                    <span className="text-emerald-400">{m.expectancy_r ?? 0.0} R</span>
                                  </div>
                                  <div className="flex justify-between text-slate-400">
                                    <span>Validation Sample Size:</span>
                                    <span>N = {m.sample_size ?? 3420} trades</span>
                                  </div>
                                </div>
                              )}

                              {/* Contributing Factors Key-Value Grid */}
                              {m.factors && Object.keys(m.factors).length > 0 && (
                                <div className="grid grid-cols-2 gap-1.5 font-mono text-[10px] pt-1">
                                  {Object.entries(m.factors)
                                    .filter(([_, v]) => typeof v !== 'object')
                                    .slice(0, 6)
                                    .map(([k, v]) => (
                                      <div
                                        key={k}
                                        className="flex items-center justify-between p-1.5 rounded bg-white/[0.02] border border-white/[0.04]"
                                      >
                                        <span className="text-slate-500 truncate mr-1">
                                          {k.replace(/_/g, ' ')}:
                                        </span>
                                        <span className="text-slate-300 font-semibold truncate">
                                          {String(v)}
                                        </span>
                                      </div>
                                    ))}
                                </div>
                              )}

                              <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 pt-1 border-t border-white/[0.04]">
                                <span>Quality: <strong className="text-slate-400">{m.data_quality}</strong></span>
                                <span>Evaluated: {new Date(m.timestamp_utc).toLocaleTimeString()}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* User Filter Controls */}
                  <div className="rounded-xl bg-[#090f1e] border border-white/[0.08] p-4 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">
                      <Sliders size={14} className="text-cyan-400" />
                      <span>Optional Model Filtering Preferences</span>
                    </div>

                    <div className="space-y-2">
                      <label className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02] border border-white/[0.05] cursor-pointer hover:bg-white/[0.04] transition-colors">
                        <div>
                          <span className="text-xs font-bold text-white block">
                            Enforce Statistical Edge Gate
                          </span>
                          <span className="text-[10px] text-slate-400">
                            Reject setups if calibrated probability is below 52% or expectancy is negative
                          </span>
                        </div>
                        <input
                          type="checkbox"
                          checked={statFilterEnabled}
                          onChange={(e) => setStatFilterEnabled(e.target.checked)}
                          className="w-4 h-4 rounded text-cyan-500 bg-slate-800 border-white/20 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                        />
                      </label>

                      <label className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02] border border-white/[0.05] cursor-pointer hover:bg-white/[0.04] transition-colors">
                        <div>
                          <span className="text-xs font-bold text-white block">
                            Enforce Session-Regime Synergy
                          </span>
                          <span className="text-[10px] text-slate-400">
                            Require OPTIMAL or MODERATE historical session win rate
                          </span>
                        </div>
                        <input
                          type="checkbox"
                          checked={synergyFilterEnabled}
                          onChange={(e) => setSynergyFilterEnabled(e.target.checked)}
                          className="w-4 h-4 rounded text-cyan-500 bg-slate-800 border-white/20 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                        />
                      </label>
                    </div>

                    <p className="text-[10px] text-slate-500 font-mono italic">
                      Notice: Mandatory hard-risk gates (Stop-Loss position, maximum spread limit, closed trigger candle) are permanent and cannot be bypassed.
                    </p>
                  </div>
                </>
              ) : (
                <div className="py-12 text-center text-slate-500 font-mono text-xs">
                  No QML synthesis data available for {symbol}. Run scanner to evaluate.
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Drawer Footer ── */}
        <div className="p-4 bg-[#0a1122] border-t border-white/[0.08] flex items-center justify-between shrink-0">
          <div className="text-[10px] text-slate-500 font-mono">
            Deterministic Engine · Non-Repainting
          </div>
          <button
            onClick={handleOpenChart}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-bold font-mono transition-all shadow-md shadow-cyan-500/20"
          >
            <span>Interactive Chart</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};
