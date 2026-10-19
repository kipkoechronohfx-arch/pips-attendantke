from typing import List
from datetime import datetime, timezone, timedelta
from app.schemas.news import NewsArticleResponse

CURATED_HEADLINES = [
    {
        "id": 1,
        "title": "Fed Chair Signals Measured Approach to Future Rate Decisions as Core Inflation Cools",
        "summary": "Federal Reserve remarks indicate policy remains restrictive with balanced risks between inflation targets and labor market stability.",
        "source": "Reuters Markets",
        "url": "https://www.reuters.com/markets/",
        "sentiment": "BULLISH",
        "affected_currencies": "USD,EUR",
        "published_at": datetime.now(timezone.utc) - timedelta(minutes=24)
    },
    {
        "id": 2,
        "title": "Gold (XAU/USD) Consolidates Above $4,100 Support Amid Record Safe-Haven Bullion Demand",
        "summary": "Spot gold maintains strong momentum above institutional psychological support as Treasury yields adjust and global reserve demand remains elevated.",
        "source": "FXStreet",
        "url": "https://www.fxstreet.com/news",
        "sentiment": "BULLISH",
        "affected_currencies": "XAU,USD",
        "published_at": datetime.now(timezone.utc) - timedelta(minutes=58)
    },
    {
        "id": 3,
        "title": "European Central Bank Holds Key Rates; Markets Price in Potential Q4 Easing Measures",
        "summary": "President Lagarde emphasized data-dependent trajectory while noting ongoing disinflationary pressures across the euro area.",
        "source": "ForexLive",
        "url": "https://www.forexlive.com/",
        "sentiment": "NEUTRAL",
        "affected_currencies": "EUR,USD",
        "published_at": datetime.now(timezone.utc) - timedelta(hours=2, minutes=15)
    },
    {
        "id": 4,
        "title": "Bank of Japan Interventions Assessed as USD/JPY Consolidates Above 158.00 Handle",
        "summary": "Governor Ueda reiterated commitment to gradual policy normalization while monitoring currency pass-through on domestic import prices.",
        "source": "Reuters Markets",
        "url": "https://www.reuters.com/markets/",
        "sentiment": "BEARISH",
        "affected_currencies": "JPY,USD",
        "published_at": datetime.now(timezone.utc) - timedelta(hours=3, minutes=40)
    },
    {
        "id": 5,
        "title": "UK Inflation Prints In-Line with Consensus, Keeping Bank of England Rate Path Flexible",
        "summary": "Sterling holds firm against European cross-currencies following CPI print as services inflation maintains steady pace.",
        "source": "ForexLive",
        "url": "https://www.forexlive.com/",
        "sentiment": "NEUTRAL",
        "affected_currencies": "GBP,USD,EUR",
        "published_at": datetime.now(timezone.utc) - timedelta(hours=5, minutes=10)
    }
]

class NewsService:
    @staticmethod
    def get_latest_news(category: str = "ALL") -> List[NewsArticleResponse]:
        res = []
        for item in CURATED_HEADLINES:
            if category == "ALL" or category.upper() in item["affected_currencies"]:
                res.append(NewsArticleResponse(**item))
        return res

news_service = NewsService()
