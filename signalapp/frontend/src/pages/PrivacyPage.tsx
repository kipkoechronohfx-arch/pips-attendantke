import React from 'react';
import { Shield, AlertTriangle, Lock, FileText, CheckCircle2, Mail, ExternalLink } from 'lucide-react';

export const PrivacyPage: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-16">
      {/* Header */}
      <div className="relative rounded-2xl overflow-hidden border border-white/[0.08] bg-gradient-to-br from-slate-900/90 via-[#060a18] to-slate-950 p-6 sm:p-8 backdrop-blur-xl">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <Shield size={24} />
          </div>
          <div>
            <span className="text-[10px] font-mono font-bold tracking-widest text-cyan-400 uppercase">Legal & Compliance</span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">Privacy Policy & Risk Disclosure</h1>
          </div>
        </div>
        <p className="text-sm text-slate-300 max-w-2xl leading-relaxed">
          Forex Signal Pro is committed to protecting your privacy and providing transparent, institutional-grade market data. This policy details how we handle information and outlines critical financial risk disclosures in accordance with Google Play Store policies.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-4 text-xs font-mono text-slate-400">
          <span>Effective Date: October 2026</span>
          <span>•</span>
          <span>Version: 2.0.0</span>
          <span>•</span>
          <span className="text-emerald-400 flex items-center gap-1">
            <CheckCircle2 size={13} /> Google Play Certified Format
          </span>
        </div>
      </div>

      {/* High Risk Investment Warning (Mandatory for Google Play Financial Apps) */}
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.05] p-6 sm:p-7 relative overflow-hidden backdrop-blur-md">
        <div className="flex items-start gap-4">
          <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex-shrink-0 mt-0.5">
            <AlertTriangle size={22} />
          </div>
          <div className="space-y-2">
            <h2 className="text-base sm:text-lg font-bold text-amber-300">Important High-Risk Financial Disclaimer</h2>
            <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
              Trading foreign exchange (Forex), commodities, and Contracts for Difference (CFDs) on margin carries a high level of risk and may not be suitable for all investors. The high degree of leverage can work against you as well as for you. Before deciding to trade foreign exchange you should carefully consider your investment objectives, level of experience, and risk appetite.
            </p>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-semibold">
              Forex Signal Pro provides algorithmic technical analysis, market indicators, and educational trading signals. We do NOT manage funds, execute trades on your behalf, or provide personalized financial advice. Past performance of any trading system or signal methodology is not indicative of future results.
            </p>
          </div>
        </div>
      </div>

      {/* Information Collection */}
      <div className="rounded-2xl border border-white/[0.07] bg-[#070c1a]/80 p-6 sm:p-8 space-y-6 backdrop-blur-xl">
        <div className="flex items-center gap-2.5 text-white font-bold text-lg border-b border-white/[0.08] pb-4">
          <Lock size={20} className="text-cyan-400" />
          <h2>Information We Collect and How It Is Used</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] space-y-2">
            <h3 className="font-semibold text-slate-100 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" /> Account Information
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              When creating an account, we collect your email address, full name, and preferred timezone. Passwords are cryptographically salted and hashed using standard bcrypt — plaintext passwords are never stored or accessible by anyone.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] space-y-2">
            <h3 className="font-semibold text-slate-100 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" /> Device & Push Notification Tokens
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              With your explicit permission, we collect Google Firebase Cloud Messaging (FCM) tokens solely to dispatch real-time trade signals, take-profit alerts, and breaking financial calendar events directly to your device.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] space-y-2">
            <h3 className="font-semibold text-slate-100 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" /> What We DO NOT Collect
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              We never collect or store brokerage passwords, private MT4/MT5 credentials, bank account details, or payment card numbers. Your trading capital remains strictly at your regulated brokerage.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] space-y-2">
            <h3 className="font-semibold text-slate-100 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" /> Third-Party Market Feeds
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Market data is retrieved via secure REST/WebSocket connections with OANDA Corporation and Twelve Data. No personal identifiable information is transmitted to market data feed providers.
            </p>
          </div>
        </div>
      </div>

      {/* Data Retention & Deletion */}
      <div className="rounded-2xl border border-white/[0.07] bg-[#070c1a]/80 p-6 sm:p-8 space-y-4 backdrop-blur-xl">
        <div className="flex items-center gap-2.5 text-white font-bold text-lg border-b border-white/[0.08] pb-4">
          <FileText size={20} className="text-cyan-400" />
          <h2>Data Deletion & User Rights (GDPR & CCPA)</h2>
        </div>
        <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
          You have the right to request access to, correction of, or permanent deletion of your account and personal data at any time. To request account termination and full data eradication from our servers, simply use the Account Settings tab or email our Data Protection team.
        </p>
        <div className="pt-2 flex flex-col sm:flex-row items-start sm:items-center gap-4 text-xs">
          <a
            href="mailto:support@forexsignalpro.com"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 font-medium transition-colors"
          >
            <Mail size={14} /> Contact Data Protection Officer
          </a>
          <span className="text-slate-500 font-mono">Response time: within 24–48 business hours</span>
        </div>
      </div>
    </div>
  );
};
