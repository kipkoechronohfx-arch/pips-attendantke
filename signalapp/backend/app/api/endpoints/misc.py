from fastapi import APIRouter, Query, Depends
from typing import List, Optional
from app.services.news_service.news import news_service
from app.services.calendar_service.calendar import calendar_service
from app.services.risk_engine.calculator import risk_engine
from app.schemas.news import NewsArticleResponse, EconomicEventResponse
from app.schemas.risk import RiskCalculationRequest, RiskCalculationResponse
from app.schemas.news import AlertCreate, AlertResponse
from app.models.alert import PriceAlert
from app.models.user import User
from app.core.database import get_db
from app.api.deps import get_current_user
from sqlalchemy.orm import Session

news_router = APIRouter()
calendar_router = APIRouter()
risk_router = APIRouter()
alerts_router = APIRouter()

# News Endpoints
@news_router.get("/", response_model=List[NewsArticleResponse])
def get_news(
    category: str = Query("ALL", description="Currency or market category (e.g. ALL, USD, EUR, XAU)"),
    refresh: bool = Query(False, description="Force re-fetch from live RSS feeds")
):
    return news_service.get_latest_news(category=category, force_refresh=refresh)

# Calendar Endpoints
@calendar_router.get("/", response_model=List[EconomicEventResponse])
def get_economic_calendar(
    timezone: str = Query("Africa/Nairobi", description="Target timezone for scheduled times"),
    currency: Optional[str] = Query(None, description="Currency filter (e.g. USD, EUR, GBP)"),
    impact: Optional[str] = Query(None, description="Impact filter (HIGH, MEDIUM, ALL)")
):
    return calendar_service.get_events(user_timezone=timezone, currency_filter=currency, impact_filter=impact)

# Risk Calculator Endpoint
@risk_router.post("/calculate", response_model=RiskCalculationResponse)
def calculate_position_risk(request: RiskCalculationRequest):
    return risk_engine.calculate_position(request)

# Alerts Endpoints
@alerts_router.get("/", response_model=List[AlertResponse])
def get_user_alerts(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(PriceAlert).filter(PriceAlert.user_id == current_user.id).all()

@alerts_router.post("/", response_model=AlertResponse)
def create_price_alert(alert_in: AlertCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    alert = PriceAlert(
        user_id=current_user.id,
        symbol=alert_in.symbol,
        target_price=alert_in.target_price,
        condition=alert_in.condition,
        notes=alert_in.notes
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return alert
