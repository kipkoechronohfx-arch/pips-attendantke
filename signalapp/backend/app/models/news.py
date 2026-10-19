from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime, Text
from app.core.database import Base

class NewsArticle(Base):
    __tablename__ = "news_articles"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(300), nullable=False)
    summary = Column(Text, nullable=True)
    source = Column(String(100), nullable=False) # Reuters, ForexLive, FXStreet, Bloomberg
    url = Column(String(500), nullable=False)
    sentiment = Column(String(20), default="NEUTRAL") # BULLISH, BEARISH, NEUTRAL
    affected_currencies = Column(String(100), default="USD") # e.g. "USD,EUR,XAU"
    published_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
