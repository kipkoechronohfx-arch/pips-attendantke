import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Quote, TradingSignal, NewsArticle, EconomicEvent, User, PriceAlert } from '../types';
import { soundFx } from '../services/audio';

export type AppTab =
  | 'dashboard'
  | 'scanner'
  | 'signals'
  | 'charts'
  | 'history'
  | 'performance'
  | 'risk'
  | 'news'
  | 'calendar'
  | 'watchlist'
  | 'broker-vault'
  | 'profile'
  | 'privacy'
  | 'admin';

export interface ToastItem {
  id: string;
  title: string;
  message: string;
  type: 'success' | 'alert' | 'error';
}

// Price flash direction per symbol
export type FlashDir = 'up' | 'down' | null;

interface AppState {
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;

  selectedSymbol: string;
  setSelectedSymbol: (symbol: string) => void;

  // ── Quotes with flash tracking ─────────────────
  quotes: Record<string, Quote>;
  flashMap: Record<string, FlashDir>;  // symbol → 'up' | 'down' | null
  setQuotes: (quotes: Quote[]) => void;
  updateQuote: (quote: Quote) => void;
  clearFlash: (symbol: string) => void;

  // ── Signals ────────────────────────────────────
  signals: TradingSignal[];
  setSignals: (signals: TradingSignal[]) => void;
  addSignal: (signal: TradingSignal) => void;
  updateSignalStatus: (id: number, status: TradingSignal['status'], pnl_pips?: number) => void;

  // ── Content ────────────────────────────────────
  news: NewsArticle[];
  setNews: (news: NewsArticle[]) => void;

  calendar: EconomicEvent[];
  setCalendar: (events: EconomicEvent[]) => void;

  // ── Auth ───────────────────────────────────────
  user: User | null;
  setUser: (user: User | null) => void;
  authToken: string | null;
  setAuthToken: (token: string | null) => void;

  // ── UI Preferences ────────────────────────────
  soundEnabled: boolean;
  toggleSound: () => void;

  darkMode: boolean;
  toggleDarkMode: () => void;

  notificationsGranted: boolean;
  setNotificationsGranted: (v: boolean) => void;

  // ── Scan rate limiting ────────────────────────
  lastScanAt: number | null;
  setLastScanAt: (ts: number) => void;

  // ── Toasts ────────────────────────────────────
  toasts: ToastItem[];
  addToast: (title: string, message: string, type?: 'success' | 'alert' | 'error') => void;
  removeToast: (id: string) => void;

  // ── Provider Health ───────────────────────────
  providerHealth: { provider_name: string; status: string; is_live: boolean; latency_ms?: number } | null;
  setProviderHealth: (health: { provider_name: string; status: string; is_live: boolean; latency_ms?: number }) => void;

  // ── PWA Install Prompt ────────────────────────
  pwaPrompt: any;
  setPwaPrompt: (prompt: any) => void;

  // ── Shortcuts Modal ───────────────────────────
  shortcutsOpen: boolean;
  setShortcutsOpen: (open: boolean) => void;

  // ── Terminal UI State & Favorites ──────────────
  favorites: string[];
  toggleFavorite: (symbol: string) => void;

  selectedAnalysisSymbol: string | null;
  setSelectedAnalysisSymbol: (sym: string | null) => void;

  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  userTimezone: string;
  setUserTimezone: (tz: string) => void;

  activeSession: string | null;
  setActiveSession: (session: string | null) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      activeTab: 'dashboard',
      setActiveTab: (tab) => set({ activeTab: tab }),

      selectedSymbol: 'EUR/USD',
      setSelectedSymbol: (symbol) => set({ selectedSymbol: symbol }),

      favorites: ['EUR/USD', 'GBP/USD', 'XAU/USD', 'USD/JPY'],
      toggleFavorite: (symbol) =>
        set((state) => {
          const exists = state.favorites.includes(symbol);
          return {
            favorites: exists
              ? state.favorites.filter((s) => s !== symbol)
              : [...state.favorites, symbol],
          };
        }),

      selectedAnalysisSymbol: null,
      setSelectedAnalysisSymbol: (selectedAnalysisSymbol) => set({ selectedAnalysisSymbol }),

      sidebarCollapsed: false,
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      userTimezone: typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Nairobi' : 'Africa/Nairobi',
      setUserTimezone: (userTimezone) => set({ userTimezone }),

      activeSession: null,
      setActiveSession: (activeSession) => set({ activeSession }),

      // ── Quotes ─────────────────────────────────
      quotes: {},
      flashMap: {},
      setQuotes: (quotesList) => {
        const prevQuotes = get().quotes;
        const newMap: Record<string, Quote> = {};
        const newFlash: Record<string, FlashDir> = {};

        quotesList.forEach((q) => {
          newMap[q.symbol] = q;
          const prev = prevQuotes[q.symbol];
          if (prev) {
            if (q.mid > prev.mid) newFlash[q.symbol] = 'up';
            else if (q.mid < prev.mid) newFlash[q.symbol] = 'down';
          }
        });

        set({ quotes: newMap, flashMap: { ...get().flashMap, ...newFlash } });

        // Auto-clear flash after 500ms
        Object.keys(newFlash).forEach((sym) => {
          setTimeout(() => get().clearFlash(sym), 500);
        });
      },
      updateQuote: (quote) => {
        const prev = get().quotes[quote.symbol];
        const dir: FlashDir = prev
          ? quote.mid > prev.mid ? 'up' : quote.mid < prev.mid ? 'down' : null
          : null;
        set((state) => ({
          quotes: { ...state.quotes, [quote.symbol]: quote },
          flashMap: { ...state.flashMap, [quote.symbol]: dir },
        }));
        if (dir) setTimeout(() => get().clearFlash(quote.symbol), 500);
      },
      clearFlash: (symbol) =>
        set((state) => ({ flashMap: { ...state.flashMap, [symbol]: null } })),

      // ── Signals ────────────────────────────────
      signals: [],
      setSignals: (signals) => set({ signals }),
      addSignal: (signal) =>
        set((state) => ({
          signals: [signal, ...state.signals.filter((s) => s.id !== signal.id)],
        })),
      updateSignalStatus: (id, status, pnl_pips) =>
        set((state) => ({
          signals: state.signals.map((s) =>
            s.id === id
              ? {
                  ...s,
                  status,
                  pnl_pips: pnl_pips !== undefined ? pnl_pips : s.pnl_pips,
                  closed_at: (status !== 'ACTIVE' && !s.closed_at) ? new Date().toISOString() : s.closed_at
                }
              : s
          ),
        })),

      // ── Content ────────────────────────────────
      news: [],
      setNews: (news) => set({ news }),
      calendar: [],
      setCalendar: (calendar) => set({ calendar }),

      // ── Auth ───────────────────────────────────
      user: null,
      setUser: (user) => set({ user }),
      authToken: null,
      setAuthToken: (authToken) => set({ authToken }),

      // ── UI Preferences ────────────────────────
      soundEnabled: true,
      toggleSound: () => {
        const next = !get().soundEnabled;
        soundFx.enabled = next;
        set({ soundEnabled: next });
      },

      darkMode: true,
      toggleDarkMode: () => set((s) => ({ darkMode: !s.darkMode })),

      notificationsGranted: false,
      setNotificationsGranted: (v) => set({ notificationsGranted: v }),

      // ── Scan Rate Limit ─────────────────────────
      lastScanAt: null,
      setLastScanAt: (ts) => set({ lastScanAt: ts }),

      // ── Toasts ────────────────────────────────
      toasts: [],
      addToast: (title, message, type = 'success') => {
        const id = Math.random().toString(36).substring(2, 9);
        set((state) => ({
          toasts: [...state.toasts, { id, title, message, type }],
        }));
        setTimeout(() => get().removeToast(id), 4500);
      },
      removeToast: (id) =>
        set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

      // ── Provider Health ───────────────────────
      providerHealth: null,
      setProviderHealth: (health) => set({ providerHealth: health }),

      // ── PWA Prompt ────────────────────────────
      pwaPrompt: null,
      setPwaPrompt: (pwaPrompt) => set({ pwaPrompt }),

      // ── Shortcuts Modal ───────────────────────
      shortcutsOpen: false,
      setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
    }),
    {
      name: 'fsp-prefs',
      partialize: (s) => ({
        soundEnabled: s.soundEnabled,
        darkMode: s.darkMode,
        selectedSymbol: s.selectedSymbol,
        authToken: s.authToken,
        notificationsGranted: s.notificationsGranted,
        favorites: s.favorites,
        sidebarCollapsed: s.sidebarCollapsed,
        userTimezone: s.userTimezone,
      }),
    }
  )
);
