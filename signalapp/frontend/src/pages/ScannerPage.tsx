import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { MarketScannerTable } from '../components/MarketScannerTable';
import { api } from '../services/api';
import { SessionState } from '../types';
import {
  Cpu,
  Clock,
  Activity,
  Layers,
  Sparkles,
  ShieldCheck,
  Zap,
} from 'lucide-react';

export const ScannerPage: React.FC = () => {
  const { quotes, signals } = useAppStore();
  const [sessionState, setSessionState] = useState<SessionState | null>(null);

  useEffect(() => {
    api.getSessionState().then(setSessionState).catch(() => {});
    const timer = setInterval(() => {
      api.getSessionState().then(setSessionState).catch(() => {});
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const primarySession = sessionState?.primary_session;
  const quoteCount = Object.keys(quotes).length;
  const confirmedCount = signals.filter((s) => s.status === 'ACTIVE').length;

  return (
    <div className="space-y-6 page-enter">
      {/* ── Page Header & Session Ribbon ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#0a101f] border border-white/[0.08] rounded-2xl p-4 sm:p-5 shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400">
              <Cpu size={18} />
            </div>
            <div>
              <h1 className="text-xl font-black font-mono tracking-tight text-white flex items-center gap-2">
                Market Scanner Desk
                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 uppercase">
                  Live Confluence
                </span>
              </h1>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Deterministic 3-Stage Pipeline: Context Filter → Setup Discovery → 11 Hard-Gate Checks
              </p>
            </div>
          </div>
        </div>

        {/* Live Session Status Pill */}
        <div className="flex items-center gap-3">
          <div className="bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 flex items-center gap-2.5 font-mono text-xs">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <div>
              <span className="text-[10px] text-slate-400 block uppercase">Active Window</span>
              <span className="text-emerald-300 font-bold">
                {primarySession ? primarySession.name : 'LONDON / NY OVERLAP'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Market Scanner Table ── */}
      <MarketScannerTable />
    </div>
  );
};
