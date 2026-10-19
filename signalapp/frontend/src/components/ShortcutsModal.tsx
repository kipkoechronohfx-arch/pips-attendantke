import React, { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { Keyboard, X, ArrowLeftRight, Volume2, Shield } from 'lucide-react';

const SHORTCUT_LIST = [
  { key: 'D', desc: 'Overview Dashboard' },
  { key: 'S', desc: 'Live Trading Signals' },
  { key: 'C', desc: 'TradingView Market Charts' },
  { key: 'N', desc: 'Financial Market News' },
  { key: 'E', desc: 'Economic Calendar' },
  { key: 'R', desc: 'Position Sizing & Risk Calculator' },
  { key: 'H', desc: 'Signal Audit History & CSV' },
  { key: 'W', desc: 'Watchlist & Price Alerts' },
  { key: 'A', desc: 'Admin Broadcast Desk' },
  { key: 'P', desc: 'Account Profile & Preferences' },
  { key: '?', desc: 'Toggle This Shortcuts Guide' },
  { key: 'Esc', desc: 'Dismiss Active Modal / Overlay' },
];

export const ShortcutsModal: React.FC = () => {
  const { shortcutsOpen, setShortcutsOpen } = useAppStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && shortcutsOpen) {
        setShortcutsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcutsOpen, setShortcutsOpen]);

  if (!shortcutsOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="w-full max-w-lg bg-[#0a101f] border border-cyan-500/30 rounded-2xl shadow-2xl overflow-hidden page-enter"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08] bg-[#070c18]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <Keyboard size={18} />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-100">Keyboard Shortcuts</h3>
              <p className="text-[11px] text-slate-400 font-sans">Power-user keybindings for ultra-fast terminal navigation</p>
            </div>
          </div>
          <button
            onClick={() => setShortcutsOpen(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.05] transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* Shortcut Grid */}
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto">
          {SHORTCUT_LIST.map(({ key, desc }) => (
            <div 
              key={key} 
              className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:border-cyan-500/30 transition-colors"
            >
              <span className="text-xs text-slate-300 font-sans">{desc}</span>
              <kbd className="px-2.5 py-1 rounded-md bg-[#040711] border border-cyan-500/40 text-cyan-400 font-mono text-[11px] font-bold shadow-inner">
                {key}
              </kbd>
            </div>
          ))}
        </div>

        {/* Mobile gestures note */}
        <div className="px-6 py-3.5 bg-[#050814] border-t border-white/[0.06] flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <ArrowLeftRight size={14} className="text-cyan-400" />
            <span>Mobile gesture: Swipe left / right to cycle tabs</span>
          </div>
          <button
            onClick={() => setShortcutsOpen(false)}
            className="text-cyan-400 hover:text-cyan-300 font-semibold text-xs"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};
