import { Quote, Candle, TradingSignal, NewsArticle, EconomicEvent, User, PriceAlert, SignalPerformanceStats, BrokerListItem, MT5Account, TradeExecution, ExecutionStats } from '../types';

const envBase = (import.meta as any).env?.VITE_API_BASE_URL;
const RAW_BASE = envBase ? String(envBase).trim().replace(/\/+$/, '') : '';
export const API_BASE = RAW_BASE ? `${RAW_BASE}/api/v1` : '/api/v1';


function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('fsp_token');
  const headers: HeadersInit = {
    'Content-Type': 'application/json'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export const api = {
  // Authentication
  async register(data: { email: string; password: string; full_name?: string; timezone?: string }): Promise<User> {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Registration failed' }));
      throw new Error(err.detail || 'Registration failed');
    }
    return res.json();
  },

  async login(credentials: { email: string; password: string }): Promise<{ access_token: string; role: string; email: string; full_name?: string }> {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Login failed' }));
      throw new Error(err.detail || 'Invalid email or password');
    }
    const data = await res.json();
    localStorage.setItem('fsp_token', data.access_token);
    localStorage.setItem('fsp_role', data.role);
    localStorage.setItem('fsp_email', data.email);
    return data;
  },

  async getCurrentUser(): Promise<User> {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Unauthorized');
    return res.json();
  },

  logout() {
    localStorage.removeItem('fsp_token');
    localStorage.removeItem('fsp_role');
    localStorage.removeItem('fsp_email');
  },

  // Market Data
  async getQuotes(): Promise<Quote[]> {
    const res = await fetch(`${API_BASE}/market/quotes`);
    if (!res.ok) throw new Error('Failed to load market quotes');
    return res.json();
  },

  async getCandles(symbol: string, timeframe: string = 'H1', count: number = 80): Promise<Candle[]> {
    const res = await fetch(`${API_BASE}/market/candles/${encodeURIComponent(symbol)}?timeframe=${timeframe}&count=${count}`);
    if (!res.ok) throw new Error(`Failed to load candles for ${symbol}`);
    return res.json();
  },

  /** Returns only the last candle with a live close price (OANDA mid injected).
   *  Poll every 1-2s for chart animation without re-fetching 100 candles. */
  async getLiveTick(symbol: string, timeframe: string = 'M5'): Promise<Candle | null> {
    const res = await fetch(`${API_BASE}/market/tick/${encodeURIComponent(symbol)}?timeframe=${timeframe}`);
    if (!res.ok) return null;
    return res.json();
  },

  async getMarketStatus(): Promise<{ provider: string; status: string; is_live: boolean; latency_ms: number; provider_class: string }> {
    const res = await fetch(`${API_BASE}/market/status`);
    if (!res.ok) throw new Error('Failed to load market status');
    return res.json();
  },

  async getMarketHealth(): Promise<{ provider_name: string; status: string; is_live: boolean; latency_ms: number }> {
    const res = await fetch(`${API_BASE}/market/health`);
    if (!res.ok) throw new Error('Failed to load provider health');
    return res.json();
  },

  // Signals
  async getSignals(filters?: { symbol?: string; status?: string; direction?: string; timeframe?: string }): Promise<TradingSignal[]> {
    const params = new URLSearchParams();
    if (filters?.symbol) params.append('symbol', filters.symbol);
    if (filters?.status && filters.status !== 'ALL') params.append('status', filters.status);
    if (filters?.direction && filters.direction !== 'ALL') params.append('direction', filters.direction);
    if (filters?.timeframe && filters.timeframe !== 'ALL') params.append('timeframe', filters.timeframe);

    const res = await fetch(`${API_BASE}/signals/?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to load signals');
    return res.json();
  },

  async triggerAutoScan(): Promise<TradingSignal[]> {
    const res = await fetch(`${API_BASE}/signals/auto-scan`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Auto-scan failed');
    const data = await res.json();
    return Array.isArray(data) ? data : (data.signals || []);
  },

  async getPerformanceStats(): Promise<SignalPerformanceStats> {
    const res = await fetch(`${API_BASE}/signals/stats/performance`);
    if (!res.ok) throw new Error('Failed to load performance stats');
    return res.json();
  },

  async closeSignal(id: number, status: string = 'CLOSED', pnl?: number): Promise<TradingSignal> {
    const params = new URLSearchParams({ status });
    if (pnl !== undefined) params.append('pnl', String(pnl));
    const res = await fetch(`${API_BASE}/signals/${id}/close?${params.toString()}`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Failed to close signal');
    return res.json();
  },

  // Admin Broadcast
  async publishAdminSignal(signalData: Partial<TradingSignal>): Promise<TradingSignal> {
    const res = await fetch(`${API_BASE}/admin/signals`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(signalData)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to publish signal' }));
      throw new Error(err.detail || 'Failed to publish signal');
    }
    return res.json();
  },

  async updateSignal(id: number, data: { status?: string; stop_loss?: number; take_profit_1?: number }): Promise<TradingSignal> {
    const res = await fetch(`${API_BASE}/admin/signals/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to update signal');
    return res.json();
  },

  // News & Calendar
  async getNews(category: string = 'ALL', refresh: boolean = false): Promise<NewsArticle[]> {
    const params = new URLSearchParams();
    if (category && category !== 'ALL') params.append('currency', category);
    if (refresh) params.append('refresh', 'true');
    const res = await fetch(`${API_BASE}/news/?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to load news');
    return res.json();
  },

  async getCalendar(timezone: string = 'Africa/Nairobi', currency?: string, impact?: string): Promise<EconomicEvent[]> {
    const params = new URLSearchParams();
    params.set('timezone', timezone);
    if (currency && currency !== 'ALL') params.set('currency', currency);
    if (impact && impact !== 'ALL') params.set('impact', impact);
    const res = await fetch(`${API_BASE}/calendar/?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to load economic calendar');
    return res.json();
  },

  // Risk Calculator
  async calculateRisk(req: {
    account_balance: number;
    account_currency: string;
    risk_percentage: number;
    symbol: string;
    entry_price: number;
    stop_loss_price: number;
    take_profit_price?: number;
    leverage?: number;
    spread_pips?: number;
  }) {
    const res = await fetch(`${API_BASE}/risk/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req)
    });
    if (!res.ok) throw new Error('Failed to calculate risk');
    return res.json();
  },

  // Price Alerts
  async getAlerts(): Promise<PriceAlert[]> {
    const res = await fetch(`${API_BASE}/alerts/`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) return [];
    return res.json();
  },

  async createAlert(alert: { symbol: string; target_price: number; condition: string; notes?: string }): Promise<PriceAlert> {
    const res = await fetch(`${API_BASE}/alerts/`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(alert)
    });
    if (!res.ok) throw new Error('Failed to create alert');
    return res.json();
  },

  // MT5 Broker Vault
  async getBrokers(): Promise<BrokerListItem[]> {
    const res = await fetch(`${API_BASE}/vault/brokers`);
    if (!res.ok) return [];
    return res.json();
  },

  async getVaultAccounts(clientEmail?: string): Promise<MT5Account[]> {
    const url = clientEmail
      ? `${API_BASE}/vault/accounts?client_email=${encodeURIComponent(clientEmail)}`
      : `${API_BASE}/vault/accounts`;
    const res = await fetch(url, { headers: getAuthHeaders() });
    if (!res.ok) return [];
    return res.json();
  },

  async addVaultAccount(data: {
    client_email: string;
    nickname?: string;
    broker_name: string;
    mt5_server: string;
    mt5_login: string;
    mt5_password: string;
    risk_percent: number;
    auto_breakeven: boolean;
  }): Promise<MT5Account> {
    const res = await fetch(`${API_BASE}/vault/accounts`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to add account' }));
      throw new Error(err.detail || 'Failed to add account');
    }
    return res.json();
  },

  async updateVaultAccount(id: number, data: { nickname?: string; risk_percent?: number; auto_breakeven?: boolean; is_active?: boolean }): Promise<MT5Account> {
    const res = await fetch(`${API_BASE}/vault/accounts/${id}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Update failed');
    return res.json();
  },

  async removeVaultAccount(id: number): Promise<void> {
    await fetch(`${API_BASE}/vault/accounts/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
  },

  async testVaultConnection(id: number): Promise<MT5Account> {
    const res = await fetch(`${API_BASE}/vault/accounts/${id}/test-connection`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Connection test failed');
    return res.json();
  },

  // ─── Trade Executions ───────────────────────────────────────────

  async getExecutions(params?: { signal_id?: number; account_id?: number; status?: string; limit?: number }): Promise<TradeExecution[]> {
    const query = new URLSearchParams();
    if (params?.signal_id) query.set('signal_id', String(params.signal_id));
    if (params?.account_id) query.set('account_id', String(params.account_id));
    if (params?.status) query.set('status', params.status);
    if (params?.limit) query.set('limit', String(params.limit));
    const res = await fetch(`${API_BASE}/executions/?${query.toString()}`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) return [];
    return res.json();
  },

  async getExecutionStats(): Promise<ExecutionStats> {
    const res = await fetch(`${API_BASE}/executions/stats`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) return { total_executions: 0, submitted: 0, rejected: 0, closed: 0, winners: 0, win_rate: 0, total_pnl_usd: 0 };
    return res.json();
  },

  async manualExecuteSignal(signalId: number): Promise<{ status: string; message: string }> {
    const res = await fetch(`${API_BASE}/executions/execute-signal/${signalId}`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Execution failed' }));
      throw new Error(err.detail || 'Execution failed');
    }
    return res.json();
  },

  // ─── Session-Aware Scanner ──────────────────────────────────────

  async getSessionState(): Promise<import('../types').SessionState> {
    const res = await fetch(`${API_BASE}/scanner/session`);
    if (!res.ok) throw new Error('Failed to load session state');
    return res.json();
  },

  async getSymbolAnalysis(symbol: string, timeframe: string = 'H1'): Promise<import('../types').FullAnalysis> {
    const res = await fetch(`${API_BASE}/scanner/analysis/${encodeURIComponent(symbol)}?timeframe=${timeframe}`);
    if (!res.ok) throw new Error(`Failed to load analysis for ${symbol}`);
    return res.json();
  },

  async getSymbolQML(symbol: string, timeframe: string = 'M15', direction: string = 'BUY'): Promise<import('../types').QMLSynthesis> {
    const res = await fetch(`${API_BASE}/scanner/qml/${encodeURIComponent(symbol)}?timeframe=${timeframe}&direction=${direction}`);
    if (!res.ok) throw new Error(`Failed to load QML synthesis for ${symbol}`);
    return res.json();
  },

  async getEntryAllowed(): Promise<{ allowed: boolean; reason: string | null }> {
    const res = await fetch(`${API_BASE}/scanner/entry-allowed`);
    if (!res.ok) return { allowed: true, reason: null };
    return res.json();
  },

  async getStrategyProfiles(): Promise<import('../types').StrategyProfile[]> {
    const res = await fetch(`${API_BASE}/scanner/strategy-profiles`);
    if (!res.ok) return [];
    return res.json();
  },

  async getFeedHealth(): Promise<import('../types').FeedHealth> {
    const res = await fetch(`${API_BASE}/scanner/feed-health`);
    if (!res.ok) throw new Error('Failed to load feed health');
    return res.json();
  },

  async getValidationReport(): Promise<import('../types').ValidationReport> {
    const res = await fetch(`${API_BASE}/scanner/performance/validation`);
    if (!res.ok) throw new Error('Failed to load validation report');
    return res.json();
  },

  async getSymbolRegime(symbol: string): Promise<any> {
    const res = await fetch(`${API_BASE}/scanner/regime/${encodeURIComponent(symbol)}`);
    if (!res.ok) return null;
    return res.json();
  },

  async getDiagnostics(timeframe: string = 'H1'): Promise<import('../types').DiagnosticEntry[]> {
    const res = await fetch(`${API_BASE}/scanner/diagnostics?timeframe=${encodeURIComponent(timeframe)}`);
    if (!res.ok) return [];
    return res.json();
  },
};

