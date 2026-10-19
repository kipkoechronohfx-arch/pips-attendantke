import React, { useState, useEffect, useCallback } from 'react';
import {
  Link2, PlusCircle, Wifi, WifiOff, Trash2, RefreshCw,
  ShieldCheck, Eye, EyeOff, ChevronDown, CheckCircle2,
  AlertTriangle, Loader2, Settings2, ToggleLeft, ToggleRight,
  Server, Lock, TrendingUp, Zap
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { api } from '../services/api';
import { MT5Account, BrokerListItem } from '../types';
import { ExecutionLogPanel } from '../components/ExecutionLogPanel';

// ─── Status Badge Component ────────────────────────────────────────────────
const StatusBadge: React.FC<{ status: MT5Account['status'] }> = ({ status }) => {
  const cfg = {
    CONNECTED: { cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30', icon: <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block mr-1" />, label: 'Live Connected' },
    PENDING:   { cls: 'text-amber-400  bg-amber-500/10  border-amber-500/30',  icon: <Loader2 size={10} className="animate-spin inline mr-1" />, label: 'Connecting...' },
    ERROR:     { cls: 'text-rose-400   bg-rose-500/10   border-rose-500/30',   icon: <AlertTriangle size={10} className="inline mr-1" />, label: 'Error' },
    DISCONNECTED: { cls: 'text-slate-400 bg-slate-800/60 border-white/5', icon: <WifiOff size={10} className="inline mr-1" />, label: 'Inactive' },
  };
  const c = cfg[status] || cfg.DISCONNECTED;
  return (
    <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border ${c.cls}`}>
      {c.icon}{c.label}
    </span>
  );
};

// ─── Connected Account Card ────────────────────────────────────────────────
const AccountCard: React.FC<{
  acc: MT5Account;
  onToggle: (id: number, active: boolean) => void;
  onTest: (id: number) => void;
  onRemove: (id: number) => void;
  onRiskChange: (id: number, pct: number) => void;
  testing: boolean;
}> = ({ acc, onToggle, onTest, onRemove, onRiskChange, testing }) => {
  const [showSettings, setShowSettings] = useState(false);
  const [localRisk, setLocalRisk] = useState(acc.risk_percent);

  return (
    <div className={`rounded-2xl border p-5 transition-all duration-300 ${
      acc.status === 'CONNECTED' && acc.is_active
        ? 'bg-[#060d1a] border-emerald-500/20 shadow-lg shadow-emerald-500/5'
        : 'bg-[#060d1a] border-white/[0.07]'
    }`}>
      {/* Header Row */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            acc.status === 'CONNECTED' && acc.is_active
              ? 'bg-emerald-500/15 border border-emerald-500/25'
              : 'bg-white/[0.04] border border-white/[0.07]'
          }`}>
            <Server size={18} className={acc.status === 'CONNECTED' && acc.is_active ? 'text-emerald-400' : 'text-slate-500'} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-black text-slate-100 truncate">{acc.nickname || acc.broker_name}</div>
            <div className="text-[11px] text-slate-400 font-mono truncate">
              {acc.broker_name} · Login: <span className="text-slate-300">****{acc.mt5_login.slice(-4)}</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5 truncate">{acc.mt5_server}</div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <StatusBadge status={acc.status} />
          {/* Toggle Active */}
          <button onClick={() => onToggle(acc.id, !acc.is_active)} className="text-slate-400 hover:text-slate-200 transition-colors" title={acc.is_active ? 'Pause auto-trading' : 'Enable auto-trading'}>
            {acc.is_active ? <ToggleRight size={22} className="text-emerald-400" /> : <ToggleLeft size={22} className="text-slate-500" />}
          </button>
        </div>
      </div>

      {/* Equity / Balance Row */}
      {acc.last_equity != null && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="bg-[#0a1528] rounded-xl p-2.5 text-center border border-white/[0.05]">
            <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-0.5">Equity</div>
            <div className="text-xs font-black font-mono text-cyan-400">${acc.last_equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
          <div className="bg-[#0a1528] rounded-xl p-2.5 text-center border border-white/[0.05]">
            <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-0.5">Balance</div>
            <div className="text-xs font-black font-mono text-slate-200">${(acc.last_balance ?? acc.last_equity).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
          <div className="bg-[#0a1528] rounded-xl p-2.5 text-center border border-white/[0.05]">
            <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-0.5">Risk/Trade</div>
            <div className="text-xs font-black font-mono text-amber-400">{acc.risk_percent}%</div>
          </div>
        </div>
      )}

      {/* Error Message */}
      {acc.error_message && acc.status === 'ERROR' && (
        <div className="mb-3 text-[10px] text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
          ⚠️ {acc.error_message}
        </div>
      )}

      {/* Expandable Risk Settings */}
      <button
        onClick={() => setShowSettings(s => !s)}
        className="flex items-center gap-1.5 text-[10px] text-slate-500 hover:text-slate-300 transition-colors mb-2"
      >
        <Settings2 size={11} /><span>Settings</span>
        <ChevronDown size={11} className={`transition-transform ${showSettings ? 'rotate-180' : ''}`} />
      </button>
      {showSettings && (
        <div className="bg-[#030812] rounded-xl p-3 border border-white/[0.05] mb-3 space-y-3 animate-in slide-in-from-top-1 duration-150">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] text-slate-400 font-semibold">Risk % per Trade</span>
              <span className="text-[10px] font-mono font-bold text-amber-400">{localRisk}%</span>
            </div>
            <div className="flex gap-1 mb-2">
              {[0.5, 1.0, 1.5, 2.0, 3.0].map(r => (
                <button
                  key={r}
                  onClick={() => setLocalRisk(r)}
                  className={`flex-1 py-1 rounded text-[9px] font-mono font-bold transition-all ${
                    localRisk === r ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-white/[0.03] text-slate-500 hover:text-slate-300'
                  }`}
                >{r}%</button>
              ))}
            </div>
            <input
              type="range" min={0.1} max={5} step={0.1}
              value={localRisk}
              onChange={e => setLocalRisk(Number(e.target.value))}
              className="w-full accent-amber-400"
            />
          </div>
          <button
            onClick={() => { onRiskChange(acc.id, localRisk); setShowSettings(false); }}
            className="w-full py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/25 text-[10px] font-bold transition-all"
          >
            Save Settings
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onTest(acc.id)}
          disabled={testing}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/25 text-[10px] font-bold transition-all disabled:opacity-50"
        >
          {testing ? <Loader2 size={11} className="animate-spin" /> : <Wifi size={11} />}
          <span>Test Connection</span>
        </button>
        <button
          onClick={() => onRemove(acc.id)}
          className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-all"
          title="Remove account"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
};

// ─── Add Account Modal ─────────────────────────────────────────────────────
const AddAccountModal: React.FC<{
  brokers: BrokerListItem[];
  onClose: () => void;
  onAdded: (acc: MT5Account) => void;
}> = ({ brokers, onClose, onAdded }) => {
  const { user } = useAppStore();
  const [form, setForm] = useState({
    client_email: user?.email || '',
    nickname: '',
    broker_name: '',
    mt5_server: '',
    mt5_login: '',
    mt5_password: '',
    risk_percent: 1.0,
    auto_breakeven: true,
  });
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<1|2>(1);

  const selectedBroker = brokers.find(b => b.name === form.broker_name);
  const availableServers = selectedBroker?.servers || [];

  const handleSubmit = async () => {
    if (!form.client_email || !form.broker_name || !form.mt5_server || !form.mt5_login || !form.mt5_password) {
      setError('Please fill in all required fields.');
      return;
    }
    setLoading(true); setError('');
    try {
      const acc = await api.addVaultAccount(form);
      onAdded(acc);
    } catch (e: any) {
      setError(e.message || 'Failed to connect account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-[#060d1a] border border-white/[0.1] rounded-3xl shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border-b border-white/[0.07] px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/15 border border-cyan-500/25 flex items-center justify-center">
              <Link2 size={18} className="text-cyan-400" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-100">Link MT5 Broker Account</h3>
              <p className="text-[11px] text-slate-400">Auto-execute signals into your broker in 1-click</p>
            </div>
            <button onClick={onClose} className="ml-auto text-slate-500 hover:text-slate-300 text-xl leading-none">&times;</button>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-2 mt-4">
            {[1, 2].map(s => (
              <React.Fragment key={s}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black transition-all ${
                  step === s ? 'bg-cyan-500 text-white' : s < step ? 'bg-emerald-500 text-white' : 'bg-white/[0.05] text-slate-500'
                }`}>{s < step ? '✓' : s}</div>
                {s < 2 && <div className={`flex-1 h-0.5 rounded transition-all ${s < step ? 'bg-cyan-500' : 'bg-white/10'}`} />}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Modal Body */}
        <div className="px-6 py-5 space-y-4 max-h-[65vh] overflow-y-auto">
          {step === 1 && (
            <>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Your Email *</label>
                <input
                  type="email"
                  placeholder="you@email.com"
                  value={form.client_email}
                  onChange={e => setForm(f => ({ ...f, client_email: e.target.value }))}
                  className="w-full bg-[#030812] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500/60 transition-all"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Broker *</label>
                <div className="relative">
                  <select
                    value={form.broker_name}
                    onChange={e => setForm(f => ({ ...f, broker_name: e.target.value, mt5_server: '' }))}
                    className="w-full bg-[#030812] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-cyan-500/60 appearance-none cursor-pointer"
                  >
                    <option value="">Select your broker...</option>
                    {brokers.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                </div>
              </div>
              {availableServers.length > 0 && (
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">MT5 Server *</label>
                  <div className="relative">
                    <select
                      value={form.mt5_server}
                      onChange={e => setForm(f => ({ ...f, mt5_server: e.target.value }))}
                      className="w-full bg-[#030812] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-cyan-500/60 appearance-none cursor-pointer"
                    >
                      <option value="">Select server...</option>
                      {availableServers.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                  </div>
                </div>
              )}
              {(form.broker_name === 'Other / Manual' || availableServers.length === 0) && form.broker_name && (
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">MT5 Server (Manual) *</label>
                  <input
                    type="text"
                    placeholder="e.g. Exness-MT5Real6"
                    value={form.mt5_server}
                    onChange={e => setForm(f => ({ ...f, mt5_server: e.target.value }))}
                    className="w-full bg-[#030812] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500/60 transition-all"
                  />
                </div>
              )}
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Account Nickname (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. My FTMO Challenge"
                  value={form.nickname}
                  onChange={e => setForm(f => ({ ...f, nickname: e.target.value }))}
                  className="w-full bg-[#030812] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500/60 transition-all"
                />
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="text-[11px] text-slate-400 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex items-start gap-2">
                <ShieldCheck size={14} className="text-amber-400 shrink-0 mt-0.5" />
                <span>Your password is encrypted with AES-256 before storage. We never have access to your trading account in plain text.</span>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">MT5 Account Number (Login) *</label>
                <input
                  type="text"
                  placeholder="e.g. 83920194"
                  value={form.mt5_login}
                  onChange={e => setForm(f => ({ ...f, mt5_login: e.target.value }))}
                  className="w-full bg-[#030812] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500/60 transition-all font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">MT5 Password *</label>
                <div className="relative">
                  <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type={showPass ? 'text' : 'password'}
                    placeholder="Investor or Master password"
                    value={form.mt5_password}
                    onChange={e => setForm(f => ({ ...f, mt5_password: e.target.value }))}
                    className="w-full bg-[#030812] border border-white/10 rounded-xl pl-9 pr-10 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500/60 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              {/* Risk slider */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Risk Per Signal</label>
                  <span className="text-xs font-black font-mono text-amber-400">{form.risk_percent}%</span>
                </div>
                <div className="flex gap-1.5 mb-2">
                  {[0.5, 1.0, 1.5, 2.0].map(r => (
                    <button
                      key={r}
                      onClick={() => setForm(f => ({ ...f, risk_percent: r }))}
                      className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                        form.risk_percent === r ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-white/[0.03] text-slate-500 hover:text-slate-300'
                      }`}
                    >{r}%</button>
                  ))}
                </div>
                <input
                  type="range" min={0.1} max={5} step={0.1}
                  value={form.risk_percent}
                  onChange={e => setForm(f => ({ ...f, risk_percent: Number(e.target.value) }))}
                  className="w-full accent-amber-400"
                />
                <div className="text-[9px] text-slate-500 mt-1">
                  Recommended: 1–2%. Never risk more than 2% of capital per signal.
                </div>
              </div>

              {/* Breakeven toggle */}
              <div className="flex items-center justify-between bg-[#030812] border border-white/[0.06] rounded-xl px-4 py-3">
                <div>
                  <div className="text-xs font-bold text-slate-200">Auto Breakeven on TP1</div>
                  <div className="text-[10px] text-slate-500">Move Stop Loss to entry when TP1 is hit</div>
                </div>
                <button onClick={() => setForm(f => ({ ...f, auto_breakeven: !f.auto_breakeven }))} className="ml-4">
                  {form.auto_breakeven
                    ? <ToggleRight size={26} className="text-emerald-400" />
                    : <ToggleLeft size={26} className="text-slate-600" />
                  }
                </button>
              </div>
            </>
          )}

          {error && (
            <div className="text-[11px] text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2 flex items-center gap-2">
              <AlertTriangle size={12} /> {error}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 pb-6 pt-2 flex gap-3">
          {step === 2 && (
            <button
              onClick={() => setStep(1)}
              className="flex-1 py-3 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 text-sm font-bold transition-all border border-white/[0.07]"
            >
              ← Back
            </button>
          )}
          <button
            onClick={step === 1 ? () => { if (!form.broker_name || !form.mt5_server) { setError('Please select a broker and server.'); return; } setError(''); setStep(2); } : handleSubmit}
            disabled={loading}
            className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-sm font-black shadow-lg shadow-cyan-500/20 transition-all active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : null}
            {step === 1 ? 'Continue →' : loading ? 'Connecting...' : '🔗 Connect Account'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Main Broker Vault Page ────────────────────────────────────────────────
export const BrokerVaultPage: React.FC = () => {
  const { addToast, user } = useAppStore();
  const [accounts, setAccounts] = useState<MT5Account[]>([]);
  const [brokers, setBrokers] = useState<BrokerListItem[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const [accs, bks] = await Promise.all([
        api.getVaultAccounts(user?.email),
        api.getBrokers()
      ]);
      setAccounts(accs);
      setBrokers(bks);
    } catch {}
    setLoading(false);
  }, [user?.email]);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  const handleAdded = (acc: MT5Account) => {
    setAccounts(prev => [acc, ...prev]);
    setShowModal(false);
    addToast('Account Added!', `${acc.broker_name} linked — testing connection...`, 'success');
    // Auto-run test immediately
    setTimeout(() => handleTest(acc.id), 500);
  };

  const handleToggle = async (id: number, active: boolean) => {
    const updated = await api.updateVaultAccount(id, { is_active: active });
    setAccounts(prev => prev.map(a => a.id === id ? updated : a));
    addToast(active ? 'Auto-Trading Enabled' : 'Auto-Trading Paused', `Account ${active ? 'is now receiving signals.' : 'paused.'}`, active ? 'success' : 'alert');
  };

  const handleTest = async (id: number) => {
    setTestingId(id);
    try {
      const updated = await api.testVaultConnection(id);
      setAccounts(prev => prev.map(a => a.id === id ? updated : a));
      addToast(
        updated.status === 'CONNECTED' ? '✅ Connected!' : '❌ Connection Failed',
        updated.status === 'CONNECTED'
          ? `${updated.broker_name} live. Equity: $${updated.last_equity?.toLocaleString()}`
          : updated.error_message || 'Check your credentials.',
        updated.status === 'CONNECTED' ? 'success' : 'error'
      );
    } catch { addToast('Test Failed', 'Could not reach broker.', 'error'); }
    finally { setTestingId(null); }
  };

  const handleRemove = async (id: number) => {
    await api.removeVaultAccount(id);
    setAccounts(prev => prev.filter(a => a.id !== id));
    addToast('Account Removed', 'Broker account unlinked.', 'alert');
  };

  const handleRiskChange = async (id: number, pct: number) => {
    const updated = await api.updateVaultAccount(id, { risk_percent: pct });
    setAccounts(prev => prev.map(a => a.id === id ? updated : a));
    addToast('Settings Saved', `Risk updated to ${pct}% per trade.`, 'success');
  };

  const connectedCount = accounts.filter(a => a.status === 'CONNECTED' && a.is_active).length;
  const totalEquity = accounts.filter(a => a.last_equity).reduce((sum, a) => sum + (a.last_equity ?? 0), 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-2xl font-black tracking-tight text-slate-100 flex items-center gap-2">
              <Link2 size={24} className="text-cyan-400" />
              MT5 Broker Vault
            </h2>
            {connectedCount > 0 && (
              <span className="flex items-center gap-1 text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {connectedCount} Live
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Link your MT5 broker accounts — signals auto-execute on every connected account with your risk settings
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold shadow-lg shadow-cyan-500/20 transition-all hover:scale-[1.02] active:scale-[0.98] shrink-0"
        >
          <PlusCircle size={14} />
          Link New Broker
        </button>
      </div>

      {/* Summary KPI Row */}
      {accounts.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Connected Accounts', value: connectedCount, sub: `of ${accounts.length} total`, color: 'text-emerald-400', Icon: Wifi },
            { label: 'Combined Equity', value: `$${totalEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, sub: 'Across all live accounts', color: 'text-cyan-400', Icon: TrendingUp },
            { label: 'Auto-Trading', value: connectedCount > 0 ? 'ACTIVE' : 'STANDBY', sub: `${accounts.filter(a => a.auto_breakeven).length} with breakeven enabled`, color: connectedCount > 0 ? 'text-emerald-400' : 'text-slate-400', Icon: Zap },
          ].map(({ label, value, sub, color, Icon }) => (
            <div key={label} className="kpi-card rounded-2xl p-4 border border-white/[0.07] bg-[#060d1a]">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{label}</span>
                <Icon size={13} className={color} />
              </div>
              <div className={`text-xl font-black font-mono ${color}`}>{value}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* Accounts Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1,2,3].map(i => (
            <div key={i} className="rounded-2xl border border-white/[0.06] bg-[#060d1a] p-5 h-48 animate-pulse" />
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center space-y-4">
          <div className="w-20 h-20 rounded-3xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
            <Link2 size={32} className="text-cyan-400/60" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-200 mb-2">No Broker Accounts Linked Yet</h3>
            <p className="text-sm text-slate-400 max-w-sm">
              Connect your MT5 broker account to start receiving automatic trade execution on every signal. No manual intervention needed.
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="mt-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-sm font-bold shadow-lg shadow-cyan-500/20 transition-all hover:scale-[1.02]"
          >
            + Link My First Broker
          </button>

          {/* How it works */}
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl text-left">
            {[
              { step: '01', icon: Lock, title: 'Enter Credentials', desc: 'Input your broker login securely. Encrypted before storage.' },
              { step: '02', icon: Wifi, title: 'One-Click Connect', desc: 'We verify your account and establish a live cloud trading session.' },
              { step: '03', icon: Zap, title: 'Auto-Execute', desc: 'Every signal fires into your MT5 account automatically with dynamic lot sizing.' },
            ].map(({ step, icon: Icon, title, desc }) => (
              <div key={step} className="bg-[#060d1a] border border-white/[0.06] rounded-2xl p-4">
                <div className="text-[10px] font-black text-cyan-500/60 font-mono mb-2">{step}</div>
                <Icon size={16} className="text-cyan-400 mb-2" />
                <div className="text-xs font-bold text-slate-200 mb-1">{title}</div>
                <div className="text-[11px] text-slate-500">{desc}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {accounts.map(acc => (
            <AccountCard
              key={acc.id}
              acc={acc}
              onToggle={handleToggle}
              onTest={handleTest}
              onRemove={handleRemove}
              onRiskChange={handleRiskChange}
              testing={testingId === acc.id}
            />
          ))}
        </div>
      )}

      {showModal && (
        <AddAccountModal
          brokers={brokers}
          onClose={() => setShowModal(false)}
          onAdded={handleAdded}
        />
      )}

      {/* Execution Log — full width below account cards */}
      {accounts.length > 0 && (
        <div className="mt-2">
          <ExecutionLogPanel />
        </div>
      )}
    </div>
  );
};
