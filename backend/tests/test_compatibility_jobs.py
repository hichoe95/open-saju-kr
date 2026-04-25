import asyncio
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import BackgroundTasks

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api.payment import PaymentResult
from app.schemas.job import CompatibilityJobStartRequest, CompatibilityJobStatusResponse
from app.services import compatibility_job_service as service


def _sample_request() -> CompatibilityJobStartRequest:
    return CompatibilityJobStartRequest(
        user_a={
            "name": "A",
            "birth_solar": "1990-01-01",
            "birth_time": "12:00",
            "timezone": "Asia/Seoul",
            "birth_place": "대한민국",
            "gender": "male",
        },
        user_b={
            "name": "B",
            "birth_solar": "1991-02-02",
            "birth_time": "13:00",
            "timezone": "Asia/Seoul",
            "birth_place": "대한민국",
            "gender": "female",
        },
        model={"provider": "openai", "model_id": "auto", "temperature": 0.9},
        client_request_id="compat-job-req-1",
    )


class TestCompatibilityJobs:
    def test_start_charges_once_and_schedules_job(self):
        request = _sample_request()
        background_tasks = BackgroundTasks()
        charged_job = {
            "id": "job-1",
            "user_id": "user-1",
            "status": service.JOB_STATUS_CHARGED,
            "payment_state": service.PAYMENT_STATE_CHARGED,
            "progress": 25,
            "retry_count": 0,
        }

        with (
            patch.object(
                service, "_get_job_by_user_and_request_id", AsyncMock(return_value=None)
            ),
            patch.object(
                service,
                "_insert_job",
                AsyncMock(
                    return_value={
                        "id": "job-1",
                        "status": service.JOB_STATUS_PENDING,
                        "payment_state": service.PAYMENT_STATE_NOT_CHARGED,
                    }
                ),
            ),
            patch.object(
                service, "_find_existing_charge", AsyncMock(return_value=None)
            ),
            patch.object(
                service,
                "charge_for_paid_feature",
                AsyncMock(
                    return_value=PaymentResult(success=True, transaction_id="tx-1")
                ),
            ) as charge_mock,
            patch.object(service, "_update_job", AsyncMock(return_value=charged_job)),
            patch.object(
                service, "_get_job_by_id", AsyncMock(return_value=charged_job)
            ),
            patch.object(
                service,
                "get_compatibility_job_status",
                AsyncMock(
                    return_value=CompatibilityJobStatusResponse(
                        job_id="job-1",
                        status="processing",
                        payment_state="charged",
                        progress=50,
                    )
                ),
            ) as get_status_mock,
        ):
            result = asyncio.run(
                service.start_compatibility_job(
                    "user-1", request, 100, background_tasks
                )
            )

        assert result.job_id == "job-1"
        assert len(background_tasks.tasks) == 1
        charge_mock.assert_awaited_once_with(
            "user-1", "compatibility", 100, "AI 궁합 분석", reference_id="job-1"
        )
        get_status_mock.assert_awaited_once()

    def test_start_requeues_charged_job_without_recharge(self):
        request = _sample_request()
        background_tasks = BackgroundTasks()
        existing_job = {
            "id": "job-2",
            "user_id": "user-1",
            "status": service.JOB_STATUS_CHARGED,
            "payment_state": service.PAYMENT_STATE_CHARGED,
            "progress": 25,
            "retry_count": 0,
            "last_heartbeat_at": service._now_iso(),
        }

        with (
            patch.object(
                service,
                "_get_job_by_user_and_request_id",
                AsyncMock(return_value=existing_job),
            ),
            patch.object(
                service, "_get_job_by_id", AsyncMock(return_value=existing_job)
            ),
            patch.object(service, "_update_job", AsyncMock(return_value=existing_job)),
            patch.object(
                service,
                "get_compatibility_job_status",
                AsyncMock(
                    return_value=CompatibilityJobStatusResponse(
                        job_id="job-2",
                        status="processing",
                        payment_state="charged",
                        progress=50,
                    )
                ),
            ),
            patch.object(
                service, "charge_for_paid_feature", AsyncMock()
            ) as charge_mock,
        ):
            result = asyncio.run(
                service.start_compatibility_job(
                    "user-1", request, 100, background_tasks
                )
            )

        assert result.job_id == "job-2"
        assert len(background_tasks.tasks) == 1
        charge_mock.assert_not_awaited()

    def test_reconcile_refunds_exhausted_stale_job(self):
        stale_job = {
            "id": "job-3",
            "status": service.JOB_STATUS_PROCESSING,
            "payment_state": service.PAYMENT_STATE_CHARGED,
            "retry_count": 1,
            "last_heartbeat_at": "2026-03-08T00:00:00+00:00",
        }
        execute_result = MagicMock(data=[stale_job])

        async def fake_db_execute(fn):
            return execute_result

        with (
            patch.object(service, "db_execute", side_effect=fake_db_execute),
            patch.object(service, "_update_job", AsyncMock(return_value=stale_job)),
            patch.object(service, "_get_job_by_id", AsyncMock(return_value=stale_job)),
            patch.object(service, "_refund_job", AsyncMock()) as refund_mock,
        ):
            asyncio.run(service.reconcile_stale_compatibility_jobs())

        refund_mock.assert_awaited_once()
