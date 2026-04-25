import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.cache_service import get_cache_reuse_status


def test_cache_reuse_allows_same_month_same_versions():
    reusable, reason = get_cache_reuse_status(
        {
            "updated_at": "2026-03-05T08:30:00+00:00",
            "model_version": "openai:gpt-5.4",
            "extras_json": {"cache_metadata": {"prompt_version": "v1"}},
        },
        current_model_version="openai:gpt-5.4",
        current_prompt_version="v1",
        now=datetime(2026, 3, 15, 12, 0, tzinfo=timezone.utc),
    )

    assert reusable is True
    assert reason == "fresh"


def test_cache_reuse_rejects_previous_month_entry():
    reusable, reason = get_cache_reuse_status(
        {
            "updated_at": "2026-02-28T14:30:00+00:00",
            "model_version": "openai:gpt-5.4",
            "extras_json": {"cache_metadata": {"prompt_version": "v1"}},
        },
        current_model_version="openai:gpt-5.4",
        current_prompt_version="v1",
        now=datetime(2026, 3, 1, 0, 30, tzinfo=timezone.utc),
    )

    assert reusable is False
    assert reason.startswith("stale_month:")


def test_cache_reuse_rejects_model_version_mismatch():
    reusable, reason = get_cache_reuse_status(
        {
            "updated_at": "2026-03-05T08:30:00+00:00",
            "model_version": "openai:gpt-4.1",
            "extras_json": {"cache_metadata": {"prompt_version": "v1"}},
        },
        current_model_version="openai:gpt-5.4",
        current_prompt_version="v1",
        now=datetime(2026, 3, 15, 12, 0, tzinfo=timezone.utc),
    )

    assert reusable is False
    assert reason == "model_version_mismatch"


def test_cache_reuse_rejects_missing_prompt_metadata():
    reusable, reason = get_cache_reuse_status(
        {
            "updated_at": "2026-03-05T08:30:00+00:00",
            "model_version": "openai:gpt-5.4",
            "extras_json": {},
        },
        current_model_version="openai:gpt-5.4",
        current_prompt_version="v1",
        now=datetime(2026, 3, 15, 12, 0, tzinfo=timezone.utc),
    )

    assert reusable is False
    assert reason == "missing_prompt_version"


def test_cache_reuse_falls_back_to_created_at_when_updated_at_missing():
    reusable, reason = get_cache_reuse_status(
        {
            "created_at": "2026-03-02T10:00:00+00:00",
            "model_version": "openai:gpt-5.4",
            "extras_json": {"cache_metadata": {"prompt_version": "v1"}},
        },
        current_model_version="openai:gpt-5.4",
        current_prompt_version="v1",
        now=datetime(2026, 3, 15, 12, 0, tzinfo=timezone.utc),
    )

    assert reusable is True
    assert reason == "fresh"
