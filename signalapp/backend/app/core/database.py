from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from app.core.config import settings

import os

# Normalize PostgreSQL URL if provided by Railway / Heroku / Supabase
db_url = settings.DATABASE_URL
if db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql://", 1)

# Handle SQLite specific parameters
connect_args = {}
if db_url.startswith("sqlite"):
    connect_args = {"check_same_thread": False}
    # Ensure directory exists if path is specified
    db_file_path = db_url.replace("sqlite:///", "")
    if "/" in db_file_path or "\\" in db_file_path:
        os.makedirs(os.path.dirname(os.path.abspath(db_file_path)), exist_ok=True)

engine = create_engine(
    db_url,
    connect_args=connect_args,
    pool_pre_ping=True
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
