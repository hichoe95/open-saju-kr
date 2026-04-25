import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

from fastapi import FastAPI  # pyright: ignore[reportMissingImports]
from fastapi.testclient import TestClient  # pyright: ignore[reportMissingImports]

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("TESTING", "1")

from app.api.auth import require_auth
from app.api.push import router as push_router
from app.services import push_service


class _FakeQuery:
    def __init__(self, supabase: "_FakeSupabase", table_name: str):
        self.supabase = supabase
        self.table_name = table_name
        self.filters: dict[str, object] = {}
        self._upsert_payload: dict[str, object] | None = None
        self._update_payload: dict[str, object] | None = None

    def select(self, _fields: str):
        return self

    def eq(self, key: str, value: object):
        self.filters[key] = value
        return self

    def upsert(self, payload: dict[str, object], on_conflict: str):
        self._upsert_payload = dict(payload)
        self.supabase.last_on_conflict = on_conflict
        return self

    def update(self, payload: dict[str, object]):
        self._update_payload = dict(payload)
        return self

    def execute(self):
        if self.table_name != "push_subscriptions":
            return SimpleNamespace(data=[])

        rows = self.supabase.rows

        if self._upsert_payload is not None:
            existing = None
            for row in rows:
                if row.get("user_id") == self._upsert_payload.get(
                    "user_id"
                ) and row.get("endpoint") == self._upsert_payload.get("endpoint"):
                    existing = row
                    break

            if existing is None:
                new_row = {
                    "id": f"sub-{len(rows) + 1}",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                    "last_sent_at": None,
                    "failure_count": 0,
                    "is_active": True,
                }
                new_row.update(self._upsert_payload)
                rows.append(new_row)
                return SimpleNamespace(data=[new_row])

            existing.update(self._upsert_payload)
            return SimpleNamespace(data=[existing])

        if self._update_payload is not None:
            updated_rows = []
            for row in rows:
                if all(row.get(k) == v for k, v in self.filters.items()):
                    row.update(self._update_payload)
                    updated_rows.append(dict(row))
            return SimpleNamespace(data=updated_rows)

        selected = [
            dict(row)
            for row in rows
            if all(row.get(k) == v for k, v in self.filters.items())
        ]
        return SimpleNamespace(data=selected)


class _FakeSupabase:
    def __init__(self, rows: list[dict] | None = None):
        self.rows = rows or []
        self.last_on_conflict: str | None = None

    def table(self, table_name: str) -> _FakeQuery:
        return _FakeQuery(self, table_name)


def _make_push_test_client() -> TestClient:
    app = FastAPI()
    app.include_router(push_router, prefix="/api")
    app.dependency_overrides[require_auth] = lambda: {"user_id": "user-1"}
    return TestClient(app)


def test_subscribe_new(monkeypatch):
    fake_supabase = _FakeSupabase()

    async def _fake_db_execute(func):
        return func()

    monkeypatch.setattr("app.api.push.supabase", fake_supabase)
    monkeypatch.setattr("app.api.push.db_execute", _fake_db_execute)

    client = _make_push_test_client()
    response = client.post(
        "/api/push/subscribe",
        json={
            "endpoint": "https://push.example/sub-1",
            "keys": {"p256dh": "p256dh-1", "auth": "auth-1"},
        },
    )

    assert response.status_code == 200
    assert response.json() == {"status": "subscribed"}
    assert len(fake_supabase.rows) == 1
    assert fake_supabase.rows[0]["endpoint"] == "https://push.example/sub-1"
    assert fake_supabase.last_on_conflict == "user_id,endpoint"


def test_subscribe_duplicate_upsert(monkeypatch):
    fake_supabase = _FakeSupabase()

    async def _fake_db_execute(func):
        return func()

    monkeypatch.setattr("app.api.push.supabase", fake_supabase)
    monkeypatch.setattr("app.api.push.db_execute", _fake_db_execute)

    client = _make_push_test_client()
    first = {
        "endpoint": "https://push.example/same",
        "keys": {"p256dh": "old-p256", "auth": "old-auth"},
    }
    second = {
        "endpoint": "https://push.example/same",
        "keys": {"p256dh": "new-p256", "auth": "new-auth"},
    }
    assert client.post("/api/push/subscribe", json=first).status_code == 200
    assert client.post("/api/push/subscribe", json=second).status_code == 200

    assert len(fake_supabase.rows) == 1
    assert fake_supabase.rows[0]["p256dh"] == "new-p256"
    assert fake_supabase.rows[0]["auth_key"] == "new-auth"
    assert fake_supabase.rows[0]["is_active"] is True
    assert fake_supabase.rows[0]["failure_count"] == 0


def test_unsubscribe(monkeypatch):
    fake_supabase = _FakeSupabase(
        rows=[
            {
                "id": "sub-1",
                "user_id": "user-1",
                "endpoint": "https://push.example/sub-1",
                "p256dh": "k1",
                "auth_key": "a1",
                "is_active": True,
                "failure_count": 0,
                "last_sent_at": None,
            }
        ]
    )

    async def _fake_db_execute(func):
        return func()

    monkeypatch.setattr("app.api.push.supabase", fake_supabase)
    monkeypatch.setattr("app.api.push.db_execute", _fake_db_execute)

    client = _make_push_test_client()
    response = client.post(
        "/api/push/unsubscribe",
        json={"endpoint": "https://push.example/sub-1"},
    )

    assert response.status_code == 200
    assert response.json() == {"status": "unsubscribed"}
    assert fake_supabase.rows[0]["is_active"] is False


def test_invalid_subscription_rejected(monkeypatch):
    fake_supabase = _FakeSupabase()

    async def _fake_db_execute(func):
        return func()

    monkeypatch.setattr("app.api.push.supabase", fake_supabase)
    monkeypatch.setattr("app.api.push.db_execute", _fake_db_execute)

    client = _make_push_test_client()
    response = client.post(
        "/api/push/subscribe",
        json={"endpoint": "https://push.example/sub-1", "keys": {}},
    )

    assert response.status_code == 400
    assert len(fake_supabase.rows) == 0


def test_send_push_success(monkeypatch):
    fake_supabase = _FakeSupabase(
        rows=[
            {
                "id": "sub-1",
                "user_id": "user-1",
                "endpoint": "https://push.example/sub-1",
                "p256dh": "p1",
                "auth_key": "a1",
                "is_active": True,
                "failure_count": 2,
                "last_sent_at": None,
            }
        ]
    )

    async def _fake_db_execute(func):
        return func()

    async def _fake_threadpool(fn, *args, **kwargs):
        return fn(*args, **kwargs)

    monkeypatch.setattr(push_service, "supabase", fake_supabase)
    monkeypatch.setattr(push_service, "db_execute", _fake_db_execute)
    monkeypatch.setattr(push_service, "run_in_threadpool", _fake_threadpool)
    monkeypatch.setattr(push_service, "webpush", lambda **_: None)
    monkeypatch.setattr(
        push_service,
        "get_settings",
        lambda: SimpleNamespace(
            vapid_private_key="private", vapid_email="mailto:test@example.com"
        ),
    )

    sent_count = asyncio.run(
        push_service.send_push_to_user("user-1", "title", "body", "/")
    )

    assert sent_count == 1
    assert fake_supabase.rows[0]["failure_count"] == 0
    assert fake_supabase.rows[0]["is_active"] is True
    assert fake_supabase.rows[0]["last_sent_at"]


def test_send_push_410_gone(monkeypatch):
    fake_supabase = _FakeSupabase(
        rows=[
            {
                "id": "sub-1",
                "user_id": "user-1",
                "endpoint": "https://push.example/sub-1",
                "p256dh": "p1",
                "auth_key": "a1",
                "is_active": True,
                "failure_count": 0,
                "last_sent_at": None,
            }
        ]
    )

    class _FakeWebPushException(Exception):
        def __init__(self, status_code: int):
            super().__init__(f"status={status_code}")
            self.response = SimpleNamespace(status_code=status_code)

    async def _fake_db_execute(func):
        return func()

    async def _fake_threadpool(fn, *args, **kwargs):
        return fn(*args, **kwargs)

    def _raise_410(**_):
        raise _FakeWebPushException(410)

    monkeypatch.setattr(push_service, "supabase", fake_supabase)
    monkeypatch.setattr(push_service, "db_execute", _fake_db_execute)
    monkeypatch.setattr(push_service, "run_in_threadpool", _fake_threadpool)
    monkeypatch.setattr(push_service, "WebPushException", _FakeWebPushException)
    monkeypatch.setattr(push_service, "webpush", _raise_410)
    monkeypatch.setattr(
        push_service,
        "get_settings",
        lambda: SimpleNamespace(
            vapid_private_key="private", vapid_email="mailto:test@example.com"
        ),
    )

    sent_count = asyncio.run(
        push_service.send_push_to_user("user-1", "title", "body", "/")
    )

    assert sent_count == 0
    assert fake_supabase.rows[0]["is_active"] is False


def test_send_push_failure_count(monkeypatch):
    fake_supabase = _FakeSupabase(
        rows=[
            {
                "id": "sub-1",
                "user_id": "user-1",
                "endpoint": "https://push.example/sub-1",
                "p256dh": "p1",
                "auth_key": "a1",
                "is_active": True,
                "failure_count": 2,
                "last_sent_at": None,
            }
        ]
    )

    async def _fake_db_execute(func):
        return func()

    async def _fake_threadpool(fn, *args, **kwargs):
        return fn(*args, **kwargs)

    def _raise_error(**_):
        raise RuntimeError("push failed")

    monkeypatch.setattr(push_service, "supabase", fake_supabase)
    monkeypatch.setattr(push_service, "db_execute", _fake_db_execute)
    monkeypatch.setattr(push_service, "run_in_threadpool", _fake_threadpool)
    monkeypatch.setattr(push_service, "webpush", _raise_error)
    monkeypatch.setattr(
        push_service,
        "get_settings",
        lambda: SimpleNamespace(
            vapid_private_key="private", vapid_email="mailto:test@example.com"
        ),
    )

    sent_count = asyncio.run(
        push_service.send_push_to_user("user-1", "title", "body", "/")
    )

    assert sent_count == 0
    assert fake_supabase.rows[0]["failure_count"] == 3
    assert fake_supabase.rows[0]["is_active"] is False


def test_daily_reminder_rate_limit(monkeypatch):
    now = datetime.now(timezone.utc)
    fake_supabase = _FakeSupabase(
        rows=[
            {
                "user_id": "u1",
                "is_active": True,
                "last_sent_at": (now - timedelta(hours=1)).isoformat(),
            },
            {"user_id": "u2", "is_active": True, "last_sent_at": None},
            {
                "user_id": "u3",
                "is_active": True,
                "last_sent_at": (now - timedelta(hours=30)).isoformat(),
            },
        ]
    )

    async def _fake_db_execute(func):
        return func()

    called_users: list[str] = []

    async def _fake_send_push_to_user(
        user_id: str, title: str, body: str, url: str = "/"
    ) -> int:
        called_users.append(user_id)
        return 1

    monkeypatch.setattr(push_service, "supabase", fake_supabase)
    monkeypatch.setattr(push_service, "db_execute", _fake_db_execute)
    monkeypatch.setattr(push_service, "send_push_to_user", _fake_send_push_to_user)

    summary = asyncio.run(push_service.send_daily_reminders())

    assert set(called_users) == {"u2", "u3"}
    assert summary["total_users"] == 3
    assert summary["eligible_users"] == 2
    assert summary["sent_users"] == 2
    assert summary["failed_users"] == 0
    assert summary["sent_notifications"] == 2
    assert summary["skipped_users"] == 1
