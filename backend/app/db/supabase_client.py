"""
Supabase 클라이언트 모듈

동기 클라이언트를 사용하되, async 핸들러에서 블로킹 없이 사용할 수 있도록
run_in_threadpool 헬퍼 함수를 제공합니다.
"""
import os
from typing import Callable, Optional, TypeVar, cast

from dotenv import load_dotenv
from starlette.concurrency import run_in_threadpool
from supabase import Client, create_client

load_dotenv()

T = TypeVar("T")


def _is_testing() -> bool:
    return os.getenv("TESTING", "").strip().lower() in {"1", "true", "yes", "on"}


class _DisabledSupabaseClient:
    """테스트 환경에서 Supabase 환경변수 없이 import를 허용하되,
    실제 DB 접근 시 명확한 에러를 발생시키는 sentinel 객체."""

    def __getattr__(self, name: str) -> object:
        if name.startswith("_"):
            raise AttributeError(name)

        raise RuntimeError(
            "Supabase client is disabled in test mode because "
            "SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY are missing. "
            "Mock DB access in tests or provide test credentials."
        )


url: Optional[str] = os.environ.get("SUPABASE_URL")
key: Optional[str] = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

supabase: Client
if url and key:
    supabase = create_client(cast(str, url), cast(str, key))
elif _is_testing():
    supabase = cast(Client, _DisabledSupabaseClient())
else:
    raise ValueError(
        "Missing required Supabase environment variables. "
        "Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file."
    )


async def db_execute(func: Callable[[], T]) -> T:
    """
    동기 Supabase 호출을 threadpool에서 실행하여 async 핸들러 블로킹 방지.

    Usage:
        result = await db_execute(
            lambda: supabase.table("users").select("*").execute()
        )
    """
    return await run_in_threadpool(func)
