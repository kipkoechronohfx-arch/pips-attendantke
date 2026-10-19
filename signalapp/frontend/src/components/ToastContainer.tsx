import React from 'react';
import { useAppStore } from '../store/useAppStore';
import { CheckCircle2, AlertTriangle, AlertCircle, X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useAppStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-20 md:bottom-6 right-4 sm:right-6 z-[9999] flex flex-col gap-2.5 max-w-[340px] w-full pointer-events-none">
      {toasts.map((t) => {
        const styles = {
          success: 'border-emerald-500/30 border-l-[3px] border-l-emerald-500',
          alert:   'border-amber-500/30  border-l-[3px] border-l-amber-500',
          error:   'border-rose-500/30   border-l-[3px] border-l-rose-500',
        }[t.type] ?? 'border-white/10';

        const Icon = {
          success: CheckCircle2,
          alert:   AlertTriangle,
          error:   AlertCircle,
        }[t.type] ?? AlertCircle;

        const iconColor = {
          success: 'text-emerald-400',
          alert:   'text-amber-400',
          error:   'text-rose-400',
        }[t.type] ?? 'text-slate-400';

        return (
          <div
            key={t.id}
            className={`pointer-events-auto toast-enter flex items-start gap-3 p-4 rounded-2xl bg-[#0a1020]/96 backdrop-blur-xl border ${styles} shadow-[0_8px_32px_rgba(0,0,0,0.6)] text-slate-100`}
          >
            <Icon size={16} className={`${iconColor} shrink-0 mt-0.5`} />
            <div className="flex-1 min-w-0">
              <h4 className="text-[12px] font-bold font-sans text-slate-100 leading-tight">{t.title}</h4>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed font-sans">{t.message}</p>
            </div>
            <button
              onClick={() => removeToast(t.id)}
              className="text-slate-600 hover:text-slate-300 transition-colors p-0.5 shrink-0 mt-0.5"
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
