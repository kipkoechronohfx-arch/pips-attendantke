import React, { useState, useEffect, useCallback } from 'react';
import {
  Zap, RefreshCw, TrendingUp, TrendingDown, AlertCircle,
  CheckCircle2, Clock, XCircle, ChevronDown, ChevronUp,
  DollarSign, Activity
} from 'lucide-react';
import { TradeExecution, ExecutionStats } from '../types';
import { api } from '../services/api';

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CFG = {
  PENDING:   { label: 'Pending',   cls: 'text-amber-400 bg-amber-500/10 border-amber-500/25',  icon: Clock },
  SUBMITTED: { label: 'Submitted', cls: 'text-cyan-400  bg-cyan-500/10  border-cyan-500/25',   icon: Activity },
  FILLED:    { label: 'Filled',    cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25', icon: CheckCircle2 },
  REJECTED:  { label: 'Rejected',  cls: 'text-rose-400  bg-rose-500/10  border-rose-500/25',   icon: XCircle },
  CLOSED:    { label: 'Closed',    cls: 'text-violet-400 bg-violet-500/10 border-violet-500/25', icon: CheckCircle2 },
  CANCELLED: { label: 'Cancelled', cls: 'text-slate-400 bg-slate-800/40 border-white/5',        icon: XCircle },
} as const;

// ─── Execution Row ────────────────────────────────────────────────────────────
const ExecutionRow: React.FC<{ exec: TradeExecution }> = ({ exec }) => {
  const cfg = STATUS_CFG[exec.status] || STATUS_CFG.PENDING;
  const Icon = cfg.icon;
  const isBuy = exec.direction === 'BUY';
  const pnl = exec.pnl_usd;
  const pnlPositive = pnl != null && pnl > 0;

  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-3 px-4 py-3 border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors text-xs">
      {/* Symbol + Direction */}
      <div className="flex items-center gap-2 min-w-0">
        <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 text-[9px] font-black ${
          isBuy ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
        }`}>
          {isBuy ? '▲' : '▼'}
        </div>
        <div className="min-w-0">
          <div className="font-bold text-slate-100 font-mono truncate">{exec.symbol}</div>
          <div className="text-[10px] text-slate-500 font-mono">
            {exec.lot_size.toFixed(2)} lots @ {exec.entry_price.toFixed(exec.symbol.includes('JPY') ? 3 : 5)}
          </div>
        </div>
      </div>

      {/* Ticket */}
      <div className="text-right hidden sm:block">
        <div className="text-[10px] text-slate-500">Ticket</div>
        <div className="font-mono text-slate-300">{exec.mt5_ticket || '—'}</div>
      </div>

      {/* Risk */}
      <div className="text-right hidden md:block">
        <div className="text-[10px] text-slate-500">Risk</div>
        <div className="font-mono text-amber-400">{exec.risk_percent}%</div>
      </div>

      {/* P&L */}
      <div className="text-right">
        {pnl != null ? (
          <div className={`font-mono font-bold ${pnlPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
            {pnlPositive ? '+' : ''}{pnl.toFixed(2)}
          </div>
        ) : (
          <div className="text-slate-600 font-mono">—</div>
        )}
        <div className="text-[9px] text-slate-600">USD P&L</div>
      </div>

      {/* Status */}
      <div>
        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.cls}`}>
          <Icon size={9} />
          {cfg.label}
        </span>
        <div className="text-[9px] text-slate-600 mt-0.5 text-right">
          {new Date(exec.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
};

// ─── Main Component ────────────────────────────────────────────────────────────
interface Props {
  accountId?: number;
}

export const ExecutionLogPanel: React.FC<Props> = ({ accountId }) => {
  const [executions, setExecutions] = useState<TradeExecution[]>([]);
  const [stats, setStats] = useState<ExecutionStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [filter, setFilter] = useState<string>('ALL');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [execs, st] = await Promise.all([
        api.getExecutions({ account_id: accountId, limit: 50 }),
        api.getExecutionStats(),
      ]);
      setExecutions(execs);
      setStats(st);
    } catch {}
    setLoading(false);
  }, [accountId]);

  useEffect(() => { load(); }, [load]);

  const filtered = filter === 'ALL' ? executions : executions.filter(e => e.status === filter);

  const FILTERS = ['ALL', 'SUBMITTED', 'FILLED', 'REJECTED', 'CLOSED'];

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-[#060d1a] overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07] cursor-pointer hover:bg-white/[0.02] transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-violet-500/15 border border-violet-500/25 flex items-center justify-center">
            <Zap size={15} className="text-violet-400" />
          </div>
          <div>
            <div className="text-sm font-black text-slate-100">Live Execution Log</div>
            <div className="text-[10px] text-slate-500">MetaApi auto-trade history</div>
          </div>
          {executions.length > 0 && (
            <span className="ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/25">
              {executions.length} records
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={e => { e.stopPropagation(); load(); }}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/[0.05] transition-all"
            title="Refresh"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          {expanded ? <ChevronUp size={15} className="text-slate-500" /> : <ChevronDown size={15} className="text-slate-500" />}
        </div>
      </div>

      {expanded && (
        <>
          {/* Stats Row */}
          {stats && (
            <div className="grid grid-cols-4 gap-px border-b border-white/[0.05] bg-white/[0.03]">
              {[
                { label: 'Submitted', val: stats.submitted, color: 'text-cyan-400' },
                { label: 'Win Rate', val: `${stats.win_rate}%`, color: 'text-emerald-400' },
                { label: 'Rejected', val: stats.rejected, color: 'text-rose-400' },
                {
                  label: 'Net P&L',
                  val: `$${stats.total_pnl_usd >= 0 ? '+' : ''}${stats.total_pnl_usd.toFixed(2)}`,
                  color: stats.total_pnl_usd >= 0 ? 'text-emerald-400' : 'text-rose-400'
                },
              ].map(({ label, val, color }) => (
                <div key={label} className="bg-[#060d1a] px-4 py-3 text-center">
                  <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-0.5">{label}</div>
                  <div className={`text-sm font-black font-mono ${color}`}>{val}</div>
                </div>
              ))}
            </div>
          )}

          {/* Filter tabs */}
          <div className="flex gap-1 px-4 py-2.5 border-b border-white/[0.05] overflow-x-auto">
            {FILTERS.map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap transition-all ${
                  filter === f
                    ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Execution List */}
          {loading && filtered.length === 0 ? (
            <div className="py-8 text-center text-slate-600 text-xs">Loading executions...</div>
          ) : filtered.length === 0 ? (
            <div className="py-12 flex flex-col items-center gap-3 text-center">
              <div className="w-12 h-12 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                <Zap size={22} className="text-violet-400/40" />
              </div>
              <div>
                <div className="text-sm font-bold text-slate-400 mb-1">No executions yet</div>
                <p className="text-[11px] text-slate-600 max-w-xs">
                  {filter !== 'ALL'
                    ? `No ${filter.toLowerCase()} executions found.`
                    : 'Executions appear here automatically when a signal fires into connected vault accounts.'
                  }
                </p>
              </div>
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              {filtered.map(exec => (
                <ExecutionRow key={exec.id} exec={exec} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};
