import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { api } from '../services/api';
import { SessionState } from '../types';
import {
  Volume2,
  VolumeX,
  User as UserIcon,
  Clock,
  Keyboard,
  Sun,
  Moon,
  Bell,
  Cpu,
  Layers,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';

function useClock() {
  const [timeUtc, setTimeUtc] = useState('');
  const [timeLocal, setTimeLocal] = useState('');

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTimeUtc(
        now.toLocaleTimeString('en-GB', {
          timeZone: 'UTC',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })
      );
      setTimeLocal(
        now.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return { timeUtc, timeLocal };
}

export const Navbar: React.FC = () => {
  const {
    providerHealth,
    soundEnabled,
    toggleSound,
    darkMode,
    toggleDarkMode,
    user,
    setActiveTab,
    setShortcutsOpen,
    quotes,
  } = useAppStore();

  const { timeUtc, timeLocal } = useClock();
  const [sessionState, setSessionState] = useState<SessionState | null>(null);
  const [lastQuoteTime, setLastQuoteTime] = useState<number>(Date.now());
  const [secondsAgo, setSecondsAgo] = useState(0);

  // Fetch session state
  useEffect(() => {
    api.getSessionState().then(setSessionState).catch(() => {});
    const interval = setInterval(() => {
      api.getSessionState().then(setSessionState).catch(() => {});
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Track quote update time
  useEffect(() => {
    setLastQuoteTime(Date.now());
  }, [quotes]);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsAgo(Math.max(0, Math.floor((Date.now() - lastQuoteTime) / 1000)));
    }, 1000);
    return () => clearInterval(timer);
  }, [lastQuoteTime]);

  const activeSessionName = sessionState?.primary_session?.name || 'LONDON / NY OVERLAP';
  const nextSession = sessionState?.next_session;

  return (
    <header className="h-[64px] bg-[#070b16]/90 backdrop-blur-2xl border-b border-white/[0.08] sticky top-0 z-40 flex items-center shadow-[0_4px_30px_rgba(0,0,0,0.4)]">
      <div className="max-w-[1720px] w-full mx-auto flex items-center justify-between gap-3 px-3 sm:px-5 lg:px-6">
        {/* ── Brand & Navigation ── */}
        <div className="flex items-center gap-3 shrink-0">
          <a
            href="/"
            title="Return to Landing Page"
            className="px-2.5 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-slate-300 hover:text-white text-xs font-mono font-semibold transition-all flex items-center gap-1.5 shrink-0"
          >
            <span>←</span>
            <span className="hidden sm:inline">Landing</span>
          </a>

          <div
            onClick={() => setActiveTab('dashboard')}
            className="flex items-center gap-2.5 cursor-pointer group shrink-0"
          >
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-mono font-black text-sm shadow-md shadow-cyan-500/20">
              PA
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm sm:text-base font-black tracking-tight text-white font-mono leading-none">
                  PIPS ATTENDANT
                </span>
                <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-cyan-500/10 border border-cyan-500/25 text-cyan-400 uppercase tracking-widest hidden sm:inline">
                  TERMINAL
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                Institutional Confluence Scanner
              </p>
            </div>
          </div>
        </div>

        {/* ── Center Session & Clock Status ── */}
        <div className="hidden lg:flex items-center gap-3 shrink-0 font-mono text-xs">
          {/* Active Session Pill */}
          <div className="flex items-center gap-2 bg-[#0a1122] border border-white/10 px-3 py-1.5 rounded-xl shadow-inner">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-slate-400 text-[10px] uppercase font-bold">Session:</span>
            <span className="text-emerald-400 font-bold uppercase">{activeSessionName}</span>
            {nextSession && nextSession.countdown_label && (
              <span className="text-slate-500 text-[10px] border-l border-white/10 pl-2">
                {nextSession.name} in {Math.round(nextSession.minutes_to_open / 60)}h
              </span>
            )}
          </div>

          {/* Dual Clock (Local & UTC) */}
          <div className="flex items-center gap-2 bg-[#0a1122] border border-white/10 px-3 py-1.5 rounded-xl shadow-inner text-slate-300">
            <Clock size={12} className="text-cyan-400" />
            <span className="text-[10px] text-slate-400">UTC</span>
            <span className="text-white font-bold tabular-nums">{timeUtc}</span>
            <span className="text-slate-600">·</span>
            <span className="text-[10px] text-slate-400">LOC</span>
            <span className="text-cyan-300 font-bold tabular-nums">{timeLocal}</span>
          </div>

          {/* Connection Status & Last Update */}
          <div className="flex items-center gap-2 bg-[#0a1122] border border-white/10 px-3 py-1.5 rounded-xl shadow-inner text-[11px]">
            <span className={`w-1.5 h-1.5 rounded-full ${providerHealth?.is_live ? 'bg-emerald-400' : 'bg-cyan-400'}`} />
            <span className="text-slate-300 font-bold">
              {providerHealth?.is_live ? 'LIVE FEED' : 'SIMULATED'}
            </span>
            <span className="text-slate-500 border-l border-white/10 pl-2 text-[10px]">
              {secondsAgo < 5 ? 'Just now' : `${secondsAgo}s ago`}
            </span>
          </div>
        </div>

        {/* ── Right Controls ── */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Sound Mute/Unmute */}
          <button
            onClick={toggleSound}
            title={soundEnabled ? 'Mute Alert Audio' : 'Unmute Alert Audio'}
            className={`p-2 rounded-xl border transition-all ${
              soundEnabled
                ? 'bg-cyan-500/15 border-cyan-500/35 text-cyan-300'
                : 'bg-[#0a1122] border-white/10 text-slate-400 hover:text-white'
            }`}
          >
            {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
          </button>

          {/* Dark / Light Mode Toggle */}
          <button
            onClick={toggleDarkMode}
            title={darkMode ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
            className="p-2 rounded-xl border bg-[#0a1122] border-white/10 text-slate-400 hover:text-cyan-300 hover:border-cyan-400/40 transition-all"
          >
            {darkMode ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          {/* Keyboard Shortcuts (?) */}
          <button
            onClick={() => setShortcutsOpen(true)}
            title="Keyboard Shortcuts (?)"
            className="hidden sm:flex p-2 rounded-xl border bg-[#0a1122] border-white/10 text-slate-400 hover:text-cyan-300 hover:border-cyan-400/40 transition-all"
          >
            <Keyboard size={15} />
          </button>

          {/* User Account Button */}
          <button
            onClick={() => setActiveTab('profile')}
            className="flex items-center gap-2 bg-[#0a1122] hover:bg-[#101b33] border border-white/10 hover:border-cyan-400/40 text-slate-200 px-3 py-1.5 rounded-xl text-xs font-mono font-semibold transition-all shadow-sm"
          >
            <UserIcon size={14} className="text-cyan-400 shrink-0" />
            <span className="max-w-[100px] truncate hidden sm:inline">
              {user ? (user.full_name || user.email) : 'Account'}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
};
