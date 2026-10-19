from datetime import datetime, timezone, timedelta
from typing import List, Optional
from zoneinfo import ZoneInfo
from app.schemas.news import EconomicEventResponse

def get_live_calendar_events() -> List[dict]:
    now = datetime.now(timezone.utc)
    today = now.date()
    yesterday = today - timedelta(days=1)
    tomorrow = today + timedelta(days=1)

    raw_events = [
        # Today's London Session (06:00 UTC = 09:00 EAT)
        {
            "id": 101,
            "event_name": "UK GDP Monthly Estimate (MoM)",
            "country": "United Kingdom",
            "currency": "GBP",
            "scheduled_time_utc": datetime(today.year, today.month, today.day, 6, 0, tzinfo=timezone.utc),
            "impact": "HIGH",
            "previous": "0.1%",
            "forecast": "0.2%",
            "actual": "0.2%",
            "status": "RELEASED"
        },
        # Today's European Session (08:00 UTC = 11:00 EAT)
        {
            "id": 102,
            "event_name": "German ZEW Economic Sentiment",
            "country": "Germany",
            "currency": "EUR",
            "scheduled_time_utc": datetime(today.year, today.month, today.day, 8, 0, tzinfo=timezone.utc),
            "impact": "MEDIUM",
            "previous": "3.6",
            "forecast": "10.0",
            "actual": "13.1",
            "status": "RELEASED"
        },
        # Frankfurt ECB (12:15 UTC = 15:15 EAT)
        {
            "id": 103,
            "event_name": "ECB Monetary Policy Statement & Rate Decision",
            "country": "European Union",
            "currency": "EUR",
            "scheduled_time_utc": datetime(today.year, today.month, today.day, 12, 15, tzinfo=timezone.utc),
            "impact": "HIGH",
            "previous": "3.65%",
            "forecast": "3.40%",
            "actual": "3.40%" if now.hour >= 13 else None,
            "status": "RELEASED" if now.hour >= 13 else "SCHEDULED"
        },
        # US Session Open (12:30 UTC = 15:30 EAT)
        {
            "id": 104,
            "event_name": "US Core CPI Inflation (YoY)",
            "country": "United States",
            "currency": "USD",
            "scheduled_time_utc": datetime(today.year, today.month, today.day, 12, 30, tzinfo=timezone.utc),
            "impact": "HIGH",
            "previous": "3.2%",
            "forecast": "3.1%",
            "actual": "3.1%" if now.hour >= 13 else None,
            "status": "RELEASED" if now.hour >= 13 else "SCHEDULED"
        },
        # US Session Retail (12:30 UTC = 15:30 EAT)
        {
            "id": 105,
            "event_name": "US Core Retail Sales (MoM)",
            "country": "United States",
            "currency": "USD",
            "scheduled_time_utc": datetime(today.year, today.month, today.day, 12, 30, tzinfo=timezone.utc),
            "impact": "HIGH",
            "previous": "0.1%",
            "forecast": "0.3%",
            "actual": "0.4%" if now.hour >= 13 else None,
            "status": "RELEASED" if now.hour >= 13 else "SCHEDULED"
        },
        # US Session Afternoon (14:00 UTC = 17:00 EAT)
        {
            "id": 106,
            "event_name": "US ISM Services PMI",
            "country": "United States",
            "currency": "USD",
            "scheduled_time_utc": datetime(today.year, today.month, today.day, 14, 0, tzinfo=timezone.utc),
            "impact": "HIGH",
            "previous": "51.5",
            "forecast": "52.2",
            "actual": "52.8" if now.hour >= 15 else None,
            "status": "RELEASED" if now.hour >= 15 else "SCHEDULED"
        },
        # US Late Session FOMC (18:00 UTC = 21:00 EAT)
        {
            "id": 107,
            "event_name": "FOMC Meeting Minutes & Policy Guidance",
            "country": "United States",
            "currency": "USD",
            "scheduled_time_utc": datetime(today.year, today.month, today.day, 18, 0, tzinfo=timezone.utc),
            "impact": "HIGH",
            "previous": "5.00%",
            "forecast": "4.75%",
            "actual": "4.75%" if now.hour >= 19 else None,
            "status": "RELEASED" if now.hour >= 19 else "SCHEDULED"
        },
        # Tomorrow Asian Session (00:30 UTC = 03:30 EAT)
        {
            "id": 108,
            "event_name": "Australia Employment Change & Unemployment Rate",
            "country": "Australia",
            "currency": "AUD",
            "scheduled_time_utc": datetime(tomorrow.year, tomorrow.month, tomorrow.day, 0, 30, tzinfo=timezone.utc),
            "impact": "HIGH",
            "previous": "47.5K",
            "forecast": "25.0K",
            "actual": None,
            "status": "SCHEDULED"
        },
        # Tomorrow Tokyo Session (03:00 UTC = 06:00 EAT)
        {
            "id": 109,
            "event_name": "Bank of Japan (BoJ) Policy Rate & Core CPI",
            "country": "Japan",
            "currency": "JPY",
            "scheduled_time_utc": datetime(tomorrow.year, tomorrow.month, tomorrow.day, 3, 0, tzinfo=timezone.utc),
            "impact": "HIGH",
            "previous": "0.25%",
            "forecast": "0.25%",
            "actual": None,
            "status": "SCHEDULED"
        },
        # Tomorrow US Session (12:30 UTC = 15:30 EAT)
        {
            "id": 110,
            "event_name": "US Nonfarm Payrolls (NFP) & Average Hourly Earnings",
            "country": "United States",
            "currency": "USD",
            "scheduled_time_utc": datetime(tomorrow.year, tomorrow.month, tomorrow.day, 12, 30, tzinfo=timezone.utc),
            "impact": "HIGH",
            "previous": "142K",
            "forecast": "150K",
            "actual": None,
            "status": "SCHEDULED"
        }
    ]
    return raw_events

class EconomicCalendarService:
    @staticmethod
    def get_events(user_timezone: str = "Africa/Nairobi", currency_filter: Optional[str] = None, impact_filter: Optional[str] = None) -> List[EconomicEventResponse]:
        try:
            tz = ZoneInfo(user_timezone)
        except Exception:
            tz = ZoneInfo("Africa/Nairobi")

        events = get_live_calendar_events()
        results = []

        for ev in events:
            if currency_filter and currency_filter != "ALL" and ev["currency"] != currency_filter:
                continue
            if impact_filter and impact_filter != "ALL" and ev["impact"] != impact_filter:
                continue

            # Format cleanly in target timezone (e.g. 2026-10-15 15:30 EAT)
            local_dt = ev["scheduled_time_utc"].astimezone(tz)
            local_time_str = local_dt.strftime("%Y-%m-%d %H:%M %Z")

            item = dict(ev)
            item["scheduled_time_local"] = local_time_str
            results.append(EconomicEventResponse(**item))

        # Sort by scheduled time
        results.sort(key=lambda x: x.scheduled_time_utc)
        return results

calendar_service = EconomicCalendarService()
