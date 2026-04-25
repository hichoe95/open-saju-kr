# pyright: reportMissingImports=false

import os
import re
import sys
from pathlib import Path

import pytest
from pydantic import ValidationError

os.environ.setdefault("TESTING", "1")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:3000")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-with-minimum-length")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api.analytics import (  # noqa: E402
    TrackEventRequest,
    TrackFeatureRequest,
    TrackFunnelStepRequest,
    TrackShareRequest,
    TrackTabEngagementRequest,
    _extract_attribution_from_mapping,
)


FRONTEND_CONTRACT_PATH = (
    Path(__file__).resolve().parents[2]
    / "frontend"
    / "src"
    / "lib"
    / "analyticsContract.ts"
)

EXPECTED_SHARE_TYPES = ["saju", "compatibility"]
EXPECTED_SHARE_METHODS = ["link", "kakao", "image", "clipboard"]
EXPECTED_FEATURE_NAMES = [
    "reading_start",
    "reading_complete",
    "compatibility_start",
    "compatibility_complete",
    "flow_calendar_view",
    "flow_ai_advice",
    "decision_qa",
    "share_modal_open",
    "share_created",
    "profile_save",
    "check_in",
]
EXPECTED_TAB_NAMES = [
    "overview",
    "personality",
    "career",
    "wealth",
    "relationship",
    "health",
    "yearly",
    "monthly",
    "advice",
    "advanced",
    "decision",
    "summary",
    "lucky",
    "love",
    "money",
    "study",
    "compatibility",
    "life",
    "daeun",
]


def _extract_exported_array(name: str) -> list[str]:
    source = FRONTEND_CONTRACT_PATH.read_text(encoding="utf-8")
    pattern = rf"export const {name} = \[(.*?)\] as const;"
    match = re.search(pattern, source, re.DOTALL)
    if match is None:
        raise AssertionError(f"Could not find exported array: {name}")

    return re.findall(r"'([^']+)'", match.group(1))


class TestAnalyticsContract:
    def test_share_types_match_frontend_contract(self):
        assert _extract_exported_array("SHARE_TYPES") == EXPECTED_SHARE_TYPES

    def test_share_methods_match_frontend_contract(self):
        assert _extract_exported_array("SHARE_METHODS") == EXPECTED_SHARE_METHODS

    def test_feature_names_match_frontend_contract(self):
        assert _extract_exported_array("FEATURE_NAMES") == EXPECTED_FEATURE_NAMES

    def test_tab_names_match_frontend_contract(self):
        assert _extract_exported_array("TAB_NAMES") == EXPECTED_TAB_NAMES


class TestTrackEventRequest:
    def test_valid_payload(self):
        payload = TrackEventRequest.model_validate(
            {
                "event_type": "page_view",
                "event_data": {"page": "home"},
                "session_id": "sess_123",
            }
        )

        assert payload.event_type == "page_view"
        assert payload.event_data == {"page": "home"}
        assert payload.session_id == "sess_123"

    def test_missing_event_type_raises_validation_error(self):
        with pytest.raises(ValidationError):
            TrackEventRequest.model_validate({"event_data": {"page": "home"}})

    def test_null_safe_optional_fields(self):
        payload = TrackEventRequest.model_validate(
            {
                "event_type": "page_view",
                "event_data": None,
                "session_id": None,
            }
        )

        assert payload.event_data is None
        assert payload.session_id is None

    def test_accepts_attribution_fields_inside_event_data(self):
        payload = TrackEventRequest.model_validate(
            {
                "event_type": "page_view",
                "event_data": {
                    "page": "home",
                    "utm_source": "kakao",
                    "utm_medium": "share",
                    "utm_campaign": "spring2026",
                    "referral_code": "abc123",
                },
            }
        )

        assert payload.event_data == {
            "page": "home",
            "utm_source": "kakao",
            "utm_medium": "share",
            "utm_campaign": "spring2026",
            "referral_code": "abc123",
        }

    def test_accepts_null_or_missing_attribution_fields_gracefully(self):
        payload = TrackEventRequest.model_validate(
            {
                "event_type": "page_view",
                "event_data": {
                    "page": "home",
                    "utm_source": None,
                },
            }
        )

        assert payload.event_data == {"page": "home", "utm_source": None}


class TestAttributionExtraction:
    def test_extracts_only_non_empty_string_values(self):
        assert _extract_attribution_from_mapping(
            {
                "utm_source": " kakao ",
                "utm_medium": "share",
                "utm_campaign": "  ",
                "referral_code": None,
            }
        ) == {
            "utm_source": "kakao",
            "utm_medium": "share",
        }

    def test_returns_empty_dict_for_missing_attribution(self):
        assert _extract_attribution_from_mapping({"page": "home"}) == {}


class TestTrackShareRequest:
    def test_valid_payload(self):
        payload = TrackShareRequest.model_validate(
            {"share_id": "abc", "share_type": "saju"}
        )

        assert payload.share_id == "abc"
        assert payload.share_type == "saju"

    def test_missing_share_id_raises_validation_error(self):
        with pytest.raises(ValidationError):
            TrackShareRequest.model_validate({"share_type": "saju"})


class TestTrackFeatureRequest:
    def test_valid_payload(self):
        payload = TrackFeatureRequest.model_validate(
            {
                "feature_name": "reading_start",
                "metadata": {"source": "kakao"},
            }
        )

        assert payload.feature_name == "reading_start"
        assert payload.metadata == {"source": "kakao"}

    def test_missing_feature_name_raises_validation_error(self):
        with pytest.raises(ValidationError):
            TrackFeatureRequest.model_validate({"metadata": {"source": "kakao"}})


class TestTrackFunnelStepRequest:
    @pytest.mark.parametrize(
        "step",
        [
            "input_started",
            "result_received",
            "tab_clicked",
            "profile_saved",
            "shared",
        ],
    )
    def test_valid_steps(self, step: str):
        payload = TrackFunnelStepRequest.model_validate(
            {
                "session_id": "sess_123",
                "step": step,
                "step_data": {"source": "marketing"},
            }
        )

        assert payload.step == step

    def test_invalid_step_raises_validation_error(self):
        with pytest.raises(ValidationError):
            TrackFunnelStepRequest.model_validate(
                {
                    "session_id": "sess_123",
                    "step": "checkout_started",
                }
            )


class TestTrackTabEngagementRequest:
    def test_valid_payload(self):
        payload = TrackTabEngagementRequest.model_validate(
            {"tab_name": "overview", "dwell_ms": 5000}
        )

        assert payload.tab_name == "overview"
        assert payload.dwell_ms == 5000

    def test_missing_tab_name_raises_validation_error(self):
        with pytest.raises(ValidationError):
            TrackTabEngagementRequest.model_validate({"dwell_ms": 5000})

    def test_zero_dwell_ms_is_valid(self):
        payload = TrackTabEngagementRequest.model_validate(
            {"tab_name": "overview", "dwell_ms": 0}
        )

        assert payload.dwell_ms == 0
