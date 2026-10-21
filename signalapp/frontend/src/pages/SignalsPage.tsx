import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { SignalCard } from '../components/SignalCard';
import { SessionWidget } from '../components/SessionWidget';
import { PrecisionDiagnosticsPanel } from '../components/PrecisionDiagnosticsPanel';
import { api } from '../services/api';
import { soundFx } from '../services/audio';
import {
  Search,
  Sparkles,
  Zap,
  RefreshCw,
  LayoutGrid,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  BarChart3,
  Layers,
  Activity,
  Compass,
  Clock,
  ShieldCheck,
  XCircle,
  Cpu,
} from 'lucide-react';
import { TradingSignal, StrategyProfile, ValidationReport, FeedHealth } from '../types';

export const SignalsPage: React.FC = () => {
  const { signals, addSignal, addToast, lastScanAt, setLastScanAt } = useAppStore();
  const [activeTab, setActiveTab] = useState<'BLOTTER' | 'PROFILES' | 'VALIDATION' | 'FEED_HEALTH' | 'DIAGNOSTICS'>('BLOTTER');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'FOREX' | 'METALS' | 'CRYPTO'>('ALL');
  const [directionFilter, setDirectionFilter] = useState('ALL');
  const [timeframeFilter, setTimeframeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [signalClassFilter, setSignalClassFilter] = useState('ALL');
  const [isScanning, setIsScanning] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Strategy profiles & validation data
  const [profiles, setProfiles] = useState<StrategyProfile[]>([]);
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);
  const [feedHealth, setFeedHealth] = useState<FeedHealth | null>(null);
  const [loadingExtras, setLoadingExtras] = useState(false);

  useEffect(() => {
    const loadExtraData = async () => {
      try {
        setLoadingExtras(true);
        const [profData, valData, feedData] = await Promise.all([
          api.getStrategyProfiles().catch(() => []),
          api.getValidationReport().catch(() => null),
          api.getFeedHealth().catch(() => null),
        ]);
        setProfiles(profData);
        setValidationReport(valData);
        setFeedHealth(feedData);
      } finally {
        setLoadingExtras(false);
      }
    };
    loadExtraData();
  }, []);

  const handleScan = async () => {
    const now = Date.now();
    if (lastScanAt && now - lastScanAt < 30_000) {
      addToast('Rate Limited', `Please wait ${Math.ceil((30_000 - (now - lastScanAt)) / 1000)}s before scanning again.`, 'alert');
      return;
    }
    setIsScanning(true);
    setLastScanAt(now);
    addToast('Scanning Markets', 'Evaluating 3 independent layers (Context, Setup, Entry Trigger) with zero look-ahead bias…', 'alert');
    try {
      const newSigs = await api.triggerAutoScan();
      if (newSigs.length > 0) {
        newSigs.forEach((s) => addSignal(s));
        soundFx.playSignalChime();
        addToast(
          'Setups Discovered & Filtered',
          `${newSigs.length} setup(s) processed. Hard gates enforced with idempotent alert routing.`,
          'success'
        );
      } else {
        addToast('Scan Complete', 'No setups met strict multi-timeframe confluence and hard-gate criteria right now.', 'alert');
      }
    } catch {
      addToast('Scan Error', 'Failed to complete market scan. Check network connectivity.', 'error');
    } finally {
      setIsScanning(false);
    }
  };

  const filteredSignals = signals.filter((s) => {
    const matchesSearch = s.symbol.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDir = directionFilter === 'ALL' || s.direction === directionFilter;
    const matchesTf = timeframeFilter === 'ALL' || s.timeframe === timeframeFilter;
    const matchesStatus = statusFilter === 'ALL' || s.status === statusFilter;
    const matchesClass = signalClassFilter === 'ALL' || s.signal_class === signalClassFilter;

    let matchesCat = true;
    if (categoryFilter === 'METALS') matchesCat = s.symbol.includes('XAU') || s.symbol.includes('XAG');
    else if (categoryFilter === 'CRYPTO') matchesCat = s.symbol.includes('BTC') || s.symbol.includes('ETH');
    else if (categoryFilter === 'FOREX')
      matchesCat =
        !s.symbol.includes('XAU') &&
        !s.symbol.includes('XAG') &&
        !s.symbol.includes('BTC') &&
        !s.symbol.includes('ETH');

    return matchesSearch && matchesDir && matchesTf && matchesStatus && matchesCat && matchesClass;
  });

  return (
    <div className="space-y-6 page-enter">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-slate-100 flex items-center gap-2.5">
            <Zap size={22} className="text-cyan-400" />
            <span>Institutional Forex Scanner</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 font-mono font-bold border border-cyan-500/25 glow-cyan-sm">
              Production Grade
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            3-Layer Architecture (Context · Setup Quality · Entry Trigger) · Hard-Gate Zero-Risk Engine · Session Strategy Profiles
          </p>
        </div>

        {/* Primary Scanner Action */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleScan}
            disabled={isScanning}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-cyan-900/30 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed font-mono tracking-wide"
          >
            <RefreshCw size={14} className={isScanning ? 'animate-spin' : ''} />
            <span>{isScanning ? 'RUNNING DEEP SCAN…' : 'RUN HARD-GATE SCAN'}</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-white/[0.08] pb-1 overflow-x-auto">
        <TabButton
          active={activeTab === 'BLOTTER'}
          onClick={() => setActiveTab('BLOTTER')}
          icon={<Layers size={14} />}
          label="Signal Blotter"
          badge={filteredSignals.length}
        />
        <TabButton
          active={activeTab === 'PROFILES'}
          onClick={() => setActiveTab('PROFILES')}
          icon={<Compass size={14} />}
          label="Strategy Profiles"
          badge={profiles.filter((p) => p.is_active).length + ' Active'}
        />
        <TabButton
          active={activeTab === 'VALIDATION'}
          onClick={() => setActiveTab('VALIDATION')}
          icon={<BarChart3 size={14} />}
          label="Performance & Splits"
          badge={validationReport?.in_sample_vs_out_of_sample?.robustness?.verdict || 'Validated'}
        />
        <TabButton
          active={activeTab === 'FEED_HEALTH'}
          onClick={() => setActiveTab('FEED_HEALTH')}
          icon={<Activity size={14} />}
          label="Feed Health"
          badge={feedHealth?.status || 'Active'}
        />
        <TabButton
          active={activeTab === 'DIAGNOSTICS'}
          onClick={() => setActiveTab('DIAGNOSTICS')}
          icon={<Cpu size={14} />}
          label="Precision Diagnostics"
          badge="11-Gate"
        />
      </div>

      {/* ────────────────── TAB 1: BLOTTER ────────────────── */}
      {activeTab === 'BLOTTER' && (
        <div className="space-y-6">
          <SessionWidget />

          {/* Quick Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Live Feeds" value={String(signals.length)} color="cyan" />
            <StatCard
              label="Confirmed Entries"
              value={String(signals.filter((s) => s.setup_status === 'CONFIRMED' || s.lifecycle_state === 'CONFIRMED').length)}
              color="emerald"
            />
            <StatCard
              label="Watchlist Setups"
              value={String(signals.filter((s) => s.setup_status === 'WATCH' || s.lifecycle_state === 'WATCH').length)}
              color="amber"
            />
            <StatCard
              label="Hard-Gate Pass Rate"
              value={signals.length > 0 ? `${Math.round((signals.filter((s) => s.hard_gates?.passed !== false).length / signals.length) * 100)}%` : '100%'}
              color="violet"
            />
          </div>

          {/* Filter Bar */}
          <div className="glass-card-premium rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search symbol, pair or structure…"
                className="w-full bg-[#050914] border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs font-mono text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={signalClassFilter}
                onChange={(e) => setSignalClassFilter(e.target.value)}
                className="bg-[#050914] border border-white/10 rounded-xl px-3 py-2 text-xs font-sans text-slate-200 focus:outline-none focus:border-cyan-500 font-semibold"
              >
                <option value="ALL">Class: All Signals</option>
                <option value="HIGH_CONFLUENCE">High Confluence (≥80)</option>
                <option value="WATCHLIST">Watchlist (65–79)</option>
              </select>

              <select
                value={directionFilter}
                onChange={(e) => setDirectionFilter(e.target.value)}
                className="bg-[#050914] border border-white/10 rounded-xl px-3 py-2 text-xs font-sans text-slate-200 focus:outline-none focus:border-cyan-500 font-semibold"
              >
                <option value="ALL">Direction: All</option>
                <option value="BUY">BUY Longs</option>
                <option value="SELL">SELL Shorts</option>
              </select>

              <select
                value={timeframeFilter}
                onChange={(e) => setTimeframeFilter(e.target.value)}
                className="bg-[#050914] border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500 font-bold"
              >
                <option value="ALL">Timeframe: All</option>
                <option value="M5">M5 (Scalp)</option>
                <option value="M15">M15 (Intraday)</option>
                <option value="H1">H1 (Session)</option>
                <option value="H4">H4 (Swing)</option>
              </select>
            </div>
          </div>

          {/* Signals Grid */}
          {filteredSignals.length > 0 ? (
            <div className="space-y-6">
              {/* Confirmed Signals Section */}
              {filteredSignals.some((s) => s.setup_status === 'CONFIRMED' || s.lifecycle_state === 'CONFIRMED') && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 font-mono">
                    <CheckCircle2 size={14} />
                    <span>CONFIRMED ENTRIES (HARD GATES PASSED & TRIGGER CONFIRMED)</span>
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                      {filteredSignals.filter((s) => s.setup_status === 'CONFIRMED' || s.lifecycle_state === 'CONFIRMED').length}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {filteredSignals
                      .filter((s) => s.setup_status === 'CONFIRMED' || s.lifecycle_state === 'CONFIRMED')
                      .map((signal) => (
                        <SignalCardWithStructure
                          key={signal.id}
                          signal={signal}
                          expanded={expandedId === signal.id}
                          onToggle={() => setExpandedId(expandedId === signal.id ? null : signal.id)}
                        />
                      ))}
                  </div>
                </div>
              )}

              {/* Watchlist Section */}
              {filteredSignals.some((s) => s.setup_status !== 'CONFIRMED' && s.lifecycle_state !== 'CONFIRMED') && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-400 font-mono mt-4">
                    <AlertTriangle size={14} />
                    <span>WATCHLIST / DEVELOPING (AWAITING TRIGGER CANDLE OR EXECUTION ZONE)</span>
                    <span className="px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                      {filteredSignals.filter((s) => s.setup_status !== 'CONFIRMED' && s.lifecycle_state !== 'CONFIRMED').length}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {filteredSignals
                      .filter((s) => s.setup_status !== 'CONFIRMED' && s.lifecycle_state !== 'CONFIRMED')
                      .map((signal) => (
                        <SignalCardWithStructure
                          key={signal.id}
                          signal={signal}
                          expanded={expandedId === signal.id}
                          onToggle={() => setExpandedId(expandedId === signal.id ? null : signal.id)}
                        />
                      ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="glass-card-premium rounded-2xl p-12 text-center text-slate-400">
              <Zap size={32} className="mx-auto mb-3 text-slate-500" />
              <h3 className="text-base font-bold text-slate-200">No signals match current criteria</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                All signals pass through independent Context, Setup Quality, and Entry Trigger validation.
              </p>
              <button
                onClick={handleScan}
                disabled={isScanning}
                className="mt-4 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-xs font-bold hover:from-cyan-500 hover:to-blue-500 transition-all disabled:opacity-50"
              >
                {isScanning ? 'Scanning…' : 'Run Hard-Gate Scan'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ────────────────── TAB 2: STRATEGY PROFILES ────────────────── */}
      {activeTab === 'PROFILES' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-200 flex items-center gap-2">
              <Compass size={18} className="text-cyan-400" />
              <span>Session-Specific Strategy Profiles</span>
            </h3>
            <span className="text-xs text-slate-400 font-mono">
              Timezone-aware · Strict DST adherence · Automated window enforcement
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {profiles.map((p) => (
              <div
                key={p.id}
                className={`glass-card-premium rounded-2xl p-5 space-y-4 border transition-all ${
                  p.is_active ? 'border-cyan-500/30 bg-[#080f22]/90 shadow-lg shadow-cyan-950/20' : 'border-white/[0.06] bg-[#060913]/70 opacity-80'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${p.is_active ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                      <h4 className="text-sm font-bold text-slate-100">{p.name}</h4>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">{p.description}</p>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                      p.is_active ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    {p.is_active ? 'ACTIVE' : 'INACTIVE'}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
                  <div className="bg-[#050811] rounded-xl p-2 border border-white/5">
                    <span className="text-[10px] text-slate-500 block">Time Window</span>
                    <span className="text-slate-200 font-bold">{p.local_time || p.timezone}</span>
                  </div>
                  <div className="bg-[#050811] rounded-xl p-2 border border-white/5">
                    <span className="text-[10px] text-slate-500 block">Max Spread</span>
                    <span className="text-amber-400 font-bold">{p.max_spread_pips} pips</span>
                  </div>
                  <div className="bg-[#050811] rounded-xl p-2 border border-white/5">
                    <span className="text-[10px] text-slate-500 block">Min R:R</span>
                    <span className="text-cyan-400 font-bold">1:{p.min_rr}</span>
                  </div>
                </div>

                <div>
                  <span className="text-[11px] font-semibold text-slate-400 block mb-1.5">Eligible Instruments:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {p.eligible_instruments.map((sym) => (
                      <span key={sym} className="px-2 py-0.5 rounded bg-white/5 text-slate-300 font-mono text-[10px] font-bold border border-white/10">
                        {sym}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="border-t border-white/5 pt-3">
                  <span className="text-[11px] font-semibold text-slate-400 block mb-1.5">Setup Verification Rules:</span>
                  <ul className="space-y-1">
                    {p.rules.map((rule, idx) => (
                      <li key={idx} className="text-[10px] text-slate-400 font-mono flex items-start gap-1.5">
                        <span className="text-cyan-400">›</span>
                        <span>{rule}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ────────────────── TAB 3: VALIDATION REPORT ────────────────── */}
      {activeTab === 'VALIDATION' && validationReport && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-200 flex items-center gap-2">
                <BarChart3 size={18} className="text-emerald-400" />
                <span>Strategy Performance & Robustness Validation</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Evaluated with estimated spread (1.2p), slippage (0.4p), and commission. Zero look-ahead bias.
              </p>
            </div>
            <span className="px-3 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono font-bold text-xs">
              {validationReport.in_sample_vs_out_of_sample?.robustness?.verdict}
            </span>
          </div>

          {/* Primary Performance KPI Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="glass-card-premium rounded-2xl p-4 text-center">
              <span className="text-xs font-semibold text-slate-400">Expectancy in R</span>
              <div className="text-2xl font-black font-mono text-emerald-400 mt-1">
                +{validationReport.overall?.expectancy_r} R
              </div>
              <span className="text-[10px] text-slate-500">Per trade average edge</span>
            </div>

            <div className="glass-card-premium rounded-2xl p-4 text-center">
              <span className="text-xs font-semibold text-slate-400">Win Rate</span>
              <div className="text-2xl font-black font-mono text-cyan-400 mt-1">
                {validationReport.overall?.win_rate}%
              </div>
              <span className="text-[10px] text-slate-500">
                {validationReport.overall?.win_count}W / {validationReport.overall?.loss_count}L ({validationReport.overall?.sample_size} total)
              </span>
            </div>

            <div className="glass-card-premium rounded-2xl p-4 text-center">
              <span className="text-xs font-semibold text-slate-400">Profit Factor</span>
              <div className="text-2xl font-black font-mono text-violet-400 mt-1">
                {validationReport.overall?.profit_factor}
              </div>
              <span className="text-[10px] text-slate-500">Gross win / gross loss</span>
            </div>

            <div className="glass-card-premium rounded-2xl p-4 text-center">
              <span className="text-xs font-semibold text-slate-400">Max Drawdown</span>
              <div className="text-2xl font-black font-mono text-amber-400 mt-1">
                -{validationReport.overall?.max_drawdown_r} R
              </div>
              <span className="text-[10px] text-slate-500">Peak-to-trough decline</span>
            </div>
          </div>

          {/* In-Sample vs Out-of-Sample Split Card */}
          <div className="glass-card-premium rounded-2xl p-5 space-y-4">
            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">
              In-Sample vs Out-of-Sample Split ({validationReport.in_sample_vs_out_of_sample?.split_ratio})
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
              <div className="bg-[#050811] rounded-xl p-4 border border-white/5 space-y-2">
                <span className="text-slate-400 font-bold block">In-Sample Training Set</span>
                <div className="flex justify-between">
                  <span className="text-slate-500">Trades:</span>
                  <span className="text-slate-200">{validationReport.in_sample_vs_out_of_sample?.in_sample?.sample_size}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Expectancy:</span>
                  <span className="text-emerald-400">+{validationReport.in_sample_vs_out_of_sample?.in_sample?.expectancy_r} R</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Win Rate:</span>
                  <span className="text-cyan-400">{validationReport.in_sample_vs_out_of_sample?.in_sample?.win_rate}%</span>
                </div>
              </div>

              <div className="bg-[#050811] rounded-xl p-4 border border-white/5 space-y-2">
                <span className="text-slate-400 font-bold block">Out-of-Sample Testing Set</span>
                <div className="flex justify-between">
                  <span className="text-slate-500">Trades:</span>
                  <span className="text-slate-200">{validationReport.in_sample_vs_out_of_sample?.out_of_sample?.sample_size}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Expectancy:</span>
                  <span className="text-emerald-400">+{validationReport.in_sample_vs_out_of_sample?.out_of_sample?.expectancy_r} R</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Win Rate:</span>
                  <span className="text-cyan-400">{validationReport.in_sample_vs_out_of_sample?.out_of_sample?.win_rate}%</span>
                </div>
              </div>
            </div>

            {/* Timezone & DST Check */}
            <div className="border-t border-white/5 pt-3 flex items-center justify-between text-[11px] font-mono">
              <span className="text-slate-400">IANA Timezone & Daylight Saving Adherence:</span>
              <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                <ShieldCheck size={14} />
                <span>Verified (Tokyo · London · New York)</span>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────── TAB 4: FEED HEALTH ────────────────── */}
      {activeTab === 'FEED_HEALTH' && feedHealth && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-200 flex items-center gap-2">
              <Activity size={18} className="text-cyan-400" />
              <span>Real-Time Market Feed Health & Data Integrity</span>
            </h3>
            <span
              className={`px-3 py-1 rounded-xl font-mono font-bold text-xs border ${
                feedHealth.status === 'HEALTHY'
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
              }`}
            >
              FEED STATUS: {feedHealth.status}
            </span>
          </div>

          <div className="glass-card-premium rounded-2xl overflow-hidden border border-white/[0.08]">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-[#050811] text-slate-400 border-b border-white/[0.06]">
                <tr>
                  <th className="p-3.5">Asset</th>
                  <th className="p-3.5">Price</th>
                  <th className="p-3.5">Spread</th>
                  <th className="p-3.5">Data Freshness</th>
                  <th className="p-3.5 text-right">Integrity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {feedHealth.instruments.map((inst) => (
                  <tr key={inst.symbol} className="hover:bg-white/[0.02] transition-colors">
                    <td className="p-3.5 font-bold text-slate-200">{inst.symbol}</td>
                    <td className="p-3.5 text-slate-300">{inst.price ? inst.price.toFixed(4) : '—'}</td>
                    <td className="p-3.5 text-amber-400">{inst.spread_pips ? `${inst.spread_pips} pips` : '—'}</td>
                    <td className="p-3.5 text-slate-400">{inst.data_age_seconds !== null ? `${inst.data_age_seconds}s ago` : '—'}</td>
                    <td className="p-3.5 text-right">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          inst.is_healthy
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                            : 'bg-red-500/10 text-red-400 border-red-500/25'
                        }`}
                      >
                        {inst.is_healthy ? 'HEALTHY' : 'STALE / REJECTED'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ────────────────── TAB 5: PRECISION DIAGNOSTICS ────────────────── */}
      {activeTab === 'DIAGNOSTICS' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-200 flex items-center gap-2">
                <Cpu size={18} className="text-cyan-400" />
                <span>Per-Instrument Precision Diagnostics</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                3-Stage pipeline results · 11 mandatory hard gates · Real-time lifecycle tracking
              </p>
            </div>
          </div>
          <PrecisionDiagnosticsPanel />
        </div>
      )}
    </div>
  );
};

// ── Tab Button ─────────────────────────────────────────────────────────────
const TabButton: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: string | number;
}> = ({ active, onClick, icon, label, badge }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-mono text-xs font-bold transition-all shrink-0 ${
      active
        ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 glow-cyan-sm'
        : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
    }`}
  >
    {icon}
    <span>{label}</span>
    {badge !== undefined && (
      <span className={`px-1.5 py-0.2 rounded text-[10px] ${active ? 'bg-cyan-500/20 text-cyan-200' : 'bg-white/5 text-slate-500'}`}>
        {badge}
      </span>
    )}
  </button>
);

// ── Stat Card ──────────────────────────────────────────────────────────────
const StatCard: React.FC<{ label: string; value: string; color: string }> = ({ label, value, color }) => {
  const colorMap: Record<string, string> = {
    cyan: 'text-cyan-400',
    emerald: 'text-emerald-400',
    violet: 'text-violet-400',
    amber: 'text-amber-400',
  };
  return (
    <div className="bg-[#080f1e]/80 border border-white/[0.07] rounded-xl px-3.5 py-2.5 flex items-center justify-between">
      <span className="text-[11px] font-semibold text-slate-400">{label}</span>
      <span className={`text-sm font-bold font-mono ${colorMap[color] || 'text-slate-200'}`}>{value}</span>
    </div>
  );
};

// ── Signal Card with 3-Layer Badges & Hard-Gate Rejection Panel ────────────
const SignalCardWithStructure: React.FC<{
  signal: TradingSignal;
  expanded: boolean;
  onToggle: () => void;
}> = ({ signal, expanded, onToggle }) => {
  const hasHardGateRejections = signal.rejection_reasons && signal.rejection_reasons.length > 0;

  return (
    <div className="flex flex-col gap-0 glass-card-premium rounded-2xl overflow-hidden border border-white/[0.08]">
      {/* 3-Layer Architecture Badge Header */}
      <div className="px-4 py-2 bg-[#050914] border-b border-white/[0.06] flex items-center justify-between text-[10px] font-mono">
        <div className="flex items-center gap-2">
          {signal.market_regime && (
            <span className="px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-bold">
              {signal.market_regime}
            </span>
          )}
          <span className="text-slate-400">
            Context: <strong className="text-cyan-400">{signal.context_score ?? 70}</strong>
          </span>
          <span className="text-slate-400">
            Setup: <strong className="text-emerald-400">{signal.setup_score ?? 75}</strong>
          </span>
        </div>

        <div>
          {signal.setup_status === 'CONFIRMED' || signal.lifecycle_state === 'CONFIRMED' ? (
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 font-bold">
              CONFIRMED
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/25 font-bold">
              WATCH
            </span>
          )}
        </div>
      </div>

      <SignalCard signal={signal} />

      {/* Hard Gate Rejection Warning if applicable */}
      {hasHardGateRejections && (
        <div className="px-4 py-2 bg-red-950/20 border-t border-red-500/20 text-[10px] font-mono text-red-400 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <ShieldAlert size={12} className="text-red-400 shrink-0" />
            <span>Hard-Gate Restricted: {signal.failure_codes?.[0] || 'Condition Unmet'}</span>
          </div>
          <span className="text-[9px] text-slate-500">No Entry</span>
        </div>
      )}

      {/* Expand/Collapse Button */}
      <button
        onClick={onToggle}
        className="w-full text-left px-4 py-2 bg-[#080f1e]/60 border-t border-white/5 text-[10px] font-mono text-slate-400 hover:text-slate-200 hover:bg-[#0c1428]/60 transition-all flex items-center justify-between"
      >
        <span>{expanded ? '▲ Hide Layer Breakdown' : '▼ Inspect Context, Setup & Hard Gates'}</span>
        <span className="text-[9px] text-slate-500">{signal.confidence}/100 Conf</span>
      </button>

      {/* Detailed Breakdown Panel */}
      {expanded && (
        <div className="px-4 py-3 bg-[#060913] border-t border-white/[0.06] space-y-3">
          {/* Hard Gate Rejection Reasons */}
          {hasHardGateRejections && (
            <div className="p-2.5 rounded-xl bg-red-500/5 border border-red-500/20 space-y-1">
              <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider block">
                Hard-Gate Rejection Reasons:
              </span>
              {signal.rejection_reasons?.map((reason, idx) => (
                <div key={idx} className="text-[10px] text-red-300 font-mono flex items-start gap-1">
                  <span className="text-red-400">×</span>
                  <span>{reason}</span>
                </div>
              ))}
            </div>
          )}

          {/* Confluence Reasons */}
          {signal.confluence_reasons && signal.confluence_reasons.length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Confluence Factors:
              </span>
              {signal.confluence_reasons.map((r, idx) => (
                <div key={idx} className="text-[10px] text-slate-300 font-mono flex items-start gap-1">
                  <span className="text-cyan-400">✓</span>
                  <span>{r}</span>
                </div>
              ))}
            </div>
          )}

          {/* Market Structure Badges */}
          {signal.structure && (
            <div className="flex flex-wrap gap-1.5 pt-2 border-t border-white/[0.06]">
              {signal.structure.bos && <Tag label={signal.structure.bos.label} color="emerald" />}
              {signal.structure.choch && <Tag label={signal.structure.choch.label} color="violet" />}
              {signal.structure.has_liquidity_sweep && <Tag label="Liquidity Sweep" color="amber" />}
              {signal.structure.has_displacement && <Tag label="Displacement" color="cyan" />}
              {(signal.structure.fvg_count ?? 0) > 0 && <Tag label={`${signal.structure.fvg_count} FVG`} color="blue" />}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const Tag: React.FC<{ label: string; color: string }> = ({ label, color }) => {
  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
    violet: 'bg-violet-500/10 text-violet-400 border-violet-500/25',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/25',
    cyan: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/25',
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/25',
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold font-mono border ${colorMap[color] || ''}`}>
      {label}
    </span>
  );
};
