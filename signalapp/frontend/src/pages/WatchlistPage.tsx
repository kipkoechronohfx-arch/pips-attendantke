import React, { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { api } from '../services/api';
import { soundFx } from '../services/audio';
import { Bell, Plus, Trash2, ArrowUpRight, ArrowDownRight, CheckCircle } from 'lucide-react';

interface LocalAlert {
  id: string;
  symbol: string;
  targetPrice: number;
  condition: 'ABOVE' | 'BELOW';
  status: 'ACTIVE' | 'TRIGGERED';
}

export const WatchlistPage: React.FC = () => {
  const { quotes, addToast } = useAppStore();
  const [alerts, setAlerts] = useState<LocalAlert[]>([
    { id: '1', symbol: 'EUR/USD', targetPrice: 1.08800, condition: 'ABOVE', status: 'ACTIVE' },
    { id: '2', symbol: 'XAU/USD', targetPrice: 2660.00, condition: 'ABOVE', status: 'ACTIVE' },
    { id: '3', symbol: 'USD/JPY', targetPrice: 148.800, condition: 'BELOW', status: 'ACTIVE' }
  ]);

  const [symbol, setSymbol] = useState('EUR/USD');
  const [targetPrice, setTargetPrice] = useState<number>(1.08800);
  const [condition, setCondition] = useState<'ABOVE' | 'BELOW'>('ABOVE');

  const handleAddAlert = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetPrice || targetPrice <= 0) return;

    const newAlert: LocalAlert = {
      id: Math.random().toString(),
      symbol,
      targetPrice,
      condition,
      status: 'ACTIVE'
    };
    setAlerts([newAlert, ...alerts]);
    soundFx.playAlertBell();
    addToast('Price Alert Set', `Monitoring ${symbol} ${condition} ${targetPrice}`, 'success');
  };

  const handleDelete = (id: string) => {
    setAlerts(alerts.filter(a => a.id !== id));
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h2 className="text-2xl font-black tracking-tight text-slate-100 flex items-center gap-2">
          <Bell size={24} className="text-cyan-400" />
          <span>Watchlist & Live Price Alerts</span>
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Set instant audible & visual alerts triggered when market quotes touch your critical price levels
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Form to Set Price Alert (5 cols) */}
        <div className="lg:col-span-5 glass-card-premium rounded-2xl p-6 shadow-xl">
          <h3 className="text-sm font-extrabold text-slate-100 uppercase tracking-wider font-mono mb-4 flex items-center gap-2">
            <Plus size={16} className="text-cyan-400" />
            <span>Create New Price Alert</span>
          </h3>

          <form onSubmit={handleAddAlert} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Instrument</label>
              <select
                value={symbol}
                onChange={(e) => {
                  setSymbol(e.target.value);
                  const q = quotes[e.target.value];
                  if (q) setTargetPrice(q.mid);
                }}
                className="w-full bg-[#050914] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-cyan-500 font-bold"
              >
                {Object.keys(quotes).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Trigger Condition</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setCondition('ABOVE')}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all ${
                    condition === 'ABOVE'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm'
                      : 'bg-[#050914] text-slate-400 border border-white/5'
                  }`}
                >
                  <ArrowUpRight size={14} />
                  <span>Price &ge; Target</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCondition('BELOW')}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all ${
                    condition === 'BELOW'
                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 shadow-sm'
                      : 'bg-[#050914] text-slate-400 border border-white/5'
                  }`}
                >
                  <ArrowDownRight size={14} />
                  <span>Price &le; Target</span>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Target Price</label>
              <input
                type="number"
                step="any"
                value={targetPrice}
                onChange={(e) => setTargetPrice(Number(e.target.value))}
                className="w-full bg-[#050914] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm font-mono text-cyan-400 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs shadow-lg shadow-cyan-500/20 transition-all mt-2 hover:scale-[1.02] active:scale-[0.98]"
            >
              Activate Price Alert
            </button>
          </form>
        </div>

        {/* Active Alerts List (7 cols) */}
        <div className="lg:col-span-7 glass-card-premium rounded-2xl p-6 shadow-xl space-y-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-extrabold text-slate-100 uppercase tracking-wider font-mono">
              Active Alerts ({alerts.length})
            </h3>
            <span className="text-xs text-slate-400 font-mono">Audio &amp; Push Enabled</span>
          </div>

          <div className="space-y-2.5">
            {alerts.map((a) => {
              const currentMid = quotes[a.symbol]?.mid;
              return (
                <div
                  key={a.id}
                  className="bg-[#060913] border border-white/5 hover:border-white/15 rounded-xl p-3.5 flex items-center justify-between gap-3 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
                      <Bell size={16} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-100">{a.symbol}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          a.condition === 'ABOVE' ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10'
                        }`}>
                          {a.condition} {a.targetPrice}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400 font-mono">
                        Current: <strong className="text-slate-200">{currentMid ?? 'Streaming...'}</strong>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                      ACTIVE
                    </span>
                    <button
                      onClick={() => handleDelete(a.id)}
                      className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-white/5 transition-colors"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
