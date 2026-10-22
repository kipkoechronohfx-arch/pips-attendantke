/**
 * Session Engine — Timezone-Aware Forex Session Detection & Strategy Profiles
 * Uses IANA timezones via Intl.DateTimeFormat. Handles DST transitions accurately.
 */

'use strict';

// ── Session Definitions ─────────────────────────────────────────────────────
const SESSION_DEFS = [
  {
    id: 'ASIAN',
    name: 'Asian Session',
    timezone: 'Asia/Tokyo',
    open: { h: 9, m: 0 },
    close: { h: 18, m: 0 },
    color: '#6366f1',
    priority_pairs: ['AUD/USD', 'NZD/USD', 'USD/JPY', 'AUD/JPY', 'GBP/JPY'],
    description: 'Tokyo / Sydney. Lower volatility, range-bound. Asian High/Low key levels.',
  },
  {
    id: 'LONDON',
    name: 'London Session',
    timezone: 'Europe/London',
    open: { h: 8, m: 0 },
    close: { h: 17, m: 0 },
    color: '#22d3ee',
    priority_pairs: ['EUR/USD', 'GBP/USD', 'EUR/GBP', 'GBP/JPY', 'EUR/JPY'],
    description: 'London open. Highest liquidity. Asian range breakouts common.',
  },
  {
    id: 'NEW_YORK',
    name: 'New York Session',
    timezone: 'America/New_York',
    open: { h: 8, m: 0 },
    close: { h: 17, m: 0 },
    color: '#f59e0b',
    priority_pairs: ['EUR/USD', 'GBP/USD', 'USD/CAD', 'XAU/USD', 'USD/CHF'],
    description: 'New York open. Strong USD moves. Major news releases.',
  },
];

// ── London–NY Overlap ───────────────────────────────────────────────────────
const OVERLAP = {
  id: 'OVERLAP',
  name: 'London–NY Overlap',
  timezone: 'America/New_York',
  open: { h: 8, m: 0 },
  close: { h: 12, m: 0 }, // 12:00 NY = 17:00 London close
  color: '#10b981',
  priority_pairs: ['EUR/USD', 'GBP/USD', 'XAU/USD', 'GBP/JPY', 'USD/CHF'],
  description: 'Highest volatility window. Peak institutional order execution.',
};

// ── Session-Specific Strategy Profiles (Requirement B) ──────────────────────
const STRATEGY_PROFILES = {
  ASIAN_RANGE: {
    id: 'ASIAN_RANGE',
    name: 'Asian Range & Boundary Fade',
    session_id: 'ASIAN',
    timezone: 'Asia/Tokyo',
    open_local: { h: 9, m: 0 },
    close_local: { h: 17, m: 0 },
    eligible_instruments: ['AUD/USD', 'USD/JPY', 'NZD/USD', 'AUD/JPY', 'EUR/JPY'],
    strategy_type: 'RANGE_BOUND',
    max_spread_pips: 2.2,
    max_spread_atr_ratio: 0.25,
    min_rr: 2.0,
    min_context_score: 55,
    min_setup_score: 65,
    min_confluence_score: 70,
    news_blackout_minutes: 30,
    setup_expiration_hours: 6,
    sl_buffer_atr: 0.4,
    description: 'Fades false breakouts of Asian session extremes back into equilibrium. Avoids trading into incoming London volume.',
    rules: [
      'Identify Asian session 00:00-06:00 UTC high and low',
      'Look for liquidity sweep of high/low without body closure outside range',
      'Wait for M15/M5 rejection candle back inside range',
      'SL placed beyond swept wick + 0.4 ATR',
      'TP1 at range midpoint, TP2 at opposing range boundary',
    ],
  },
  LONDON_OPEN: {
    id: 'LONDON_OPEN',
    name: 'London Open Liquidity Sweep & Breakout Retest',
    session_id: 'LONDON',
    timezone: 'Europe/London',
    open_local: { h: 7, m: 30 }, // Includes 30m pre-market ramp
    close_local: { h: 12, m: 0 }, // Core London morning window
    eligible_instruments: ['EUR/USD', 'GBP/USD', 'EUR/GBP', 'GBP/JPY', 'EUR/JPY'],
    strategy_type: 'BREAKOUT_RETEST',
    max_spread_pips: 1.8,
    max_spread_atr_ratio: 0.20,
    min_rr: 2.2,
    min_context_score: 65,
    min_setup_score: 70,
    min_confluence_score: 75,
    news_blackout_minutes: 30,
    setup_expiration_hours: 4,
    sl_buffer_atr: 0.5,
    description: 'Captures the London "Judas Swing" liquidity sweep of the Asian range followed by genuine directional expansion.',
    rules: [
      'Asian range must be well-formed (< 45 pips for majors)',
      'London open sweeps Asian high or low in first 90 minutes',
      'Displacement candle with body > 1.5x average confirms CHoCH',
      'Entry on M15 pullback to Fair Value Gap or Order Block',
      'SL placed behind origin order block',
      'TP targeted at opposite higher-timeframe liquidity pools',
    ],
  },
  NEW_YORK_CONTINUATION: {
    id: 'NEW_YORK_CONTINUATION',
    name: 'New York Trend Continuation & US Macro',
    session_id: 'NEW_YORK',
    timezone: 'America/New_York',
    open_local: { h: 8, m: 0 },
    close_local: { h: 16, m: 0 },
    eligible_instruments: ['EUR/USD', 'GBP/USD', 'USD/CAD', 'XAU/USD', 'USD/CHF'],
    strategy_type: 'TREND_CONTINUATION',
    max_spread_pips: 2.0,
    max_spread_atr_ratio: 0.22,
    min_rr: 2.0,
    min_context_score: 60,
    min_setup_score: 70,
    min_confluence_score: 75,
    news_blackout_minutes: 30, // 30 mins around CPI, NFP, FOMC
    setup_expiration_hours: 4,
    sl_buffer_atr: 0.5,
    description: 'Trades continuation of established London trend or macro re-pricing after US 08:30 EST high-impact releases.',
    rules: [
      'Confirm H4/H1 trend alignment with London direction',
      'No pending Tier-1 US news within 30 minutes',
      'Entry on M15 pullback to discount/premium FVG',
      'SL beyond recent swing structure',
      'TP at next unmitigated liquidity target',
    ],
  },
  LONDON_NY_OVERLAP: {
    id: 'LONDON_NY_OVERLAP',
    name: 'London–NY Overlap High-Velocity Momentum',
    session_id: 'OVERLAP',
    timezone: 'America/New_York',
    open_local: { h: 8, m: 0 },
    close_local: { h: 12, m: 0 },
    eligible_instruments: ['EUR/USD', 'GBP/USD', 'XAU/USD', 'GBP/JPY', 'USD/CAD'],
    strategy_type: 'MOMENTUM_EXPANSION',
    max_spread_pips: 1.5,
    max_spread_atr_ratio: 0.18,
    min_rr: 2.0,
    min_context_score: 70,
    min_setup_score: 75,
    min_confluence_score: 80,
    news_blackout_minutes: 30,
    setup_expiration_hours: 3,
    sl_buffer_atr: 0.5,
    description: 'Trades maximum global liquidity overlap with tight spreads and strong directional impulse runs.',
    rules: [
      'Both London and New York primary desks active',
      'ADX > 25 or clear directional displacement',
      'Pullback to key M15 liquidity pool or Breaker Block',
      'Minimum 1:2 R:R strictly validated with no overhead obstacle',
      'Quick scale-out on TP1 (+1R) with break-even trailing stop',
    ],
  },
};

/**
 * Returns { hour, minute } in a given IANA timezone for a Date.
 */
function getLocalTime(date, timezone) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    }).formatToParts(date);

    const h = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
    const m = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
    return { h: h === 24 ? 0 : h, m };
  } catch {
    const utcH = date.getUTCHours();
    const utcM = date.getUTCMinutes();
    return { h: utcH, m: utcM };
  }
}

/**
 * Returns true if time {h,m} falls within [open, close) in local session time.
 */
function isInSession(localTime, open, close) {
  const nowMin = localTime.h * 60 + localTime.m;
  const openMin = open.h * 60 + open.m;
  const closeMin = close.h * 60 + close.m;
  if (openMin > closeMin) {
    return nowMin >= openMin || nowMin < closeMin;
  }
  return nowMin >= openMin && nowMin < closeMin;
}

/**
 * Returns minutes until target local time.
 */
function minutesUntil(localTime, target) {
  const nowMin = localTime.h * 60 + localTime.m;
  const targetMin = target.h * 60 + target.m;
  let diff = targetMin - nowMin;
  if (diff < 0) diff += 24 * 60;
  return diff;
}

function formatCountdown(totalMinutes) {
  if (totalMinutes <= 0) return '0m';
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Converts a session's local open/close time into Kenya Time (Africa/Nairobi, UTC+3).
 */
function convertSessionTimeToTimezone(h, m, fromTimezone, toTimezone = 'Africa/Nairobi', refDate = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: fromTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(refDate);

    const year = parts.find((p) => p.type === 'year')?.value;
    const month = parts.find((p) => p.type === 'month')?.value;
    const day = parts.find((p) => p.type === 'day')?.value;

    const baseIso = `${year}-${month}-${day}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`;
    const testDate = new Date(baseIso);

    const fromParts = new Intl.DateTimeFormat('en-US', {
      timeZone: fromTimezone,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    }).formatToParts(testDate);

    const currentFromHour = parseInt(fromParts.find((p) => p.type === 'hour')?.value ?? '0', 10);
    const hourDiff = currentFromHour - h;
    const realDate = new Date(testDate.getTime() - hourDiff * 3600000);

    return realDate.toLocaleTimeString('en-GB', {
      timeZone: toTimezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}

/**
 * Main export: returns full session state for the given Date.
 */
function getSessionState(date = new Date()) {
  const activeSessions = [];
  const inactiveSessions = [];

  for (const sess of SESSION_DEFS) {
    const localTime = getLocalTime(date, sess.timezone);
    const active = isInSession(localTime, sess.open, sess.close);
    if (active) {
      activeSessions.push({ ...sess, localTime });
    } else {
      const minsToOpen = minutesUntil(localTime, sess.open);
      inactiveSessions.push({ ...sess, localTime, minutes_to_open: minsToOpen });
    }
  }

  // Check overlap (London AND New York both active)
  const londonActive = activeSessions.some((s) => s.id === 'LONDON');
  const nyActive = activeSessions.some((s) => s.id === 'NEW_YORK');
  const overlapActive = londonActive && nyActive;

  // Primary session (for display)
  let primary = null;
  if (overlapActive) {
    primary = { ...OVERLAP, is_active: true };
  } else if (activeSessions.length > 0) {
    const order = ['LONDON', 'NEW_YORK', 'ASIAN'];
    for (const id of order) {
      const found = activeSessions.find((s) => s.id === id);
      if (found) { primary = { ...found, is_active: true }; break; }
    }
    if (!primary) primary = { ...activeSessions[0], is_active: true };
  } else {
    const next = inactiveSessions.sort((a, b) => a.minutes_to_open - b.minutes_to_open)[0];
    primary = { ...next, is_active: false };
  }

  const allNextCandidates = [...SESSION_DEFS, OVERLAP].filter(
    (s) => s.id !== primary?.id
  );
  const nextSession = allNextCandidates
    .map((s) => {
      const lt = getLocalTime(date, s.timezone);
      const mto = minutesUntil(lt, s.open);
      return { ...s, minutes_to_open: mto };
    })
    .sort((a, b) => a.minutes_to_open - b.minutes_to_open)[0];

  const countdown = primary?.is_active
    ? formatCountdown(minutesUntil(getLocalTime(date, primary.timezone || 'UTC'), primary.close))
    : formatCountdown(primary?.minutes_to_open ?? 0);

  // Active strategy profiles
  const activeProfiles = getActiveProfiles(date);

  const kenyaLocal = getLocalTime(date, 'Africa/Nairobi');
  const kenyaTimeStr = `${String(kenyaLocal.h).padStart(2, '0')}:${String(kenyaLocal.m).padStart(2, '0')}`;

  const primaryEatOpen = primary ? convertSessionTimeToTimezone(primary.open.h, primary.open.m, primary.timezone, 'Africa/Nairobi', date) : null;
  const primaryEatClose = primary ? convertSessionTimeToTimezone(primary.close.h, primary.close.m, primary.timezone, 'Africa/Nairobi', date) : null;

  return {
    timestamp_utc: date.toISOString(),
    kenya_time: `${kenyaTimeStr} EAT`,
    kenya_timezone: 'Africa/Nairobi',
    active_sessions: activeSessions.map((s) => s.id),
    is_overlap: overlapActive,
    primary_session: primary
      ? {
          id: primary.id,
          name: primary.name,
          is_active: primary.is_active,
          color: primary.color,
          priority_pairs: primary.priority_pairs,
          description: primary.description,
          countdown_label: primary.is_active ? 'Closes in' : 'Opens in',
          countdown: countdown,
          eat_open: primaryEatOpen,
          eat_close: primaryEatClose,
          eat_schedule: `${primaryEatOpen} – ${primaryEatClose} EAT`,
        }
      : null,
    next_session: nextSession
      ? {
          id: nextSession.id,
          name: nextSession.name,
          color: nextSession.color,
          priority_pairs: nextSession.priority_pairs,
          minutes_to_open: nextSession.minutes_to_open,
          countdown: formatCountdown(nextSession.minutes_to_open),
        }
      : null,
    active_strategy_profiles: activeProfiles.map(p => ({
      id: p.id,
      name: p.name,
      strategy_type: p.strategy_type,
      eligible_instruments: p.eligible_instruments,
      max_spread_pips: p.max_spread_pips,
      min_confluence_score: p.min_confluence_score
    })),
    all_sessions: SESSION_DEFS.map((s) => {
      const lt = getLocalTime(date, s.timezone);
      const active = isInSession(lt, s.open, s.close);
      const eatOpen = convertSessionTimeToTimezone(s.open.h, s.open.m, s.timezone, 'Africa/Nairobi', date);
      const eatClose = convertSessionTimeToTimezone(s.close.h, s.close.m, s.timezone, 'Africa/Nairobi', date);
      return {
        id: s.id,
        name: s.name,
        is_active: active,
        color: s.color,
        priority_pairs: s.priority_pairs,
        local_time: `${String(lt.h).padStart(2, '0')}:${String(lt.m).padStart(2, '0')}`,
        open: `${String(s.open.h).padStart(2, '0')}:${String(s.open.m).padStart(2, '0')}`,
        close: `${String(s.close.h).padStart(2, '0')}:${String(s.close.m).padStart(2, '0')}`,
        eat_open: eatOpen,
        eat_close: eatClose,
        eat_schedule: `${eatOpen} – ${eatClose} EAT`,
      };
    }),
  };
}

/**
 * Returns strategy profile evaluated for the given time.
 */
function getStrategyProfile(profileId, date = new Date()) {
  const base = STRATEGY_PROFILES[profileId];
  if (!base) return null;

  const lt = getLocalTime(date, base.timezone);
  const isActive = isInSession(lt, base.open_local, base.close_local);
  const minsToOpen = minutesUntil(lt, base.open_local);
  const minsToClose = minutesUntil(lt, base.close_local);

  return {
    ...base,
    is_active: isActive,
    local_time: `${String(lt.h).padStart(2, '0')}:${String(lt.m).padStart(2, '0')}`,
    minutes_to_open: minsToOpen,
    minutes_to_close: minsToClose,
    time_label: isActive ? `Active (closes in ${formatCountdown(minsToClose)})` : `Inactive (opens in ${formatCountdown(minsToOpen)})`
  };
}

/**
 * Returns list of currently active strategy profiles.
 */
function getActiveProfiles(date = new Date()) {
  return Object.keys(STRATEGY_PROFILES)
    .map(id => getStrategyProfile(id, date))
    .filter(p => p && p.is_active);
}

/**
 * Enforces profile eligibility for a given symbol and time.
 * If allow_pre_post is false, setups outside active profile window are strictly rejected.
 */
function isProfileEligible(profileId, symbol, date = new Date(), options = {}) {
  const profile = getStrategyProfile(profileId, date);
  if (!profile) {
    return { eligible: false, reason: `Unknown strategy profile: ${profileId}` };
  }

  // Check window
  if (!profile.is_active && !options.allow_pre_post) {
    return {
      eligible: false,
      reason: `Profile ${profile.name} is currently inactive (window: ${profile.time_label})`,
      code: 'PROFILE_INACTIVE'
    };
  }

  // Check instrument
  const normSym = symbol.replace('/', '');
  const isPairEligible = profile.eligible_instruments.some(
    p => p.replace('/', '') === normSym
  );
  if (!isPairEligible) {
    return {
      eligible: false,
      reason: `${symbol} is not eligible for strategy profile ${profile.name} (eligible: ${profile.eligible_instruments.join(', ')})`,
      code: 'INSTRUMENT_NOT_ELIGIBLE'
    };
  }

  return { eligible: true, profile };
}

/**
 * Session suitability score (0-10) for confluence scoring.
 */
function getSessionSuitability(symbol, sessionState) {
  if (!sessionState || !sessionState.primary_session) return 5;
  const prio = sessionState.primary_session.priority_pairs || [];
  const norm = symbol.replace('/', '');
  if (prio.some(p => p.replace('/', '') === norm)) return 10;
  if (sessionState.is_overlap && OVERLAP.priority_pairs.some(p => p.replace('/', '') === norm)) return 10;
  return 4;
}

/**
 * Hard-gate check for illiquid windows (weekend, rollover, late Friday).
 */
function isEntryAllowed(date = new Date()) {
  const utcH = date.getUTCHours();
  const utcDay = date.getUTCDay(); // 0=Sun, 5=Fri, 6=Sat

  if (utcDay === 6) return { allowed: false, reason: 'Weekend — market closed (Saturday)', code: 'MARKET_CLOSED_WEEKEND' };
  if (utcDay === 0 && utcH < 22) return { allowed: false, reason: 'Weekend — market closed (Sunday pre-open)', code: 'MARKET_CLOSED_WEEKEND' };

  if (utcDay === 5 && utcH >= 22) return { allowed: false, reason: 'Late Friday — approaching weekly close', code: 'LATE_FRIDAY_CLOSE' };

  if (utcH === 21 && date.getUTCMinutes() >= 55) return { allowed: false, reason: 'Daily rollover window (21:55–22:05 UTC)', code: 'ROLLOVER_BLACKOUT' };
  if (utcH === 22 && date.getUTCMinutes() < 5) return { allowed: false, reason: 'Daily rollover window (21:55–22:05 UTC)', code: 'ROLLOVER_BLACKOUT' };

  return { allowed: true, reason: null };
}

/**
 * Unit verification for IANA timezones & Daylight Saving transitions
 */
function testTimezoneAndDst() {
  const summerDate = new Date('2026-07-15T13:30:00Z'); // Summer (EDT UTC-4, BST UTC+1)
  const winterDate = new Date('2026-01-15T13:30:00Z'); // Winter (EST UTC-5, GMT UTC+0)

  const summerNY = getLocalTime(summerDate, 'America/New_York');
  const winterNY = getLocalTime(winterDate, 'America/New_York');
  const summerLondon = getLocalTime(summerDate, 'Europe/London');
  const winterLondon = getLocalTime(winterDate, 'Europe/London');

  return {
    summer: {
      utc: '13:30 UTC',
      new_york_edt: `${summerNY.h}:${summerNY.m} (expected 9:30 EDT)`,
      london_bst: `${summerLondon.h}:${summerLondon.m} (expected 14:30 BST)`
    },
    winter: {
      utc: '13:30 UTC',
      new_york_est: `${winterNY.h}:${winterNY.m} (expected 8:30 EST)`,
      london_gmt: `${winterLondon.h}:${winterLondon.m} (expected 13:30 GMT)`
    },
    dst_functioning: summerNY.h === 9 && winterNY.h === 8 && summerLondon.h === 14 && winterLondon.h === 13
  };
}

module.exports = {
  getSessionState,
  getSessionSuitability,
  isEntryAllowed,
  getStrategyProfile,
  getActiveProfiles,
  isProfileEligible,
  testTimezoneAndDst,
  SESSION_DEFS,
  OVERLAP,
  STRATEGY_PROFILES,
};
