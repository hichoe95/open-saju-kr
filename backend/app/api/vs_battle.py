import logging
import secrets
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException

from .auth import get_current_user
from .deps import rate_limit_dependency
from ..db.supabase_client import db_execute, supabase
from ..schemas import VsBattleCreate, VsBattleJoin, VsBattleResponse, VsBattleResult
from ..services.analytics_service import AnalyticsService
from ..services.config_service import config_service
from ..utils.flow_calculator import compute_scores, merge_weighted_pillars
from ..utils.saju_calculator import calculate_saju

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/vs-battle", tags=["vs-battle"])

DEFAULT_ELEMENTS: Dict[str, float] = {
    "wood": 1.0,
    "fire": 1.0,
    "earth": 1.0,
    "metal": 1.0,
    "water": 1.0,
}


def _parse_expires_at(expires_at: str) -> Optional[datetime]:
    if not expires_at:
        return None
    normalized = expires_at.replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _today_period_elements() -> Dict[str, float]:
    today = date.today()
    today_saju = calculate_saju(today.year, today.month, today.day, 12, 0)
    return merge_weighted_pillars(
        (today_saju.get("day_pillar", ""), 0.6),
        (today_saju.get("month_pillar", ""), 0.3),
        (today_saju.get("year_pillar", ""), 0.1),
    )


def _score_to_badge(score: int) -> str:
    if score >= 75:
        return "매우 좋음"
    if score >= 60:
        return "좋음"
    if score >= 40:
        return "보통"
    return "주의"


def _message_for_result(category: str, winner: str, challenger_score: int, opponent_score: int) -> str:
    diff = abs(challenger_score - opponent_score)
    category_name = {
        "overall": "종합운",
        "love": "연애운",
        "money": "금전운",
        "career": "직장운",
    }.get(category, "종합운")

    if winner == "tie":
        return f"{category_name}에서 동점! 비슷한 기운을 가진 두 사람입니다."
    if winner == "challenger":
        return f"주인장이 {category_name}에서 {diff}점 앞서요!"
    return f"도전자가 {category_name}에서 {diff}점 앞서요!"


def _build_result(data: Dict[str, Any]) -> VsBattleResult:
    category = str(data.get("category", "overall"))
    challenger_score = int(data.get("challenger_score", 50) or 50)
    opponent_scores = data.get("opponent_scores") if isinstance(data.get("opponent_scores"), dict) else {}
    score_key = "general" if category == "overall" else category
    opponent_score = int(opponent_scores.get(score_key, 50) or 50)
    winner = str(data.get("winner", "tie"))

    return VsBattleResult(
        challenger={"name": "주인장", "score": challenger_score, "badge": _score_to_badge(challenger_score)},
        opponent={"name": "도전자", "score": opponent_score, "badge": _score_to_badge(opponent_score)},
        winner=winner,
        category=category,
        message=_message_for_result(category, winner, challenger_score, opponent_score),
    )


async def _fetch_battle_by_code(battle_code: str) -> Dict[str, Any]:
    battle_res = await db_execute(
        lambda: supabase.table("vs_battles")
        .select("*")
        .eq("battle_code", battle_code)
        .limit(1)
        .execute()
    )
    rows = battle_res.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Battle not found")
    return rows[0]


@router.post("/create", response_model=VsBattleResponse)
async def create_battle(
    req: VsBattleCreate,
    current_user: Optional[dict] = Depends(get_current_user),
    _rate_limit: None = Depends(rate_limit_dependency(limit=20, window_seconds=86400, scope="vs_battle_create")),
) -> VsBattleResponse:
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    if not await config_service.is_feature_enabled("vs_battle"):
        raise HTTPException(status_code=404, detail="Feature not available")

    profile_res = await db_execute(
        lambda: supabase.table("saju_profiles")
        .select("id, user_id, saju_data")
        .eq("id", req.profile_id)
        .limit(1)
        .execute()
    )
    profiles = profile_res.data or []
    if not profiles:
        raise HTTPException(status_code=404, detail="Profile not found")

    profile = profiles[0]
    if profile.get("user_id") != current_user.get("user_id"):
        raise HTTPException(status_code=403, detail="Access denied")

    saju_data = profile.get("saju_data") if isinstance(profile.get("saju_data"), dict) else {}
    day_pillar = str(saju_data.get("day_pillar", "갑자"))
    day_master = day_pillar[0] if day_pillar else "갑"

    period_elements = _today_period_elements() or DEFAULT_ELEMENTS
    base_balance = saju_data.get("base_balance_weights") if isinstance(saju_data.get("base_balance_weights"), dict) else DEFAULT_ELEMENTS
    scores = compute_scores(period_elements, day_master, base_balance)

    score_key = "general" if req.category == "overall" else req.category
    challenger_score = int(scores.get(score_key, 50))

    battle_code = secrets.token_urlsafe(12)
    expires_at = (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()

    for attempt in range(3):
        try:
            await db_execute(
                lambda: supabase.table("vs_battles").insert(
                    {
                        "battle_code": battle_code,
                        "challenger_profile_id": req.profile_id,
                        "category": req.category,
                        "challenger_score": challenger_score,
                        "expires_at": expires_at,
                    }
                ).execute()
            )
            break
        except Exception as e:
            text = str(e).lower()
            if "unique" in text and attempt < 2:
                battle_code = secrets.token_urlsafe(12)
                continue
            logger.exception("Failed to create vs battle")
            raise HTTPException(status_code=500, detail="Failed to create battle")

    await AnalyticsService.track_event(
        event_type="vs_battle_created",
        event_data={"category": req.category, "battle_code": battle_code},
        user_id=current_user.get("user_id"),
    )

    return VsBattleResponse(battle_code=battle_code, expires_at=expires_at)


@router.post("/join", response_model=VsBattleResult)
async def join_battle(
    req: VsBattleJoin,
    _rate_limit: None = Depends(rate_limit_dependency(limit=10, window_seconds=3600, scope="vs_battle_join")),
) -> VsBattleResult:
    if not await config_service.is_feature_enabled("vs_battle"):
        raise HTTPException(status_code=404, detail="Feature not available")

    battle = await _fetch_battle_by_code(req.battle_code)

    parsed_expires_at = _parse_expires_at(str(battle.get("expires_at", "")))
    if parsed_expires_at and datetime.now(timezone.utc) > parsed_expires_at:
        raise HTTPException(status_code=410, detail="Battle expired")

    if battle.get("used"):
        return _build_result(battle)

    opponent_saju = calculate_saju(req.birth_year, req.birth_month, req.birth_day, req.birth_hour, 0)
    opponent_day_pillar = str(opponent_saju.get("day_pillar", "갑자"))
    opponent_day_master = opponent_day_pillar[0] if opponent_day_pillar else "갑"

    period_elements = _today_period_elements() or DEFAULT_ELEMENTS
    opponent_scores = compute_scores(period_elements, opponent_day_master, DEFAULT_ELEMENTS, gender=req.gender)

    category = str(battle.get("category", "overall"))
    score_key = "general" if category == "overall" else category
    opponent_score = int(opponent_scores.get(score_key, 50))
    challenger_score = int(battle.get("challenger_score", 50) or 50)

    winner = "tie"
    if challenger_score > opponent_score:
        winner = "challenger"
    elif opponent_score > challenger_score:
        winner = "opponent"

    await db_execute(
        lambda: supabase.table("vs_battles")
        .update(
            {
                "used": True,
                "opponent_display_name": "도전자",
                "opponent_scores": opponent_scores,
                "winner": winner,
            }
        )
        .eq("battle_code", req.battle_code)
        .execute()
    )

    await AnalyticsService.track_event(
        event_type="vs_battle_joined",
        event_data={"battle_code": req.battle_code, "is_guest": True, "category": category},
    )

    return VsBattleResult(
        challenger={"name": "주인장", "score": challenger_score, "badge": _score_to_badge(challenger_score)},
        opponent={"name": "도전자", "score": opponent_score, "badge": _score_to_badge(opponent_score)},
        winner=winner,
        category=category,
        message=_message_for_result(category, winner, challenger_score, opponent_score),
    )


@router.get("/{code}/result", response_model=VsBattleResult)
async def get_battle_result(code: str) -> VsBattleResult:
    battle = await _fetch_battle_by_code(code)

    if not battle.get("used"):
        raise HTTPException(status_code=400, detail="Battle not yet completed")

    parsed_expires_at = _parse_expires_at(str(battle.get("expires_at", "")))
    if parsed_expires_at and datetime.now(timezone.utc) > parsed_expires_at:
        raise HTTPException(status_code=410, detail="Battle expired")

    return _build_result(battle)
