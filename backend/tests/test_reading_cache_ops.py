import asyncio
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import HTTPException

from app.api.reading import cache_ops
from app.core import security as security_module


def _make_cached_row(
    *, cache_id: str, updated_at: datetime, prompt_version: str = "v1"
) -> dict:
    return {
        "id": cache_id,
        "updated_at": updated_at.isoformat(),
        "model_version": "openai:gpt-5.4",
        "one_liner": "cached result",
        "pillars_json": {"day": "갑자"},
        "card_json": {},
        "tabs_json": {},
        "advanced_json": {},
        "extras_json": {"cache_metadata": {"prompt_version": prompt_version}},
    }


class _FakeQuery:
    def __init__(self, supabase: "_FakeSupabase", table_name: str):
        self.supabase = supabase
        self.table_name = table_name
        self.filters: dict[str, object] = {}
        self.update_payload: dict[str, object] | None = None

    def select(self, _fields: str):
        return self

    def eq(self, key: str, value: object):
        self.filters[key] = value
        return self

    def limit(self, _value: int):
        return self

    def order(self, _field: str, desc: bool = False):
        return self

    def update(self, payload: dict[str, object]):
        self.update_payload = payload
        return self

    def execute(self):
        if self.update_payload is not None:
            self.supabase.updates.append(
                (self.table_name, dict(self.filters), self.update_payload)
            )
            return SimpleNamespace(data=[])

        if self.table_name == "saju_profiles":
            profile = self.supabase.profile
            if not profile:
                return SimpleNamespace(data=[])
            for key, value in self.filters.items():
                if profile.get(key) != value:
                    return SimpleNamespace(data=[])
            return SimpleNamespace(data=[profile])

        if self.table_name == "user_readings":
            if "profile_id" in self.filters:
                rows = self.supabase.linked_readings
            else:
                rows = self.supabase.fallback_readings
            rows = [
                row
                for row in rows
                if all(row.get(key) == value for key, value in self.filters.items())
            ]
            return SimpleNamespace(data=rows)

        if self.table_name == "saju_cache":
            cache_id = self.filters.get("id")
            if cache_id is None:
                return SimpleNamespace(data=[])
            row = self.supabase.caches_by_id.get(str(cache_id))
            return SimpleNamespace(data=[row] if row else [])

        return SimpleNamespace(data=[])


class _FakeSupabase:
    def __init__(
        self,
        *,
        profile: dict | None = None,
        linked_readings: list[dict] | None = None,
        fallback_readings: list[dict] | None = None,
        caches_by_id: dict[str, dict] | None = None,
    ):
        self.profile = profile
        self.linked_readings = linked_readings or []
        self.fallback_readings = fallback_readings or []
        self.caches_by_id = caches_by_id or {}
        self.updates: list[tuple[str, dict[str, object], dict[str, object]]] = []

    def table(self, table_name: str) -> _FakeQuery:
        return _FakeQuery(self, table_name)


def _patch_cache_versions(monkeypatch) -> None:
    async def _fake_get_model_main() -> str:
        return "gpt-5.4"

    monkeypatch.setattr(
        cache_ops.config_service, "get_model_main", _fake_get_model_main
    )
    monkeypatch.setattr(
        cache_ops,
        "get_settings",
        lambda: SimpleNamespace(prompt_version="v1", rate_limit_per_minute=30),
    )


def test_build_cached_reading_response_preserves_prompt_version():
    response = cache_ops._build_cached_reading_response(
        _make_cached_row(
            cache_id="cache-1",
            updated_at=datetime.now(timezone.utc),
            prompt_version="v9",
        )
    )

    assert response["meta"]["prompt_version"] == "v9"


def test_get_cached_reading_by_params_skips_stale_classic_and_uses_fresh_mz(
    monkeypatch,
):
    now = datetime.now(timezone.utc)
    stale_row = _make_cached_row(
        cache_id="cache-stale", updated_at=now - timedelta(days=40)
    )
    fresh_row = _make_cached_row(cache_id="cache-fresh", updated_at=now)

    _patch_cache_versions(monkeypatch)
    monkeypatch.setattr(
        cache_ops, "_verify_profile_ownership", lambda *args, **kwargs: True
    )
    monkeypatch.setattr(security_module, "hmac_birth_key", lambda canonical: canonical)

    def _fake_get_cached_reading_sync(birth_key: str):
        if birth_key.endswith("_classic"):
            return stale_row
        if birth_key.endswith("_mz"):
            return fresh_row
        return None

    monkeypatch.setattr(
        cache_ops, "get_cached_reading_sync", _fake_get_cached_reading_sync
    )

    response = asyncio.run(
        cache_ops.get_cached_reading_by_params(
            birth_date="1990-01-01",
            hour="12",
            calendar_type="solar",
            gender="male",
            persona=None,
            current_user={"user_id": "user-1"},
        )
    )

    assert response["meta"]["prompt_version"] == "v1"
    assert response["one_liner"] == "cached result"


def test_get_cached_reading_by_profile_skips_stale_direct_cache_and_uses_fresh_fallback(
    monkeypatch,
):
    now = datetime.now(timezone.utc)
    stale_row = _make_cached_row(
        cache_id="cache-stale", updated_at=now - timedelta(days=40)
    )
    fresh_row = _make_cached_row(cache_id="cache-fresh", updated_at=now)

    _patch_cache_versions(monkeypatch)
    monkeypatch.setattr(
        cache_ops,
        "supabase",
        _FakeSupabase(
            profile={
                "id": "profile-1",
                "user_id": "user-1",
                "cache_id": "cache-stale",
                "label": "내 사주",
                "persona": "classic",
                "created_at": now.isoformat(),
            },
            linked_readings=[],
            fallback_readings=[
                {
                    "id": "reading-stale",
                    "user_id": "user-1",
                    "cache_id": "cache-stale",
                    "label": "내 사주",
                    "persona": "classic",
                    "created_at": now.isoformat(),
                },
                {
                    "id": "reading-fresh",
                    "user_id": "user-1",
                    "cache_id": "cache-fresh",
                    "label": "내 사주",
                    "persona": "warm",
                    "created_at": (now - timedelta(minutes=1)).isoformat(),
                },
            ],
            caches_by_id={"cache-stale": stale_row, "cache-fresh": fresh_row},
        ),
    )
    monkeypatch.setattr(
        cache_ops,
        "_decrypt_profile_field",
        lambda _profile, column: {
            "birth_date": "1990-01-01",
            "hour_branch": "12",
            "calendar_type": "solar",
            "gender": "male",
        }[column],
    )
    monkeypatch.setattr(cache_ops, "get_cached_reading_sync", lambda _birth_key: None)
    monkeypatch.setattr(security_module, "hmac_birth_key", lambda canonical: canonical)

    response = asyncio.run(
        cache_ops.get_cached_reading_by_profile(
            profile_id="profile-1",
            current_user={"user_id": "user-1"},
        )
    )

    assert response["one_liner"] == "cached result"
    assert response["meta"]["reading_id"] == "reading-fresh"


def test_get_cached_reading_by_key_rejects_stale_cache(monkeypatch):
    stale_row = _make_cached_row(
        cache_id="cache-stale",
        updated_at=datetime.now(timezone.utc) - timedelta(days=40),
    )

    _patch_cache_versions(monkeypatch)
    monkeypatch.setattr(
        cache_ops, "_is_birth_key_owned", lambda *_args, **_kwargs: True
    )
    monkeypatch.setattr(
        cache_ops, "get_cached_reading_sync", lambda _birth_key: stale_row
    )

    try:
        asyncio.run(
            cache_ops.get_cached_reading_by_key(
                birth_key="birth-key",
                current_user={"user_id": "user-1"},
            )
        )
        assert False, "Expected stale cache to raise HTTPException"
    except HTTPException as exc:
        assert exc.status_code == 404
