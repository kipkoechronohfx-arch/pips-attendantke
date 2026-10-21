import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { api } from '../services/api';
import { NewsArticle } from '../types';
import {
  ExternalLink,
  TrendingUp,
  TrendingDown,
  MinusCircle,
  Newspaper,
  RefreshCw,
  Search,
  Clock,
  Sparkles,
  Filter,
  CheckCircle2,
  Globe,
} from 'lucide-react';

export const NewsPage: React.FC = () => {
  const { news, setNews } = useAppStore();
  const [currencyFilter, setCurrencyFilter] = useState('ALL');
  const [sentimentFilter, setSentimentFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [nowSec, setNowSec] = useState<number>(Date.now());

  // Update relative time counter every 10 seconds
  useEffect(() => {
    const timer = setInterval(() => setNowSec(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const fresh = await api.getNews('ALL', true);
      if (Array.isArray(fresh) && fresh.length > 0) {
        setNews(fresh);
      }
      setLastRefreshed(new Date());
    } catch {
      // Keep existing cache on error
    } finally {
      setIsRefreshing(false);
    }
  }, [setNews]);

  // Initial fetch if empty
  useEffect(() => {
    if (!news || news.length === 0) {
      handleRefresh();
    }
  }, []);

  const filtered = useMemo(() => {
    return news.filter((item) => {
      // Currency match
      if (currencyFilter !== 'ALL') {
        const currencies = item.affected_currencies.split(',').map((c) => c.trim().toUpperCase());
        if (currencyFilter === 'METALS') {
          if (!currencies.includes('XAU') && !currencies.includes('XAG')) return false;
        } else if (!currencies.includes(currencyFilter)) {
          return false;
        }
      }

      // Sentiment match
      if (sentimentFilter !== 'ALL' && item.sentiment !== sentimentFilter) {
        return false;
      }

      // Search match
      if (search.trim()) {
        const q = search.toLowerCase();
        const inTitle = item.title.toLowerCase().includes(q);
        const inSummary = item.summary ? item.summary.toLowerCase().includes(q) : false;
        if (!inTitle && !inSummary) return false;
      }

      return true;
    });
  }, [news, currencyFilter, sentimentFilter, search]);

  const refreshAgo = Math.floor((nowSec - lastRefreshed.getTime()) / 1000);
  const refreshLabel = refreshAgo < 60 ? `${refreshAgo}s ago` : `${Math.floor(refreshAgo / 60)}m ago`;

  const formatElapsed = (dateStr: string) => {
    try {
      const dt = new Date(dateStr);
      const diffSec = Math.max(0, Math.floor((nowSec - dt.getTime()) / 1000));
      if (diffSec < 60) return `${diffSec}s ago`;
      const diffMins = Math.floor(diffSec / 60);
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      return `${Math.floor(diffHours / 24)}d ago`;
    } catch {
      return 'Recent';
    }
  };

  return (
    <div className="space-y-6 page-enter font-sans">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#0a101f] border border-white/[0.08] rounded-2xl p-4 sm:p-5 shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400">
              <Newspaper size={18} />
            </div>
            <div>
              <h1 className="text-xl font-black font-mono tracking-tight text-white flex items-center gap-2">
                Forex &amp; Macro Intelligence Wire
                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold font-mono bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 uppercase tracking-widest flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live Feed
                </span>
              </h1>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Real-Time Breaking Macroeconomic News · Algorithmic Sentiment Scoring &amp; Currency Exposure Tagging
              </p>
            </div>
          </div>
        </div>

        {/* Refresh & Last Updated Pill */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/35 text-cyan-300 text-xs font-mono font-bold transition-all disabled:opacity-50"
          >
            <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
            <span>{isRefreshing ? 'Fetching Live Wire…' : `Refresh (${refreshLabel})`}</span>
          </button>
        </div>
      </div>

      {/* ── Filters & Search Toolbar ── */}
      <div className="bg-[#0a101f] border border-white/[0.08] rounded-2xl p-4 space-y-3 font-mono shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Search bar */}
          <div className="relative min-w-[200px] max-w-sm flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Filter headlines (e.g. Fed, CPI, Lagarde)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-black/40 border border-white/10 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
            />
          </div>

          {/* Sentiment Filter Tabs */}
          <div className="flex rounded-xl bg-black/40 border border-white/10 p-0.5 text-xs">
            {(['ALL', 'BULLISH', 'BEARISH', 'NEUTRAL'] as const).map((sent) => (
              <button
                key={sent}
                onClick={() => setSentimentFilter(sent)}
                className={`px-3 py-1 rounded-lg font-bold transition-all ${
                  sentimentFilter === sent
                    ? sent === 'BULLISH'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/35 shadow-sm'
                      : sent === 'BEARISH'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/35 shadow-sm'
                      : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/35 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {sent}
              </button>
            ))}
          </div>
        </div>

        {/* Currency Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 border-t border-white/[0.05] no-scrollbar text-xs">
          <span className="text-[10px] text-slate-500 uppercase font-bold mr-1 shrink-0">
            Currencies:
          </span>
          {['ALL', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'XAU'].map((curr) => (
            <button
              key={curr}
              onClick={() => setCurrencyFilter(curr)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all shrink-0 ${
                currencyFilter === curr
                  ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-sm'
                  : 'bg-black/30 text-slate-400 hover:text-slate-200 border border-white/5'
              }`}
            >
              {curr}
            </button>
          ))}
          <div className="ml-auto text-[11px] text-slate-400 shrink-0">
            Showing <strong className="text-white">{filtered.length}</strong> of {news.length}
          </div>
        </div>
      </div>

      {/* ── News Articles Grid ── */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500 space-y-3 bg-[#0a101f] border border-white/[0.08] rounded-2xl font-mono text-xs">
          <Newspaper size={36} className="opacity-30 text-cyan-400" />
          <p className="text-slate-300 font-bold">No articles match your active filter.</p>
          <button
            onClick={() => {
              setSearch('');
              setCurrencyFilter('ALL');
              setSentimentFilter('ALL');
            }}
            className="px-3 py-1.5 rounded-xl bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/25 transition-all"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((item) => {
            const isBullish = item.sentiment === 'BULLISH';
            const isBearish = item.sentiment === 'BEARISH';
            const currencies = item.affected_currencies.split(',').map((c) => c.trim());

            return (
              <article
                key={item.id}
                className="p-4 sm:p-5 bg-[#0a101f] hover:bg-[#0e162a] border border-white/[0.08] hover:border-cyan-400/40 rounded-2xl transition-all shadow-lg flex flex-col justify-between space-y-3 group"
              >
                <div className="space-y-2.5">
                  {/* Top Meta Line */}
                  <div className="flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1">
                        <Globe size={11} className="text-cyan-400" />
                        {item.source}
                      </span>
                      <span className="text-slate-600">·</span>
                      <span className="text-[10px] text-slate-500 flex items-center gap-1">
                        <Clock size={10} />
                        {formatElapsed(item.published_at)}
                      </span>
                    </div>

                    {/* Sentiment Badge */}
                    <span
                      className={`px-2 py-0.5 rounded text-[9px] font-bold font-mono border flex items-center gap-1 ${
                        isBullish
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                          : isBearish
                          ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                          : 'bg-slate-700/30 text-slate-300 border-white/10'
                      }`}
                    >
                      {isBullish && <TrendingUp size={10} />}
                      {isBearish && <TrendingDown size={10} />}
                      {item.sentiment}
                    </span>
                  </div>

                  {/* Headline */}
                  <h3 className="text-sm font-bold text-slate-100 group-hover:text-cyan-300 transition-colors leading-snug">
                    <a href={item.url} target="_blank" rel="noopener noreferrer">
                      {item.title}
                    </a>
                  </h3>

                  {/* Summary */}
                  {item.summary && (
                    <p className="text-xs text-slate-400 leading-relaxed font-sans line-clamp-3">
                      {item.summary}
                    </p>
                  )}
                </div>

                {/* Footer: Currency Tags & External Link */}
                <div className="pt-3 border-t border-white/[0.05] flex items-center justify-between font-mono text-xs">
                  <div className="flex items-center gap-1 flex-wrap">
                    {currencies.map((curr) => (
                      <span
                        key={curr}
                        className="px-1.5 py-0.5 rounded bg-black/40 text-slate-300 border border-white/10 text-[10px] font-bold"
                      >
                        {curr}
                      </span>
                    ))}
                  </div>

                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 font-bold group-hover:translate-x-0.5 transition-transform"
                  >
                    <span>Read Wire</span>
                    <ExternalLink size={11} />
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
