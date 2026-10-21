import React from 'react';
import { useAppStore, AppTab } from '../store/useAppStore';
import {
  LucideIcon,
  LayoutDashboard,
  Cpu,
  LineChart,
  Zap,
  History,
  BarChart3,
  Settings,
  Calculator,
  CalendarDays,
  Newspaper,
  Bell,
  Link2,
  FileText,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';

interface NavItem {
  id: AppTab;
  label: string;
  icon: LucideIcon;
  badge?: string;
}

const primaryItems: NavItem[] = [
  { id: 'dashboard',   label: 'Overview',             icon: LayoutDashboard },
  { id: 'scanner',     label: 'Market Scanner',       icon: Cpu, badge: 'HOT' },
  { id: 'charts',      label: 'Charts & Analysis',    icon: LineChart },
  { id: 'signals',     label: 'Active Signals',       icon: Zap, badge: 'LIVE' },
  { id: 'history',     label: 'Signal History',       icon: History },
  { id: 'performance', label: 'Strategy Performance', icon: BarChart3 },
  { id: 'profile',     label: 'Settings & Account',   icon: Settings },
];

const utilityItems: NavItem[] = [
  { id: 'risk',         label: 'Risk Calculator',      icon: Calculator },
  { id: 'calendar',     label: 'Economic Calendar',    icon: CalendarDays },
  { id: 'news',         label: 'Forex News Wire',      icon: Newspaper },
  { id: 'watchlist',    label: 'Watchlist & Alerts',   icon: Bell },
  { id: 'broker-vault', label: 'MT5 Broker Vault',     icon: Link2 },
  { id: 'privacy',      label: 'Legal & Risk Policy',  icon: FileText },
];

const adminItems: NavItem[] = [
  { id: 'admin',        label: 'Admin Broadcast',      icon: ShieldCheck },
];

export const Sidebar: React.FC = () => {
  const { user, activeTab, setActiveTab, sidebarCollapsed, toggleSidebar } = useAppStore();

  const isEmbedded =
    typeof window !== 'undefined' &&
    (window.self !== window.top || document.documentElement.classList.contains('in-iframe'));

  const isAdmin =
    !isEmbedded &&
    typeof window !== 'undefined' &&
    (window.location.search.includes('mode=admin') || window.location.search.includes('admin=true')) &&
    (user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN' || Boolean(localStorage.getItem('pa_admin_key')));

  const renderNavGroup = (items: NavItem[], title?: string) => (
    <div className="space-y-1">
      {title && !sidebarCollapsed && (
        <span className="text-[9px] font-black tracking-[0.16em] text-slate-500 uppercase px-3 py-1 block font-mono">
          {title}
        </span>
      )}
      <nav className="space-y-0.5">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              title={sidebarCollapsed ? item.label : undefined}
              className={`relative w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-mono font-medium transition-all duration-150 cursor-pointer overflow-hidden group ${
                isActive
                  ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/10 text-cyan-300 border border-cyan-500/35 font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.05] border border-transparent'
              }`}
            >
              {isActive && (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
              )}
              <Icon
                size={17}
                className={`shrink-0 transition-colors ${
                  isActive ? 'text-cyan-400' : 'text-slate-500 group-hover:text-slate-300'
                }`}
              />
              {!sidebarCollapsed && (
                <>
                  <span className="whitespace-nowrap truncate">{item.label}</span>
                  {item.badge && (
                    <span className="ml-auto text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 tracking-wider shrink-0 font-mono">
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );

  return (
    <aside
      className={`bg-black/35 backdrop-blur-2xl border-r border-white/[0.08] p-2.5 flex flex-col justify-between shrink-0 hidden lg:flex transition-all duration-300 ${
        sidebarCollapsed ? 'w-[68px]' : 'w-[230px] xl:w-[245px]'
      }`}
    >
      <div className="space-y-4">
        {/* Toggle Collapse Button */}
        <div className="flex items-center justify-between px-1">
          {!sidebarCollapsed && (
            <span className="text-[10px] font-bold font-mono tracking-widest text-slate-500 uppercase">
              Trading Terminal
            </span>
          )}
          <button
            onClick={toggleSidebar}
            title={sidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            className="p-1.5 rounded-lg border border-white/10 hover:border-white/20 text-slate-400 hover:text-white hover:bg-white/[0.05] transition-all ml-auto"
          >
            {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        {/* 7 Core Items */}
        {renderNavGroup(primaryItems, 'Core Modules')}

        {/* Utilities Section */}
        {renderNavGroup(utilityItems, 'Tools & Utilities')}

        {/* Admin Broadcast if Admin */}
        {isAdmin && renderNavGroup(adminItems, 'Administration')}
      </div>

      {/* Bottom Risk Warning Pill */}
      {!sidebarCollapsed && (
        <button
          onClick={() => setActiveTab('privacy')}
          className="mt-4 text-left bg-gradient-to-br from-[#0c1424] to-[#070b16] hover:from-[#101b30] hover:to-[#0a101f] border border-white/[0.07] hover:border-cyan-400/30 transition-all rounded-xl p-2.5 text-xs group"
        >
          <div className="flex items-center justify-between text-cyan-400 font-bold mb-1 font-mono">
            <div className="flex items-center gap-1.5">
              <ShieldCheck size={13} />
              <span className="text-[10px]">Risk Disclosures</span>
            </div>
            <span className="text-[9px] text-cyan-400 group-hover:underline font-mono">View →</span>
          </div>
          <p className="text-slate-500 group-hover:text-slate-400 text-[10px] leading-tight font-sans transition-colors">
            Strict risk management required. Never risk capital you cannot afford to lose.
          </p>
        </button>
      )}
    </aside>
  );
};
