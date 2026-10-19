import React, { useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { Download, X } from 'lucide-react';

export const PWAInstallBanner: React.FC = () => {
  const { pwaPrompt, setPwaPrompt } = useAppStore();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setPwaPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [setPwaPrompt]);

  const handleInstall = async () => {
    if (!pwaPrompt) return;
    pwaPrompt.prompt();
    const result = await pwaPrompt.userChoice;
    if (result.outcome === 'accepted') setPwaPrompt(null);
  };

  if (!pwaPrompt || dismissed) return null;

  return (
    <div className="fixed bottom-20 md:bottom-6 left-4 z-[9998] max-w-xs toast-enter">
      <div className="flex items-center gap-3 bg-[#0a1020]/96 backdrop-blur-xl border border-cyan-500/25 rounded-2xl p-4 shadow-2xl">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/10 border border-cyan-500/25 flex items-center justify-center shrink-0">
          <Download size={16} className="text-cyan-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-bold text-slate-100">Install Forex Signal Pro</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Add to home screen for instant access</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleInstall}
            className="px-2.5 py-1.5 rounded-lg bg-cyan-500/15 text-cyan-400 text-[11px] font-bold border border-cyan-500/25 hover:bg-cyan-500/25 transition-all"
          >
            Install
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="p-1 text-slate-600 hover:text-slate-400 transition-colors"
          >
            <X size={13} />
          </button>
        </div>
      </div>
    </div>
  );
};
