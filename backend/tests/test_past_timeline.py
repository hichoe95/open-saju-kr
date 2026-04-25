"""
Past Timeline 테스트 모듈

테스트 대상:
- extract_korean_pillar() - 한자→한글 변환 유틸
- convert_pillars_for_analysis() - DB pillars_json → 분석 입력 변환
- analyze_past_years() - 과거 연도별 충/형/파/해 분석
- PastYearAnalysis / PastTimelineResponse 스키마 검증
- POST /reading/past-timeline endpoint (mock)
"""
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch, AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.utils.flow_calculator import (
    analyze_past_years,
    convert_pillars_for_analysis,
    extract_korean_pillar,
)
from app.schemas import PastYearAnalysis, PastTimelineResponse


# =============================================================================
# Unit Tests: Pillar Conversion Utilities
# =============================================================================


class TestExtractKoreanPillar:
    """extract_korean_pillar() 한자→한글 변환 테스트"""

    def test_chinese_with_parentheses(self):
        """한자(한글) 형태 → 한글만 추출"""
        assert extract_korean_pillar("乙亥(을해)") == "을해"

    def test_chinese_with_korean_parentheses(self):
        """다양한 한자+괄호 형태"""
        assert extract_korean_pillar("壬午(임오)") == "임오"
        assert extract_korean_pillar("甲子(갑자)") == "갑자"
        assert extract_korean_pillar("庚辰(경진)") == "경진"

    def test_already_korean(self):
        """이미 한글인 경우 그대로 반환"""
        assert extract_korean_pillar("을해") == "을해"
        assert extract_korean_pillar("갑자") == "갑자"

    def test_empty_string(self):
        """빈 문자열 → 빈 문자열"""
        assert extract_korean_pillar("") == ""

    def test_none_input(self):
        """None → 빈 문자열"""
        assert extract_korean_pillar(None) == ""

    def test_nested_parentheses(self):
        """괄호 안의 첫 번째 그룹만 추출"""
        assert extract_korean_pillar("乙亥(을해)(extra)") == "을해"


class TestConvertPillarsForAnalysis:
    """convert_pillars_for_analysis() DB→분석 변환 테스트"""

    def test_full_conversion(self):
        """한자 pillars_json → 한글 + hour_A→hour 변환"""
        pillars_json = {
            "year": "乙亥(을해)",
            "month": "壬午(임오)",
            "day": "甲子(갑자)",
            "hour_A": "庚辰(경진)",
        }
        result = convert_pillars_for_analysis(pillars_json)
        assert result == {
            "year": "을해",
            "month": "임오",
            "day": "갑자",
            "hour": "경진",
        }

    def test_already_korean_pillars(self):
        """이미 한글인 pillars_json도 처리"""
        pillars_json = {
            "year": "을해",
            "month": "임오",
            "day": "갑자",
            "hour_A": "경진",
        }
        result = convert_pillars_for_analysis(pillars_json)
        assert result == {
            "year": "을해",
            "month": "임오",
            "day": "갑자",
            "hour": "경진",
        }

    def test_missing_keys(self):
        """일부 키 누락 시 빈 문자열로 처리"""
        result = convert_pillars_for_analysis({"year": "乙亥(을해)"})
        assert result["year"] == "을해"
        assert result["month"] == ""
        assert result["day"] == ""
        assert result["hour"] == ""

    def test_empty_dict(self):
        """빈 dict → 모두 빈 문자열"""
        result = convert_pillars_for_analysis({})
        assert all(v == "" for v in result.values())
        assert set(result.keys()) == {"year", "month", "day", "hour"}

    def test_hour_A_to_hour_key_rename(self):
        """hour_A → hour 키 변환"""
        result = convert_pillars_for_analysis({"hour_A": "庚辰(경진)"})
        assert "hour" in result
        assert "hour_A" not in result
        assert result["hour"] == "경진"


# =============================================================================
# Unit Tests: analyze_past_years
# =============================================================================


class TestAnalyzePastYears:
    """analyze_past_years() 충/형/파/해 분석 결정론적 테스트"""

    @pytest.fixture
    def sample_pillars(self):
        """테스트용 원국 사주"""
        return {
            "year": "갑자",
            "month": "병인",
            "day": "무진",
            "hour": "경오",
        }

    def test_returns_list(self, sample_pillars):
        """반환 타입이 list"""
        result = analyze_past_years(sample_pillars, 1990, 2025)
        assert isinstance(result, list)

    def test_results_have_required_keys(self, sample_pillars):
        """각 결과에 필수 키 포함"""
        result = analyze_past_years(sample_pillars, 1990, 2025)
        for item in result:
            assert "year" in item
            assert "year_ganji" in item
            assert "interaction_type" in item
            assert "severity" in item

    def test_year_range(self, sample_pillars):
        """birth_year+1 ~ current_year 범위 내 결과"""
        result = analyze_past_years(sample_pillars, 2000, 2010)
        for item in result:
            assert 2001 <= item["year"] <= 2010

    def test_deterministic(self, sample_pillars):
        """동일 입력 → 동일 결과 (결정론적)"""
        r1 = analyze_past_years(sample_pillars, 1990, 2025)
        r2 = analyze_past_years(sample_pillars, 1990, 2025)
        assert len(r1) == len(r2)
        for a, b in zip(r1, r2):
            assert a["year"] == b["year"]
            assert a["year_ganji"] == b["year_ganji"]
            assert a["severity"] == b["severity"]

    def test_known_clash_2002_oja(self):
        """2002년(임오)과 자(子)원국의 충 검증: 자-오 충"""
        pillars = {"year": "갑자", "month": "병인", "day": "무진", "hour": "경오"}
        result = analyze_past_years(pillars, 2001, 2003)
        years_found = {r["year"] for r in result}
        assert 2002 in years_found, "2002년 임오 — 자(子)와 오(午) 충이 감지되어야 함"
        clash_2002 = next(r for r in result if r["year"] == 2002)
        assert "충" in clash_2002["interaction_type"]

    def test_empty_pillars(self):
        """빈 사주 → 빈 결과"""
        result = analyze_past_years({}, 1990, 2025)
        assert result == []

    def test_short_pillar_ignored(self):
        """1글자 pillar → 지지 추출 불가, 무시됨"""
        result = analyze_past_years({"year": "갑"}, 2020, 2025)
        assert result == []

    def test_severity_values(self, sample_pillars):
        """severity는 '강함' 또는 '보통'만"""
        result = analyze_past_years(sample_pillars, 1990, 2025)
        for item in result:
            assert item["severity"] in ("강함", "보통")


# =============================================================================
# Unit Tests: Schema Validation
# =============================================================================


class TestPastTimelineSchemas:
    """Pydantic 스키마 검증"""

    def test_past_year_analysis_valid(self):
        """정상적인 PastYearAnalysis 생성"""
        item = PastYearAnalysis(
            year=2002,
            year_ganji="임오",
            interaction_type="충",
            type_detail="충",
            severity="강함",
            description="2002년 임오: 정면 충돌의 기운이 작용하는 해",
        )
        assert item.year == 2002
        assert item.interaction_type == "충"

    def test_past_year_analysis_defaults(self):
        """기본값 테스트"""
        item = PastYearAnalysis(year=2000)
        assert item.year_ganji == ""
        assert item.interaction_type == "충"
        assert item.type_detail == ""
        assert item.severity == "보통"
        assert item.description == ""

    def test_past_year_analysis_invalid_type(self):
        """잘못된 interaction_type → validation error"""
        with pytest.raises(Exception):
            PastYearAnalysis(year=2000, interaction_type="합")

    def test_past_year_analysis_invalid_severity(self):
        """잘못된 severity → validation error"""
        with pytest.raises(Exception):
            PastYearAnalysis(year=2000, severity="매우강함")

    def test_past_timeline_response_valid(self):
        """정상적인 PastTimelineResponse"""
        resp = PastTimelineResponse(
            profile_id="test-123",
            conflicts=[
                PastYearAnalysis(year=2002, interaction_type="충", severity="강함"),
            ],
            total_count=1,
            earliest_year=2002,
            latest_year=2002,
        )
        assert resp.profile_id == "test-123"
        assert len(resp.conflicts) == 1
        assert resp.total_count == 1

    def test_past_timeline_response_empty(self):
        """빈 결과 PastTimelineResponse"""
        resp = PastTimelineResponse(profile_id="test-456")
        assert resp.conflicts == []
        assert resp.total_count == 0
        assert resp.earliest_year is None
        assert resp.latest_year is None

    def test_frontend_type_alignment(self):
        """프론트엔드 타입과 정합성 — 필드명/타입 일치 검증"""
        item = PastYearAnalysis(
            year=2002,
            year_ganji="임오",
            interaction_type="충",
            type_detail="충/형",
            severity="강함",
            description="test",
        )
        d = item.model_dump()
        expected_keys = {"year", "year_ganji", "interaction_type", "type_detail", "severity", "description"}
        assert set(d.keys()) == expected_keys

        resp = PastTimelineResponse(profile_id="p1", conflicts=[item], total_count=1)
        rd = resp.model_dump()
        expected_resp_keys = {"profile_id", "conflicts", "total_count", "earliest_year", "latest_year"}
        assert set(rd.keys()) == expected_resp_keys


# =============================================================================
# Integration Tests: Bug G — composite interaction_type → single primary
# =============================================================================


class TestBugGCompositeTypeHandling:
    """Bug G fix: analyze_past_years가 '충/형' 같은 composite를 반환할 때
    endpoint에서 가장 심각한 것을 primary로 선택하는 로직 검증"""

    def test_severity_ranking(self):
        """_SEVERITY_RANK: 충(3) > 형(2) > 파(1) > 해(0)"""
        from app.api.past_timeline import _SEVERITY_RANK
        assert _SEVERITY_RANK["충"] > _SEVERITY_RANK["형"]
        assert _SEVERITY_RANK["형"] > _SEVERITY_RANK["파"]
        assert _SEVERITY_RANK["파"] > _SEVERITY_RANK["해"]

    def test_composite_split_primary_selection(self):
        """'충/형' → primary='충', type_detail='충/형'"""
        from app.api.past_timeline import _SEVERITY_RANK

        raw_type = "충/형"
        types = sorted(
            [t.strip() for t in raw_type.split("/")],
            key=lambda t: _SEVERITY_RANK.get(t, -1),
            reverse=True,
        )
        primary = types[0]
        type_detail = "/".join(types) if len(types) > 1 else types[0]

        assert primary == "충"
        assert type_detail == "충/형"

    def test_single_type_no_split(self):
        """'충' → primary='충', type_detail='충'"""
        from app.api.past_timeline import _SEVERITY_RANK

        raw_type = "충"
        types = sorted(
            [t.strip() for t in raw_type.split("/")],
            key=lambda t: _SEVERITY_RANK.get(t, -1),
            reverse=True,
        )
        primary = types[0]
        type_detail = "/".join(types) if len(types) > 1 else types[0]

        assert primary == "충"
        assert type_detail == "충"


# =============================================================================
# Integration Tests: Endpoint (mocked DB)
# =============================================================================


def _async_mock_return(value):
    """비동기 mock 반환 헬퍼"""
    async def _mock(*args, **kwargs):
        return value
    return MagicMock(side_effect=_mock)


class MockDBResult:
    """Supabase execute() 결과 mock"""
    def __init__(self, data):
        self.data = data


from app.api.past_timeline import router as past_timeline_router
from app.api.auth import get_current_user
past_timeline_app = FastAPI()
past_timeline_app.include_router(past_timeline_router, prefix="/api")


@pytest.fixture
def mock_auth_user():
    past_timeline_app.dependency_overrides[get_current_user] = lambda: {"user_id": "user-123"}
    yield
    past_timeline_app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture
def mock_auth_none():
    past_timeline_app.dependency_overrides[get_current_user] = lambda: None
    yield
    past_timeline_app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture(autouse=True)
def mock_rate_limit():
    from app.api import deps
    deps._rate_limit_store.clear()
    with patch("app.api.past_timeline.rate_limit_dependency", return_value=lambda: None):
        yield


@pytest.fixture
def pt_client():
    return TestClient(past_timeline_app)


class TestPastTimelineEndpoint:
    """POST /reading/past-timeline endpoint 테스트"""

    @patch("app.api.past_timeline.AnalyticsService")
    @patch("app.api.past_timeline.config_service")
    @patch("app.api.past_timeline._decrypt_profile_field")
    @patch("app.api.past_timeline.db_execute")
    def test_success_flow(
        self, mock_db, mock_decrypt, mock_config, mock_analytics,
        pt_client, mock_auth_user, mock_rate_limit
    ):
        """정상 플로우: 암호화된 프로파일 → 복호화 → 캐시 조회 → 분석 → 응답"""
        mock_config.is_feature_enabled = AsyncMock(return_value=True)
        profile_data = {
            "id": "profile-123",
            "user_id": "user-123",
            "key_id": "v1",
            "birth_date_ct": "enc", "birth_date_iv": "iv", "birth_date_tag": "tag",
            "cache_id": "cache-456",
        }
        cache_data = {
            "pillars_json": {
                "year": "甲子(갑자)",
                "month": "丙寅(병인)",
                "day": "戊辰(무진)",
                "hour_A": "庚午(경오)",
            }
        }
        mock_db.side_effect = [
            MockDBResult([profile_data]),
            MockDBResult([cache_data]),
        ]
        mock_decrypt.return_value = "1990-01-15"
        mock_analytics.track_event = AsyncMock()
        response = pt_client.post(
            "/api/reading/past-timeline",
            json={"profile_id": "profile-123"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["profile_id"] == "profile-123"
        assert "conflicts" in data
        assert "total_count" in data
        assert isinstance(data["conflicts"], list)
    def test_unauthorized(self, pt_client, mock_auth_none, mock_rate_limit):
        """미인증 사용자 → 401"""
        response = pt_client.post(
            "/api/reading/past-timeline",
            json={"profile_id": "profile-123"},
        )
        assert response.status_code == 401
    @patch("app.api.past_timeline.config_service")
    def test_feature_disabled(self, mock_config, pt_client, mock_auth_user, mock_rate_limit):
        """기능 비활성화 → 404"""
        mock_config.is_feature_enabled = AsyncMock(return_value=False)
        response = pt_client.post(
            "/api/reading/past-timeline",
            json={"profile_id": "profile-123"},
        )
        assert response.status_code == 404

    def test_missing_profile_id(self, pt_client, mock_auth_user, mock_rate_limit):
        """profile_id 누락 → 422"""
        response = pt_client.post(
            "/api/reading/past-timeline",
            json={},
        )
        assert response.status_code == 422
    @patch("app.api.past_timeline.config_service")
    @patch("app.api.past_timeline.db_execute")
    def test_profile_not_found(self, mock_db, mock_config, pt_client, mock_auth_user, mock_rate_limit):
        """존재하지 않는 프로파일 → 404"""
        mock_config.is_feature_enabled = AsyncMock(return_value=True)
        mock_db.return_value = MockDBResult([])
        response = pt_client.post(
            "/api/reading/past-timeline",
            json={"profile_id": "nonexistent"},
        )
        assert response.status_code == 404

    @patch("app.api.past_timeline.config_service")
    @patch("app.api.past_timeline._decrypt_profile_field")
    @patch("app.api.past_timeline.db_execute")
    def test_no_cache_id(self, mock_db, mock_decrypt, mock_config, pt_client, mock_auth_user, mock_rate_limit):
        """cache_id 없는 프로파일 → 400"""
        mock_config.is_feature_enabled = AsyncMock(return_value=True)
        mock_decrypt.return_value = "1990-01-15"
        profile_data = {"id": "p1", "user_id": "user-123", "cache_id": None,
                       "birth_date_ct": "e", "birth_date_iv": "i", "birth_date_tag": "t"}
        mock_db.return_value = MockDBResult([profile_data])
        response = pt_client.post(
            "/api/reading/past-timeline",
            json={"profile_id": "p1"},
        )
        assert response.status_code == 400
