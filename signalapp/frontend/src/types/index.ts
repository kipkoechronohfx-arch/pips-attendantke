export interface Quote {
  symbol: string;
  bid: number;
  ask: number;
  spread: number;
  mid: number;
  change_24h: number;
  change_24h_pct: number;
  high_24h: number;
  low_24h: number;
  timestamp_utc: string;
  provider: string;
  is_live: boolean;
  data_freshness_seconds: number;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TradingSignal {
  id: number;
  symbol: string;
  direction: 'BUY' | 'SELL' | 'NEUTRAL';
  timeframe: string;
  entry_price: number;
  entry_zone_high?: number;
  entry_zone_low?: number;
  stop_loss: number;
  take_profit_1: number;
  take_profit_2?: number;
  take_profit_3?: number;
  risk_reward_ratio: number;
  confidence: number;
  technical_justification?: string;
  status: 'ACTIVE' | 'HIT_TP1' | 'HIT_TP2' | 'HIT_TP3' | 'STOPPED_OUT' | 'CANCELLED' | 'CLOSED';
  source: 'AUTO' | 'ADMIN' | 'ANALYST';
  pnl_pips: number;
  created_at: string;
  expires_at?: string;
  closed_at?: string;
}

export interface NewsArticle {
  id: number;
  title: string;
  summary?: string;
  source: string;
  url: string;
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  affected_currencies: string;
  published_at: string;
}

export interface EconomicEvent {
  id: number;
  event_name: string;
  country: string;
  currency: string;
  scheduled_time_utc: string;
  scheduled_time_local?: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  previous?: string;
  forecast?: string;
  actual?: string;
  status: string;
}

export interface User {
  id: number;
  email: string;
  full_name?: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'ANALYST' | 'USER';
  timezone: string;
  account_currency: string;
  is_active: boolean;
  is_verified: boolean;
  created_at: string;
}

export interface PriceAlert {
  id: number;
  user_id: number;
  symbol: string;
  target_price: number;
  condition: 'ABOVE' | 'BELOW';
  notes?: string;
  is_active: boolean;
  triggered_at?: string;
  created_at: string;
}

export interface SignalPerformanceStats {
  total_signals: number;
  active_signals: number;
  closed_signals: number;
  winning_signals: number;
  losing_signals: number;
  win_rate_percentage: number;
  profit_factor: number;
  average_rr_ratio: number;
  total_net_pips: number;
  max_drawdown_pips: number;
  performance_by_pair: Record<string, number>;
  performance_by_timeframe: Record<string, number>;
}

export interface BrokerListItem {
  name: string;
  servers: string[];
}

export interface MT5Account {
  id: number;
  client_email: string;
  nickname?: string;
  broker_name: string;
  mt5_server: string;
  mt5_login: string;
  risk_percent: number;
  auto_breakeven: boolean;
  is_active: boolean;
  status: 'PENDING' | 'CONNECTED' | 'ERROR' | 'DISCONNECTED';
  last_equity?: number;
  last_balance?: number;
  last_connected_at?: string;
  error_message?: string;
  metaapi_account_id?: string;
  created_at: string;
}

export interface TradeExecution {
  id: number;
  signal_id: number;
  mt5_account_id: number;
  client_email: string;
  metaapi_account_id?: string;
  mt5_ticket?: string;
  symbol: string;
  direction: 'BUY' | 'SELL';
  lot_size: number;
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  risk_percent: number;
  balance_at_execution?: number;
  status: 'PENDING' | 'SUBMITTED' | 'FILLED' | 'REJECTED' | 'CLOSED' | 'CANCELLED';
  fill_price?: number;
  close_price?: number;
  pnl_usd?: number;
  error_message?: string;
  created_at: string;
  filled_at?: string;
  closed_at?: string;
}

export interface ExecutionStats {
  total_executions: number;
  submitted: number;
  rejected: number;
  closed: number;
  winners: number;
  win_rate: number;
  total_pnl_usd: number;
}
