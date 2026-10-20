import React from 'react';
import { useAppStore, AppTab } from '../store/useAppStore';
import {
  LucideIcon,
  LayoutDashboard,
  Zap,
  LineChart,
  Newspaper,
  CalendarDays,
  Calculator,
  History,
  Bell,
  ShieldCheck,
  UserCircle,
  FileText,
  Link2,
} from 'lucide-react';

interface NavItem {
  id: AppTab;
  label: string;
  icon: LucideIcon;
  badge?: string;
}

const tradingItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard',         icon: LayoutDashboard },
  { id: 'signals',   label: 'Trading Signals',   icon: Zap,         badge: 'LIVE' },
  { id: 'charts',    label: 'Pro Charts',         icon: LineChart },
  { id: 'news',      label: 'Forex News',         icon: Newspaper },
  { id: 'calendar',  label: 'Economic Calendar',  icon: CalendarDays },
  { id: 'risk',      label: 'Risk Calculator',    icon: Calculator },
  { id: 'history',      label: 'Signal History',     icon: History },
  { id: 'broker-vault', label: 'MT5 Broker Vault',   icon: Link2, badge: 'NEW' },
];

const mgmtItems: NavItem[] = [
  { id: 'watchlist', label: 'Watchlist & Alerts', icon: Bell },
  { id: 'profile',   label: 'Account & Settings',  icon: UserCircle },
  { id: 'privacy',   label: 'Legal & Privacy',     icon: FileText },
];

const adminItems: NavItem[] = [
  { id: 'admin',     label: 'Admin Broadcast',    icon: ShieldCheck },
];

function NavSection({ items, activeTab, setActiveTab }: {
  items: NavItem[];
  activeTab: string;
  setActiveTab: (id: AppTab) => void;
}) {
  return (
    <nav className="mt-2 space-y-0.5">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;
        return (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`relative w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-200 ${
              isActive
                ? 'nav-item-active bg-gradient-to-r from-amber-500/[0.15] to-yellow-500/[0.08] text-amber-300 border border-amber-500/35 font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] border border-transparent'
            }`}
          >
            <Icon
              size={17}
              className={`shrink-0 transition-colors duration-200 ${
                isActive ? 'text-amber-400' : 'text-slate-500 group-hover:text-slate-300'
              }`}
            />
            <span className="whitespace-nowrap">{item.label}</span>
            {item.badge && (
              <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/[0.12] text-emerald-400 border border-emerald-500/25 animate-pulse tracking-wider shrink-0">
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

export const Sidebar: React.FC = () => {
  const { user, activeTab, setActiveTab } = useAppStore();

  // Hide Administration completely on main site / iframe; only expose when explicitly in admin mode
  const isEmbedded =
    typeof window !== 'undefined' &&
    (window.self !== window.top || document.documentElement.classList.contains('in-iframe'));

  const isAdmin =
    !isEmbedded &&
    typeof window !== 'undefined' &&
    (window.location.search.includes('mode=admin') || window.location.search.includes('admin=true')) &&
    (user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN' || Boolean(localStorage.getItem('pa_admin_key')));

  return (
    <aside className="w-[200px] xl:w-[220px] bg-black/30 backdrop-blur-xl border-r border-white/[0.07] p-2.5 xl:p-3 flex flex-col justify-between shrink-0 hidden lg:flex">
      <div className="space-y-4">
        {/* Trading Terminal Section */}
        <div>
          <span className="text-[9px] font-black tracking-[0.15em] text-slate-500 uppercase px-2.5 py-1 block">
            Trading Terminal
          </span>
          <NavSection items={tradingItems} activeTab={activeTab} setActiveTab={setActiveTab} />
        </div>

        {/* Management Section */}
        <div>
          <span className="text-[9px] font-black tracking-[0.15em] text-slate-500 uppercase px-2.5 py-1 block">
            Management
          </span>
          <NavSection items={mgmtItems} activeTab={activeTab} setActiveTab={setActiveTab} />
        </div>

        {/* Administration Section (Private Admin Only — Never on main site) */}
        {isAdmin && (
          <div>
            <span className="text-[9px] font-black tracking-[0.15em] text-amber-400 uppercase px-2.5 py-1 block">
              Administration
            </span>
            <NavSection items={adminItems} activeTab={activeTab} setActiveTab={setActiveTab} />
          </div>
        )}
      </div>

      {/* Risk Warning & Legal Disclosures Card */}
      <button
        onClick={() => setActiveTab('privacy')}
        className="mt-4 text-left bg-gradient-to-br from-[#0d1929] to-[#07101e] hover:from-[#112238] hover:to-[#091526] border border-white/[0.07] hover:border-amber-400/30 transition-all rounded-xl p-3 text-xs group"
      >
        <div className="flex items-center justify-between text-amber-400 font-bold mb-1">
          <div className="flex items-center gap-1.5">
            <ShieldCheck size={13} />
            <span className="text-[11px]">Risk & Privacy Policy</span>
          </div>
          <span className="text-[9px] text-amber-400 group-hover:underline font-mono">View →</span>
        </div>
        <p className="text-slate-500 group-hover:text-slate-400 text-[10px] leading-relaxed transition-colors">
          CFD &amp; Forex trading carries risk. View our Google Play verified Privacy Policy &amp; Disclosures.
        </p>
      </button>
    </aside>
  );
};
