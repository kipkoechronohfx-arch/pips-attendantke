import React, { useState } from 'react';
import { TradingSignal } from '../types';
import { useAppStore } from '../store/useAppStore';
import { ArrowUpRight, ArrowDownRight, Copy, Calculator, LineChart, ChevronDown, ChevronUp, CheckCircle2, XCircle, CheckCheck, Sparkles } from 'lucide-react';
import { soundFx } from '../services/audio';
import { notifService } from '../services/notifications';
import { api } from '../services/api';

interface SignalCardProps {
  signal: TradingSignal;
  /** Show admin win/loss outcome controls */
  showOutcomeControls?: boolean;
}

// MTF confluence labels — derived from single timeframe for demo
function getMTFBadges(tf: string) {
  const all = ['M15', 'H1', 'H4', 'D1'];
  const tfIndex = all.indexOf(tf);
  return all.map((t, i) => ({ tf: t, aligned: i >= tfIndex }));
}

// Pip calculator: pip value per lot at entry vs SL
function calcPips(signal: TradingSignal): { pips: number; valuePerLot: number } {
  const isJpy = signal.symbol.includes('JPY');
  const isGold = signal.symbol.includes('XAU');
  const isCrypto = signal.symbol.includes('BTC') || signal.symbol.includes('ETH');

  // Pip size: 0.01 for JPY (2nd decimal), 0.10 for Gold ($0.10 move = 1 pip), 1.0 for Crypto, 0.0001 for 4-decimal FX
  const pipSize = isJpy ? 0.01 : isGold ? 0.10 : isCrypto ? 1.0 : 0.0001;
  const pips = Math.abs(signal.entry_price - signal.stop_loss) / pipSize;

  // Value per lot per pip (USD):
  // 1 standard FX lot: $10/pip
  // 1 standard Gold lot (100 oz): $0.10 move = $10/pip
  // Crypto: $1 per point
  const valuePerLot = isCrypto ? 1 : 10;
  return { pips: Math.round(pips), valuePerLot };
}

export const SignalCard: React.FC<SignalCardProps> = ({ signal, showOutcomeControls = false }) => {
  const { setSelectedSymbol, setActiveTab, addToast, updateSignalStatus, quotes } = useAppStore();
  const [showCalc, setShowCalc] = useState(false);
  const [accountBalance, setAccountBalance] = useState(5000);
  const [riskPercent, setRiskPercent] = useState(1.0);
  const [lotSize, setLotSize] = useState(0.1);
  const isBuy = signal.direction === 'BUY';
  const confidence = signal.confidence ?? 0;
  const { pips, valuePerLot } = calcPips(signal);
  const mtfBadges = getMTFBadges(signal.timeframe);

  // Dynamic recommended lot size from balance and risk %
  const dollarRisk = (accountBalance * (riskPercent / 100));
  const recommendedLots = pips > 0 && valuePerLot > 0
    ? Math.max(0.01, Math.round((dollarRisk / (pips * valuePerLot)) * 100) / 100)
    : 0.10;

  const activeLots = lotSize || recommendedLots;
  const slRisk = (pips * activeLots * valuePerLot).toFixed(2);
  const tpReward = (pips * signal.risk_reward_ratio * activeLots * valuePerLot).toFixed(2);

  // Live real-time pricing and target detection
  const isJpy = signal.symbol.includes('JPY');
  const isGold = signal.symbol.includes('XAU');
  const isCrypto = signal.symbol.includes('BTC') || signal.symbol.includes('ETH');
  const pipUnit = isJpy ? 0.01 : isGold ? 0.10 : isCrypto ? 1.0 : 0.0001;

  const currentQuote = quotes[signal.symbol];
  const livePrice = currentQuote ? currentQuote.mid : signal.entry_price;

  // Stopped out detection: status is STOPPED_OUT or price breached stop loss
  const isStopped = signal.status === 'STOPPED_OUT' || (signal.stop_loss ? ((isBuy && livePrice <= signal.stop_loss) || (!isBuy && livePrice >= signal.stop_loss)) : false);

  // Exact stop loss distance in pips (spot stopped out)
  const stopLossPips = -Math.round((Math.abs(signal.entry_price - signal.stop_loss) / pipUnit) * 10) / 10;

  // Live floating pips: when stopped out, strictly freeze at spot stopped out
  const liveFloatingPips = isStopped
    ? (signal.pnl_pips !== undefined && signal.pnl_pips !== 0 ? signal.pnl_pips : stopLossPips)
    : isBuy 
    ? Math.round(((livePrice - signal.entry_price) / pipUnit) * 10) / 10
    : Math.round(((signal.entry_price - livePrice) / pipUnit) * 10) / 10;

  const hitTp3 = (signal.take_profit_3 && ((isBuy && livePrice >= signal.take_profit_3) || (!isBuy && livePrice <= signal.take_profit_3))) || signal.status === 'HIT_TP3';
  const hitTp2 = (signal.take_profit_2 && ((isBuy && livePrice >= signal.take_profit_2) || (!isBuy && livePrice <= signal.take_profit_2))) || signal.status === 'HIT_TP2';
  const hitTp1 = (isBuy && livePrice >= signal.take_profit_1) || (!isBuy && livePrice <= signal.take_profit_1) || signal.status === 'HIT_TP1';
  const hitSl = isStopped;

  // Prioritize stopped out or highest reached target: SL > TP3 > TP2 > TP1
  const bestTargetStatus: TradingSignal['status'] = isStopped
    ? 'STOPPED_OUT'
    : hitTp3
    ? 'HIT_TP3'
    : hitTp2
    ? 'HIT_TP2'
    : hitTp1
    ? 'HIT_TP1'
    : 'CLOSED';

  const exitTargetPrice = isStopped
    ? signal.stop_loss
    : hitTp3
    ? signal.take_profit_3!
    : hitTp2
    ? signal.take_profit_2!
    : hitTp1
    ? signal.take_profit_1
    : livePrice;

  // Realized pips calculated from the spot stopped out or furthest target reached
  const highestTargetPips = isStopped
    ? (signal.pnl_pips !== undefined && signal.pnl_pips !== 0 ? signal.pnl_pips : stopLossPips)
    : isBuy 
    ? Math.round(((exitTargetPrice - signal.entry_price) / pipUnit) * 10) / 10
    : Math.round(((signal.entry_price - exitTargetPrice) / pipUnit) * 10) / 10;

  const isReadyToClose = signal.status === 'ACTIVE' && (hitTp1 || hitTp2 || hitTp3 || hitSl);

  const handleCopy = () => {
    const text = [
      `📊 FOREX SIGNAL — ${signal.symbol} ${signal.direction}`,
      `Timeframe : ${signal.timeframe}`,
      `Entry     : ${signal.entry_price}`,
      `Stop Loss : ${signal.stop_loss}`,
      `TP 1      : ${signal.take_profit_1}`,
      `TP 2      : ${signal.take_profit_2 || 'Open'}`,
      `TP 3      : ${signal.take_profit_3 || 'Open'}`,
      `R:R       : 1:${signal.risk_reward_ratio}`,
      `Confidence: ${confidence}%`,
      `SL Risk   : ${pips} pips (~$${slRisk} @ ${lotSize} lot)`,
    ].join('\n');
    navigator.clipboard.writeText(text);
    soundFx.playAlertBell();
    notifService.hapticLight();
    addToast('Setup Copied', `${signal.symbol} parameters copied to clipboard`, 'success');
  };

  const handleCloseAndLock = async (targetStatus?: TradingSignal['status']) => {
    const finalStatus = targetStatus || bestTargetStatus;
    const finalPnl = (finalStatus === 'STOPPED_OUT' || isStopped)
      ? (signal.pnl_pips !== undefined && signal.pnl_pips !== 0 ? signal.pnl_pips : stopLossPips)
      : (finalStatus !== 'CLOSED' && (hitTp1 || hitTp2 || hitTp3)) 
      ? highestTargetPips 
      : liveFloatingPips;

    updateSignalStatus(signal.id, finalStatus, finalPnl);
    soundFx.playSignalChime();
    notifService.hapticSignal();
    addToast(
      finalStatus === 'STOPPED_OUT' ? 'Position Stopped Out' : `🎯 Target Hit (${finalStatus})`,
      `${signal.symbol} closed with ${finalPnl >= 0 ? '+' : ''}${finalPnl} pips locked at ${finalStatus === 'STOPPED_OUT' ? 'Stop Loss' : 'highest target'}!`,
      finalPnl >= 0 ? 'success' : 'alert'
    );
    try {
      await api.closeSignal(signal.id, finalStatus, finalPnl);
    } catch {
      // Local state preserved
    }
  };

  const handleOutcome = (status: TradingSignal['status']) => {
    handleCloseAndLock(status);
  };

  const accentColor = isBuy
    ? 'border-l-emerald-500 shadow-[0_0_24px_rgba(16,185,129,0.08)]'
    : 'border-l-rose-500 shadow-[0_0_24px_rgba(244,63,94,0.08)]';

  const directionBadge = isBuy
    ? 'bg-emerald-500/[0.14] text-emerald-400 border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.22)]'
    : 'bg-rose-500/[0.14] text-rose-400 border-rose-500/30 shadow-[0_0_12px_rgba(244,63,94,0.22)]';

  const confColor = confidence >= 80
    ? 'from-emerald-500 to-emerald-400'
    : confidence >= 65
    ? 'from-amber-500 to-amber-400'
    : 'from-rose-500 to-rose-400';

  // Calculate TP1 pips
  const tp1Pips = Math.round(Math.abs(signal.take_profit_1 - signal.entry_price) / pipUnit);
  const tp2Pips = signal.take_profit_2 ? Math.round(Math.abs(signal.take_profit_2 - signal.entry_price) / pipUnit) : null;

  return (
    <div className={`glass-card-premium border-l-4 ${accentColor} rounded-2xl p-4 sm:p-5 transition-all duration-200 relative overflow-hidden card-hover w-full min-w-0`}>
      {/* ── Header ─────────────────────────────── */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          {/* Asset Type Micro-Tag */}
          <span className="w-6 h-6 rounded-lg bg-white/[0.05] border border-white/10 flex items-center justify-center font-bold text-[10px] text-cyan-300 shrink-0">
            {isGold ? 'AU' : isCrypto ? '₿' : 'FX'}
          </span>
          <span className="text-[16px] font-mono font-black text-slate-100 tracking-tight shrink-0">{signal.symbol}</span>
          <span className={`inline-flex items-center gap-1 text-[11px] font-mono font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider border shrink-0 ${directionBadge}`}>
            {isBuy ? <ArrowUpRight size={12} strokeWidth={2.5} /> : <ArrowDownRight size={12} strokeWidth={2.5} />}
            {signal.direction}
          </span>
          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-[#070e1c] text-slate-300 border border-white/[0.08] shrink-0">{signal.timeframe}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0 mt-0.5">
          <span className="hidden sm:block text-[10px] font-bold text-slate-400 bg-[#060913] px-2 py-0.5 rounded-full border border-white/[0.08]">
            {signal.source === 'ADMIN' ? 'Senior Desk' : 'Quant AI'}
          </span>
          <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full tracking-wider ${
            signal.status === 'ACTIVE' 
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' 
              : signal.status === 'STOPPED_OUT'
              ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
              : 'bg-slate-800 text-slate-500'
          }`}>
            {signal.status === 'ACTIVE' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
            {signal.status === 'STOPPED_OUT' && <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />}
            {signal.status}
          </span>
        </div>
      </div>

      {/* ── Stopped Out Frozen Banner ──────────────── */}
      {signal.status === 'STOPPED_OUT' && (
        <div className="mb-3.5 p-3 rounded-xl border flex items-center justify-between gap-2.5 bg-rose-500/15 border-rose-500/35 text-rose-200 shadow-rose-500/10">
          <div className="flex items-center gap-2 min-w-0">
            <XCircle size={17} className="text-rose-400 shrink-0" />
            <div className="text-xs min-w-0">
              <span className="font-black tracking-wide block truncate text-rose-300">
                POSITION STOPPED OUT
              </span>
              <span className="text-[10px] text-slate-300 font-mono">
                Stopped at {signal.stop_loss} · Frozen at {signal.pnl_pips !== undefined && signal.pnl_pips !== 0 ? signal.pnl_pips : stopLossPips} pips
              </span>
            </div>
          </div>
          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 shrink-0">
            {signal.pnl_pips !== undefined && signal.pnl_pips !== 0 ? signal.pnl_pips : stopLossPips}p
          </span>
        </div>
      )}

      {/* ── Ready to Close / Target Reached Banner ──────────────── */}
      {isReadyToClose && (
        <div className={`mb-3.5 p-3 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 transition-all shadow-lg ${
          hitSl 
            ? 'bg-rose-500/15 border-rose-500/35 text-rose-200 shadow-rose-500/10' 
            : 'bg-emerald-500/15 border-emerald-500/35 text-emerald-200 shadow-emerald-500/10 glow-emerald-sm'
        }`}>
          <div className="flex items-center gap-2 min-w-0">
            {hitSl ? <XCircle size={17} className="text-rose-400 shrink-0" /> : <CheckCircle2 size={17} className="text-emerald-400 shrink-0" />}
            <div className="text-xs min-w-0">
              <span className="font-black tracking-wide block truncate">
                {hitSl ? 'STOP LOSS HIT' : hitTp3 ? '🎯 TARGET 3 HIT (RUNNER)' : hitTp2 ? '🎯 TARGET 2 REACHED' : '🎯 TARGET 1 HIT!'}
              </span>
              <span className="text-[10px] text-slate-300 font-mono">
                {hitSl 
                  ? `Stopped at ${signal.stop_loss} (${stopLossPips} pips locked) · Ready to be closed`
                  : `${highestTargetPips >= 0 ? `+${highestTargetPips}` : highestTargetPips} pips at ${bestTargetStatus} · Ready to be closed`}
              </span>
            </div>
          </div>
          <button
            onClick={() => handleCloseAndLock(bestTargetStatus)}
            className={`w-full sm:w-auto px-3.5 py-1.5 rounded-lg text-xs font-black shadow-md transition-all active:scale-95 shrink-0 flex items-center justify-center gap-1.5 ${
              hitSl
                ? 'bg-rose-600 hover:bg-rose-500 text-white'
                : 'bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 shadow-emerald-500/25'
            }`}
          >
            <CheckCheck size={14} />
            <span>Lock &amp; Close ({bestTargetStatus === 'STOPPED_OUT' ? 'SL' : bestTargetStatus === 'HIT_TP3' ? 'TP3' : bestTargetStatus === 'HIT_TP2' ? 'TP2' : bestTargetStatus === 'HIT_TP1' ? 'TP1' : 'Trade'})</span>
          </button>
        </div>
      )}

      {/* ── MTF Confluence Badges ──────────────── */}
      <div className="flex items-center justify-between mb-3 text-[10px] gap-2">
        <div className="flex items-center gap-1 flex-wrap min-w-0">
          <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest shrink-0">MTF:</span>
          {mtfBadges.map(({ tf, aligned }) => (
            <span key={tf} className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border shrink-0 ${
              aligned
                ? 'bg-emerald-500/[0.12] text-emerald-400 border-emerald-500/25'
                : 'bg-slate-900/60 text-slate-600 border-white/5'
            }`}>
              {tf} {aligned ? '✓' : '·'}
            </span>
          ))}
        </div>
        <span className="text-[10px] font-mono text-slate-400 shrink-0">
          ATR <strong className="text-slate-200">1.4x</strong>
        </span>
      </div>

      {/* ── Order Ticket Price Grid ─────────────────────────── */}
      <div className="grid grid-cols-2 2xl:grid-cols-4 gap-2.5 bg-[#040814]/90 border border-white/[0.07] rounded-xl p-3 mb-3 font-mono">
        <div className="min-w-0">
          <span className="text-[9px] text-slate-400 uppercase tracking-widest block font-sans font-bold mb-0.5 truncate">Entry Level</span>
          <span className="text-sm font-black text-cyan-400 tabular-nums truncate block">{signal.entry_price}</span>
        </div>
        <div className="min-w-0">
          <div className="flex items-center justify-between mb-0.5 gap-1">
            <span className="text-[9px] text-slate-400 uppercase tracking-widest font-sans font-bold truncate">Stop Loss</span>
            <span className="text-[9px] text-rose-400 font-bold shrink-0">-{pips}p</span>
          </div>
          <span className="text-sm font-black text-rose-400 tabular-nums truncate block">{signal.stop_loss}</span>
        </div>
        <div className="min-w-0">
          <div className="flex items-center justify-between mb-0.5 gap-1">
            <span className="text-[9px] text-slate-400 uppercase tracking-widest font-sans font-bold truncate">Target 1</span>
            <span className="text-[9px] text-emerald-400 font-bold shrink-0">+{tp1Pips}p</span>
          </div>
          <span className="text-sm font-black text-emerald-400 tabular-nums truncate block">{signal.take_profit_1}</span>
        </div>
        <div className="min-w-0">
          <div className="flex items-center justify-between mb-0.5 gap-1">
            <span className="text-[9px] text-slate-400 uppercase tracking-widest font-sans font-bold truncate">Target 2</span>
            {tp2Pips && <span className="text-[9px] text-emerald-300 font-bold shrink-0">+{tp2Pips}p</span>}
          </div>
          <span className="text-sm font-black text-emerald-300 tabular-nums truncate block">{signal.take_profit_2 || 'Runner'}</span>
        </div>
      </div>

      {/* ── Technical Summary ──────────────────── */}
      {signal.technical_justification && (
        <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed mb-3 font-sans">
          {signal.technical_justification}
        </p>
      )}

      {/* ── Confidence & R:R Bar ─────────────────────── */}
      <div className="mb-3 space-y-1.5">
        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 gap-2">
          <span className="truncate min-w-0">R:R&nbsp;<strong className="text-slate-200">1 : {signal.risk_reward_ratio}</strong>
            <span className="ml-1.5 text-slate-500 hidden sm:inline">· {pips}p SL</span>
          </span>
          <span className="shrink-0">Conf&nbsp;
            <strong className={`font-bold ${confidence >= 80 ? 'text-emerald-400' : confidence >= 65 ? 'text-amber-400' : 'text-rose-400'}`}>
              {confidence}%
            </strong>
          </span>
        </div>
        <div className="h-1.5 w-full bg-white/[0.05] rounded-full overflow-hidden">
          <div className={`confidence-bar bg-gradient-to-r ${confColor}`} style={{ '--bar-w': `${confidence}%` } as React.CSSProperties} />
        </div>
      </div>

      {/* ── Inline Risk & Position Sizing Calculator ──────────────── */}
      <div className="mb-3">
        <button
          onClick={() => setShowCalc(!showCalc)}
          className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-cyan-400 transition-colors font-mono font-semibold"
        >
          <Calculator size={12} className="text-cyan-400" />
          <span>Institutional Lot Sizer &amp; Risk ($)</span>
          {showCalc ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>

        {showCalc && (
          <div className="mt-2.5 bg-[#030611] border border-white/[0.08] rounded-xl p-3.5 space-y-3 animate-in slide-in-from-top-1 duration-150">
            {/* Account Balance & Risk % Presets */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-400 font-sans font-semibold">Account Balance</span>
                <span className="text-[10px] font-mono font-bold text-cyan-400">${accountBalance.toLocaleString()}</span>
              </div>
              <div className="grid grid-cols-5 gap-1">
                {[2000, 5000, 10000, 25000, 50000].map((b) => (
                  <button
                    key={b}
                    onClick={() => setAccountBalance(b)}
                    className={`py-1 rounded text-[9px] font-mono font-bold transition-all ${
                      accountBalance === b
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                        : 'bg-white/[0.03] text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    ${b >= 1000 ? `${b / 1000}k` : b}
                  </button>
                ))}
              </div>
            </div>

            {/* Risk % Selector */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-400 font-sans font-semibold">Risk Per Trade</span>
                <span className="text-[10px] font-mono font-bold text-emerald-400">{riskPercent}% (${dollarRisk.toFixed(2)})</span>
              </div>
              <div className="grid grid-cols-3 gap-1">
                {[0.5, 1.0, 2.0].map((r) => (
                  <button
                    key={r}
                    onClick={() => setRiskPercent(r)}
                    className={`py-1 rounded text-[9px] font-mono font-bold transition-all ${
                      riskPercent === r
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-white/[0.03] text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {r}% Risk
                  </button>
                ))}
              </div>
            </div>

            {/* Computed Lot Sizing & Metrics */}
            <div className="grid grid-cols-3 gap-2 text-[10px] font-mono pt-1">
              <div className="bg-[#081020] border border-cyan-500/30 rounded-lg p-2 text-center">
                <div className="text-cyan-400/80 mb-0.5">Rec. Lots</div>
                <div className="text-cyan-300 font-black text-xs">{recommendedLots} Lots</div>
              </div>
              <div className="bg-rose-500/[0.08] border border-rose-500/20 rounded-lg p-2 text-center">
                <div className="text-rose-400/70 mb-0.5">SL Risk ({pips}p)</div>
                <div className="text-rose-400 font-bold text-xs">${slRisk}</div>
              </div>
              <div className="bg-emerald-500/[0.08] border border-emerald-500/20 rounded-lg p-2 text-center">
                <div className="text-emerald-400/70 mb-0.5">TP1 Reward</div>
                <div className="text-emerald-400 font-bold text-xs">${tpReward}</div>
              </div>
            </div>

            <div className="pt-1">
              <button
                onClick={() => { setSelectedSymbol(signal.symbol); setActiveTab('risk'); }}
                className="w-full py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 text-[10px] font-bold tracking-wide transition-all text-center flex items-center justify-center gap-1.5"
              >
                <span>Open Full Institutional Risk Studio</span>
                <span className="text-[11px]">→</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Actions ────────────────────────────── */}
      <div className="flex items-center gap-2 pt-2.5 border-t border-white/[0.06]">
        <button
          onClick={() => { setSelectedSymbol(signal.symbol); setActiveTab('charts'); notifService.hapticLight(); }}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold shadow-md shadow-cyan-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <LineChart size={13} />
          <span>Open Chart</span>
        </button>
        <button
          onClick={() => { setSelectedSymbol(signal.symbol); setShowCalc(true); notifService.hapticLight(); }}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[#091122] hover:bg-[#101e3d] text-slate-300 hover:text-white border border-white/[0.08] hover:border-white/20 text-xs font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <Calculator size={13} />
          <span>Lot Size</span>
        </button>
        <button
          onClick={handleCopy}
          title="Copy signal ticket to clipboard"
          className="p-2.5 rounded-xl bg-[#091122] hover:bg-[#101e3d] text-slate-400 hover:text-cyan-400 border border-white/[0.08] hover:border-cyan-500/30 transition-all active:scale-95"
        >
          <Copy size={14} />
        </button>

        {signal.status === 'ACTIVE' && (
          <button
            onClick={() => handleCloseAndLock(hitTp1 ? 'HIT_TP1' : hitSl ? 'STOPPED_OUT' : 'CLOSED')}
            title="Lock in PnL and close signal"
            className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all active:scale-95 flex items-center gap-1.5 ${
              isReadyToClose
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 glow-emerald-sm animate-pulse'
                : 'bg-white/[0.04] text-slate-300 hover:text-white hover:bg-white/[0.08] border-white/10'
            }`}
          >
            <CheckCheck size={13} className={isReadyToClose ? 'text-emerald-400' : 'text-slate-400'} />
            <span>Close</span>
          </button>
        )}

        {/* Outcome controls (admin/analyst only) */}
        {showOutcomeControls && signal.status === 'ACTIVE' && (
          <>
            <button
              onClick={() => handleOutcome('HIT_TP1')}
              title="Mark TP1 Hit"
              className="p-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/25 transition-all active:scale-95"
            >
              <CheckCircle2 size={14} />
            </button>
            <button
              onClick={() => handleOutcome('STOPPED_OUT')}
              title="Mark Stopped Out"
              className="p-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/25 transition-all active:scale-95"
            >
              <XCircle size={14} />
            </button>
          </>
        )}
      </div>
    </div>
  );
};
