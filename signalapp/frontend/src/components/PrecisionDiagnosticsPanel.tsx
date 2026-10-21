import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import {
  ShieldCheck,
  ShieldAlert,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  Target,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Info,
  Zap,
} from 'lucide-react';

interface GateResults {
  data_fresh?: boolean;
  session_strategy?: boolean;
  setup_valid?: boolean;
  trigger_candle?: boolean;
  entry_in_zone?: boolean;
  stop_loss_valid?: boolean;
  target_space?: boolean;
  rr_after_costs?: boolean;
  spread_volatility?: boolean;
  news_conditions?: boolean;
  no_duplicate?: boolean;
}

interface EntryZone {
  lower: number;
  upper: number;
  preferred: number;
  current_bid: number;
  current_ask: number;
  max_deviation_pips: number;
  current_deviation_pips: number;
  is_within_zone: boolean;
  executable_side: string;
}

interface RiskData {
  stop_loss: number;
  stop_distance_pips: number;
  take_profit_1: number;
  take_profit_2: number;
  take_profit_3: number;
  target_distance_pips: number;
  rr_ratio: number;
  rr_after_costs: number;
  opposing_liquidity_level: number | null;
  distance_to_opposing_pips: number | null;
}

interface DiagnosticEntry {
  symbol: string;
  lifecycle_state: string;
  signal_valid: boolean;
  direction: string | null;
  timeframe: string;
  strategy_profile: string | null;
  market_regime: string;
  context_score: number;
  setup_score: number;
  confidence: number;
  setup_type: string | null;
  has_trigger_candle: boolean;
  entry_zone: EntryZone | null;
  risk: RiskData | null;
  spread_pips: number;
  data_freshness_seconds: number;
  setup_age_seconds: number | null;
  expiry_time: string | null;
  gate_results: GateResults;
  rejection_codes: string[];
  rejection_messages: string[];
  technical_justification: string;
  scanned_at: string;
}

const LIFECYCLE_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  CONFIRMED:               { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30', dot: 'bg-emerald-400' },
  WAITING_FOR_RETEST:      { bg: 'bg-blue-500/10',    text: 'text-blue-400',    border: 'border-blue-500/30',    dot: 'bg-blue-400' },
  WAITING_FOR_CONFIRMATION:{ bg: 'bg-cyan-500/10',    text: 'text-cyan-400',    border: 'border-cyan-500/30',    dot: 'bg-cyan-400' },
  WATCH:                   { bg: 'bg-amber-500/10',   text: 'text-amber-400',   border: 'border-amber-500/30',   dot: 'bg-amber-400' },
  ENTRY_MISSED:            { bg: 'bg-orange-500/10',  text: 'text-orange-400',  border: 'border-orange-500/30',  dot: 'bg-orange-400' },
  EXPIRED:                 { bg: 'bg-slate-500/10',   text: 'text-slate-400',   border: 'border-slate-500/30',   dot: 'bg-slate-500' },
  INVALIDATED:             { bg: 'bg-red-500/10',     text: 'text-red-400',     border: 'border-red-500/30',     dot: 'bg-red-500' },
  NO_TRADE:                { bg: 'bg-red-900/10',     text: 'text-red-500',     border: 'border-red-900/30',     dot: 'bg-red-700' },
};

const GATE_LABELS: Record<string, string> = {
  data_fresh:        'Data Fresh',
  session_strategy:  'Session Eligible',
  setup_valid:       'Setup Valid',
  trigger_candle:    'Trigger Candle',
  entry_in_zone:     'Entry In Zone',
  stop_loss_valid:   'SL Valid',
  target_space:      'Target Space',
  rr_after_costs:    'R:R After Costs',
  spread_volatility: 'Spread OK',
  news_conditions:   'News Clear',
  no_duplicate:      'No Duplicate',
};

const REGIME_COLORS: Record<string, string> = {
  TRENDING: 'text-emerald-400',
  RANGING:  'text-amber-400',
  VOLATILE: 'text-red-400',
  UNKNOWN:  'text-slate-500',
};

function fmt(n: number | null | undefined, d = 5): string {
  if (n == null) return '—';
  return n.toFixed(d);
}

function fmtAge(s: number | null | undefined): string {
  if (s == null) return '—';
  if (s < 60) return `${Math.round(s)}s`;
  return `${Math.round(s / 60)}m`;
}

// ── Gate Grid ────────────────────────────────────────────────────────────────
const GateGrid: React.FC<{ gates: GateResults }> = ({ gates }) => (
  <div className="grid grid-cols-3 sm:grid-cols-4 gap-1">
    {Object.entries(GATE_LABELS).map(([key, label]) => {
      const passed = (gates as Record<string, boolean | undefined>)[key];
      return (
        <div
          key={key}
          className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[9px] font-mono font-bold border ${
            passed === true
              ? 'bg-emerald-500/5 text-emerald-400 border-emerald-500/20'
              : passed === false
              ? 'bg-red-500/5 text-red-400 border-red-500/20'
              : 'bg-white/[0.03] text-slate-500 border-white/5'
          }`}
        >
          {passed === true ? (
            <CheckCircle2 size={8} className="shrink-0 text-emerald-400" />
          ) : passed === false ? (
            <XCircle size={8} className="shrink-0 text-red-400" />
          ) : (
            <Minus size={8} className="shrink-0 text-slate-600" />
          )}
          <span className="truncate">{label}</span>
        </div>
      );
    })}
  </div>
);

// ── Single Diagnostics Card ──────────────────────────────────────────────────
const DiagCard: React.FC<{ entry: DiagnosticEntry }> = ({ entry }) => {
  const [expanded, setExpanded] = useState(false);
  const lc = LIFECYCLE_COLORS[entry.lifecycle_state] ?? LIFECYCLE_COLORS.NO_TRADE;
  const digits = entry.symbol.includes('JPY') ? 3 : entry.symbol.includes('XAU') || entry.symbol.includes('BTC') ? 2 : 5;

  return (
    <div className={`rounded-2xl border overflow-hidden transition-all ${lc.border} bg-[#060913]/90`}>
      {/* Header row */}
      <div className={`px-4 py-2.5 flex items-center justify-between ${lc.bg}`}>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${lc.dot} ${entry.lifecycle_state === 'CONFIRMED' ? 'animate-pulse' : ''}`} />
          <span className="text-sm font-black text-slate-100 font-mono">{entry.symbol}</span>
          {entry.direction && (
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold font-mono border ${
              entry.direction === 'BUY'
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                : 'bg-red-500/15 text-red-400 border-red-500/30'
            }`}>
              {entry.direction === 'BUY' ? <TrendingUp size={8} className="inline mr-0.5" /> : <TrendingDown size={8} className="inline mr-0.5" />}
              {entry.direction}
            </span>
          )}
        </div>
        <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold border ${lc.bg} ${lc.text} ${lc.border}`}>
          {entry.lifecycle_state.replace(/_/g, ' ')}
        </span>
      </div>

      {/* Scores & regime row */}
      <div className="px-4 py-2 border-b border-white/[0.05] grid grid-cols-4 gap-2 text-center text-[10px] font-mono">
        <div>
          <span className="text-slate-500 block">Context</span>
          <span className="text-cyan-400 font-bold">{entry.context_score ?? '—'}</span>
        </div>
        <div>
          <span className="text-slate-500 block">Setup</span>
          <span className="text-emerald-400 font-bold">{entry.setup_score ?? '—'}</span>
        </div>
        <div>
          <span className="text-slate-500 block">Regime</span>
          <span className={`font-bold ${REGIME_COLORS[entry.market_regime] ?? 'text-slate-400'}`}>
            {entry.market_regime}
          </span>
        </div>
        <div>
          <span className="text-slate-500 block">Spread</span>
          <span className={`font-bold ${entry.spread_pips > 3 ? 'text-red-400' : 'text-slate-200'}`}>
            {entry.spread_pips?.toFixed(1)} p
          </span>
        </div>
      </div>

      {/* Entry zone + SL/TP row */}
      {entry.entry_zone && entry.risk && (
        <div className="px-4 py-2 border-b border-white/[0.05] grid grid-cols-2 gap-3 text-[10px] font-mono">
          <div className="space-y-0.5">
            <span className="text-slate-500 block">Entry Zone</span>
            <span className="text-slate-300">{fmt(entry.entry_zone.lower, digits)} – {fmt(entry.entry_zone.upper, digits)}</span>
            <span className="text-slate-400">Preferred: <strong className="text-cyan-300">{fmt(entry.entry_zone.preferred, digits)}</strong></span>
            <span className={entry.entry_zone.is_within_zone ? 'text-emerald-400' : 'text-amber-400'}>
              {entry.entry_zone.is_within_zone ? '✓ In Zone' : `${entry.entry_zone.current_deviation_pips?.toFixed(1)}p deviation`}
            </span>
          </div>
          <div className="space-y-0.5">
            <span className="text-slate-500 block">Risk Levels</span>
            <span className="text-red-400">SL: {fmt(entry.risk.stop_loss, digits)} ({entry.risk.stop_distance_pips?.toFixed(1)}p)</span>
            <span className="text-emerald-400">TP2: {fmt(entry.risk.take_profit_2, digits)}</span>
            <span className={entry.risk.rr_after_costs >= 1.5 ? 'text-cyan-300 font-bold' : 'text-amber-400'}>
              R:R {entry.risk.rr_after_costs?.toFixed(2)} (net)
            </span>
          </div>
        </div>
      )}

      {/* Data health row */}
      <div className="px-4 py-1.5 border-b border-white/[0.04] flex items-center justify-between text-[9px] font-mono text-slate-500">
        <span>Data age: {fmtAge(entry.data_freshness_seconds)}</span>
        <span>Setup age: {fmtAge(entry.setup_age_seconds)}</span>
        <span>{entry.has_trigger_candle ? <span className="text-emerald-400">✓ Trigger</span> : <span className="text-slate-500">No trigger</span>}</span>
        {entry.strategy_profile && <span className="text-indigo-400">{entry.strategy_profile}</span>}
      </div>

      {/* Rejection reasons (if any) */}
      {entry.rejection_messages.length > 0 && (
        <div className="px-4 py-2 bg-red-950/15 border-b border-red-900/20">
          {entry.rejection_messages.slice(0, 2).map((msg, i) => (
            <div key={i} className="text-[9px] text-red-400 font-mono flex gap-1.5 items-start">
              <ShieldAlert size={9} className="shrink-0 mt-0.5" />
              <span>{msg}</span>
            </div>
          ))}
          {entry.rejection_messages.length > 2 && (
            <span className="text-[9px] text-red-500/60">{entry.rejection_messages.length - 2} more reasons…</span>
          )}
        </div>
      )}

      {/* Expand toggle */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full px-4 py-1.5 text-[9px] font-mono text-slate-500 hover:text-slate-300 transition-colors flex items-center justify-between bg-[#050811]/60 hover:bg-[#050811]/80"
      >
        <span>{expanded ? '▲ Hide Gate Results' : '▼ Show 11-Gate Breakdown'}</span>
        <span className="text-slate-600">Conf: {entry.confidence}/100</span>
      </button>

      {/* Gate grid (expanded) */}
      {expanded && (
        <div className="px-4 py-3 bg-[#050811]/60 space-y-3">
          <GateGrid gates={entry.gate_results} />

          {entry.technical_justification && (
            <div className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.05]">
              <span className="text-[9px] text-slate-400 font-mono leading-relaxed block">{entry.technical_justification}</span>
            </div>
          )}

          {entry.risk?.opposing_liquidity_level && (
            <div className="flex justify-between text-[9px] font-mono text-slate-400">
              <span>Opposing Liq:</span>
              <span className="text-amber-400">{fmt(entry.risk.opposing_liquidity_level, digits)} ({entry.risk.distance_to_opposing_pips?.toFixed(1)}p)</span>
            </div>
          )}

          {entry.expiry_time && (
            <div className="flex items-center gap-1.5 text-[9px] font-mono text-slate-500">
              <Clock size={9} />
              <span>Expires: {new Date(entry.expiry_time).toLocaleTimeString()}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Main Panel ───────────────────────────────────────────────────────────────
export const PrecisionDiagnosticsPanel: React.FC = () => {
  const [data, setData] = useState<DiagnosticEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [timeframeFilter, setTimeframeFilter] = useState<string>('H1');
  const [lifecycleFilter, setLifecycleFilter] = useState<string>('ALL');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/scanner/diagnostics?timeframe=${timeframeFilter}`);
      if (!res.ok) throw new Error('Failed to load diagnostics');
      const json = await res.json();
      setData(Array.isArray(json) ? json : []);
      setLastRefreshed(new Date());
    } catch (e: any) {
      setError(e.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [timeframeFilter]);

  const filtered = data.filter(d =>
    lifecycleFilter === 'ALL' || d.lifecycle_state === lifecycleFilter
  );

  const confirmed = filtered.filter(d => d.lifecycle_state === 'CONFIRMED').length;
  const watching  = filtered.filter(d => d.lifecycle_state === 'WATCH').length;
  const waiting   = filtered.filter(d => ['WAITING_FOR_RETEST', 'WAITING_FOR_CONFIRMATION'].includes(d.lifecycle_state)).length;

  return (
    <div className="space-y-4">
      {/* Panel header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <Zap size={15} className="text-cyan-400" />
            Precision Diagnostics Panel
          </h3>
          <p className="text-[10px] text-slate-500 mt-0.5 font-mono">
            3-Stage Pipeline · 11 Hard Gates · Per-instrument lifecycle tracking
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={timeframeFilter}
            onChange={e => setTimeframeFilter(e.target.value)}
            className="bg-[#050914] border border-white/10 rounded-lg px-2 py-1.5 text-[10px] font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="M15">M15</option>
            <option value="H1">H1</option>
            <option value="H4">H4</option>
          </select>

          <select
            value={lifecycleFilter}
            onChange={e => setLifecycleFilter(e.target.value)}
            className="bg-[#050914] border border-white/10 rounded-lg px-2 py-1.5 text-[10px] font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">All States</option>
            <option value="CONFIRMED">CONFIRMED</option>
            <option value="WAITING_FOR_RETEST">RETEST</option>
            <option value="WAITING_FOR_CONFIRMATION">AWAITING TRIGGER</option>
            <option value="WATCH">WATCH</option>
            <option value="NO_TRADE">NO TRADE</option>
          </select>

          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/30 text-cyan-400 text-[10px] font-mono font-bold transition-all disabled:opacity-50"
          >
            <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Scanning…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-3 py-2 text-center">
          <span className="text-[10px] text-emerald-500 font-mono block">CONFIRMED</span>
          <span className="text-lg font-black text-emerald-400 font-mono">{confirmed}</span>
        </div>
        <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl px-3 py-2 text-center">
          <span className="text-[10px] text-blue-400 font-mono block">AWAITING</span>
          <span className="text-lg font-black text-blue-400 font-mono">{waiting}</span>
        </div>
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl px-3 py-2 text-center">
          <span className="text-[10px] text-amber-400 font-mono block">WATCH</span>
          <span className="text-lg font-black text-amber-400 font-mono">{watching}</span>
        </div>
      </div>

      {/* Status bar */}
      {lastRefreshed && (
        <div className="flex items-center gap-2 text-[9px] font-mono text-slate-600">
          <Activity size={9} className="text-emerald-600" />
          <span>Last scan: {lastRefreshed.toLocaleTimeString()}</span>
          <span>·</span>
          <span>{filtered.length} of {data.length} instruments shown</span>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-xl bg-red-900/20 border border-red-500/20 text-[10px] text-red-400 font-mono flex items-center gap-2">
          <AlertTriangle size={12} />
          <span>{error}</span>
        </div>
      )}

      {/* Diagnostics cards */}
      {loading && data.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {[...Array(9)].map((_, i) => (
            <div key={i} className="h-40 rounded-2xl bg-[#070e1e]/60 border border-white/[0.05] animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map(entry => (
            <DiagCard key={entry.symbol} entry={entry} />
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && !error && (
        <div className="text-center py-8 text-slate-500 text-xs font-mono">
          No instruments match the selected lifecycle filter.
        </div>
      )}

      {/* Gate legend */}
      <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
        <span className="text-[9px] font-mono text-slate-500 font-bold uppercase tracking-wider block mb-2">
          Hard Gate Legend (all must pass for CONFIRMED)
        </span>
        <div className="flex flex-wrap gap-2">
          {Object.entries(GATE_LABELS).map(([key, label]) => (
            <span key={key} className="text-[9px] text-slate-500 font-mono bg-white/[0.03] rounded px-1.5 py-0.5 border border-white/[0.05]">
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};
