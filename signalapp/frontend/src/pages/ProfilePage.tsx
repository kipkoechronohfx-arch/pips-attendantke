import React, { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { api } from '../services/api';
import { UserCircle, Lock, Mail, Globe, Shield, LogOut, CheckCircle } from 'lucide-react';

export const ProfilePage: React.FC = () => {
  const { user, setUser, addToast } = useAppStore();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [timezone, setTimezone] = useState('Africa/Nairobi');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isLogin) {
        const res = await api.login({ email, password });
        setUser({
          id: 1,
          email: res.email,
          full_name: res.full_name || 'Member',
          role: res.role as any,
          timezone: 'Africa/Nairobi',
          account_currency: 'USD',
          is_active: true,
          is_verified: true,
          created_at: new Date().toISOString()
        });
        addToast('Authentication Success', `Welcome back, ${res.full_name || res.email}!`, 'success');
      } else {
        await api.register({ email, password, full_name: fullName, timezone });
        const res = await api.login({ email, password });
        setUser({
          id: 2,
          email: res.email,
          full_name: fullName,
          role: 'USER',
          timezone: timezone,
          account_currency: 'USD',
          is_active: true,
          is_verified: true,
          created_at: new Date().toISOString()
        });
        addToast('Account Created', 'Successfully registered and authenticated!', 'success');
      }
    } catch (err: any) {
      addToast('Auth Failed', err.message || 'Could not verify credentials', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    api.logout();
    setUser(null);
    addToast('Logged Out', 'You have been signed out safely', 'alert');
  };

  if (user) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in duration-300">
        <div className="glass-card-premium rounded-2xl p-6 shadow-xl">
          <div className="flex items-center justify-between pb-6 border-b border-white/5">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20">
                <UserCircle size={32} />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-100">{user.full_name || 'Trader'}</h3>
                <span className="text-xs text-slate-400 font-mono">{user.email}</span>
              </div>
            </div>

            <span className="text-xs font-bold px-3 py-1 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
              {user.role}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-6 font-mono text-xs">
            <div className="bg-[#060913] p-3.5 rounded-xl border border-white/5">
              <span className="text-[10px] text-slate-500 uppercase block font-sans">Primary Timezone</span>
              <span className="text-slate-200 font-bold mt-1 block flex items-center gap-1.5">
                <Globe size={13} className="text-cyan-400" />
                {user.timezone} (EAT)
              </span>
            </div>

            <div className="bg-[#060913] p-3.5 rounded-xl border border-white/5">
              <span className="text-[10px] text-slate-500 uppercase block font-sans">Account Currency</span>
              <span className="text-slate-200 font-bold mt-1 block text-emerald-400">
                USD ($)
              </span>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold transition-all"
          >
            <LogOut size={15} />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-6 animate-in fade-in duration-300">
      <div className="glass-card-premium rounded-2xl p-6 shadow-xl">
        <div className="flex bg-[#060913] p-1 rounded-xl mb-6 border border-white/5">
          <button
            onClick={() => setIsLogin(true)}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
              isLogin ? 'bg-[#1e293b] text-cyan-400 shadow-sm' : 'text-slate-400'
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => setIsLogin(false)}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
              !isLogin ? 'bg-[#1e293b] text-cyan-400 shadow-sm' : 'text-slate-400'
            }`}
          >
            Create Account
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Full Name</label>
              <input
                type="text"
                required
                placeholder="e.g. John Doe"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full bg-[#060913] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-400"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">Email Address</label>
            <input
              type="email"
              required
              placeholder="trader@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[#060913] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-400"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">Password</label>
            <input
              type="password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#060913] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-400"
            />
          </div>

          {!isLogin && (
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Timezone</label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full bg-[#060913] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-amber-400"
              >
                <option value="Africa/Nairobi">Africa/Nairobi (EAT, UTC+3)</option>
                <option value="UTC">UTC (Universal)</option>
                <option value="Europe/London">Europe/London (GMT/BST)</option>
                <option value="America/New_York">America/New_York (EST/EDT)</option>
              </select>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/20 transition-all mt-2 cursor-pointer"
          >
            {loading ? 'Processing...' : isLogin ? 'Sign In to Terminal' : 'Create Trader Account'}
          </button>
        </form>
      </div>
    </div>
  );
};
