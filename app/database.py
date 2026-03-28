"""Database configuration using PostgreSQL connection from environment."""

from collections.abc import Generator
import os

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL environment variable is required and must point to PostgreSQL.")

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db() -> Generator:
    """Yield SQLAlchemy DB session and ensure cleanup."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
