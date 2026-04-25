import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api.admin import require_admin, router as admin_router
from app.api.auth import require_auth
from app.api.feedback import router as feedback_router


feedback_test_app = FastAPI()
feedback_test_app.include_router(feedback_router, prefix="/api")
feedback_test_app.include_router(admin_router, prefix="/api")


def _mock_sync_db_execute(result):
    async def _mock(_fn):
        return result

    return _mock


class TestFeedbackReplies:
    def setup_method(self):
        feedback_test_app.dependency_overrides[require_auth] = lambda: {
            "user_id": "user-1"
        }
        feedback_test_app.dependency_overrides[require_admin] = lambda: "admin-user"

    def teardown_method(self):
        feedback_test_app.dependency_overrides.clear()

    def test_get_my_feedbacks_marks_unread_reply(self):
        client = TestClient(feedback_test_app)

        with patch("app.api.feedback.supabase") as mock_supabase:
            table = MagicMock()
            table.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = SimpleNamespace(
                data=[
                    {
                        "id": "feedback-1",
                        "category": "inquiry",
                        "content": "첫 번째 문의입니다.",
                        "status": "resolved",
                        "created_at": "2026-03-08T00:00:00Z",
                        "response": "답변 완료",
                        "responded_at": "2026-03-08T01:00:00Z",
                        "reply_seen_at": None,
                    },
                    {
                        "id": "feedback-2",
                        "category": "bug",
                        "content": "두 번째 문의입니다.",
                        "status": "reviewed",
                        "created_at": "2026-03-07T00:00:00Z",
                        "response": "확인 중입니다.",
                        "responded_at": "2026-03-07T01:00:00Z",
                        "reply_seen_at": "2026-03-07T02:00:00Z",
                    },
                ]
            )
            mock_supabase.table.return_value = table

            response = client.get("/api/feedback/my")

        assert response.status_code == 200
        payload = response.json()
        assert payload[0]["has_unread_reply"] is True
        assert payload[1]["has_unread_reply"] is False

    def test_mark_feedback_replies_read_updates_only_unread_rows(self):
        client = TestClient(feedback_test_app)

        with patch("app.api.feedback.supabase") as mock_supabase:
            table = MagicMock()
            update_chain = table.update.return_value
            update_chain.eq.return_value.not_.is_.return_value.is_.return_value.execute.return_value = SimpleNamespace(
                data=[{"id": "feedback-1"}, {"id": "feedback-2"}]
            )
            mock_supabase.table.return_value = table

            response = client.post("/api/feedback/mark-replies-read")

        assert response.status_code == 200
        assert response.json()["marked_count"] == 2

    def test_admin_reply_resets_unread_state(self):
        client = TestClient(feedback_test_app)

        async def mock_db_execute(fn):
            return fn()

        with (
            patch(
                "app.api.admin.db_execute",
                side_effect=mock_db_execute,
            ),
            patch("app.api.admin.supabase") as mock_supabase,
            patch("app.api.admin.log_admin_action", new=AsyncMock()),
        ):
            table = MagicMock()
            table.update.return_value.eq.return_value.execute.return_value = (
                SimpleNamespace(data=[{"id": "feedback-1"}])
            )
            mock_supabase.table.return_value = table

            response = client.put(
                "/api/admin/feedbacks/feedback-1",
                json={
                    "status": "resolved",
                    "response": "확인 후 처리했습니다.",
                    "admin_note": "내부 확인 완료",
                },
            )

        assert response.status_code == 200
        update_payload = table.update.call_args.args[0]
        assert update_payload["response"] == "확인 후 처리했습니다."
        assert update_payload["reply_seen_at"] is None
        assert update_payload["responded_at"]
