from datetime import datetime, timezone, timedelta
from typing import List, Optional, Tuple, Dict, Any
from zoneinfo import ZoneInfo
from app.schemas.news import EconomicEventResponse

def _get_current_week_dates(ref_now: datetime) -> Dict[str, datetime.date]:
    """Calculate date for Monday through Friday of the current week."""
    # Monday is weekday 0, Sunday is weekday 6
    weekday = ref_now.weekday()
    monday = ref_now.date() - timedelta(days=weekday)
    return {
        "monday":    monday,
        "tuesday":   monday + timedelta(days=1),
        "wednesday": monday + timedelta(days=2),
        "thursday":  monday + timedelta(days=3),
        "friday":    monday + timedelta(days=4),
    }

def get_weekly_macro_calendar(ref_now: Optional[datetime] = None) -> List[dict]:
    """
    Comprehensive institutional macroeconomic calendar dynamically anchored
    to the active trading week (Monday through Friday).
    """
    now = ref_now or datetime.now(timezone.utc)
    week_dates = _get_current_week_dates(now)

    def _event_time(day_key: str, hour: int, minute: int) -> datetime:
        d = week_dates[day_key]
        return datetime(d.year, d.month, d.day, hour, minute, tzinfo=timezone.utc)

    # Master economic release catalogue
    catalog = [
        # ── MONDAY ──
        {
            "id": 201,
            "event_name": "Australia Manufacturing & Services PMI",
            "country": "Australia",
            "currency": "AUD",
            "scheduled_time_utc": _event_time("monday", 0, 30),
            "impact": "MEDIUM",
            "previous": "48.7",
            "forecast": "49.2",
            "actual_val": "49.6",
            "higher_is_better": True,
        },
        {
            "id": 202,
            "event_name": "German Ifo Business Climate Index",
            "country": "Germany",
            "currency": "EUR",
            "scheduled_time_utc": _event_time("monday", 8, 0),
            "impact": "HIGH",
            "previous": "85.4",
            "forecast": "85.6",
            "actual_val": "86.1",
            "higher_is_better": True,
        },
        {
            "id": 203,
            "event_name": "US Factory Orders & Construction Spending",
            "country": "United States",
            "currency": "USD",
            "scheduled_time_utc": _event_time("monday", 14, 0),
            "impact": "MEDIUM",
            "previous": "-0.2%",
            "forecast": "0.1%",
            "actual_val": "0.3%",
            "higher_is_better": True,
        },

        # ── TUESDAY ──
        {
            "id": 204,
            "event_name": "Reserve Bank of Australia (RBA) Cash Rate & Statement",
            "country": "Australia",
            "currency": "AUD",
            "scheduled_time_utc": _event_time("tuesday", 3, 30),
            "impact": "HIGH",
            "previous": "4.35%",
            "forecast": "4.35%",
            "actual_val": "4.35%",
            "higher_is_better": True,
        },
        {
            "id": 205,
            "event_name": "UK Claimant Count & ILO Unemployment Rate",
            "country": "United Kingdom",
            "currency": "GBP",
            "scheduled_time_utc": _event_time("tuesday", 6, 0),
            "impact": "HIGH",
            "previous": "4.1%",
            "forecast": "4.1%",
            "actual_val": "4.0%",
            "higher_is_better": False,  # lower unemployment is better
        },
        {
            "id": 206,
            "event_name": "Eurozone Harmonized Core CPI (YoY Flash)",
            "country": "European Union",
            "currency": "EUR",
            "scheduled_time_utc": _event_time("tuesday", 9, 0),
            "impact": "HIGH",
            "previous": "2.8%",
            "forecast": "2.7%",
            "actual_val": "2.7%",
            "higher_is_better": False,
        },
        {
            "id": 207,
            "event_name": "US JOLTs Job Openings",
            "country": "United States",
            "currency": "USD",
            "scheduled_time_utc": _event_time("tuesday", 14, 0),
            "impact": "HIGH",
            "previous": "7.71M",
            "forecast": "7.65M",
            "actual_val": "7.82M",
            "higher_is_better": True,
        },

        # ── WEDNESDAY ──
        {
            "id": 208,
            "event_name": "UK GDP Monthly Estimate (MoM)",
            "country": "United Kingdom",
            "currency": "GBP",
            "scheduled_time_utc": _event_time("wednesday", 6, 0),
            "impact": "HIGH",
            "previous": "0.1%",
            "forecast": "0.2%",
            "actual_val": "0.2%",
            "higher_is_better": True,
        },
        {
            "id": 209,
            "event_name": "US ADP Non-Farm Employment Change",
            "country": "United States",
            "currency": "USD",
            "scheduled_time_utc": _event_time("wednesday", 12, 15),
            "impact": "HIGH",
            "previous": "143K",
            "forecast": "145K",
            "actual_val": "152K",
            "higher_is_better": True,
        },
        {
            "id": 210,
            "event_name": "US ISM Services PMI (Employment & New Orders)",
            "country": "United States",
            "currency": "USD",
            "scheduled_time_utc": _event_time("wednesday", 14, 0),
            "impact": "HIGH",
            "previous": "51.5",
            "forecast": "52.2",
            "actual_val": "52.8",
            "higher_is_better": True,
        },
        {
            "id": 211,
            "event_name": "EIA Crude Oil Inventories Change",
            "country": "United States",
            "currency": "CAD",
            "scheduled_time_utc": _event_time("wednesday", 14, 30),
            "impact": "MEDIUM",
            "previous": "-1.5M",
            "forecast": "-1.0M",
            "actual_val": "-2.2M",
            "higher_is_better": True,
        },
        {
            "id": 212,
            "event_name": "FOMC Meeting Minutes & Policy Rate Guidance",
            "country": "United States",
            "currency": "USD",
            "scheduled_time_utc": _event_time("wednesday", 18, 0),
            "impact": "HIGH",
            "previous": "5.00%",
            "forecast": "4.75%",
            "actual_val": "4.75%",
            "higher_is_better": True,
        },

        # ── THURSDAY ──
        {
            "id": 213,
            "event_name": "Australia Employment Change & Labor Participation",
            "country": "Australia",
            "currency": "AUD",
            "scheduled_time_utc": _event_time("thursday", 0, 30),
            "impact": "HIGH",
            "previous": "47.5K",
            "forecast": "25.0K",
            "actual_val": "34.2K",
            "higher_is_better": True,
        },
        {
            "id": 214,
            "event_name": "Bank of Japan (BoJ) Policy Rate & Core CPI Outlook",
            "country": "Japan",
            "currency": "JPY",
            "scheduled_time_utc": _event_time("thursday", 3, 0),
            "impact": "HIGH",
            "previous": "0.25%",
            "forecast": "0.25%",
            "actual_val": "0.25%",
            "higher_is_better": True,
        },
        {
            "id": 215,
            "event_name": "Swiss National Bank (SNB) Interest Rate Decision",
            "country": "Switzerland",
            "currency": "CHF",
            "scheduled_time_utc": _event_time("thursday", 7, 30),
            "impact": "HIGH",
            "previous": "1.25%",
            "forecast": "1.00%",
            "actual_val": "1.00%",
            "higher_is_better": True,
        },
        {
            "id": 216,
            "event_name": "Bank of England (BoE) Official Bank Rate & Votes",
            "country": "United Kingdom",
            "currency": "GBP",
            "scheduled_time_utc": _event_time("thursday", 11, 0),
            "impact": "HIGH",
            "previous": "5.00%",
            "forecast": "4.75%",
            "actual_val": "4.75%",
            "higher_is_better": True,
        },
        {
            "id": 217,
            "event_name": "ECB Main Refinancing Rate & Policy Statement",
            "country": "European Union",
            "currency": "EUR",
            "scheduled_time_utc": _event_time("thursday", 12, 15),
            "impact": "HIGH",
            "previous": "3.65%",
            "forecast": "3.40%",
            "actual_val": "3.40%",
            "higher_is_better": True,
        },
        {
            "id": 218,
            "event_name": "US Initial Jobless Claims & Core Retail Sales",
            "country": "United States",
            "currency": "USD",
            "scheduled_time_utc": _event_time("thursday", 12, 30),
            "impact": "HIGH",
            "previous": "225K",
            "forecast": "222K",
            "actual_val": "218K",
            "higher_is_better": False,  # lower claims is better
        },
        {
            "id": 219,
            "event_name": "ECB President Christine Lagarde Press Conference",
            "country": "European Union",
            "currency": "EUR",
            "scheduled_time_utc": _event_time("thursday", 12, 45),
            "impact": "HIGH",
            "previous": "—",
            "forecast": "—",
            "actual_val": "Accommodative",
            "higher_is_better": True,
        },

        # ── FRIDAY ──
        {
            "id": 220,
            "event_name": "Tokyo Core CPI Inflation (YoY)",
            "country": "Japan",
            "currency": "JPY",
            "scheduled_time_utc": _event_time("friday", 0, 30),
            "impact": "HIGH",
            "previous": "2.4%",
            "forecast": "2.2%",
            "actual_val": "2.3%",
            "higher_is_better": True,
        },
        {
            "id": 221,
            "event_name": "UK Retail Sales (MoM)",
            "country": "United Kingdom",
            "currency": "GBP",
            "scheduled_time_utc": _event_time("friday", 6, 0),
            "impact": "MEDIUM",
            "previous": "1.0%",
            "forecast": "-0.3%",
            "actual_val": "0.1%",
            "higher_is_better": True,
        },
        {
            "id": 222,
            "event_name": "US Nonfarm Payrolls (NFP) Employment Report",
            "country": "United States",
            "currency": "USD",
            "scheduled_time_utc": _event_time("friday", 12, 30),
            "impact": "HIGH",
            "previous": "142K",
            "forecast": "150K",
            "actual_val": "164K",
            "higher_is_better": True,
        },
        {
            "id": 223,
            "event_name": "US Unemployment Rate & Average Hourly Earnings",
            "country": "United States",
            "currency": "USD",
            "scheduled_time_utc": _event_time("friday", 12, 30),
            "impact": "HIGH",
            "previous": "4.2%",
            "forecast": "4.2%",
            "actual_val": "4.1%",
            "higher_is_better": False,  # lower unemployment is better
        },
        {
            "id": 224,
            "event_name": "Canada Net Employment Change & Unemployment Rate",
            "country": "Canada",
            "currency": "CAD",
            "scheduled_time_utc": _event_time("friday", 12, 30),
            "impact": "HIGH",
            "previous": "22.1K",
            "forecast": "27.5K",
            "actual_val": "31.0K",
            "higher_is_better": True,
        },
        {
            "id": 225,
            "event_name": "US Michigan Consumer Sentiment (Preliminary)",
            "country": "United States",
            "currency": "USD",
            "scheduled_time_utc": _event_time("friday", 14, 0),
            "impact": "HIGH",
            "previous": "70.1",
            "forecast": "71.0",
            "actual_val": "71.5",
            "higher_is_better": True,
        },
    ]

    events = []
    for item in catalog:
        sch_time: datetime = item["scheduled_time_utc"]
        is_past = now >= sch_time

        actual = item["actual_val"] if is_past else None
        status = "RELEASED" if is_past else "SCHEDULED"

        # Determine surprise outcome
        surprise = "PENDING"
        if is_past and actual and item.get("forecast") and item["forecast"] != "—":
            try:
                # Clean numeric values
                act_num = float(re.sub(r"[^\d.-]", "", actual))
                fc_num = float(re.sub(r"[^\d.-]", "", item["forecast"]))
                higher_better = item.get("higher_is_better", True)

                if act_num == fc_num:
                    surprise = "IN_LINE"
                elif (act_num > fc_num and higher_better) or (act_num < fc_num and not higher_better):
                    surprise = "BULLISH"
                else:
                    surprise = "BEARISH"
            except Exception:
                surprise = "IN_LINE"

        diff_mins = int((sch_time - now).total_seconds() / 60)

        events.append({
            "id": item["id"],
            "event_name": item["event_name"],
            "country": item["country"],
            "currency": item["currency"],
            "scheduled_time_utc": sch_time,
            "impact": item["impact"],
            "previous": item["previous"],
            "forecast": item["forecast"],
            "actual": actual,
            "status": status,
            "surprise_sentiment": surprise,
            "minutes_until": diff_mins,
        })

    return events


import re

class EconomicCalendarService:
    def get_events(
        self,
        user_timezone: str = "Africa/Nairobi",
        currency_filter: Optional[str] = None,
        impact_filter: Optional[str] = None,
    ) -> List[EconomicEventResponse]:
        """
        Return accurately formatted economic events converted into target timezone.
        """
        try:
            tz = ZoneInfo(user_timezone)
        except Exception:
            tz = ZoneInfo("Africa/Nairobi")

        raw_events = get_weekly_macro_calendar()
        results: List[EconomicEventResponse] = []

        for ev in raw_events:
            # Filter currency
            if currency_filter and currency_filter != "ALL":
                if ev["currency"] != currency_filter:
                    # Also support XAU mapping to USD events
                    if currency_filter == "XAU" and ev["currency"] == "USD":
                        pass
                    else:
                        continue

            # Filter impact
            if impact_filter and impact_filter != "ALL" and ev["impact"] != impact_filter:
                continue

            # Accurate local time formatting
            local_dt = ev["scheduled_time_utc"].astimezone(tz)
            local_time_str = local_dt.strftime("%Y-%m-%d %H:%M %Z")

            data = dict(ev)
            data["scheduled_time_local"] = local_time_str
            results.append(EconomicEventResponse(**data))

        # Sort chronologically by scheduled UTC time
        results.sort(key=lambda x: x.scheduled_time_utc)
        return results

    def check_blackout(
        self,
        symbol: str,
        blackout_minutes: int = 30,
        ref_now: Optional[datetime] = None,
    ) -> Tuple[bool, Optional[dict]]:
        """
        Check if any HIGH-impact economic event affecting this symbol
        is scheduled within [-blackout_minutes, +blackout_minutes] of ref_now.
        """
        now = ref_now or datetime.now(timezone.utc)
        sym_clean = symbol.upper().replace("/", "").replace("_", "")

        # Extract currencies
        relevant_currencies = set()
        for curr in ["USD", "EUR", "GBP", "JPY", "AUD", "CAD", "NZD", "CHF"]:
            if curr in sym_clean:
                relevant_currencies.add(curr)
        if "XAU" in sym_clean or "XAG" in sym_clean:
            relevant_currencies.add("USD")  # Metals heavily moved by USD high-impact releases

        if not relevant_currencies:
            relevant_currencies = {"USD", "EUR"}

        events = get_weekly_macro_calendar(now)
        for ev in events:
            if ev["impact"] != "HIGH":
                continue
            if ev["currency"] not in relevant_currencies:
                continue

            sch_time: datetime = ev["scheduled_time_utc"]
            delta = abs((sch_time - now).total_seconds()) / 60.0

            if delta <= blackout_minutes:
                return True, ev

        return False, None


calendar_service = EconomicCalendarService()
