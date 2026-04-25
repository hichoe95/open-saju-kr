import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import BackgroundTasks, HTTPException

from ..db.supabase_client import db_execute, supabase
from ..schemas import (
    CompatibilityJobStartRequest,
    CompatibilityJobStatusResponse,
    CompatibilityRequest,
    CompatibilityResponse,
)
from ..api.payment import charge_for_paid_feature, refund_on_failure

logger = logging.getLogger(__name__)

JOB_STATUS_PENDING = "pending"
JOB_STATUS_CHARGED = "charged"
JOB_STATUS_PROCESSING = "processing"
JOB_STATUS_COMPLETED = "completed"
JOB_STATUS_FAILED = "failed"

PAYMENT_STATE_NOT_CHARGED = "not_charged"
PAYMENT_STATE_CHARGED = "charged"
PAYMENT_STATE_REFUND_PENDING = "refund_pending"
PAYMENT_STATE_REFUNDED = "refunded"

STALE_JOB_MINUTES = 10
MAX_REQUEUE_ATTEMPTS = 1


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _build_job_payload(
    user_id: str, request: CompatibilityJobStartRequest
) -> dict[str, Any]:
    now_iso = _now_iso()
    return {
        "user_id": user_id,
        "client_request_id": request.client_request_id,
        "status": JOB_STATUS_PENDING,
        "payment_state": PAYMENT_STATE_NOT_CHARGED,
        "progress": 10,
        "request_json": {
            "user_a": request.user_a.model_dump(),
            "user_b": request.user_b.model_dump(),
            "model": request.model.model_dump(),
            "scenario": request.scenario.value,
        },
        "retry_count": 0,
        "created_at": now_iso,
        "updated_at": now_iso,
        "last_heartbeat_at": now_iso,
    }


def _compatibility_request_from_job(job: dict[str, Any]) -> CompatibilityRequest:
    request_json = _as_dict(job.get("request_json"))
    return CompatibilityRequest(**request_json)


async def _get_job_by_user_and_request_id(
    user_id: str, client_request_id: str
) -> Optional[dict[str, Any]]:
    result = await db_execute(
        lambda: (
            supabase.table("compatibility_jobs")
            .select("*")
            .eq("user_id", user_id)
            .eq("client_request_id", client_request_id)
            .limit(1)
            .execute()
        )
    )
    first = result.data[0] if result.data else None
    return first if isinstance(first, dict) else None


async def _get_job_by_id(job_id: str) -> Optional[dict[str, Any]]:
    result = await db_execute(
        lambda: (
            supabase.table("compatibility_jobs")
            .select("*")
            .eq("id", job_id)
            .limit(1)
            .execute()
        )
    )
    first = result.data[0] if result.data else None
    return first if isinstance(first, dict) else None


async def _insert_job(
    user_id: str, request: CompatibilityJobStartRequest
) -> dict[str, Any]:
    payload = _build_job_payload(user_id, request)
    result = await db_execute(
        lambda: supabase.table("compatibility_jobs").insert(payload).execute()
    )
    first = result.data[0] if result.data else None
    if not isinstance(first, dict):
        raise HTTPException(status_code=500, detail="궁합 작업 생성에 실패했습니다.")
    return first


async def _update_job(job_id: str, payload: dict[str, Any]) -> Optional[dict[str, Any]]:
    payload = {**payload, "updated_at": _now_iso()}
    result = await db_execute(
        lambda: (
            supabase.table("compatibility_jobs")
            .update(payload)
            .eq("id", job_id)
            .execute()
        )
    )
    first = result.data[0] if result.data else None
    return first if isinstance(first, dict) else None


async def _find_existing_charge(user_id: str, job_id: str) -> Optional[str]:
    result = await db_execute(
        lambda: (
            supabase.table("coin_transactions")
            .select("id")
            .eq("user_id", user_id)
            .eq("type", "spend")
            .eq("reference_type", "compatibility")
            .eq("reference_id", job_id)
            .limit(1)
            .execute()
        )
    )
    first = result.data[0] if result.data else None
    if not isinstance(first, dict):
        return None
    tx_id = first.get("id")
    return str(tx_id) if tx_id else None


def _is_job_stale(job: dict[str, Any]) -> bool:
    heartbeat_raw = job.get("last_heartbeat_at") or job.get("updated_at")
    if not isinstance(heartbeat_raw, str):
        return True
    try:
        heartbeat = datetime.fromisoformat(heartbeat_raw.replace("Z", "+00:00"))
    except ValueError:
        return True
    return datetime.now(timezone.utc) - heartbeat > timedelta(minutes=STALE_JOB_MINUTES)


def _can_requeue(job: dict[str, Any]) -> bool:
    retry_count = job.get("retry_count")
    normalized_retry_count = retry_count if isinstance(retry_count, int) else 0
    return normalized_retry_count < MAX_REQUEUE_ATTEMPTS


async def _mark_refunded(job_id: str, refund_transaction_id: Optional[str]) -> None:
    payload: dict[str, Any] = {
        "payment_state": PAYMENT_STATE_REFUNDED,
        "status": JOB_STATUS_FAILED,
        "completed_at": _now_iso(),
        "progress": 100,
    }
    if refund_transaction_id:
        payload["refund_transaction_id"] = refund_transaction_id
    await _update_job(job_id, payload)


async def _refund_job(job: dict[str, Any], reason: str) -> None:
    transaction_id = job.get("payment_transaction_id")
    if not transaction_id:
        await _update_job(
            job["id"],
            {"payment_state": PAYMENT_STATE_REFUNDED, "completed_at": _now_iso()},
        )
        return
    await _update_job(job["id"], {"payment_state": PAYMENT_STATE_REFUND_PENDING})
    refunded = await refund_on_failure(
        str(job.get("user_id") or ""), str(transaction_id), reason
    )
    if refunded:
        await _mark_refunded(job["id"], None)
    else:
        await _update_job(job["id"], {"payment_state": PAYMENT_STATE_REFUND_PENDING})


async def get_compatibility_job_status(
    job_id: str, user_id: str
) -> CompatibilityJobStatusResponse:
    job = await _get_job_by_id(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="궁합 작업을 찾을 수 없습니다.")
    if str(job.get("user_id") or "") != user_id:
        raise HTTPException(status_code=403, detail="권한이 없습니다.")

    result_response: Optional[CompatibilityResponse] = None
    result_json = job.get("result_json")
    if isinstance(result_json, dict):
        result_response = CompatibilityResponse(**result_json)

    completed_at = job.get("completed_at")
    return CompatibilityJobStatusResponse(
        job_id=str(job.get("id") or ""),
        status=str(job.get("status") or JOB_STATUS_PENDING),
        payment_state=str(job.get("payment_state") or PAYMENT_STATE_NOT_CHARGED),
        progress=int(job.get("progress") or 0),
        result=result_response,
        error=str(job.get("error_message")) if job.get("error_message") else None,
        created_at=str(job.get("created_at")) if job.get("created_at") else None,
        updated_at=str(job.get("updated_at")) if job.get("updated_at") else None,
        completed_at=str(completed_at) if completed_at else None,
    )


async def start_compatibility_job(
    user_id: str,
    request: CompatibilityJobStartRequest,
    compatibility_price: int,
    background_tasks: BackgroundTasks,
) -> CompatibilityJobStatusResponse:
    job = await _get_job_by_user_and_request_id(user_id, request.client_request_id)
    if job is None:
        try:
            job = await _insert_job(user_id, request)
        except Exception:
            job = await _get_job_by_user_and_request_id(
                user_id, request.client_request_id
            )
            if job is None:
                raise

    job_id = str(job.get("id") or "")
    status = str(job.get("status") or JOB_STATUS_PENDING)
    payment_state = str(job.get("payment_state") or PAYMENT_STATE_NOT_CHARGED)

    if status == JOB_STATUS_COMPLETED:
        return await get_compatibility_job_status(job_id, user_id)

    if payment_state == PAYMENT_STATE_REFUNDED:
        return await get_compatibility_job_status(job_id, user_id)

    if payment_state == PAYMENT_STATE_REFUND_PENDING:
        return await get_compatibility_job_status(job_id, user_id)

    if payment_state == PAYMENT_STATE_NOT_CHARGED:
        recovered_tx_id = await _find_existing_charge(user_id, job_id)
        if recovered_tx_id:
            job = (
                await _update_job(
                    job_id,
                    {
                        "status": JOB_STATUS_CHARGED,
                        "payment_state": PAYMENT_STATE_CHARGED,
                        "payment_transaction_id": recovered_tx_id,
                        "progress": 25,
                    },
                )
                or job
            )
        else:
            payment = await charge_for_paid_feature(
                user_id,
                "compatibility",
                compatibility_price,
                "AI 궁합 분석",
                reference_id=job_id,
            )
            if not payment.success:
                if "부족" in (payment.error or ""):
                    raise HTTPException(status_code=402, detail=payment.error)
                raise HTTPException(
                    status_code=400, detail=payment.error or "결제 처리 실패"
                )
            if not payment.transaction_id:
                raise HTTPException(
                    status_code=500, detail="궁합 결제 기록 생성에 실패했습니다."
                )
            job = (
                await _update_job(
                    job_id,
                    {
                        "status": JOB_STATUS_CHARGED,
                        "payment_state": PAYMENT_STATE_CHARGED,
                        "payment_transaction_id": payment.transaction_id,
                        "progress": 25,
                    },
                )
                or job
            )

    job = await _get_job_by_id(job_id) or job
    status = str(job.get("status") or JOB_STATUS_PENDING)

    if status == JOB_STATUS_PROCESSING and not _is_job_stale(job):
        return await get_compatibility_job_status(job_id, user_id)

    if status in {JOB_STATUS_PENDING, JOB_STATUS_CHARGED} or (
        status == JOB_STATUS_PROCESSING and _is_job_stale(job) and _can_requeue(job)
    ):
        retry_count_raw = job.get("retry_count")
        retry_count = retry_count_raw if isinstance(retry_count_raw, int) else 0
        await _update_job(
            job_id,
            {
                "status": JOB_STATUS_PROCESSING,
                "progress": 50,
                "last_heartbeat_at": _now_iso(),
                "retry_count": retry_count + 1,
            },
        )
        background_tasks.add_task(process_compatibility_job, job_id)

    return await get_compatibility_job_status(job_id, user_id)


async def process_compatibility_job(job_id: str) -> None:
    from ..api.compatibility import generate_compatibility_result

    job = await _get_job_by_id(job_id)
    if not job:
        return

    user_id = str(job.get("user_id") or "")
    try:
        await _update_job(
            job_id,
            {
                "status": JOB_STATUS_PROCESSING,
                "progress": 75,
                "last_heartbeat_at": _now_iso(),
            },
        )
        request = _compatibility_request_from_job(job)
        result = await generate_compatibility_result(request, user_id=user_id)
        await _update_job(
            job_id,
            {
                "status": JOB_STATUS_COMPLETED,
                "progress": 100,
                "result_json": result.model_dump(),
                "completed_at": _now_iso(),
                "last_heartbeat_at": _now_iso(),
            },
        )
    except Exception as e:
        logger.exception("[COMPAT JOB] Failed: %s", job_id)
        updated_job = await _update_job(
            job_id,
            {
                "status": JOB_STATUS_FAILED,
                "payment_state": PAYMENT_STATE_REFUND_PENDING,
                "error_message": str(e),
                "completed_at": _now_iso(),
                "last_heartbeat_at": _now_iso(),
            },
        )
        if updated_job:
            await _refund_job(updated_job, "궁합 분석 실패 환불")


async def reconcile_stale_compatibility_jobs() -> None:
    threshold = (
        datetime.now(timezone.utc) - timedelta(minutes=STALE_JOB_MINUTES)
    ).isoformat()
    result = await db_execute(
        lambda: (
            supabase.table("compatibility_jobs")
            .select("*")
            .in_("status", [JOB_STATUS_CHARGED, JOB_STATUS_PROCESSING])
            .lt("last_heartbeat_at", threshold)
            .execute()
        )
    )
    for row in result.data or []:
        if not isinstance(row, dict):
            continue
        job_id = str(row.get("id") or "")
        if not job_id:
            continue
        if row.get("result_json"):
            await _update_job(
                job_id,
                {
                    "status": JOB_STATUS_COMPLETED,
                    "progress": 100,
                    "completed_at": _now_iso(),
                },
            )
            continue
        retry_count_raw = row.get("retry_count")
        retry_count = retry_count_raw if isinstance(retry_count_raw, int) else 0
        if retry_count < MAX_REQUEUE_ATTEMPTS:
            await _update_job(
                job_id,
                {
                    "status": JOB_STATUS_PROCESSING,
                    "retry_count": retry_count + 1,
                    "last_heartbeat_at": _now_iso(),
                    "progress": 50,
                },
            )
            asyncio.create_task(process_compatibility_job(job_id))
            continue
        await _update_job(
            job_id,
            {
                "status": JOB_STATUS_FAILED,
                "payment_state": PAYMENT_STATE_REFUND_PENDING,
                "error_message": "분석 작업이 중단되어 환불 처리됩니다.",
                "completed_at": _now_iso(),
            },
        )
        latest = await _get_job_by_id(job_id)
        if latest:
            await _refund_job(latest, "궁합 작업 중단 환불")
