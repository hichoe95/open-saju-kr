"""
통계 API 라우터
"""

import logging
from fastapi import APIRouter
from ..db.supabase_client import supabase

logger = logging.getLogger(__name__)

router = APIRouter(tags=["stats"])

DEFAULT_PROCESSING_TIME_MS = 180000


@router.get("/stats/avg-processing-time")
async def get_avg_processing_time():
    """최근 100건의 평균 분석 소요 시간 조회 (밀리초)"""
    try:
        result = (
            supabase.table("user_readings")
            .select("processing_time_ms")
            .not_.is_("processing_time_ms", "null")
            .order("created_at", desc=True)
            .limit(100)
            .execute()
        )

        if not result.data:
            return {"avg_processing_time_ms": DEFAULT_PROCESSING_TIME_MS}

        times: list[int] = []
        for row in result.data:
            if isinstance(row, dict):
                value = row.get("processing_time_ms")
                if isinstance(value, (int, float)):
                    times.append(int(value))

        if not times:
            return {"avg_processing_time_ms": DEFAULT_PROCESSING_TIME_MS}

        avg_time = sum(times) // len(times)

        return {"avg_processing_time_ms": max(avg_time, 60000)}

    except Exception as e:
        logger.error(f"[STATS ERROR] avg-processing-time: {e}")
        return {"avg_processing_time_ms": DEFAULT_PROCESSING_TIME_MS}
