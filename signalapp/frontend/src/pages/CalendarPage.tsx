import React, { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { CalendarDays, AlertTriangle, Clock, Filter, CheckCircle2 } from 'lucide-react';

export const CalendarPage: React.FC = () => {
  const { calendar } = useAppStore();
  const [impactFilter, setImpactFilter] = useState('ALL');
  const [currencyFilter, setCurrencyFilter] = useState('ALL');

  const filtered = calendar.filter((ev) => {
    const matchesImpact = impactFilter === 'ALL' || ev.impact === impactFilter;
    const matchesCurrency = currencyFilter === 'ALL' || ev.currency === currencyFilter;
    return matchesImpact && matchesCurrency;
  });

  return (
    <div className="space-y-6 page-enter">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-slate-100 flex items-center gap-2">
            <CalendarDays size={24} className="text-cyan-400" />
            <span>Economic Calendar</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Global market-moving macroeconomic releases synchronized to Nairobi (EAT) release sessions
          </p>
        </div>

        {/* Filter controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Currency Filter */}
          <div className="flex bg-[#0f172a] p-1 rounded-xl border border-white/5 text-xs font-semibold">
            {['ALL', 'USD', 'EUR', 'GBP', 'JPY', 'AUD'].map((curr) => (
              <button
                key={curr}
                onClick={() => setCurrencyFilter(curr)}
                className={`px-2.5 py-1 rounded-lg transition-all text-xs font-mono font-bold ${
                  currencyFilter === curr
                    ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {curr}
              </button>
            ))}
          </div>

          {/* Impact Filter */}
          <div className="flex bg-[#0f172a] p-1 rounded-xl border border-white/5 text-xs font-semibold">
            {['ALL', 'HIGH', 'MEDIUM'].map((imp) => (
              <button
                key={imp}
                onClick={() => setImpactFilter(imp)}
                className={`px-3 py-1 rounded-lg transition-all ${
                  impactFilter === imp 
                    ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-sm' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {imp} Impact
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Calendar Events Table */}
      <div className="glass-card-premium rounded-2xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="bg-[#050914] text-slate-400 border-b border-white/10 uppercase tracking-wider text-[11px] font-sans">
                <th className="py-3.5 px-4 font-bold">Scheduled (EAT)</th>
                <th className="py-3.5 px-4 font-bold">Currency</th>
                <th className="py-3.5 px-4 font-bold">Impact</th>
                <th className="py-3.5 px-4 font-bold">Event</th>
                <th className="py-3.5 px-4 font-bold">Forecast</th>
                <th className="py-3.5 px-4 font-bold">Previous</th>
                <th className="py-3.5 px-4 font-bold text-right">Actual</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500 font-sans">
                    No economic events matching current filters.
                  </td>
                </tr>
              ) : (
                filtered.map((ev) => {
                  const isHigh = ev.impact === 'HIGH';
                  const isReleased = ev.status === 'RELEASED' && ev.actual;
                  return (
                    <tr key={ev.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3.5 px-4 text-slate-300 font-semibold">
                        <div className="flex items-center gap-2">
                          <Clock size={13} className="text-cyan-400 shrink-0" />
                          <span className="tabular-nums text-slate-200 font-bold">{ev.scheduled_time_local || 'Scheduled Today'}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-extrabold text-slate-100 bg-[#060913] px-2.5 py-1 rounded-md border border-white/5">
                          {ev.currency}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          isHigh 
                            ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30' 
                            : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                        }`}>
                          {isHigh && <AlertTriangle size={10} />}
                          {ev.impact}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-sans font-bold text-slate-200">
                        {ev.event_name}
                      </td>
                      <td className="py-3.5 px-4 text-slate-300 font-mono">{ev.forecast || '—'}</td>
                      <td className="py-3.5 px-4 text-slate-400 font-mono">{ev.previous || '—'}</td>
                      <td className="py-3.5 px-4 text-right">
                        {isReleased ? (
                          <span className="inline-flex items-center gap-1 text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 rounded font-bold">
                            <CheckCircle2 size={11} />
                            <span>{ev.actual}</span>
                          </span>
                        ) : (
                          <span className="text-slate-500 font-semibold text-[11px] bg-white/[0.03] px-2 py-0.5 rounded border border-white/5">
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
