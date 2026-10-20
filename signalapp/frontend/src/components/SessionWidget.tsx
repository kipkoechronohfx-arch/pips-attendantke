import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../services/api';
import { SessionState } from '../types';
import { Clock, Globe, ChevronRight, Wifi, WifiOff } from 'lucide-react';

interface SessionWidgetProps {
  compact?: boolean;
}

export const SessionWidget: React.FC<SessionWidgetProps> = ({ compact = false }) => {
  const [session, setSession] = useState<SessionState | null>(null);
  const [entryAllowed, setEntryAllowed] = useState<{ allowed: boolean; reason: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const fetchSession = useCallback(async () => {
    try {
      const [s, e] = await Promise.all([api.getSessionState(), api.getEntryAllowed()]);
      setSession(s);
      setEntryAllowed(e);
    } catch {
      // silently retry
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSession();
    const pollInterval = setInterval(fetchSession, 60000); // refresh session every 60s
    const tickInterval = setInterval(() => setTick((t) => t + 1), 30000); // re-render countdown
    return () => {
      clearInterval(pollInterval);
      clearInterval(tickInterval);
    };
  }, [fetchSession]);

  if (loading) {
    return (
      <div className="glass-card-premium rounded-2xl p-4 animate-pulse">
        <div className="h-4 bg-white/5 rounded w-32 mb-2" />
        <div className="h-6 bg-white/5 rounded w-48" />
      </div>
    );
  }

  if (!session) return null;

  const primary = session.primary_session;
  const next = session.next_session;

  const sessionColorMap: Record<string, string> = {
    ASIAN: 'text-violet-400',
    LONDON: 'text-cyan-400',
    NEW_YORK: 'text-amber-400',
    OVERLAP: 'text-emerald-400',
  };

  const sessionBgMap: Record<string, string> = {
    ASIAN: 'bg-violet-500/10 border-violet-500/20',
    LONDON: 'bg-cyan-500/10 border-cyan-500/20',
    NEW_YORK: 'bg-amber-500/10 border-amber-500/20',
    OVERLAP: 'bg-emerald-500/10 border-emerald-500/20',
  };

  const sessionDotMap: Record<string, string> = {
    ASIAN: 'bg-violet-400',
    LONDON: 'bg-cyan-400',
    NEW_YORK: 'bg-amber-400',
    OVERLAP: 'bg-emerald-400',
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-xs font-mono">
        {primary?.is_active ? (
          <>
            <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${sessionDotMap[primary.id] || 'bg-emerald-400'}`} />
            <span className={`font-bold ${sessionColorMap[primary.id] || 'text-slate-300'}`}>
              {session.is_overlap ? 'LN-NY OVERLAP' : primary.name.toUpperCase()}
            </span>
            <span className="text-slate-500">·</span>
            <span className="text-slate-400">{primary.countdown_label} {primary.countdown}</span>
          </>
        ) : (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
            <span className="text-slate-500">
              Next: {next?.name} in {next?.countdown}
            </span>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="glass-card-premium rounded-2xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
          <Globe size={16} className="text-cyan-400" />
          Market Sessions
        </h3>
        <div className="flex items-center gap-1.5 text-[10px] font-mono">
          {entryAllowed?.allowed ? (
            <span className="flex items-center gap-1 text-emerald-400">
              <Wifi size={11} />
              Entry OK
            </span>
          ) : (
            <span className="flex items-center gap-1 text-rose-400">
              <WifiOff size={11} />
              {entryAllowed?.reason?.slice(0, 22) || 'Entry Restricted'}
            </span>
          )}
        </div>
      </div>

      {/* Primary Session */}
      {primary && (
        <div className={`rounded-xl p-3.5 border ${sessionBgMap[primary.id] || 'bg-slate-800 border-white/10'}`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${primary.is_active ? `animate-pulse ${sessionDotMap[primary.id]}` : 'bg-slate-600'}`}
              />
              <span className={`text-sm font-bold ${sessionColorMap[primary.id] || 'text-slate-300'}`}>
                {session.is_overlap ? '⚡ London–NY Overlap' : primary.name}
              </span>
              {session.is_overlap && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  PEAK LIQUIDITY
                </span>
              )}
            </div>
            <div className="text-right">
              <div className="text-[10px] text-slate-500 font-mono">{primary.countdown_label}</div>
              <div className={`text-sm font-bold font-mono ${sessionColorMap[primary.id]}`}>
                {primary.countdown}
              </div>
            </div>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">{primary.description}</p>
          {primary.priority_pairs && primary.priority_pairs.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {primary.priority_pairs.map((p) => (
                <span
                  key={p}
                  className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-[#060913] border border-white/10 text-slate-300"
                >
                  {p}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Session Grid */}
      <div className="grid grid-cols-3 gap-2">
        {session.all_sessions.map((sess) => (
          <div
            key={sess.id}
            className={`rounded-xl p-2.5 border text-center transition-all ${
              sess.is_active
                ? sessionBgMap[sess.id] || 'bg-emerald-500/10 border-emerald-500/20'
                : 'bg-[#060913] border-white/5 opacity-50'
            }`}
          >
            <div className="flex items-center justify-center gap-1 mb-1">
              <span
                className={`w-1.5 h-1.5 rounded-full ${sess.is_active ? `animate-pulse ${sessionDotMap[sess.id]}` : 'bg-slate-600'}`}
              />
              <span className={`text-[10px] font-bold ${sess.is_active ? sessionColorMap[sess.id] : 'text-slate-500'}`}>
                {sess.id === 'LONDON' ? 'London' : sess.id === 'NEW_YORK' ? 'New York' : 'Asian'}
              </span>
            </div>
            <div className="text-[9px] font-mono text-slate-500">
              {sess.open}–{sess.close}
            </div>
            <div className={`text-[10px] font-mono font-bold ${sess.is_active ? 'text-slate-200' : 'text-slate-600'}`}>
              {sess.local_time}
            </div>
          </div>
        ))}
      </div>

      {/* Next Session */}
      {next && !primary?.is_active && (
        <div className="flex items-center gap-2 text-xs text-slate-500 pt-2 border-t border-white/[0.06]">
          <Clock size={12} className="shrink-0" />
          <span>
            Next: <span className={`font-bold ${sessionColorMap[next.id] || 'text-slate-300'}`}>{next.name}</span>
          </span>
          <ChevronRight size={12} />
          <span className="font-mono">{next.countdown}</span>
        </div>
      )}
    </div>
  );
};
