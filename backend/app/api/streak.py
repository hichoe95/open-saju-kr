"""
Streak & Daily Mission API
- 출석 체크 및 스트릭 관리
- 데일리 미션 조회 및 완료
"""

import logging
import json
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Any, Dict, List, Optional
from datetime import date
from ..db.supabase_client import supabase, db_execute
from .deps import get_current_user_required, rate_limit_dependency
from ..services.analytics_service import AnalyticsService
from ..services.config_service import config_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/streak", tags=["streak"])

STREAK_MILESTONES = {
    7: {"bonus": 10, "badge": "bronze", "title": "꾸준한 탐구자"},
    14: {"bonus": 20, "badge": "silver", "title": "2주 수행자"},
    30: {"bonus": 50, "badge": "gold", "title": "한 달의 기적"},
    100: {"bonus": 200, "badge": "diamond", "title": "백일 대도"},
}


# =============================================
# Schemas
# =============================================

class StreakStatus(BaseModel):
    """사용자 스트릭 상태"""
    current_streak: int = 0
    longest_streak: int = 0
    total_check_ins: int = 0
    last_check_in_date: Optional[str] = None
    checked_in_today: bool = False
    streak_bonus: int = 0  # 연속 출석 보너스 (7일마다 +5)
    badge_tier: Optional[str] = None
    title: Optional[str] = None
    next_milestone: Optional[int] = None
    next_milestone_reward: Optional[int] = None
    next_milestone_badge: Optional[str] = None


class CheckInResponse(BaseModel):
    """출석 체크 응답"""
    success: bool
    message: str
    coins_earned: int = 0
    streak: StreakStatus


class DailyMission(BaseModel):
    """데일리 미션"""
    id: str
    mission_key: str
    title: str
    description: Optional[str] = None
    icon: Optional[str] = None
    reward_coins: int = 0
    action_type: str
    action_count: int = 1
    is_completed: bool = False
    progress: int = 0


class MissionListResponse(BaseModel):
    """미션 목록 응답"""
    missions: List[DailyMission]
    total_reward: int = 0
    completed_count: int = 0


class MissionCompleteResponse(BaseModel):
    """미션 완료 응답"""
    success: bool
    message: str
    coins_earned: int = 0
    new_balance: int = 0


# =============================================
# Helper Functions
# =============================================

def calculate_streak_bonus(streak: int) -> int:
    """연속 출석 보너스 계산 (7일마다 +5)"""
    return (streak // 7) * 5


def _as_dict_list(data: Any) -> List[Dict[str, Any]]:
    if not isinstance(data, list):
        return []
    return [item for item in data if isinstance(item, dict)]


async def get_or_create_streak(user_id: str) -> Dict[str, Any]:
    """사용자 스트릭 조회 또는 생성"""
    result = await db_execute(lambda: supabase.table("user_streaks").select("*").eq("user_id", user_id).execute())
    streak_rows = _as_dict_list(result.data)

    if streak_rows:
        return streak_rows[0]

    # 스트릭 레코드 생성
    new_streak: Dict[str, Any] = {
        "user_id": user_id,
        "current_streak": 0,
        "longest_streak": 0,
        "total_check_ins": 0,
    }
    insert_result = await db_execute(lambda: supabase.table("user_streaks").insert(new_streak).execute())
    inserted_rows = _as_dict_list(insert_result.data)
    return inserted_rows[0] if inserted_rows else new_streak


async def add_coins_to_wallet(user_id: str, amount: int, description: str) -> int:
    if amount <= 0:
        return 0

    try:
        result = await db_execute(lambda: supabase.rpc("grant_bonus_coins", {
            "p_user_id": user_id,
            "p_amount": amount,
            "p_description": description,
            "p_reference_type": "mission"
        }).execute())

        rows = _as_dict_list(result.data)
        if rows:
            new_balance = rows[0].get("new_balance", amount)
            return int(new_balance) if isinstance(new_balance, int) else amount
        return amount
    except Exception as e:
        logger.error(f"[BONUS ERROR] Failed to grant bonus: {e}")
        return 0


# =============================================
# Endpoints
# =============================================

@router.get("", response_model=StreakStatus)
async def get_streak_status(
    user: dict = Depends(get_current_user_required),
    _rate_limit: None = Depends(rate_limit_dependency(limit=30, window_seconds=60, scope="streak_status")),
):
    """현재 스트릭 상태 조회"""
    user_id = user["user_id"]
    streak = await get_or_create_streak(user_id)

    today = date.today().isoformat()
    last_check_in = streak.get("last_check_in_date")
    checked_in_today = last_check_in == today if last_check_in else False
    current_count = int(streak.get("current_streak", 0) or 0)

    if last_check_in and not checked_in_today and current_count > 0:
        try:
            days_gap = (date.today() - date.fromisoformat(last_check_in)).days
            if days_gap > 1:
                current_count = 0
                streak["current_streak"] = 0
                streak["badge_tier"] = None
                streak["title"] = None
                await db_execute(
                    lambda: supabase.table("user_streaks")
                    .update({"current_streak": 0, "badge_tier": None, "title": None})
                    .eq("user_id", user_id)
                    .execute()
                )
        except ValueError:
            logger.warning("[STREAK DATE PARSE ERROR] user_id=%s last_check_in=%s", user_id, last_check_in)

    badge_tier = streak.get("badge_tier")
    title = streak.get("title")
    next_milestones = [d for d in sorted(STREAK_MILESTONES.keys()) if d > current_count]
    next_milestone_days = next_milestones[0] if next_milestones else None
    next_milestone_info = STREAK_MILESTONES.get(next_milestone_days, {}) if next_milestone_days else {}

    return StreakStatus(
        current_streak=current_count,
        longest_streak=streak.get("longest_streak", 0),
        total_check_ins=streak.get("total_check_ins", 0),
        last_check_in_date=last_check_in,
        checked_in_today=checked_in_today,
        streak_bonus=calculate_streak_bonus(current_count),
        badge_tier=badge_tier,
        title=title,
        next_milestone=next_milestone_days,
        next_milestone_reward=next_milestone_info.get("bonus") if next_milestone_info else None,
        next_milestone_badge=next_milestone_info.get("badge") if next_milestone_info else None,
    )


@router.post("/check-in", response_model=CheckInResponse)
async def check_in(
    user: dict = Depends(get_current_user_required),
    _rate_limit: None = Depends(rate_limit_dependency(limit=5, window_seconds=60, scope="streak_checkin")),
):
    """오늘 출석 체크"""
    user_id = user["user_id"]
    previous_streak = await get_or_create_streak(user_id)

    try:
        result = await db_execute(lambda: supabase.rpc("atomic_check_in", {
            "p_user_id": user_id
        }).execute())
    except Exception:
        logger.exception("[STREAK CHECK-IN RPC ERROR] user_id=%s", user_id)
        raise HTTPException(status_code=500, detail="출석 체크 처리 중 오류가 발생했습니다")

    if result.data is None:
        raise HTTPException(status_code=500, detail="출석 체크 결과가 없습니다")

    rpc_data: Any = result.data
    if isinstance(rpc_data, str):
        rpc_data = json.loads(rpc_data)
    if isinstance(rpc_data, list):
        rpc_data = rpc_data[0] if rpc_data and isinstance(rpc_data[0], dict) else None

    if not isinstance(rpc_data, dict):
        logger.error("[STREAK CHECK-IN RPC DATA INVALID] data=%s", rpc_data)
        raise HTTPException(status_code=500, detail="출석 체크 결과 형식 오류")

    current_streak = int(rpc_data.get("current_streak") or 0)
    longest_streak = int(rpc_data.get("longest_streak") or 0)
    total_check_ins = int(rpc_data.get("total_check_ins") or 0)
    last_check_in_value = rpc_data.get("last_check_in_date")
    last_check_in_date = last_check_in_value if isinstance(last_check_in_value, str) else None
    already_checked = bool(rpc_data.get("already_checked") or False)

    if already_checked:
        return CheckInResponse(
            success=False,
            message="오늘은 이미 출석 체크를 했어요!",
            coins_earned=0,
            streak=StreakStatus(
                current_streak=current_streak,
                longest_streak=longest_streak,
                total_check_ins=total_check_ins,
                last_check_in_date=last_check_in_date,
                checked_in_today=True,
                streak_bonus=calculate_streak_bonus(current_streak)
            )
        )

    base_reward = 5
    streak_bonus = calculate_streak_bonus(current_streak)
    enhanced_enabled = await config_service.is_feature_enabled("enhanced_streak")
    base_total_reward = base_reward + streak_bonus
    total_reward = base_total_reward
    milestone_bonus = 0
    milestone = None
    message = f"출석 체크 완료! {current_streak}일 연속 출석 중"

    if enhanced_enabled:
        previous_count = int(previous_streak.get("current_streak", 0) or 0)
        had_badge = bool(previous_streak.get("badge_tier") or previous_streak.get("title"))
        if current_streak <= 1 and had_badge and previous_count > current_streak:
            await db_execute(
                lambda: supabase.table("user_streaks")
                .update({"badge_tier": None, "title": None})
                .eq("user_id", user_id)
                .execute()
            )

        milestone = STREAK_MILESTONES.get(current_streak)
        if milestone:
            milestone_bonus = int(milestone["bonus"])
            total_reward = base_total_reward + milestone_bonus
            message = f"{current_streak}일 연속 출석 달성! {milestone['title']} 칭호 획득 +{milestone_bonus} 엽전"
    elif current_streak % 7 == 0:
        milestone_bonus = 10
        total_reward += milestone_bonus
        message = f"{current_streak}일 연속 출석 달성! 보너스 +{milestone_bonus} 엽전"

    # 코인 지급
    payout_reward = base_total_reward if enhanced_enabled else total_reward
    await add_coins_to_wallet(user_id, payout_reward, f"출석 체크 ({current_streak}일 연속)")

    if enhanced_enabled and milestone:
        await db_execute(
            lambda: supabase.rpc("grant_bonus_coins", {
                "p_user_id": user_id,
                "p_amount": int(milestone["bonus"]),
                "p_description": f"스트릭 {current_streak}일 달성 보너스",
                "p_reference_type": "streak_milestone"
            }).execute()
        )

        await db_execute(
            lambda: supabase.table("user_streaks")
            .update({"badge_tier": milestone["badge"], "title": milestone["title"]})
            .eq("user_id", user_id)
            .execute()
        )

        await AnalyticsService.track_event(
            event_type="streak_milestone_reached",
            event_data={
                "days": current_streak,
                "badge_tier": milestone["badge"],
                "coins_earned": milestone["bonus"],
            },
            user_id=user_id,
        )

    # 출석 미션 자동 완료 처리
    await complete_mission_by_action(user_id, "check_in")

    return CheckInResponse(
        success=True,
        message=message,
        coins_earned=total_reward,
        streak=StreakStatus(
            current_streak=current_streak,
            longest_streak=longest_streak,
            total_check_ins=total_check_ins,
            last_check_in_date=last_check_in_date,
            checked_in_today=True,
            streak_bonus=streak_bonus
        )
    )


@router.get("/missions", response_model=MissionListResponse)
async def get_daily_missions(
    user: dict = Depends(get_current_user_required),
    _rate_limit: None = Depends(rate_limit_dependency(limit=30, window_seconds=60, scope="streak_missions")),
):
    """오늘의 미션 목록 조회"""
    user_id = user["user_id"]
    today = date.today().isoformat()

    # 활성 미션 조회
    missions_result = await db_execute(
        lambda: supabase.table("daily_missions").select("*").eq("is_active", True).eq("is_daily", True).order("sort_order").execute()
    )

    # 오늘 완료한 미션 조회
    completions_result = await db_execute(
        lambda: supabase.table("user_mission_completions").select("mission_id").eq("user_id", user_id).eq("completed_date", today).execute()
    )

    completion_rows = _as_dict_list(completions_result.data)
    completed_ids = {str(c["mission_id"]) for c in completion_rows if "mission_id" in c}

    missions = []
    total_reward = 0
    completed_count = 0

    mission_rows = _as_dict_list(missions_result.data)
    for m in mission_rows:
        mission_id = str(m.get("id", ""))
        mission_key = str(m.get("mission_key", ""))
        mission_title = str(m.get("title", ""))
        action_type = str(m.get("action_type", ""))

        if not mission_id or not mission_key or not mission_title or not action_type:
            continue

        is_completed = mission_id in completed_ids
        if is_completed:
            completed_count += 1
        else:
            total_reward += int(m.get("reward_coins") or 0)

        missions.append(DailyMission(
            id=mission_id,
            mission_key=mission_key,
            title=mission_title,
            description=m.get("description") if isinstance(m.get("description"), str) else None,
            icon=m.get("icon") if isinstance(m.get("icon"), str) else None,
            reward_coins=int(m.get("reward_coins") or 0),
            action_type=action_type,
            action_count=int(m.get("action_count") or 1),
            is_completed=is_completed,
            progress=1 if is_completed else 0
        ))

    return MissionListResponse(
        missions=missions,
        total_reward=total_reward,
        completed_count=completed_count
    )


async def complete_mission_by_action(user_id: str, action_type: str) -> Optional[int]:
    """
    특정 액션 타입의 미션 자동 완료 (내부 함수)
    Returns: 지급된 코인 수 또는 None
    """
    today = date.today().isoformat()

    # 해당 action_type의 미션 조회
    mission_result = await db_execute(
        lambda: supabase.table("daily_missions").select("*").eq("action_type", action_type).eq("is_active", True).execute()
    )

    mission_rows = _as_dict_list(mission_result.data)
    if not mission_rows:
        return None

    mission = mission_rows[0]
    mission_id = mission.get("id")
    if not isinstance(mission_id, str) or not mission_id:
        return None

    # 이미 완료했는지 확인
    existing = await db_execute(
        lambda: supabase.table("user_mission_completions").select("id").eq("user_id", user_id).eq("mission_id", mission_id).eq("completed_date", today).execute()
    )

    existing_rows = _as_dict_list(existing.data)
    if existing_rows:
        return None  # 이미 완료

    # 미션 완료 기록
    reward_coins = int(mission.get("reward_coins") or 0)
    await db_execute(lambda: supabase.table("user_mission_completions").insert({
        "user_id": user_id,
        "mission_id": mission_id,
        "completed_date": today,
        "reward_claimed": True,
        "coins_rewarded": reward_coins
    }).execute())

    # 코인 지급
    if reward_coins > 0:
        mission_title = mission.get("title") if isinstance(mission.get("title"), str) else "데일리 미션"
        await add_coins_to_wallet(user_id, reward_coins, f"미션 완료: {mission_title}")

    return reward_coins


@router.post("/missions/{mission_id}/complete", response_model=MissionCompleteResponse)
async def complete_mission(
    mission_id: str,
    user: dict = Depends(get_current_user_required),
    _rate_limit: None = Depends(rate_limit_dependency(limit=10, window_seconds=60, scope="streak_mission_complete")),
):
    """미션 수동 완료 (일부 미션은 자동 완료됨)"""
    user_id = user["user_id"]

    try:
        result = await db_execute(lambda: supabase.rpc("atomic_complete_mission", {
            "p_user_id": user_id,
            "p_mission_id": mission_id
        }).execute())
    except Exception:
        logger.exception("[MISSION COMPLETE RPC ERROR] user_id=%s mission_id=%s", user_id, mission_id)
        raise HTTPException(status_code=500, detail="미션 완료 처리 중 오류가 발생했습니다")

    if result.data is None:
        raise HTTPException(status_code=500, detail="미션 완료 결과가 없습니다")

    rpc_data: Any = result.data
    if isinstance(rpc_data, str):
        rpc_data = json.loads(rpc_data)
    if isinstance(rpc_data, list):
        rpc_data = rpc_data[0] if rpc_data and isinstance(rpc_data[0], dict) else None

    if not isinstance(rpc_data, dict):
        logger.error("[MISSION COMPLETE RPC DATA INVALID] data=%s", rpc_data)
        raise HTTPException(status_code=500, detail="미션 완료 결과 형식 오류")

    if not rpc_data.get("success"):
        error_code = rpc_data.get("error")
        if error_code == "MISSION_NOT_FOUND":
            raise HTTPException(status_code=404, detail="미션을 찾을 수 없습니다")
        if error_code == "ALREADY_COMPLETED":
            return MissionCompleteResponse(
                success=False,
                message="이미 완료한 미션입니다",
                coins_earned=0,
                new_balance=0
            )
        raise HTTPException(status_code=400, detail="미션 완료 처리 실패")

    reward_coins = int(rpc_data.get("coins_earned") or 0)
    mission_title = rpc_data.get("mission_title") if isinstance(rpc_data.get("mission_title"), str) else "데일리 미션"

    # 코인 지급
    new_balance = 0
    if reward_coins > 0:
        new_balance = await add_coins_to_wallet(
            user_id,
            reward_coins,
            f"미션 완료: {mission_title}"
        )

    return MissionCompleteResponse(
        success=True,
        message=f"미션 완료! +{reward_coins} 엽전",
        coins_earned=reward_coins,
        new_balance=new_balance
    )


# 다른 API에서 호출할 수 있도록 export
__all__ = ["router", "complete_mission_by_action"]
