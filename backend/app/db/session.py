import os
import logging

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool
from ..config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()

DATABASE_URL = settings.database_url

if not DATABASE_URL and os.environ.get("ENV", "development").lower() in ("production", "prod"):
    raise RuntimeError("[FATAL] DATABASE_URL is not configured in production")

if DATABASE_URL:
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+asyncpg://", 1)
    elif DATABASE_URL.startswith("postgresql://") and "+asyncpg" not in DATABASE_URL:
        DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

if not DATABASE_URL:
    # Fallback for build/test environments without DB
    logger.warning("DATABASE_URL is not set. Using dummy URL.")
    DATABASE_URL = "postgresql+asyncpg://user:pass@localhost/dbname"

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    future=True,
    # TODO DB-4: Configure database connection pooling for production.
    # TODO DB-4: Consider SQLAlchemy pool settings (pool_size, max_overflow) or pgBouncer integration.
    # Supabase Pooler 사용 시 NullPool 필수 (공식 문서 권장)
    poolclass=NullPool,
    connect_args={
        "statement_cache_size": 0,  # Disable prepared statements for Pooler
        "prepared_statement_cache_size": 0,
    }
)

AsyncSessionLocal = sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)

async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
