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
  setup_id?: string;
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
  context_score?: number;
  setup_score?: number;
  signal_class?: 'HIGH_CONFLUENCE' | 'WATCHLIST' | 'NO_SIGNAL';
  setup_status?: 'WATCH' | 'CONFIRMED' | 'INVALIDATED' | 'EXPIRED';
  entry_status?: 'CONFIRMED' | 'WAITING_TRIGGER' | 'INVALIDATED' | 'REJECTED';
  lifecycle_state?: string;
  market_regime?: string;
  strategy_profile?: string;
  technical_justification?: string;
  confluence_reasons?: string[];
  rejection_reasons?: string[];
  failure_codes?: string[];
  hard_gates?: {
    passed: boolean;
    rejection_reasons?: Array<{ code: string; message: string }>;
    failure_codes?: string[];
  };
  score_components?: {
    context?: any;
    setup?: any;
    htf_alignment?: number;
    liquidity_sweep?: number;
    bos_choch?: number;
    fvg_ob_retest?: number;
    momentum?: number;
    session?: number;
    spread_volatility?: number;
    risk_reward?: number;
  };
  session_id?: string;
  session_name?: string;
  structure?: {
    h4_trend?: string | null;
    h1_trend?: string | null;
    bos?: { direction: string; level: number; label: string } | null;
    choch?: { direction: string; level: number; label: string } | null;
    fvg_count?: number;
    has_liquidity_sweep?: boolean;
    has_displacement?: boolean;
  };
  levels?: {
    support?: number | null;
    resistance?: number | null;
    pdh?: number | null;
    pdl?: number | null;
    asian_high?: number | null;
    asian_low?: number | null;
  };
  indicators?: {
    ema20?: number | null;
    ema50?: number | null;
    ema200?: number | null;
    rsi14?: number | null;
    atr14?: number | null;
  };
  risk_pips?: number;
  risk_amount?: number;
  lot_size?: number;
  invalidation_level?: number;
  spread?: number | null;
  status: 'ACTIVE' | 'HIT_TP1' | 'HIT_TP2' | 'HIT_TP3' | 'STOPPED_OUT' | 'CANCELLED' | 'CLOSED';
  source: 'AUTO' | 'ADMIN' | 'ANALYST';
  pnl_pips: number;
  created_at: string;
  expires_at?: string;
  closed_at?: string;
  broadcasted_to_telegram?: boolean;
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

// ── Session Engine Types ───────────────────────────────────────
export interface SessionInfo {
  id: 'ASIAN' | 'LONDON' | 'NEW_YORK' | 'OVERLAP';
  name: string;
  is_active: boolean;
  color: string;
  priority_pairs: string[];
  description?: string;
  countdown_label?: string;
  countdown?: string;
  local_time?: string;
  open?: string;
  close?: string;
  minutes_to_open?: number;
}

export interface SessionState {
  timestamp_utc: string;
  active_sessions: string[];
  is_overlap: boolean;
  primary_session: SessionInfo | null;
  next_session: (SessionInfo & { minutes_to_open: number }) | null;
  all_sessions: SessionInfo[];
}

// ── Market Structure Types ──────────────────────────────────────
export interface FVG {
  type: 'BULLISH' | 'BEARISH';
  high: number;
  low: number;
  mid: number;
  time: number;
  filled: boolean;
}

export interface OrderBlock {
  type: 'BULLISH' | 'BEARISH';
  high: number;
  low: number;
  mid: number;
  time: number;
  mitigated: boolean;
}

export interface StrategyProfile {
  id: string;
  name: string;
  session_id: string;
  timezone: string;
  is_active: boolean;
  strategy_type: string;
  eligible_instruments: string[];
  max_spread_pips: number;
  min_rr: number;
  min_confluence_score: number;
  news_blackout_minutes: number;
  setup_expiration_hours: number;
  description: string;
  rules: string[];
  local_time?: string;
  time_label?: string;
}

export interface ValidationReport {
  overall: {
    sample_size: number;
    win_count?: number;
    loss_count?: number;
    breakeven_count?: number;
    win_rate: number;
    expectancy_r: number;
    profit_factor: number;
    max_drawdown_r: number;
    total_r: number;
    avg_win_r: number;
    avg_loss_r: number;
    friction_model: {
      spread_pips: number;
      slippage_pips: number;
      commission_lot: number;
    };
  };
  in_sample_vs_out_of_sample: {
    split_ratio: string;
    in_sample: any;
    out_of_sample: any;
    robustness: {
      expectancy_delta_r: number;
      degradation_percent: number;
      verdict: string;
    };
  };
  breakdowns: {
    by_strategy: Record<string, any>;
    by_instrument: Record<string, any>;
    by_regime: Record<string, any>;
    by_score_tier: Record<string, any>;
  };
  dst_timezone_integrity: {
    dst_functioning: boolean;
    summer: any;
    winter: any;
  };
  evaluated_at: string;
}

export interface FeedHealth {
  status: 'HEALTHY' | 'DEGRADED';
  checked_at: string;
  provider: string;
  instruments: Array<{
    symbol: string;
    is_healthy: boolean;
    price: number | null;
    spread_pips: number | null;
    data_age_seconds: number | null;
    is_stale: boolean;
  }>;
}

export interface FullAnalysis {
  symbol: string;
  timeframe: string;
  candle_count: number;
  session: SessionInfo | null;
  analysis: {
    valid: boolean;
    last_close: number;
    indicators: {
      ema20: number | null;
      ema50: number | null;
      ema200: number | null;
      rsi14: number | null;
      atr14: number | null;
    };
    bias: { ema: string; rsi: string; price: string; structure: string };
    structure: {
      structure: string;
      trend: string;
      bos: { direction: string; level: number; label: string } | null;
      choch: { direction: string; level: number; label: string } | null;
      last_swing_high: number | null;
      last_swing_low: number | null;
    };
    fvgs: { all_count: number; active: FVG[]; near_bull: boolean; near_bear: boolean };
    order_blocks: { all: OrderBlock[]; near_bull: boolean; near_bear: boolean };
    liquidity: {
      sweep: { direction: string; swept_level: number; label: string; rejection: boolean } | null;
      equal_highs: number[];
      equal_lows: number[];
    };
    displacement: { direction: string; body_size: number } | null;
    patterns: { name: string; direction: string; strength: number }[];
    levels: {
      resistance: number;
      support: number;
      pdh: number | null;
      pdl: number | null;
      asian_high: number | null;
      asian_low: number | null;
    };
  };
  generated_at: string;
}
