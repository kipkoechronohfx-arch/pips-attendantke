import React, { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { SignalCard } from '../components/SignalCard';
import { api } from '../services/api';
import { soundFx } from '../services/audio';
import { Search, Filter, Sparkles, Zap, RefreshCw } from 'lucide-react';

export const SignalsPage: React.FC = () => {
  const { signals, addSignal, addToast, lastScanAt, setLastScanAt } = useAppStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'FOREX' | 'METALS' | 'CRYPTO'>('ALL');
  const [directionFilter, setDirectionFilter] = useState('ALL');
  const [timeframeFilter, setTimeframeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [isScanning, setIsScanning] = useState(false);

  const handleScan = async () => {
    const now = Date.now();
    if (lastScanAt && now - lastScanAt < 30_000) {
      addToast('Rate Limited', `Please wait ${Math.ceil((30_000 - (now - lastScanAt)) / 1000)}s before scanning again.`, 'alert');
      return;
    }
    setIsScanning(true);
    setLastScanAt(now);
    addToast('Scanning Markets', 'Quantitative confluence scanner running...', 'alert');
    try {
      const newSigs = await api.triggerAutoScan();
      if (newSigs.length > 0) {
        newSigs.forEach(s => addSignal(s));
        soundFx.playSignalChime();
        addToast('New Signals Discovered', `Added ${newSigs.length} setup(s) to feed`, 'success');
      } else {
        addToast('Scan Finished', 'No new setups met strict confluence criteria right now.', 'alert');
      }
    } catch {
      addToast('Scan Error', 'Failed to complete market scan', 'error');
    } finally {
      setIsScanning(false);
    }
  };

  const filteredSignals = signals.filter((s) => {
    const matchesSearch = s.symbol.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDir = directionFilter === 'ALL' || s.direction === directionFilter;
    const matchesTf = timeframeFilter === 'ALL' || s.timeframe === timeframeFilter;
    const matchesStatus = statusFilter === 'ALL' || s.status === statusFilter;
    
    let matchesCat = true;
    if (categoryFilter === 'METALS') matchesCat = s.symbol.includes('XAU') || s.symbol.includes('XAG');
    else if (categoryFilter === 'CRYPTO') matchesCat = s.symbol.includes('BTC') || s.symbol.includes('ETH');
    else if (categoryFilter === 'FOREX') matchesCat = !s.symbol.includes('XAU') && !s.symbol.includes('XAG') && !s.symbol.includes('BTC') && !s.symbol.includes('ETH');

    return matchesSearch && matchesDir && matchesTf && matchesStatus && matchesCat;
  });

  const activeCount = signals.filter(s => s.status === 'ACTIVE').length;
  const highConfCount = signals.filter(s => (s.confidence ?? 0) >= 75).length;

  return (
    <div className="space-y-6 page-enter">
      {/* Header and Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-slate-100 flex items-center gap-2.5">
            <span>Trading Signals Blotter</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 font-mono font-bold border border-cyan-500/25 glow-cyan-sm">
              {filteredSignals.length} Active Feeds
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Algorithmic confluence &amp; institutional desk trading setups with precise SL/TP targets
          </p>
        </div>

        <button
          onClick={handleScan}
          disabled={isScanning}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold shadow-lg shadow-cyan-500/25 transition-all disabled:opacity-50 hover:scale-105 active:scale-95"
        >
          {isScanning ? <RefreshCw size={15} className="animate-spin" /> : <Sparkles size={15} />}
          <span>Run Confluence Scan</span>
        </button>
      </div>

      {/* Quantitative Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[#080f1e]/80 border border-white/[0.07] rounded-xl px-3.5 py-2.5 flex items-center justify-between">
          <span className="text-[11px] font-semibold text-slate-400">Total Live</span>
          <span className="text-sm font-bold font-mono text-cyan-400">{activeCount} Setups</span>
        </div>
        <div className="bg-[#080f1e]/80 border border-white/[0.07] rounded-xl px-3.5 py-2.5 flex items-center justify-between">
          <span className="text-[11px] font-semibold text-slate-400">High Confluence</span>
          <span className="text-sm font-bold font-mono text-emerald-400">{highConfCount} (&ge;75%)</span>
        </div>
        <div className="bg-[#080f1e]/80 border border-white/[0.07] rounded-xl px-3.5 py-2.5 flex items-center justify-between">
          <span className="text-[11px] font-semibold text-slate-400">Target R:R</span>
          <span className="text-sm font-bold font-mono text-violet-400">1 : 2.0+</span>
        </div>
        <div className="bg-[#080f1e]/80 border border-white/[0.07] rounded-xl px-3.5 py-2.5 flex items-center justify-between">
          <span className="text-[11px] font-semibold text-slate-400">Feed Engine</span>
          <span className="text-[10px] font-bold font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">OANDA LIVE</span>
        </div>
      </div>

      {/* Asset Category Tabs + Search Bar */}
      <div className="glass-card-premium rounded-2xl p-4 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 bg-[#050914] p-1 rounded-xl border border-white/[0.08] text-xs font-bold">
            {(['ALL', 'FOREX', 'METALS', 'CRYPTO'] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  categoryFilter === cat
                    ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {cat === 'ALL' ? 'All Asset Classes' : cat === 'FOREX' ? 'Forex Majors' : cat === 'METALS' ? 'Gold & Metals' : 'Crypto'}
              </button>
            ))}
          </div>

          {/* Quick Clear */}
          {(searchTerm || directionFilter !== 'ALL' || timeframeFilter !== 'ALL' || statusFilter !== 'ALL' || categoryFilter !== 'ALL') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setCategoryFilter('ALL');
                setDirectionFilter('ALL');
                setTimeframeFilter('ALL');
                setStatusFilter('ALL');
              }}
              className="text-xs text-rose-400 hover:text-rose-300 font-semibold"
            >
              Reset Filters
            </button>
          )}
        </div>

        {/* Detailed Controls Row */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-white/[0.05]">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Filter by pair (EUR/USD, XAU/USD, JPY...)"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#050914] border border-white/10 rounded-xl pl-9 pr-3.5 py-2 text-xs font-mono text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Direction Filter */}
          <select
            value={directionFilter}
            onChange={(e) => setDirectionFilter(e.target.value)}
            className="bg-[#050914] border border-white/10 rounded-xl px-3 py-2 text-xs font-sans text-slate-200 focus:outline-none focus:border-cyan-500 font-semibold"
          >
            <option value="ALL">Direction: All</option>
            <option value="BUY">BUY Longs</option>
            <option value="SELL">SELL Shorts</option>
          </select>

          {/* Timeframe Filter */}
          <select
            value={timeframeFilter}
            onChange={(e) => setTimeframeFilter(e.target.value)}
            className="bg-[#050914] border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500 font-bold"
          >
            <option value="ALL">Timeframe: All</option>
            <option value="M5">M5 (Scalp)</option>
            <option value="M15">M15 (Intraday)</option>
            <option value="M30">M30</option>
            <option value="H1">H1 (Session)</option>
            <option value="H4">H4 (Swing)</option>
            <option value="D1">D1 (Macro)</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-[#050914] border border-white/10 rounded-xl px-3 py-2 text-xs font-sans text-slate-200 focus:outline-none focus:border-cyan-500 font-semibold"
          >
            <option value="ALL">Status: All</option>
            <option value="ACTIVE">Active (Live)</option>
            <option value="CLOSED">Closed Out</option>
          </select>
        </div>
      </div>

      {/* Signals Grid */}
      {filteredSignals.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredSignals.map((signal) => (
            <SignalCard key={signal.id} signal={signal} />
          ))}
        </div>
      ) : (
        <div className="glass-card-premium rounded-2xl p-12 text-center text-slate-400">
          <Zap size={32} className="mx-auto mb-3 text-slate-500" />
          <h3 className="text-base font-bold text-slate-200">No signals found matching criteria</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Try resetting your search or filters, or trigger a quantitative multi-indicator scan.
          </p>
        </div>
      )}
    </div>
  );
};
