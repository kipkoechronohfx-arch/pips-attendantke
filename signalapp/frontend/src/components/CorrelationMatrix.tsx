import React, { useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';

// Static forex correlation matrix (historical 3-month rolling, major pairs)
const PAIRS = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'AUD/USD', 'NZD/USD', 'USD/CAD', 'XAU/USD'];

// Pre-computed approximate correlation coefficients (range -1 to +1)
const CORR: Record<string, Record<string, number>> = {
  'EUR/USD': { 'EUR/USD': 1.00, 'GBP/USD': 0.82, 'USD/JPY': -0.71, 'USD/CHF': -0.92, 'AUD/USD': 0.68, 'NZD/USD': 0.64, 'USD/CAD': -0.61, 'XAU/USD': 0.55 },
  'GBP/USD': { 'EUR/USD': 0.82, 'GBP/USD': 1.00, 'USD/JPY': -0.58, 'USD/CHF': -0.78, 'AUD/USD': 0.74, 'NZD/USD': 0.70, 'USD/CAD': -0.55, 'XAU/USD': 0.48 },
  'USD/JPY': { 'EUR/USD': -0.71, 'GBP/USD': -0.58, 'USD/JPY': 1.00, 'USD/CHF': 0.62, 'AUD/USD': -0.52, 'NZD/USD': -0.48, 'USD/CAD': 0.45, 'XAU/USD': -0.40 },
  'USD/CHF': { 'EUR/USD': -0.92, 'GBP/USD': -0.78, 'USD/JPY': 0.62, 'USD/CHF': 1.00, 'AUD/USD': -0.65, 'NZD/USD': -0.60, 'USD/CAD': 0.58, 'XAU/USD': -0.51 },
  'AUD/USD': { 'EUR/USD': 0.68, 'GBP/USD': 0.74, 'USD/JPY': -0.52, 'USD/CHF': -0.65, 'AUD/USD': 1.00, 'NZD/USD': 0.88, 'USD/CAD': -0.72, 'XAU/USD': 0.62 },
  'NZD/USD': { 'EUR/USD': 0.64, 'GBP/USD': 0.70, 'USD/JPY': -0.48, 'USD/CHF': -0.60, 'AUD/USD': 0.88, 'NZD/USD': 1.00, 'USD/CAD': -0.68, 'XAU/USD': 0.57 },
  'USD/CAD': { 'EUR/USD': -0.61, 'GBP/USD': -0.55, 'USD/JPY': 0.45, 'USD/CHF': 0.58, 'AUD/USD': -0.72, 'NZD/USD': -0.68, 'USD/CAD': 1.00, 'XAU/USD': -0.42 },
  'XAU/USD': { 'EUR/USD': 0.55, 'GBP/USD': 0.48, 'USD/JPY': -0.40, 'USD/CHF': -0.51, 'AUD/USD': 0.62, 'NZD/USD': 0.57, 'USD/CAD': -0.42, 'XAU/USD': 1.00 },
};

function corrColor(v: number): string {
  if (v === 1.00) return '#1e293b'; // diagonal
  if (v >= 0.8)  return 'rgba(16,185,129,0.35)';
  if (v >= 0.5)  return 'rgba(16,185,129,0.18)';
  if (v >= 0.2)  return 'rgba(16,185,129,0.07)';
  if (v >= -0.2) return 'rgba(100,116,139,0.1)';
  if (v >= -0.5) return 'rgba(244,63,94,0.07)';
  if (v >= -0.8) return 'rgba(244,63,94,0.18)';
  return 'rgba(244,63,94,0.35)';
}
function corrText(v: number): string {
  if (v === 1.00) return '#475569';
  if (Math.abs(v) >= 0.5) return v > 0 ? '#10b981' : '#f43f5e';
  return '#64748b';
}

export const CorrelationMatrix: React.FC = () => {
  const { setSelectedSymbol, setActiveTab } = useAppStore();

  return (
    <div className="bg-[#0d1628] border border-white/[0.07] rounded-2xl p-4 sm:p-5 min-w-0 overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-extrabold text-slate-100">Pair Correlation Matrix</h3>
          <p className="text-[10px] text-slate-500 mt-0.5">3-month rolling · Values near ±1 indicate strong correlation</p>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-mono">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-emerald-500/30 inline-block" /> +Strong</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-slate-600/40 inline-block" /> Neutral</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-rose-500/30 inline-block" /> −Strong</span>
        </div>
      </div>

      <div className="overflow-x-auto no-scrollbar">
        <table className="text-[10px] font-mono border-collapse w-full min-w-[500px]">
          <thead>
            <tr>
              <th className="text-left text-slate-600 pr-2 pb-2 w-20" />
              {PAIRS.map((p) => (
                <th key={p} className="text-slate-500 pb-2 px-1 text-center whitespace-nowrap font-bold" style={{ minWidth: 60 }}>
                  {p.replace('/', '')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PAIRS.map((row) => (
              <tr key={row}>
                <td
                  className="text-slate-400 font-bold pr-3 py-1 cursor-pointer hover:text-cyan-400 transition-colors whitespace-nowrap"
                  onClick={() => { setSelectedSymbol(row); setActiveTab('charts'); }}
                >
                  {row}
                </td>
                {PAIRS.map((col) => {
                  const v = CORR[row]?.[col] ?? 0;
                  return (
                    <td
                      key={col}
                      className="text-center py-1 px-1 rounded transition-all"
                      style={{
                        backgroundColor: corrColor(v),
                        color: corrText(v),
                        fontWeight: Math.abs(v) >= 0.7 ? '700' : '500',
                      }}
                    >
                      {v === 1.00 ? '—' : v.toFixed(2)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
