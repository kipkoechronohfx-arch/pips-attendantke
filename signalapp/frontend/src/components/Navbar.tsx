import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { Volume2, VolumeX, User as UserIcon, Clock, Keyboard } from 'lucide-react';

function useEATClock() {
  const [time, setTime] = useState('');
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const eat = new Intl.DateTimeFormat('en-KE', {
        timeZone: 'Africa/Nairobi',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(now);
      setTime(eat);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

export const Navbar: React.FC = () => {
  const { providerHealth, soundEnabled, toggleSound, user, setActiveTab, setShortcutsOpen } = useAppStore();
  const eatTime = useEATClock();

  return (
    <header className="h-[68px] bg-black/35 backdrop-blur-2xl border-b border-white/[0.08] sticky top-0 z-50 flex items-center shadow-[0_4px_30px_rgba(0,0,0,0.4)]">
      <div className="max-w-[1680px] w-full mx-auto flex items-center justify-between gap-3 px-3 sm:px-5 lg:px-6">
        {/* ── Brand & Back to Home ─────────────────────── */}
        <div className="flex items-center gap-3 shrink-0">
          <a
            href="/"
            title="Return to Pips Attendant Home"
            className="px-2.5 py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.10] border border-white/10 hover:border-amber-400/40 text-slate-300 hover:text-white text-xs font-semibold transition-all flex items-center gap-1.5 shrink-0 shadow-sm"
          >
            <span>←</span>
            <span className="hidden sm:inline">Pips Attendant</span>
          </a>

          <div
            onClick={() => setActiveTab('dashboard')}
            className="flex items-center gap-3 cursor-pointer group shrink-0"
          >
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-[16px] sm:text-[18px] font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-100 to-amber-200 leading-none">
                  Signal Center
                </h1>
                <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 tracking-wider uppercase flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live Desk
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5 tracking-wide flex items-center gap-1.5">
                <span className="hidden xl:inline">Institutional Quantitative Confluence &amp; Market Intelligence</span>
                <span className="hidden sm:inline xl:hidden">Live Interbank Execution</span>
              </p>
            </div>
          </div>
        </div>

        {/* ── Center Status ─────────────────────────────── */}
        <div className="hidden xl:flex items-center gap-2.5 shrink-0">
          {/* Live / Simulated badge */}
          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] sm:text-[11px] font-mono font-bold tracking-wider uppercase border transition-all ${
            providerHealth?.is_live
              ? 'bg-emerald-500/[0.08] border-emerald-500/30 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
              : 'bg-amber-500/[0.08] border-amber-500/25 text-amber-400'
          }`}>
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                providerHealth?.is_live ? 'bg-emerald-400' : 'bg-amber-400'
              }`} />
              <span className={`relative inline-flex rounded-full h-2 w-2 ${
                providerHealth?.is_live ? 'bg-emerald-500' : 'bg-amber-500'
              }`} />
            </span>
            <span>{providerHealth?.is_live ? 'OANDA LIVE INTERBANK' : 'SIMULATED ENGINE'}</span>
            {providerHealth?.latency_ms ? (
              <span className="text-[9px] text-slate-400 font-mono border-l border-white/10 pl-2">
                {providerHealth.latency_ms}ms
              </span>
            ) : null}
          </div>

          {/* EAT Live Clock */}
          <div className="hidden xl:flex items-center gap-1.5 bg-black/40 border border-white/[0.09] px-3 py-1.5 rounded-xl text-[11px] font-mono shadow-inner">
            <Clock size={12} className="text-amber-400" />
            <span className="text-slate-400 font-bold text-[10px]">EAT</span>
            <span className="text-amber-300 font-bold tabular-nums tracking-widest">{eatTime}</span>
          </div>
        </div>

        {/* ── Right Controls ────────────────────────────── */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Sound Toggle */}
          <button
            onClick={toggleSound}
            title={soundEnabled ? 'Mute Alert Audio' : 'Unmute Alert Audio'}
            className={`p-2 rounded-xl border transition-all duration-200 cursor-pointer ${
              soundEnabled
                ? 'bg-amber-500/10 border-amber-500/35 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.18)] hover:bg-amber-500/20'
                : 'bg-[#090f1d] border-white/[0.08] text-slate-400 hover:text-slate-200 hover:border-white/20'
            }`}
          >
            {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
          </button>

          {/* Keyboard Shortcuts Cheat Sheet */}
          <button
            onClick={() => setShortcutsOpen(true)}
            title="Keyboard Shortcuts (?)"
            className="hidden sm:flex p-2 rounded-xl border bg-[#090f1d] border-white/[0.08] text-slate-400 hover:text-amber-300 hover:border-amber-400/35 hover:bg-amber-400/[0.05] transition-all duration-200 cursor-pointer"
          >
            <Keyboard size={15} />
          </button>

          {/* User / Auth Button */}
          <button
            onClick={() => setActiveTab('profile')}
            className="flex items-center gap-2 bg-[#090f1d] hover:bg-[#101b33] border border-white/[0.09] hover:border-amber-400/40 text-slate-200 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200 shadow-sm shrink-0"
          >
            <UserIcon size={14} className="text-amber-400 shrink-0" />
            <span className="max-w-[120px] truncate">
              {user ? (user.full_name || user.email) : 'Account'}
            </span>
            {user?.role && user.role !== 'USER' && (
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/25 tracking-wider uppercase shrink-0">
                {user.role}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
