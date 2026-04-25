import asyncio
import sys
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.chat_service import chat_service


class _FakeQuery:
    def __init__(self, rows: list[dict]):
        self.rows = rows
        self.filters: dict[str, object] = {}

    def select(self, _fields: str):
        return self

    def eq(self, _key: str, _value: object):
        self.filters[_key] = _value
        return self

    def order(self, _field: str, desc: bool = False):
        return self

    def limit(self, _value: int):
        return self

    def execute(self):
        filtered_rows = [
            row
            for row in self.rows
            if all(row.get(key) == value for key, value in self.filters.items())
        ]
        return SimpleNamespace(data=filtered_rows)


class _FakeSupabase:
    def __init__(self, rows: list[dict]):
        self.rows = rows

    def table(self, _table_name: str) -> _FakeQuery:
        return _FakeQuery(self.rows)


def _make_session_row(*, session_id: str, persona: str, birth_time: str) -> dict:
    now = datetime.now(timezone.utc)
    return {
        "id": session_id,
        "user_id": "user-1",
        "birth_key": f"hashed-{persona}",
        "domain": "general",
        "persona": persona,
        "status": "active",
        "max_turns": 20,
        "current_turn": 2,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
        "saju_context": {
            "birth_solar": "1990-01-01",
            "birth_time": birth_time,
            "calendar_type": "solar",
            "gender": "male",
        },
    }


def test_get_sessions_matches_birth_context_across_personas(monkeypatch):
    rows = [
        _make_session_row(
            session_id="session-classic", persona="classic", birth_time="14:00"
        ),
        _make_session_row(
            session_id="session-warm", persona="warm", birth_time="14:30"
        ),
        _make_session_row(session_id="session-other", persona="mz", birth_time="16:00"),
    ]

    monkeypatch.setattr("app.services.chat_service.supabase", _FakeSupabase(rows))

    sessions = asyncio.run(
        chat_service.get_sessions(
            "user-1",
            limit=10,
            birth_context={
                "birth_solar": "1990-01-01",
                "birth_time": "14:45",
                "calendar_type": "solar",
                "gender": "male",
            },
        )
    )

    assert [session.id for session in sessions] == ["session-classic", "session-warm"]


def test_get_sessions_exact_birth_key_filter_still_works(monkeypatch):
    rows = [
        _make_session_row(
            session_id="session-classic", persona="classic", birth_time="14:00"
        )
    ]

    monkeypatch.setattr("app.services.chat_service.supabase", _FakeSupabase(rows))

    sessions = asyncio.run(
        chat_service.get_sessions(
            "user-1",
            limit=10,
            birth_key="hashed-classic",
        )
    )

    assert len(sessions) == 1
    assert sessions[0].id == "session-classic"


def test_get_sessions_birth_context_keeps_legacy_birth_key_match(monkeypatch):
    now = datetime.now(timezone.utc)
    rows = [
        {
            "id": "legacy-session",
            "user_id": "user-1",
            "birth_key": "hashed-classic",
            "domain": "general",
            "persona": "classic",
            "status": "completed",
            "max_turns": 20,
            "current_turn": 20,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
            "saju_context": {},
        }
    ]

    monkeypatch.setattr("app.services.chat_service.supabase", _FakeSupabase(rows))

    sessions = asyncio.run(
        chat_service.get_sessions(
            "user-1",
            limit=10,
            birth_key="hashed-classic",
            birth_context={
                "birth_solar": "1990-01-01",
                "birth_time": "14:00",
                "calendar_type": "solar",
                "gender": "male",
            },
        )
    )

    assert len(sessions) == 1
    assert sessions[0].id == "legacy-session"
