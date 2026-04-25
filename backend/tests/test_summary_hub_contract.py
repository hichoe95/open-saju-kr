# pyright: reportMissingImports=false

import asyncio
import sys
from types import SimpleNamespace
from pathlib import Path

import pytest
from fastapi import BackgroundTasks, HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api.reading import cache_ops
from app.api.reading import job_ops as reading_job_ops
from app.api.reading import routes as reading_routes
from app.api.reading.contract import (
    dump_projected_reading_response,
    resolve_reading_projection,
)
from app.job_manager import JobStatus
from app.schemas import (
    AdvancedAnalysis,
    CardData,
    CharacterData,
    CompatibilityTab,
    DaeunTab,
    DaeunTimelineItem,
    ElementStats,
    HealthTab,
    LifeFlowTab,
    LoveTab,
    LuckyTab,
    MetaData,
    MoneyTab,
    PillarsData,
    ReadingResponse,
    ReadingRequest,
    RelationshipSubTab,
    SUMMARY_HUB_FREE_VISIBLE_FIELDS,
    SUMMARY_HUB_PAID_ONLY_FIELDS,
    SajuCharacter,
    StudyTab,
    TabsData,
    Timeline,
    CareerTab,
    BirthInput,
    ModelSelection,
    Provider,
)


def _build_full_reading_response() -> ReadingResponse:
    return ReadingResponse(
        one_liner="핵심 총평",
        pillars=PillarsData(
            year="갑자",
            month="을축",
            day="병인",
            hour_A="정묘",
            hour_B="정묘",
            hour_note="정시 기준",
        ),
        card=CardData(
            stats=ElementStats(water=12, wood=22, fire=32, metal=14, earth=20),
            character=CharacterData(
                summary="겉은 차분하고 속은 강한 타입",
                buffs=["집중력"],
                debuffs=["과몰입"],
            ),
            tags=["#집중형"],
            joseon_job="책사",
            soul_animal="호랑이",
            aura_color="#123456",
            aura_color_name="남청",
            title_badge="강철 멘탈",
        ),
        saju_dna="실행형 전략가",
        hidden_personality={"summary": "낯선 환경에서 더 강해짐"},
        superpower="결정적 순간의 추진력",
        hashtags=["#집중형", "#직진형"],
        famous_same_stem="가상의 인물",
        yearly_predictions=[{"year": 2026, "summary": "관계 확장"}],
        character=SajuCharacter(
            type="leader",
            name="청룡장수",
            icon_path="/icons/leader.png",
            description="앞장서는 타입",
            element="wood",
        ),
        tabs=TabsData(
            love=LoveTab(
                summary="좋아지면 빠르게 깊어진다",
                full_text="연애에서는 감정보다 신뢰가 먼저 쌓여야 한다.",
                timeline=Timeline(past="조심", present="호감", future="진전"),
                dos=["속도 조절"],
                donts=["밀당 과용"],
                scripts=["나는 천천히 깊어지는 편이야."],
                love_style_badges=["#신뢰중심"],
                ideal_type_portrait="차분한 대화형",
                flirting_skill="상대의 리듬 맞추기",
                best_confession_timing="관계가 안정된 직후",
                past_life_love="전생에도 늦게 타오르는 인연",
                love_energy_score=81,
                breakup_risk_months=[7, 11],
                ideal_stem_type="을목",
            ),
            money=MoneyTab(
                summary="벌 때는 크고 샐 때는 한순간이다",
                full_text="수입을 키우는 재능은 좋지만 통제되지 않은 지출을 경계해야 한다.",
                timeline=Timeline(past="저축", present="확장", future="선별 투자"),
                risk=["충동 지출"],
                rules=["자동 이체"],
                wealth_vessel="큰 항아리",
                money_type="축적형",
                shopping_ban_list=["야간 쇼핑"],
                investment_dna="분산형",
                leak_warning="기분 소비 주의",
                wealth_grade="A",
                lucky_money_days=[3, 18],
                leak_weekday="금요일",
            ),
            career=CareerTab(
                summary="성과를 내지만 환경 스트레스의 영향을 크게 받는다",
                full_text="성과 지향이 강해서 빠르게 인정받지만 사람 스트레스가 쌓이면 동력이 꺾인다.",
                timeline=Timeline(past="축적", present="도약", future="리더 역할"),
                fit=["기획"],
                avoid=["반복 행정"],
                next_steps=["강점 포트폴리오 정리"],
                job_change_signal="yellow",
                office_villain_risk="중간",
                interview_killer_move="구체 사례 제시",
                salary_nego_timing="성과 증명 직후",
                office_role="해결사",
                dream_jobs=["전략기획가"],
                promotion_energy="강함",
            ),
            study=StudyTab(
                summary="혼자 몰입할 때 효율이 최고다",
                full_text="짧고 강하게 몰입하는 구조를 만들면 성과가 빠르게 오른다.",
                timeline=Timeline(past="탐색", present="집중", future="정리"),
                routine=["90분 몰입"],
                pitfalls=["멀티태스킹"],
                study_type="몰입형",
                focus_golden_time="새벽",
                study_bgm="로파이",
                slump_escape="과목 교차 전환",
            ),
            health=HealthTab(
                summary="기본 체력은 좋지만 긴장 누적이 몸으로 온다",
                full_text="스트레스가 소화와 수면 패턴에 먼저 반영된다.",
                timeline=Timeline(past="회복", present="예민", future="안정"),
                routine=["수면 고정"],
                warnings=["야식 주의"],
                body_type="상열형",
                weak_organs=["위"],
                exercise_recommendation="걷기",
                stress_relief="호흡 정리",
            ),
            compatibility=CompatibilityTab(
                summary="서로의 리듬만 맞으면 깊게 간다",
                timeline=Timeline(past="거리", present="조율", future="안정"),
                chemistry_tags=["#대화형"],
                good_matches=["차분한 사람"],
                conflict_triggers=["답변 지연"],
                communication_scripts=["내가 원하는 포인트를 먼저 말해볼게."],
                date_ideas=["산책 데이트"],
                red_flags=["일방적 판단"],
                full_text="관계는 빠른 몰입보다 속도 합의가 중요하다.",
                friend=RelationshipSubTab(
                    summary="친구로 오래 간다",
                    full_text="의리가 강한 편이다.",
                    strengths=["신뢰"],
                    challenges=["표현 부족"],
                    tips=["먼저 연락"],
                    scenarios=["일정 조율"],
                ),
                relationship_label="온도차 조율형",
                survival_rate=77,
                chemistry_score=88,
            ),
            life_flow=LifeFlowTab(mechanism=["초반 압축 후 확장"]),
            daeun=DaeunTab(
                summary="이번 대운은 판을 넓히는 시즌이다",
                full_text="지금은 외부 확장보다 중심축을 잡는 일이 먼저다.",
                current_daeun="경오",
                next_daeun_change="39세 신미",
                sections=[{"title": "시즌 요약"}],
                timeline=[
                    DaeunTimelineItem(
                        age="34-43",
                        ganji="경오",
                        theme="확장",
                        description="일과 관계의 판이 커진다",
                    )
                ],
                season_title="확장 시즌",
                genre="성장물",
                progress_percent=40,
                season_ending_preview="정리 후 재도약",
            ),
            lucky=LuckyTab(
                lucky_color="청색",
                lucky_number="7",
                lucky_direction="동쪽",
                lucky_item="노트",
                power_spot="도서관",
                today_overview="집중이 잘 된다",
                today_love="대화운 상승",
                today_money="충동구매 주의",
                today_advice="정리부터 하자",
                golden_time="09:00-11:00",
                dead_time="22:00-23:00",
                food_recommendation="따뜻한 국물",
                mission_of_day="책상 정리",
                power_hour="10시",
                talisman_phrase="선택을 좁혀라",
            ),
        ),
        advanced_analysis=AdvancedAnalysis(),
        rendered_markdown="## 상세 리딩",
        saju_image_base64="image-data",
        saju_image_prompt="traditional portrait",
        meta=MetaData(
            provider="openai",
            model_id="saju-deep",
            prompt_version="v1",
            latency_ms=321,
            cache_id="cache-1",
            reading_id="reading-1",
        ),
    )


def _build_cache_row_from_full_reading() -> dict:
    reading = _build_full_reading_response()
    return {
        "id": "cache-1",
        "one_liner": reading.one_liner,
        "pillars_json": reading.pillars.model_dump(),
        "card_json": reading.card.model_dump(),
        "tabs_json": reading.tabs.model_dump(),
        "advanced_json": (
            reading.advanced_analysis.model_dump()
            if reading.advanced_analysis is not None
            else {}
        ),
        "extras_json": {
            "saju_dna": reading.saju_dna,
            "hidden_personality": reading.hidden_personality,
            "superpower": reading.superpower,
            "hashtags": reading.hashtags,
            "famous_same_stem": reading.famous_same_stem,
            "yearly_predictions": reading.yearly_predictions,
            "cache_metadata": {"prompt_version": reading.meta.prompt_version},
        },
        "model_version": f"{reading.meta.provider}:{reading.meta.model_id}",
    }


def test_unpaid_reading_payload_excludes_paid_fields():
    assert "card.character.summary" in SUMMARY_HUB_FREE_VISIBLE_FIELDS
    assert "tabs.life_flow.mechanism" in SUMMARY_HUB_FREE_VISIBLE_FIELDS
    assert "tabs.lucky.today_overview" in SUMMARY_HUB_FREE_VISIBLE_FIELDS
    assert "tabs.love.full_text" in SUMMARY_HUB_PAID_ONLY_FIELDS
    assert "tabs.lucky.today_love" in SUMMARY_HUB_PAID_ONLY_FIELDS

    payload = dump_projected_reading_response(
        _build_full_reading_response(),
        resolve_reading_projection(),
    )

    assert set(payload.keys()) == {"one_liner", "pillars", "card", "tabs", "meta"}
    assert set(payload["card"].keys()) == {"stats", "character"}
    assert payload["card"]["character"] == {"summary": "겉은 차분하고 속은 강한 타입"}
    assert payload["tabs"]["love"] == {"summary": "좋아지면 빠르게 깊어진다"}
    assert payload["tabs"]["money"] == {"summary": "벌 때는 크고 샐 때는 한순간이다"}
    assert payload["tabs"]["career"] == {
        "summary": "성과를 내지만 환경 스트레스의 영향을 크게 받는다"
    }
    assert payload["tabs"]["study"] == {"summary": "혼자 몰입할 때 효율이 최고다"}
    assert payload["tabs"]["health"] == {
        "summary": "기본 체력은 좋지만 긴장 누적이 몸으로 온다"
    }
    assert payload["tabs"]["compatibility"] == {
        "summary": "서로의 리듬만 맞으면 깊게 간다"
    }
    assert payload["tabs"]["life_flow"] == {"mechanism": ["초반 압축 후 확장"]}
    assert payload["tabs"]["daeun"] == {"summary": "이번 대운은 판을 넓히는 시즌이다"}
    assert payload["tabs"]["lucky"] == {"today_overview": "집중이 잘 된다"}
    assert "saju_dna" not in payload
    assert "character" not in payload
    assert "advanced_analysis" not in payload


def test_paid_reading_payload_includes_full_detail():
    payload = dump_projected_reading_response(
        _build_full_reading_response(),
        resolve_reading_projection(has_paid_entitlement=True),
    )

    assert payload["meta"]["reading_id"] == "reading-1"
    assert payload["saju_dna"] == "실행형 전략가"
    assert payload["character"]["name"] == "청룡장수"
    assert (
        payload["tabs"]["love"]["full_text"]
        == "연애에서는 감정보다 신뢰가 먼저 쌓여야 한다."
    )
    assert payload["tabs"]["love"]["timeline"]["future"] == "진전"
    assert payload["tabs"]["love"]["love_style_badges"] == ["#신뢰중심"]
    assert payload["tabs"]["money"]["wealth_vessel"] == "큰 항아리"
    assert payload["tabs"]["career"]["next_steps"] == ["강점 포트폴리오 정리"]
    assert payload["tabs"]["health"]["warnings"] == ["야식 주의"]
    assert payload["tabs"]["compatibility"]["relationship_label"] == "온도차 조율형"
    assert payload["tabs"]["daeun"]["timeline"][0]["theme"] == "확장"
    assert payload["tabs"]["lucky"]["golden_time"] == "09:00-11:00"


def test_reading_id_presence_alone_does_not_unlock_paid_fields():
    reading = _build_full_reading_response()
    reading.meta.reading_id = "reading-only"

    payload = dump_projected_reading_response(
        reading,
        resolve_reading_projection(),
    )

    assert payload["meta"]["reading_id"] == "reading-only"
    assert "saju_dna" not in payload
    assert "full_text" not in payload["tabs"]["love"]
    assert "timeline" not in payload["tabs"]["daeun"]
    assert payload["tabs"]["life_flow"] == {"mechanism": ["초반 압축 후 확장"]}
    assert payload["tabs"]["lucky"] == {"today_overview": "집중이 잘 된다"}


def test_free_projection_keeps_cache_id_even_without_reading_id():
    reading = _build_full_reading_response()
    reading.meta.reading_id = None

    payload = dump_projected_reading_response(
        reading,
        resolve_reading_projection(),
    )

    assert payload["meta"]["cache_id"] == "cache-1"
    assert "reading_id" not in payload["meta"]
    assert "full_text" not in payload["tabs"]["love"]


def test_job_id_presence_alone_does_not_unlock_paid_fields(monkeypatch):
    class _Settings:
        prompt_version = "v1"

    async def _track_analysis_event(*args, **kwargs):
        return None

    async def _reconstruct_response_from_cache_dict(**kwargs):
        return _build_full_reading_response()

    request = ReadingRequest(
        input=BirthInput(
            name="테스트",
            birth_solar="1990-01-01",
            birth_time="12:00",
            calendar_type="solar",
            gender="male",
        ),
        model=ModelSelection(
            provider=Provider.OPENAI,
            model_id="saju-deep",
            reasoning_effort="medium",
        ),
    )

    monkeypatch.setattr(reading_routes, "get_settings", lambda: _Settings())
    monkeypatch.setattr(
        reading_routes.AnalyticsService, "track_analysis_event", _track_analysis_event
    )
    monkeypatch.setattr(
        reading_routes, "get_cached_reading_sync", lambda birth_key: {"id": "cache-1"}
    )
    monkeypatch.setattr(
        reading_routes,
        "get_cache_reuse_status",
        lambda *args, **kwargs: (True, "fresh"),
    )
    monkeypatch.setattr(
        reading_routes,
        "_reconstruct_response_from_cache_dict",
        _reconstruct_response_from_cache_dict,
    )

    payload = asyncio.run(
        reading_routes.create_reading(
            request=request,
            db=None,
            current_user=None,
            job_id="job-only",
            _rate_limit=None,
        )
    )

    response_json = payload.model_dump(exclude_unset=True, exclude_none=True)
    assert response_json["meta"]["reading_id"] == "reading-1"
    assert "saju_dna" not in response_json
    assert "full_text" not in response_json["tabs"]["love"]
    assert "timeline" not in response_json["tabs"]["daeun"]
    assert response_json["tabs"]["life_flow"] == {"mechanism": ["초반 압축 후 확장"]}
    assert response_json["tabs"]["lucky"] == {"today_overview": "집중이 잘 된다"}


def test_async_summary_start_does_not_prepay_authenticated_user(monkeypatch):
    captured: dict = {}

    monkeypatch.setattr(
        reading_job_ops.job_manager,
        "find_job_by_request",
        lambda user_id, client_request_id: None,
    )
    monkeypatch.setattr(
        reading_job_ops.job_manager,
        "create_job",
        lambda request_data, push_subscription=None: (
            captured.update(
                {"request_data": request_data, "push_subscription": push_subscription}
            )
            or "job-auth-summary"
        ),
    )

    request = reading_job_ops.JobStartRequest(
        input=BirthInput(
            name="테스트",
            birth_solar="1990-01-01",
            birth_time="12:00",
            calendar_type="solar",
            gender="male",
            timezone="Asia/Seoul",
            birth_place="대한민국",
        ),
        model=ModelSelection(
            provider=Provider.OPENAI,
            model_id="saju-deep",
            reasoning_effort="medium",
        ),
        client_request_id="summary-start-auth-1",
    )

    response = asyncio.run(
        reading_job_ops.start_reading_job(
            request=request,
            background_tasks=BackgroundTasks(),
            current_user={"user_id": "user-1"},
            _rate_limit=None,
        )
    )

    assert response.job_id == "job-auth-summary"
    assert captured["request_data"]["user_id"] == "user-1"
    assert captured["request_data"]["client_request_id"] == "summary-start-auth-1"
    assert "payment_transaction_id" not in captured["request_data"]
    assert "detail_entitlement_granted" not in captured["request_data"]
    assert "detail_entitlement_source" not in captured["request_data"]


def test_async_summary_start_allows_anonymous_resume_dedupe(monkeypatch):
    existing_job = SimpleNamespace(id="job-anon-summary", status=JobStatus.PROCESSING)
    create_job_called = {"value": False}

    monkeypatch.setattr(
        reading_job_ops.job_manager,
        "find_job_by_request",
        lambda user_id, client_request_id: existing_job,
    )
    monkeypatch.setattr(
        reading_job_ops.job_manager,
        "create_job",
        lambda request_data, push_subscription=None: create_job_called.update(
            {"value": True}
        ),
    )

    request = reading_job_ops.JobStartRequest(
        input=BirthInput(
            name="익명",
            birth_solar="1991-02-02",
            birth_time="13:00",
            calendar_type="solar",
            gender="female",
            timezone="Asia/Seoul",
            birth_place="대한민국",
        ),
        model=ModelSelection(
            provider=Provider.OPENAI,
            model_id="saju-deep",
            reasoning_effort="medium",
        ),
        client_request_id="summary-start-anon-1",
    )

    response = asyncio.run(
        reading_job_ops.start_reading_job(
            request=request,
            background_tasks=BackgroundTasks(),
            current_user=None,
            _rate_limit=None,
        )
    )

    assert response.job_id == "job-anon-summary"
    assert response.status == JobStatus.PROCESSING.value
    assert create_job_called["value"] is False


def test_async_job_result_serialization_keeps_meta_ids_after_late_mutation():
    result = ReadingResponse.model_construct(
        one_liner="핵심 총평",
        pillars=PillarsData(),
        card=CardData(),
        tabs=TabsData(),
        meta=MetaData(
            provider="openai",
            model_id="saju-deep",
            prompt_version="v1",
            latency_ms=321,
        ),
        _fields_set={"one_liner", "pillars", "card", "tabs", "meta"},
    )
    result.meta.cache_id = "cache-late-id"
    result.meta.reading_id = "reading-late-id"

    payload = reading_job_ops._serialize_job_result(result)

    assert payload["meta"]["cache_id"] == "cache-late-id"
    assert payload["meta"]["reading_id"] == "reading-late-id"


def test_legacy_cached_reading_projects_to_free_layer():
    payload = cache_ops._build_cached_reading_response(
        _build_cache_row_from_full_reading(),
        reading_id="legacy-reading-1",
    )

    assert payload["meta"]["reading_id"] == "legacy-reading-1"
    assert payload["tabs"]["love"] == {"summary": "좋아지면 빠르게 깊어진다"}
    assert payload["tabs"]["daeun"] == {"summary": "이번 대운은 판을 넓히는 시즌이다"}
    assert payload["tabs"]["life_flow"] == {"mechanism": ["초반 압축 후 확장"]}
    assert payload["tabs"]["lucky"] == {"today_overview": "집중이 잘 된다"}
    assert "saju_dna" not in payload
    assert "advanced_analysis" not in payload
    assert "full_text" not in payload["tabs"]["love"]
    assert "years" not in payload["tabs"]["life_flow"]
    assert "today_love" not in payload["tabs"]["lucky"]


def test_detail_fetch_requires_entitlement(monkeypatch):
    monkeypatch.setattr(
        cache_ops,
        "_get_owned_user_reading_row",
        lambda user_id, reading_id: {
            "id": reading_id,
            "cache_id": "cache-1",
            "context_json": {"context": {"topic": "love"}},
        },
    )

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            cache_ops.get_reading_detail(
                "reading-1",
                current_user={"user_id": "user-1"},
                _rate_limit=None,
            )
        )

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "상세 사주 열람 권한이 없습니다"


def test_entitled_detail_fetch_returns_full_payload(monkeypatch):
    monkeypatch.setattr(
        cache_ops,
        "_get_owned_user_reading_row",
        lambda user_id, reading_id: {
            "id": reading_id,
            "cache_id": "cache-1",
            "context_json": {
                "reading_access": {
                    "full_detail": True,
                    "source": "reading_reanalyze",
                }
            },
        },
    )
    monkeypatch.setattr(
        cache_ops,
        "_get_cache_row_by_id",
        lambda cache_id: _build_cache_row_from_full_reading(),
    )

    payload = asyncio.run(
        cache_ops.get_reading_detail(
            "reading-1",
            current_user={"user_id": "user-1"},
            _rate_limit=None,
        )
    ).model_dump(exclude_unset=True, exclude_none=True)

    assert payload["meta"]["reading_id"] == "reading-1"
    assert payload["saju_dna"] == "실행형 전략가"
    assert (
        payload["tabs"]["love"]["full_text"]
        == "연애에서는 감정보다 신뢰가 먼저 쌓여야 한다."
    )
    assert payload["tabs"]["lucky"]["golden_time"] == "09:00-11:00"


def test_resume_bootstrap_claims_cache_for_authenticated_user(monkeypatch):
    monkeypatch.setattr(
        reading_routes,
        "get_cached_reading_sync",
        lambda birth_key: {"id": "cache-1"},
    )
    monkeypatch.setattr(
        reading_routes,
        "_find_existing_user_reading_id_by_cache",
        lambda user_id, cache_id: None,
    )
    monkeypatch.setattr(
        reading_routes,
        "save_user_reading_supabase",
        lambda **kwargs: "reading-bootstrapped-1",
    )

    response = asyncio.run(
        reading_routes.bootstrap_resume_reading(
            request=reading_routes.ReadingResumeBootstrapRequest(
                cache_id="cache-1",
                input=BirthInput(
                    name="익명 사용자",
                    birth_solar="1990-01-01",
                    birth_time="12:00",
                    calendar_type="solar",
                    gender="male",
                ),
            ),
            current_user_id="user-1",
            _rate_limit=None,
        )
    )

    assert response.reading_id == "reading-bootstrapped-1"
    assert response.cache_id == "cache-1"
    assert response.reused_existing is False


def test_resume_bootstrap_reuses_existing_user_reading(monkeypatch):
    monkeypatch.setattr(
        reading_routes,
        "get_cached_reading_sync",
        lambda birth_key: {"id": "cache-1"},
    )
    monkeypatch.setattr(
        reading_routes,
        "_find_existing_user_reading_id_by_cache",
        lambda user_id, cache_id: "reading-existing-1",
    )

    response = asyncio.run(
        reading_routes.bootstrap_resume_reading(
            request=reading_routes.ReadingResumeBootstrapRequest(
                cache_id="cache-1",
                input=BirthInput(
                    name="익명 사용자",
                    birth_solar="1990-01-01",
                    birth_time="12:00",
                    calendar_type="solar",
                    gender="male",
                ),
            ),
            current_user_id="user-1",
            _rate_limit=None,
        )
    )

    assert response.reading_id == "reading-existing-1"
    assert response.cache_id == "cache-1"
    assert response.reused_existing is True


def test_resume_bootstrap_rejects_mismatched_cache_id(monkeypatch):
    monkeypatch.setattr(
        reading_routes,
        "get_cached_reading_sync",
        lambda birth_key: {"id": "cache-2"},
    )

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            reading_routes.bootstrap_resume_reading(
                request=reading_routes.ReadingResumeBootstrapRequest(
                    cache_id="cache-1",
                    input=BirthInput(
                        name="익명 사용자",
                        birth_solar="1990-01-01",
                        birth_time="12:00",
                        calendar_type="solar",
                        gender="male",
                    ),
                ),
                current_user_id="user-1",
                _rate_limit=None,
            )
        )

    assert exc_info.value.status_code == 404
    assert exc_info.value.detail == "리딩 컨텍스트를 찾을 수 없습니다"
