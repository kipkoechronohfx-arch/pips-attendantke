import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { api } from '../services/api';
import { EconomicEvent } from '../types';
import {
  CalendarDays,
  AlertTriangle,
  Clock,
  Filter,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Minus,
  Globe,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';

const COMMON_TIMEZONES = [
  { id: 'Africa/Nairobi', label: 'Nairobi (EAT, UTC+3)' },
  { id: 'UTC', label: 'Coordinated Universal Time (UTC)' },
  { id: 'Europe/London', label: 'London (GMT/BST)' },
  { id: 'America/New_York', label: 'New York (EST/EDT)' },
  { id: 'Asia/Tokyo', label: 'Tokyo (JST, UTC+9)' },
  { id: 'Australia/Sydney', label: 'Sydney (AEST, UTC+10)' },
];

export const CalendarPage: React.FC = () => {
  const { userTimezone, setUserTimezone } = useAppStore();
  const [events, setEvents] = useState<EconomicEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [dayFilter, setDayFilter] = useState<'ALL' | 'TODAY' | 'TOMORROW' | 'WEEK'>('WEEK');
  const [impactFilter, setImpactFilter] = useState('ALL');
  const [currencyFilter, setCurrencyFilter] = useState('ALL');
  const [selectedTz, setSelectedTz] = useState(userTimezone || 'Africa/Nairobi');

  const loadCalendar = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getCalendar(selectedTz, currencyFilter, impactFilter);
      if (Array.isArray(data)) {
        setEvents(data);
      }
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  }, [selectedTz, currencyFilter, impactFilter]);

  useEffect(() => {
    loadCalendar();
    const timer = setInterval(loadCalendar, 60000);
    return () => clearInterval(timer);
  }, [loadCalendar]);

  const handleTzChange = (newTz: string) => {
    setSelectedTz(newTz);
    setUserTimezone(newTz);
  };

  // Find if any high impact event is within 30 minutes
  const activeBlackoutEvent = useMemo(() => {
    const now = Date.now();
    return events.find((ev) => {
      if (ev.impact !== 'HIGH') return false;
      try {
        const evTime = new Date(ev.scheduled_time_utc).getTime();
        const diffMins = Math.abs(evTime - now) / 60000;
        return diffMins <= 30;
      } catch {
        return false;
      }
    });
  }, [events]);

  // Filtered by horizon
  const filteredEvents = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const tomorrow = new Date(now.getTime() + 86400000);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    return events.filter((ev) => {
      if (dayFilter === 'TODAY') {
        return ev.scheduled_time_utc.startsWith(todayStr);
      }
      if (dayFilter === 'TOMORROW') {
        return ev.scheduled_time_utc.startsWith(tomorrowStr);
      }
      return true;
    });
  }, [events, dayFilter]);

  return (
    <div className="space-y-6 page-enter font-sans">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#0a101f] border border-white/[0.08] rounded-2xl p-4 sm:p-5 shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400">
              <CalendarDays size={18} />
            </div>
            <div>
              <h1 className="text-xl font-black font-mono tracking-tight text-white flex items-center gap-2">
                Macroeconomic Calendar Desk
                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/25 uppercase">
                  Institutional
                </span>
              </h1>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Central Bank Rate Announcements, Inflation Metrics, Labor Prints &amp; Algorithmic Blackout Gate Integration
              </p>
            </div>
          </div>
        </div>

        {/* Timezone & Refresh Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Timezone selector */}
          <div className="flex items-center gap-1.5 bg-black/40 border border-white/10 rounded-xl px-2.5 py-1.5 font-mono text-xs">
            <Globe size={13} className="text-cyan-400 shrink-0" />
            <select
              value={selectedTz}
              onChange={(e) => handleTzChange(e.target.value)}
              className="bg-transparent text-slate-200 focus:outline-none cursor-pointer text-xs"
            >
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz.id} value={tz.id} className="bg-[#0a101f] text-white">
                  {tz.label}
                </option>
              ))}
            </select>
          </div>

          {/* Refresh button */}
          <button
            onClick={loadCalendar}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/35 text-cyan-300 text-xs font-mono font-bold transition-all disabled:opacity-50"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            <span>{loading ? 'Refreshing…' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* ── Active News Blackout Warning Banner ── */}
      {activeBlackoutEvent && (
        <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/35 flex items-start gap-3 text-xs font-mono text-amber-200 shadow-xl animate-pulse">
          <ShieldAlert size={18} className="text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-bold text-amber-300 block text-sm">
              High-Impact News Blackout Window Active
            </span>
            <p className="text-amber-200/90 leading-relaxed text-xs">
              <strong>{activeBlackoutEvent.event_name} ({activeBlackoutEvent.currency})</strong> is scheduled near current window. The precision entry engine is actively halting new market entries on affected instruments until volatility subsides.
            </p>
          </div>
        </div>
      )}

      {/* ── Filter Toolbar ── */}
      <div className="bg-[#0a101f] border border-white/[0.08] rounded-2xl p-4 space-y-3 font-mono text-xs shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Day Horizon Tabs */}
          <div className="flex rounded-xl bg-black/40 border border-white/10 p-0.5">
            {[
              { id: 'WEEK', label: 'Full Week' },
              { id: 'TODAY', label: 'Today' },
              { id: 'TOMORROW', label: 'Tomorrow' },
              { id: 'ALL', label: 'All Events' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setDayFilter(tab.id as any)}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                  dayFilter === tab.id
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/35 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Impact Selector */}
          <div className="flex rounded-xl bg-black/40 border border-white/10 p-0.5">
            {['ALL', 'HIGH', 'MEDIUM'].map((imp) => (
              <button
                key={imp}
                onClick={() => setImpactFilter(imp)}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                  impactFilter === imp
                    ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {imp === 'ALL' ? 'All Impacts' : `${imp} Impact`}
              </button>
            ))}
          </div>
        </div>

        {/* Currency Quick-Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 border-t border-white/[0.05] no-scrollbar">
          <span className="text-[10px] text-slate-500 uppercase font-bold mr-1 shrink-0">
            Currency:
          </span>
          {['ALL', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF'].map((curr) => (
            <button
              key={curr}
              onClick={() => setCurrencyFilter(curr)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all shrink-0 ${
                currencyFilter === curr
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/35'
                  : 'bg-black/30 text-slate-400 hover:text-slate-200 border border-white/5'
              }`}
            >
              {curr}
            </button>
          ))}
          <div className="ml-auto text-[11px] text-slate-400 shrink-0">
            <strong className="text-white">{filteredEvents.length}</strong> events scheduled
          </div>
        </div>
      </div>

      {/* ── Economic Events Table ── */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#070c18] overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs font-mono">
            <thead>
              <tr className="border-b border-white/[0.08] bg-[#0b1224] text-[10px] text-slate-400 uppercase tracking-wider select-none">
                <th className="py-3 px-4">Scheduled Release</th>
                <th className="py-3 px-3">Currency</th>
                <th className="py-3 px-3">Impact</th>
                <th className="py-3 px-4">Macro Event</th>
                <th className="py-3 px-3 text-center">Forecast</th>
                <th className="py-3 px-3 text-center">Previous</th>
                <th className="py-3 px-4 text-right">Actual Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {filteredEvents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500 font-mono text-xs">
                    No economic releases scheduled matching current filters.
                  </td>
                </tr>
              ) : (
                filteredEvents.map((ev) => {
                  const isHigh = ev.impact === 'HIGH';
                  const isReleased = ev.status === 'RELEASED';
                  const isBullish = ev.surprise_sentiment === 'BULLISH';
                  const isBearish = ev.surprise_sentiment === 'BEARISH';
                  const isUpcoming = !isReleased && ev.minutes_until != null && ev.minutes_until > 0 && ev.minutes_until <= 60;

                  return (
                    <tr
                      key={ev.id}
                      className="hover:bg-white/[0.03] transition-colors group"
                    >
                      {/* Scheduled Time */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Clock size={12} className={isUpcoming ? 'text-amber-400 animate-pulse' : 'text-cyan-400'} />
                          <div>
                            <span className="font-bold text-slate-200 block">
                              {ev.scheduled_time_local || 'Scheduled'}
                            </span>
                            {isUpcoming && (
                              <span className="text-[10px] text-amber-400 font-bold block">
                                In {ev.minutes_until} mins
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Currency */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded bg-black/40 text-slate-200 border border-white/10 font-bold text-xs">
                          {ev.currency}
                        </span>
                      </td>

                      {/* Impact */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[9px] font-bold border ${
                            isHigh
                              ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                              : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                          }`}
                        >
                          {ev.impact}
                        </span>
                      </td>

                      {/* Event Title */}
                      <td className="py-3 px-4">
                        <span className="font-bold text-slate-200 group-hover:text-cyan-300 transition-colors block">
                          {ev.event_name}
                        </span>
                        <span className="text-[10px] text-slate-500 block">
                          {ev.country}
                        </span>
                      </td>

                      {/* Forecast */}
                      <td className="py-3 px-3 text-center whitespace-nowrap text-slate-300">
                        {ev.forecast || '—'}
                      </td>

                      {/* Previous */}
                      <td className="py-3 px-3 text-center whitespace-nowrap text-slate-400">
                        {ev.previous || '—'}
                      </td>

                      {/* Actual Outcome */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {isReleased && ev.actual ? (
                          <div className="inline-flex items-center gap-1.5 font-bold">
                            <span
                              className={`text-sm ${
                                isBullish
                                  ? 'text-emerald-400'
                                  : isBearish
                                  ? 'text-rose-400'
                                  : 'text-slate-200'
                              }`}
                            >
                              {ev.actual}
                            </span>
                            {isBullish && (
                              <span className="px-1.5 py-0.2 rounded text-[8px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center">
                                <TrendingUp size={9} className="mr-0.5" /> BEAT
                              </span>
                            )}
                            {isBearish && (
                              <span className="px-1.5 py-0.2 rounded text-[8px] bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center">
                                <TrendingDown size={9} className="mr-0.5" /> MISS
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-500 italic">
                            Pending
                          </span>
                        )}
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
