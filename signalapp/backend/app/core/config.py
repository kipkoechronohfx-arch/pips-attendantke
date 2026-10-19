from pathlib import Path
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    PROJECT_NAME: str = "Forex Signal Pro API"
    VERSION: str = "2.0.0"
    API_V1_STR: str = "/api/v1"
    APP_ENV: str = "development"
    
    # Environment & Security
    SECRET_KEY: str = "forex-signal-pro-super-secure-jwt-secret-key-production-change-in-env-998811"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    
    # Database
    DATABASE_URL: str = "sqlite:///./forex_signal_pro.db"
    REDIS_URL: str = ""
    
    # Supabase Configuration
    SUPABASE_URL: str = ""
    SUPABASE_ANON_KEY: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    
    # Timezone & Currency
    DEFAULT_TIMEZONE: str = "Africa/Nairobi"
    PRIMARY_CURRENCY: str = "USD"
    
    # External Market Data Services
    MARKET_DATA_PROVIDER: str = "oanda"  # mock, twelvedata, oanda, licensed
    TWELVE_DATA_API_KEY: str = ""
    OANDA_API_TOKEN: str = ""
    OANDA_ACCOUNT_ID: str = ""
    OANDA_IS_PRACTICE: bool = True
    PUBLIC_MARKET_DATA_LICENSE_ENABLED: bool = False
    
    # News Providers
    NEWS_PROVIDER: str = "mock"  # mock, gnews
    GNEWS_API_KEY: str = ""
    
    # Economic Calendar Providers
    ECONOMIC_CALENDAR_PROVIDER: str = "external"  # mock, external, tradingeconomics
    TRADING_ECONOMICS_KEY: str = ""
    
    # Push Notifications & Telegram Alerts
    FIREBASE_PROJECT_ID: str = ""
    GOOGLE_APPLICATION_CREDENTIALS: str = ""
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_CHAT_ID: str = ""
    DISCORD_WEBHOOK_URL: str = ""

    # MT5 Trade Copier API Key
    COPIER_API_KEY: str = "fsp-secret-copier-key-998811"
    
    # Initial Admin Seed Password (override in .env in production)
    INITIAL_ADMIN_PASSWORD: str = "AdminPass123!"

    # MetaApi Cloud Token (get free at https://app.metaapi.cloud)
    # Set this in .env to enable live MT5 trade auto-execution
    METAAPI_TOKEN: str = ""
    METAAPI_MAGIC: int = 889911   # unique EA magic number for this app

    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:8000",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:8000",
        "capacitor://localhost",
        "http://localhost"
    ]
    
    model_config = SettingsConfigDict(
        env_file=(
            str(Path(__file__).resolve().parent.parent.parent.parent / ".env"),
            str(Path(__file__).resolve().parent.parent.parent / ".env"),
            ".env",
            "backend/.env",
        ),
        case_sensitive=True,
        extra="ignore"
    )

settings = Settings()
