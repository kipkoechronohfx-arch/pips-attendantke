import React, { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { api } from '../services/api';
import { DiagnosticEntry, Quote, TradingSignal } from '../types';
import {
  Search,
  Star,
  ArrowUpDown,
  Filter,
  Eye,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Zap,
  SlidersHorizontal,
  ChevronDown,
} from 'lucide-react';

interface Props {
  initialTimeframe?: string;
  onSelectSymbol?: (symbol: string) => void;
  compact?: boolean;
}

type SortField = 'symbol' | 'score' | 'spread' | 'price' | 'status' | 'rr';
type SortOrder = 'asc' | 'desc';

const LIFECYCLE_BADGES: Record<string, { label: string; bg: string; text: string; border: string }> = {
  CONFIRMED:                { label: 'CONFIRMED', bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  WAITING_FOR_RETEST:       { label: 'WAITING RETEST', bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/30' },
  WAITING_FOR_CONFIRMATION: { label: 'WAITING TRIGGER', bg: 'bg-cyan-500/15', text: 'text-cyan-400', border: 'border-cyan-500/30' },
  WATCH:                    { label: 'WATCH', bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30' },
  ENTRY_MISSED:             { label: 'MISSED', bg: 'bg-orange-500/15', text: 'text-orange-400', border: 'border-orange-500/30' },
  INVALIDATED:              { label: 'INVALIDATED', bg: 'bg-rose-500/15', text: 'text-rose-400', border: 'border-rose-500/30' },
  EXPIRED:                  { label: 'EXPIRED', bg: 'bg-slate-500/15', text: 'text-slate-400', border: 'border-slate-500/30' },
  NO_TRADE:                 { label: 'NO TRADE', bg: 'bg-red-950/40', text: 'text-red-400', border: 'border-red-900/40' },
};

export const MarketScannerTable: React.FC<Props> = ({
  initialTimeframe = 'H1',
  onSelectSymbol,
  compact = false,
}) => {
  const {
    quotes,
    signals,
    flashMap,
    favorites,
    toggleFavorite,
    setSelectedAnalysisSymbol,
    lastScanAt,
    setLastScanAt,
    addToast,
    addSignal,
  } = useAppStore();

  const [diagnostics, setDiagnostics] = useState<DiagnosticEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [timeframe, setTimeframe] = useState(initialTimeframe);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<'ALL' | 'FOREX' | 'METALS' | 'CRYPTO'>('ALL');
  const [direction, setDirection] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [starredOnly, setStarredOnly] = useState(false);
  const [minScore, setMinScore] = useState<number>(0);

  // Sorting
  const [sortField, setSortField] = useState<SortField>('score');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Column visibility
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>({
    spread: true,
    session: true,
    bias: true,
    regime: true,
    setup: true,
    scores: true,
    entryZone: !compact,
    risk: true,
    rr: true,
  });

  const toggleCol = (key: string) => {
    setVisibleCols((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await api.getDiagnostics(timeframe);
      setDiagnostics(Array.isArray(data) ? data : []);
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 20000);
    return () => clearInterval(interval);
  }, [timeframe]);

  // Combined symbols list: from quotes and diagnostics
  const allSymbols = useMemo(() => {
    const set = new Set<string>();
    Object.keys(quotes).forEach((s) => set.add(s));
    diagnostics.forEach((d) => set.add(d.symbol));
    signals.forEach((s) => set.add(s.symbol));
    return Array.from(set);
  }, [quotes, diagnostics, signals]);

  // Unified items
  const tableRows = useMemo(() => {
    return allSymbols.map((sym) => {
      const q = quotes[sym];
      const diag = diagnostics.find((d) => d.symbol === sym);
      const sig = signals.find((s) => s.symbol === sym && s.status === 'ACTIVE');

      const isStarred = favorites.includes(sym);
      const dir = diag?.direction || sig?.direction || 'NEUTRAL';
      const status = diag?.lifecycle_state || sig?.lifecycle_state || (sig ? 'CONFIRMED' : 'WATCH');
      const score = diag ? diag.context_score + diag.setup_score : sig ? sig.confidence : 0;
      const spread = q ? q.spread : diag ? diag.spread_pips : 0;
      const price = q ? q.mid : diag?.entry_zone?.current_bid || 0;
      const rr = diag?.risk?.rr_after_costs || sig?.risk_reward_ratio || 0;

      // Category detection
      let cat: 'FOREX' | 'METALS' | 'CRYPTO' = 'FOREX';
      if (sym.includes('XAU') || sym.includes('XAG')) cat = 'METALS';
      else if (sym.includes('BTC') || sym.includes('ETH')) cat = 'CRYPTO';

      return {
        symbol: sym,
        quote: q,
        diag,
        sig,
        isStarred,
        direction: dir,
        lifecycle: status,
        score,
        spread,
        price,
        rr,
        category: cat,
      };
    });
  }, [allSymbols, quotes, diagnostics, signals, favorites]);

  // Filtered rows
  const filteredRows = useMemo(() => {
    return tableRows.filter((row) => {
      if (starredOnly && !row.isStarred) return false;
      if (category !== 'ALL' && row.category !== category) return false;
      if (direction !== 'ALL' && row.direction !== direction) return false;
      if (statusFilter !== 'ALL' && row.lifecycle !== statusFilter) return false;
      if (minScore > 0 && row.score < minScore) return false;
      if (search) {
        const query = search.toLowerCase();
        if (!row.symbol.toLowerCase().includes(query)) return false;
      }
      return true;
    });
  }, [tableRows, starredOnly, category, direction, statusFilter, minScore, search]);

  // Sorted rows
  const sortedRows = useMemo(() => {
    const list = [...filteredRows];
    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'symbol') {
        cmp = a.symbol.localeCompare(b.symbol);
      } else if (sortField === 'score') {
        cmp = a.score - b.score;
      } else if (sortField === 'spread') {
        cmp = a.spread - b.spread;
      } else if (sortField === 'price') {
        cmp = a.price - b.price;
      } else if (sortField === 'status') {
        cmp = a.lifecycle.localeCompare(b.lifecycle);
      } else if (sortField === 'rr') {
        cmp = a.rr - b.rr;
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [filteredRows, sortField, sortOrder]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const handleRowClick = (sym: string) => {
    if (onSelectSymbol) {
      onSelectSymbol(sym);
    } else {
      setSelectedAnalysisSymbol(sym);
    }
  };

  const handleTriggerScan = async () => {
    const now = Date.now();
    if (lastScanAt && now - lastScanAt < 30000) {
      addToast('Rate Limited', `Please wait ${Math.ceil((30000 - (now - lastScanAt)) / 1000)}s`, 'alert');
      return;
    }
    setLastScanAt(now);
    addToast('Executing Scan', 'Evaluating multi-timeframe rules across all instruments...', 'alert');
    setLoading(true);
    try {
      const newSigs = await api.triggerAutoScan();
      if (newSigs.length > 0) {
        newSigs.forEach((s) => addSignal(s));
        addToast('Scan Completed', `${newSigs.length} setup(s) processed`, 'success');
      }
      await loadData();
    } catch {
      addToast('Scan Error', 'Unable to reach backend scanner', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* ── Filter & Search Toolbar ── */}
      <div className="bg-[#0a101f] border border-white/[0.08] rounded-2xl p-3 sm:p-4 space-y-3 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Search bar */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Filter pair (e.g. EUR/USD, XAU)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-black/40 border border-white/10 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
            />
          </div>

          {/* Quick controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Category tabs */}
            <div className="flex rounded-xl bg-black/40 border border-white/10 p-0.5">
              {(['ALL', 'FOREX', 'METALS', 'CRYPTO'] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`px-2.5 py-1 text-[10px] font-bold font-mono rounded-lg transition-all ${
                    category === cat
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Timeframe selector */}
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl bg-black/40 border border-white/10 text-xs font-mono text-slate-300 focus:outline-none focus:border-cyan-400"
            >
              <option value="M15">M15</option>
              <option value="H1">H1</option>
              <option value="H4">H4</option>
            </select>

            {/* Direction filter */}
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value as any)}
              className="px-2.5 py-1.5 rounded-xl bg-black/40 border border-white/10 text-xs font-mono text-slate-300 focus:outline-none focus:border-cyan-400"
            >
              <option value="ALL">All Directions</option>
              <option value="BUY">BUY Only</option>
              <option value="SELL">SELL Only</option>
            </select>

            {/* Status filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl bg-black/40 border border-white/10 text-xs font-mono text-slate-300 focus:outline-none focus:border-cyan-400"
            >
              <option value="ALL">All States</option>
              <option value="CONFIRMED">CONFIRMED</option>
              <option value="WAITING_FOR_RETEST">WAITING RETEST</option>
              <option value="WAITING_FOR_CONFIRMATION">WAITING TRIGGER</option>
              <option value="WATCH">WATCH</option>
              <option value="INVALIDATED">INVALIDATED</option>
            </select>

            {/* Starred only toggle */}
            <button
              onClick={() => setStarredOnly(!starredOnly)}
              className={`p-1.5 rounded-xl border transition-all ${
                starredOnly
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-black/40 text-slate-400 border-white/10 hover:text-white'
              }`}
              title="Filter Starred Favorites"
            >
              <Star size={14} className={starredOnly ? 'fill-amber-400' : ''} />
            </button>

            {/* Column Visibility Selector */}
            <div className="relative">
              <button
                onClick={() => setColMenuOpen(!colMenuOpen)}
                className="p-1.5 rounded-xl bg-black/40 border border-white/10 text-slate-400 hover:text-white transition-all flex items-center gap-1 text-xs"
                title="Toggle Columns"
              >
                <SlidersHorizontal size={14} />
              </button>
              {colMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-[#0a101f] border border-white/15 rounded-xl p-2.5 shadow-2xl z-20 space-y-1 font-mono text-xs">
                  <span className="text-[10px] text-slate-500 block uppercase font-bold px-1 mb-1">
                    Toggle Columns
                  </span>
                  {Object.keys(visibleCols).map((k) => (
                    <label key={k} className="flex items-center gap-2 px-1 py-0.5 cursor-pointer text-slate-300 hover:text-white text-[11px]">
                      <input
                        type="checkbox"
                        checked={visibleCols[k]}
                        onChange={() => toggleCol(k)}
                        className="rounded accent-cyan-400"
                      />
                      <span className="capitalize">{k.replace(/([A-Z])/g, ' $1')}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Scan / Refresh Trigger */}
            <button
              onClick={handleTriggerScan}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/35 text-cyan-300 text-xs font-mono font-bold transition-all disabled:opacity-50"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              <span>{loading ? 'Scanning…' : 'Scan Now'}</span>
            </button>
          </div>
        </div>

        {/* Status count summary pill bar */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-white/[0.05] text-[11px] font-mono text-slate-400">
          <span>Total: <strong className="text-white">{sortedRows.length}</strong></span>
          <span>·</span>
          <span>Confirmed: <strong className="text-emerald-400">{sortedRows.filter((r) => r.lifecycle === 'CONFIRMED').length}</strong></span>
          <span>·</span>
          <span>Developing: <strong className="text-blue-400">{sortedRows.filter((r) => r.lifecycle.startsWith('WAITING')).length}</strong></span>
          <span>·</span>
          <span>Watch: <strong className="text-amber-400">{sortedRows.filter((r) => r.lifecycle === 'WATCH').length}</strong></span>
        </div>
      </div>

      {/* ── Table Container ── */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#070c18] overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs font-mono">
            <thead>
              <tr className="border-b border-white/[0.08] bg-[#0b1224] text-[10px] text-slate-400 uppercase tracking-wider select-none">
                <th className="py-3 px-3 w-8 text-center">★</th>
                <th
                  onClick={() => handleSort('symbol')}
                  className="py-3 px-3 cursor-pointer hover:text-white transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>Instrument</span>
                    <ArrowUpDown size={10} />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('price')}
                  className="py-3 px-3 cursor-pointer hover:text-white transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>Price</span>
                    <ArrowUpDown size={10} />
                  </div>
                </th>
                {visibleCols.spread && (
                  <th
                    onClick={() => handleSort('spread')}
                    className="py-3 px-3 cursor-pointer hover:text-white transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      <span>Spread</span>
                      <ArrowUpDown size={10} />
                    </div>
                  </th>
                )}
                {visibleCols.bias && <th className="py-3 px-3">H4/H1 Bias</th>}
                {visibleCols.regime && <th className="py-3 px-3">Regime</th>}
                {visibleCols.setup && <th className="py-3 px-3">Setup</th>}
                <th
                  onClick={() => handleSort('status')}
                  className="py-3 px-3 cursor-pointer hover:text-white transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>Status</span>
                    <ArrowUpDown size={10} />
                  </div>
                </th>
                {visibleCols.scores && (
                  <th
                    onClick={() => handleSort('score')}
                    className="py-3 px-3 cursor-pointer hover:text-white transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      <span>Score</span>
                      <ArrowUpDown size={10} />
                    </div>
                  </th>
                )}
                {visibleCols.entryZone && <th className="py-3 px-3">Entry Zone</th>}
                {visibleCols.risk && <th className="py-3 px-3">SL / TP1</th>}
                {visibleCols.rr && (
                  <th
                    onClick={() => handleSort('rr')}
                    className="py-3 px-3 cursor-pointer hover:text-white transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      <span>R:R</span>
                      <ArrowUpDown size={10} />
                    </div>
                  </th>
                )}
                <th className="py-3 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={14} className="py-12 text-center text-slate-500 font-mono text-xs">
                    No instruments match the selected filter criteria.
                  </td>
                </tr>
              ) : (
                sortedRows.map((row) => {
                  const digits = row.symbol.includes('JPY') ? 3 : row.symbol.includes('XAU') ? 2 : 5;
                  const flash = flashMap[row.symbol];
                  const badge = LIFECYCLE_BADGES[row.lifecycle] || LIFECYCLE_BADGES.WATCH;
                  const isBuy = row.direction === 'BUY';
                  const isSell = row.direction === 'SELL';

                  return (
                    <tr
                      key={row.symbol}
                      onClick={() => handleRowClick(row.symbol)}
                      className="hover:bg-white/[0.03] transition-colors cursor-pointer group"
                    >
                      {/* Star Button */}
                      <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => toggleFavorite(row.symbol)}
                          className="text-slate-600 hover:text-amber-400 transition-colors"
                        >
                          <Star size={13} className={row.isStarred ? 'fill-amber-400 text-amber-400' : ''} />
                        </button>
                      </td>

                      {/* Instrument */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-100 group-hover:text-cyan-300 transition-colors">
                            {row.symbol}
                          </span>
                          {isBuy && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-0.5">
                              <TrendingUp size={9} /> B
                            </span>
                          )}
                          {isSell && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center gap-0.5">
                              <TrendingDown size={9} /> S
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Live Price with Flash */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span
                          className={`font-mono tabular-nums font-bold ${
                            flash === 'up'
                              ? 'flash-up'
                              : flash === 'down'
                              ? 'flash-down'
                              : 'text-slate-200'
                          }`}
                        >
                          {row.price ? row.price.toFixed(digits) : '—'}
                        </span>
                      </td>

                      {/* Spread */}
                      {visibleCols.spread && (
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className={`font-mono ${row.spread > 3.0 ? 'text-amber-400 font-bold' : 'text-slate-400'}`}>
                            {row.spread ? `${row.spread.toFixed(1)}p` : '—'}
                          </span>
                        </td>
                      )}

                      {/* H4/H1 Bias */}
                      {visibleCols.bias && (
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 text-[10px]">
                            {isBuy ? (
                              <span className="text-emerald-400 flex items-center gap-0.5 font-bold">
                                <TrendingUp size={11} /> Bullish
                              </span>
                            ) : isSell ? (
                              <span className="text-rose-400 flex items-center gap-0.5 font-bold">
                                <TrendingDown size={11} /> Bearish
                              </span>
                            ) : (
                              <span className="text-slate-500 flex items-center gap-0.5">
                                <Minus size={11} /> Range
                              </span>
                            )}
                          </div>
                        </td>
                      )}

                      {/* Regime */}
                      {visibleCols.regime && (
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className="text-[10px] text-cyan-400 font-mono">
                            {row.diag?.market_regime || 'TRENDING'}
                          </span>
                        </td>
                      )}

                      {/* Setup Type */}
                      {visibleCols.setup && (
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className="text-[10px] text-slate-300 font-mono">
                            {row.diag?.setup_type || 'OB_RETEST'}
                          </span>
                        </td>
                      )}

                      {/* Status */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${badge.bg} ${badge.text} ${badge.border}`}>
                          {badge.label}
                        </span>
                      </td>

                      {/* Scores */}
                      {visibleCols.scores && (
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 font-bold text-xs">
                            <span className={row.score >= 70 ? 'text-emerald-400' : row.score >= 50 ? 'text-cyan-400' : 'text-slate-400'}>
                              {row.score}
                            </span>
                            <span className="text-[9px] text-slate-500 font-normal">/100</span>
                          </div>
                        </td>
                      )}

                      {/* Entry Zone */}
                      {visibleCols.entryZone && (
                        <td className="py-3 px-3 whitespace-nowrap text-[10px] text-slate-400 font-mono">
                          {row.diag?.entry_zone ? (
                            <span>
                              {row.diag.entry_zone.lower.toFixed(digits)} – {row.diag.entry_zone.upper.toFixed(digits)}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                      )}

                      {/* Risk (SL / TP1) */}
                      {visibleCols.risk && (
                        <td className="py-3 px-3 whitespace-nowrap text-[10px] font-mono">
                          {row.diag?.risk ? (
                            <div>
                              <span className="text-rose-400 font-bold">{row.diag.risk.stop_loss.toFixed(digits)}</span>
                              <span className="text-slate-600 mx-1">/</span>
                              <span className="text-emerald-400 font-bold">{row.diag.risk.take_profit_1.toFixed(digits)}</span>
                            </div>
                          ) : row.sig ? (
                            <div>
                              <span className="text-rose-400 font-bold">{row.sig.stop_loss.toFixed(digits)}</span>
                              <span className="text-slate-600 mx-1">/</span>
                              <span className="text-emerald-400 font-bold">{row.sig.take_profit_1.toFixed(digits)}</span>
                            </div>
                          ) : (
                            '—'
                          )}
                        </td>
                      )}

                      {/* R:R */}
                      {visibleCols.rr && (
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className={`font-mono text-xs font-bold ${row.rr >= 1.5 ? 'text-emerald-400' : 'text-slate-400'}`}>
                            {row.rr > 0 ? `1:${row.rr.toFixed(2)}` : '—'}
                          </span>
                        </td>
                      )}

                      {/* Actions */}
                      <td className="py-3 px-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleRowClick(row.symbol)}
                          className="px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.12] text-slate-300 hover:text-white border border-white/10 text-[10px] font-mono transition-all"
                        >
                          Details →
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
    </div>
  );
};
