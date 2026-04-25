import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api.admin import require_admin, router as admin_router


tracking_report_test_app = FastAPI()
tracking_report_test_app.include_router(admin_router, prefix="/api")


class TestTrackingReport:
    def setup_method(self):
        tracking_report_test_app.dependency_overrides[require_admin] = lambda: (
            "admin-user"
        )

    def teardown_method(self):
        tracking_report_test_app.dependency_overrides.clear()

    def test_tracking_report_contract(self):
        client = TestClient(tracking_report_test_app)
        payload = {
            "scope_label": "all_time",
            "generated_at": "2026-03-29T00:00:00Z",
            "executive_summary": "메인 사주 분석은 코어 가치로 작동합니다.",
            "executive_subtitle": "32명, 271세션, 2713이벤트 기준입니다.",
            "sample_size": {
                "tracked_users": 32,
                "tracked_sessions": 271,
                "total_events": 2713,
            },
            "kpis": [
                {
                    "key": "core_activation",
                    "label": "핵심 완료율",
                    "value": "99.1%",
                    "context": "106건 중 105건 완료",
                    "tone": "positive",
                }
            ],
            "journey_funnel": [
                {
                    "name": "방문 이벤트",
                    "count": 2063,
                    "conversion_rate": 100.0,
                    "note": "page_view 이벤트 기준",
                }
            ],
            "journey_funnel_note": "strict user funnel이 아닙니다.",
            "page_focus": [{"page": "home", "views": 1092, "visitors": 63}],
            "feature_focus": [
                {
                    "feature": "reading",
                    "usage_count": 100,
                    "unique_users": 22,
                    "insight": "코어 기능입니다.",
                }
            ],
            "tab_insights": [
                {
                    "tab_name": "love",
                    "event_count": 75,
                    "avg_dwell_seconds": 108.6,
                    "bounce_rate": 14.7,
                    "insight": "깊게 읽힙니다.",
                }
            ],
            "payer_segments": [
                {
                    "segment": "무과금 사용자",
                    "users": 25,
                    "avg_readings": 1.2,
                    "avg_paid_amount": 0.0,
                    "insight": "무료 단계에 머뭅니다.",
                }
            ],
            "risks": [
                {
                    "title": "응답속도 리스크",
                    "summary": "응답시간이 깁니다.",
                    "detail": "평균 80초 이상입니다.",
                    "tone": "critical",
                }
            ],
            "opportunities": [
                {
                    "title": "핵심 경험 강점",
                    "summary": "완료율이 높습니다.",
                    "detail": "시작 후 대부분 완료합니다.",
                    "tone": "positive",
                }
            ],
            "recommendations": [
                {
                    "priority": "high",
                    "title": "성능 개선",
                    "rationale": "느린 응답이 이탈을 만듭니다.",
                    "actions": ["병목 구간 찾기"],
                    "expected_impact": "첫 경험 이탈 감소",
                }
            ],
            "evidence": [
                {
                    "title": "Funnel analysis overview",
                    "source": "Amplitude",
                    "url": "https://amplitude.com/docs/analytics/charts/funnel-analysis",
                    "takeaway": "퍼널은 strict order 여부를 구분해야 합니다.",
                    "supports": "퍼널 해석 주의",
                }
            ],
            "limitations": ["표본이 작습니다."],
        }

        with patch(
            "app.api.admin._build_tracking_report_payload",
            new=AsyncMock(return_value=payload),
        ):
            response = client.get("/api/admin/analytics/tracking-report")

        assert response.status_code == 200
        data = response.json()
        assert data["scope_label"] == "all_time"
        assert data["sample_size"]["tracked_users"] == 32
        assert data["kpis"][0]["key"] == "core_activation"
        assert data["journey_funnel"][0]["name"] == "방문 이벤트"
        assert data["feature_focus"][0]["feature"] == "reading"
        assert data["tab_insights"][0]["tab_name"] == "love"
        assert data["recommendations"][0]["priority"] == "high"
        assert data["evidence"][0]["url"].startswith("https://")

    def test_tracking_report_returns_500_when_builder_fails(self):
        client = TestClient(tracking_report_test_app)

        with patch(
            "app.api.admin._build_tracking_report_payload",
            new=AsyncMock(side_effect=RuntimeError("boom")),
        ):
            response = client.get("/api/admin/analytics/tracking-report")

        assert response.status_code == 500
        assert (
            response.json()["detail"]
            == "추적 리포트 데이터를 생성하는 중 오류가 발생했습니다"
        )
