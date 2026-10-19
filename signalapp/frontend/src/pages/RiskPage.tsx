import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { api } from '../services/api';
import { Calculator, ShieldAlert, DollarSign, Percent, Scale, Check } from 'lucide-react';

export const RiskPage: React.FC = () => {
  const { selectedSymbol, quotes } = useAppStore();
  const currentQuote = quotes[selectedSymbol];

  const [balance, setBalance] = useState<number>(10000);
  const [riskPct, setRiskPct] = useState<number>(1.0);
  const [symbol, setSymbol] = useState<string>(selectedSymbol || 'EUR/USD');
  const [entryPrice, setEntryPrice] = useState<number>(currentQuote?.mid || 1.08500);
  const [stopLoss, setStopLoss] = useState<number>(1.08200);
  const [takeProfit, setTakeProfit] = useState<number>(1.09100);
  const [leverage, setLeverage] = useState<number>(100);

  const [calcResult, setCalcResult] = useState<any>(null);

  // Sync quote when symbol changes
  useEffect(() => {
    if (quotes[symbol]) {
      const q = quotes[symbol];
      setEntryPrice(q.mid);
      const isJpy = symbol.includes('JPY');
      const isGold = symbol.includes('XAU');
      const pipDist = isJpy ? 0.30 : isGold ? 10.0 : 0.0030;
      setStopLoss(Number((q.mid - pipDist).toFixed(isJpy ? 3 : isGold ? 2 : 5)));
      setTakeProfit(Number((q.mid + (pipDist * 2)).toFixed(isJpy ? 3 : isGold ? 2 : 5)));
    }
  }, [symbol, quotes]);

  // Recalculate position
  useEffect(() => {
    if (balance > 0 && riskPct > 0 && entryPrice > 0 && stopLoss > 0) {
      api.calculateRisk({
        account_balance: balance,
        account_currency: 'USD',
        risk_percentage: riskPct,
        symbol: symbol,
        entry_price: entryPrice,
        stop_loss_price: stopLoss,
        take_profit_price: takeProfit,
        leverage: leverage
      }).then(res => setCalcResult(res)).catch(() => {});
    }
  }, [balance, riskPct, symbol, entryPrice, stopLoss, takeProfit, leverage]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h2 className="text-2xl font-black tracking-tight text-slate-100 flex items-center gap-2">
          <Calculator size={24} className="text-cyan-400" />
          <span>Institutional Position Size & Risk Calculator</span>
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Precision lot sizing, contract units, and margin estimation based on instrument pip specifications
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Input Parameters (7 cols) */}
        <div className="lg:col-span-7 glass-card-premium rounded-2xl p-6 shadow-xl space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-slate-100 uppercase tracking-wider font-mono">
              Position Parameters
            </h3>
            <span className="text-[10px] font-bold text-cyan-400 bg-cyan-500/10 border border-cyan-500/25 px-2 py-0.5 rounded-full">
              INTERBANK SPEC
            </span>
          </div>

          {/* Balance Presets */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-400">Account Balance (USD)</label>
              <span className="text-xs font-mono font-bold text-slate-200">${balance.toLocaleString()}</span>
            </div>
            <div className="grid grid-cols-5 gap-1.5 mb-2.5">
              {[5000, 10000, 25000, 50000, 100000].map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBalance(b)}
                  className={`py-1.5 rounded-lg text-[11px] font-mono font-bold transition-all ${
                    balance === b
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                      : 'bg-[#050914] text-slate-400 hover:text-slate-200 border border-white/5'
                  }`}
                >
                  ${b >= 1000 ? `${b / 1000}k` : b}
                </button>
              ))}
            </div>
            <input
              type="number"
              value={balance}
              onChange={(e) => setBalance(Number(e.target.value))}
              className="w-full bg-[#050914] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm font-mono text-slate-100 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Risk Percentage */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-400">Risk per Trade (%)</label>
                <span className="text-xs font-mono font-bold text-cyan-400">{riskPct}%</span>
              </div>
              <div className="flex gap-1.5">
                {[0.5, 1.0, 1.5, 2.0, 3.0].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setRiskPct(pct)}
                    className={`flex-1 py-2 rounded-xl text-xs font-mono font-bold transition-all ${
                      riskPct === pct
                        ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 shadow-sm'
                        : 'bg-[#050914] text-slate-400 hover:text-slate-200 border border-white/5'
                    }`}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>

            {/* Leverage */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                Account Leverage
              </label>
              <select
                value={leverage}
                onChange={(e) => setLeverage(Number(e.target.value))}
                className="w-full bg-[#050914] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-cyan-500"
              >
                <option value={30}>1:30 (Tier-1 Regulated)</option>
                <option value={50}>1:50</option>
                <option value={100}>1:100 (Standard Desk)</option>
                <option value={200}>1:200</option>
                <option value={500}>1:500</option>
              </select>
            </div>

            {/* Instrument */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                Instrument
              </label>
              <select
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="w-full bg-[#050914] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold text-slate-100 focus:outline-none focus:border-cyan-500"
              >
                {Object.keys(quotes).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Entry Price */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                Entry Price
              </label>
              <input
                type="number"
                step="any"
                value={entryPrice}
                onChange={(e) => setEntryPrice(Number(e.target.value))}
                className="w-full bg-[#050914] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm font-mono text-cyan-400 focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* Stop Loss */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                Stop Loss Price
              </label>
              <input
                type="number"
                step="any"
                value={stopLoss}
                onChange={(e) => setStopLoss(Number(e.target.value))}
                className="w-full bg-[#050914] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm font-mono text-rose-400 focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* Take Profit */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                Take Profit Price
              </label>
              <input
                type="number"
                step="any"
                value={takeProfit}
                onChange={(e) => setTakeProfit(Number(e.target.value))}
                className="w-full bg-[#050914] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm font-mono text-emerald-400 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>
        </div>

        {/* Results Box (5 cols) */}
        <div className="lg:col-span-5 glass-card-premium rounded-2xl p-6 shadow-2xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-400 font-mono">
                Order Ticket Output
              </span>
              <span className="text-[10px] font-bold text-slate-500 font-mono">
                Formula v2.4
              </span>
            </div>

            {/* Hero Lot Size */}
            <div className="my-4 text-center py-5 bg-[#030612]/90 rounded-2xl border border-white/[0.08] relative overflow-hidden">
              <span className="text-xs text-slate-400 block font-sans font-medium">Recommended Position Size</span>
              <div className="text-4xl lg:text-5xl font-black font-mono text-emerald-400 mt-1 shadow-sm tabular-nums">
                {calcResult?.recommended_standard_lots ?? '0.00'} <span className="text-lg font-bold text-slate-400">Lots</span>
              </div>
              <span className="text-xs font-mono text-slate-400 mt-1 block">
                {calcResult?.units_contract_size?.toLocaleString() ?? 0} Contract Units
              </span>
            </div>

            {/* Sub Stats Grid */}
            <div className="grid grid-cols-2 gap-3 font-mono text-xs">
              <div className="bg-[#050914] border border-white/[0.07] rounded-xl p-3">
                <span className="text-[10px] text-slate-500 uppercase block font-sans font-bold">Planned Risk</span>
                <span className="text-base font-bold text-rose-400 tabular-nums">
                  ${calcResult?.planned_risk_amount?.toFixed(2) ?? '0.00'}
                </span>
              </div>

              <div className="bg-[#050914] border border-white/[0.07] rounded-xl p-3">
                <span className="text-[10px] text-slate-500 uppercase block font-sans font-bold">Stop Distance</span>
                <span className="text-base font-bold text-slate-100 tabular-nums">
                  {calcResult?.stop_loss_pips ?? 0} pips
                </span>
              </div>

              <div className="bg-[#050914] border border-white/[0.07] rounded-xl p-3">
                <span className="text-[10px] text-slate-500 uppercase block font-sans font-bold">Pip Value</span>
                <span className="text-base font-bold text-cyan-400 tabular-nums">
                  ${calcResult?.pip_value_standard_lot?.toFixed(2) ?? '10.00'} / lot
                </span>
              </div>

              <div className="bg-[#050914] border border-white/[0.07] rounded-xl p-3">
                <span className="text-[10px] text-slate-500 uppercase block font-sans font-bold">Required Margin</span>
                <span className="text-base font-bold text-purple-400 tabular-nums">
                  ${calcResult?.estimated_margin_required?.toFixed(2) ?? '0.00'}
                </span>
              </div>
            </div>

            {calcResult?.risk_reward_ratio && (
              <div className="mt-4 p-3.5 bg-emerald-500/[0.08] border border-emerald-500/25 rounded-xl text-xs flex items-center justify-between">
                <span className="text-slate-300 font-sans font-semibold">Target Profit @ TP1:</span>
                <span className="font-mono font-bold text-emerald-400 text-sm">
                  +${calcResult.potential_profit_amount?.toFixed(2)} (1:{calcResult.risk_reward_ratio})
                </span>
              </div>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-white/[0.08] text-[11px] text-slate-400 leading-relaxed flex items-center gap-2">
            <ShieldAlert size={16} className="text-amber-400 shrink-0" />
            <span>Risk rule: Never risk &gt; 2% on any single trade setup to maintain statistical survival.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
