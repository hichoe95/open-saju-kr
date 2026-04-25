"""
사주 리딩 비동기 작업 처리
"""

# pyright: reportMissingImports=false

import json
import logging
import uuid
from typing import Optional

from fastapi import BackgroundTasks, Depends, HTTPException

from ...job_manager import JobStatus, job_manager
from ...schemas import (
    JobStartRequest,
    JobStartResponse,
    JobStatusResponse,
    ReadingResponse,
)
from ..auth import get_current_user
from ..deps import rate_limit_dependency

logger = logging.getLogger(__name__)


def _serialize_job_result(result: ReadingResponse) -> dict:
    result_dict = result.model_dump(exclude_unset=True, exclude_none=True)
    meta_dict = result_dict.setdefault("meta", {})

    if result.meta.cache_id is not None:
        meta_dict["cache_id"] = result.meta.cache_id

    if result.meta.reading_id is not None:
        meta_dict["reading_id"] = result.meta.reading_id

    return result_dict


async def _process_reading_job(job_id: str, request_data: dict):
    """백그라운드에서 사주 리딩 처리"""
    try:
        # 상태를 처리 중으로 업데이트
        job_manager.update_status(job_id, JobStatus.PROCESSING)
        logger.info(f"[JOB {job_id}] 처리 시작")

        # ReadingRequest 생성
        from ...schemas import ReadingRequest, BirthInput, ModelSelection
        from ...db.session import AsyncSessionLocal
        from .routes import create_reading

        birth_input = BirthInput(**request_data["input"])
        model_selection = ModelSelection(**request_data["model"])
        user_id = request_data.get("user_id")
        profile_id = request_data.get("profile_id")
        reading_request = ReadingRequest(
            input=birth_input, model=model_selection, profile_id=profile_id
        )

        # 백그라운드 작업에서는 별도 DB 세션 생성
        async with AsyncSessionLocal() as db:  # type: ignore
            result = await create_reading(
                reading_request,
                db=db,
                current_user={"user_id": user_id} if user_id else None,
                job_id=job_id,
            )

        # 결과를 dict로 변환
        result_dict = _serialize_job_result(result)

        # 성공 상태로 업데이트
        job_manager.update_status(job_id, JobStatus.COMPLETED, result=result_dict)
        logger.info(f"[JOB {job_id}] 처리 완료")

        # 푸시 알림 발송 (구독 정보가 있으면)
        job = job_manager.get_job(job_id)
        if job and job.push_subscription:
            await _send_push_notification(
                job.push_subscription,
                {
                    "title": "사주 분석 완료!",
                    "body": "당신의 운명 분석이 준비되었어요. 지금 확인해보세요!",
                    "data": {"job_id": job_id},
                },
            )

    except Exception as e:
        logger.exception(f"Job {job_id} processing failed")
        job_manager.update_status(job_id, JobStatus.FAILED, error=str(e))


async def _send_push_notification(subscription: dict, payload: dict):
    """웹 푸시 알림 발송"""
    try:
        from pywebpush import webpush  # pyright: ignore[reportMissingImports]
        import os

        vapid_private_key = os.getenv("VAPID_PRIVATE_KEY")
        vapid_email = os.getenv("VAPID_EMAIL", "mailto:admin@example.com")

        if not vapid_private_key:
            logger.info("[PUSH] VAPID_PRIVATE_KEY not set, skipping push")
            return

        webpush(
            subscription_info=subscription,
            data=json.dumps(payload),
            vapid_private_key=vapid_private_key,
            vapid_claims={"sub": vapid_email},
        )
        logger.info("[PUSH] 알림 발송 성공")
    except Exception as e:
        logger.error(f"[PUSH] 알림 발송 실패: {e}")


async def start_reading_job(
    request: JobStartRequest,
    background_tasks: BackgroundTasks,
    current_user: Optional[dict] = Depends(get_current_user),
    _rate_limit: None = Depends(
        rate_limit_dependency(limit=6, window_seconds=60, scope="reading_start")
    ),
) -> JobStartResponse:
    """
    비동기 사주 리딩 시작 (모바일 백그라운드 대응)

    - 작업을 백그라운드에서 처리하고 즉시 job_id 반환
    - 클라이언트는 /reading/status/{job_id}로 결과 폴링
    """
    user_id = current_user.get("user_id") if current_user else None

    client_request_id = request.client_request_id or f"reading-{uuid.uuid4().hex}"
    existing_job = job_manager.find_job_by_request(user_id, client_request_id)
    if existing_job is not None and existing_job.status in {
        JobStatus.PENDING,
        JobStatus.PROCESSING,
        JobStatus.COMPLETED,
    }:
        return JobStartResponse(
            job_id=existing_job.id,
            status=existing_job.status.value,
            message="기존 분석 작업을 이어서 불러옵니다.",
        )

    # 요청 데이터 저장
    request_data = {
        "input": request.input.model_dump(),
        "model": request.model.model_dump(),
        "user_id": user_id,
        "profile_id": request.profile_id,
        "client_request_id": client_request_id,
    }

    # 푸시 구독 정보
    push_sub = (
        request.push_subscription.model_dump() if request.push_subscription else None
    )

    # 작업 생성
    try:
        job_id = job_manager.create_job(request_data, push_sub)
        logger.info(f"[JOB {job_id}] 작업 생성됨")
        background_tasks.add_task(_process_reading_job, job_id, request_data)
    except Exception:
        raise

    return JobStartResponse(
        job_id=job_id,
        status="pending",
        message="분석이 시작되었습니다. 최대 1분 후에 결과를 확인해주세요.",
    )


async def get_reading_status(
    job_id: str, current_user: Optional[dict] = Depends(get_current_user)
) -> JobStatusResponse:
    """
    작업 상태 조회

    - pending: 대기 중
    - processing: 처리 중
    - completed: 완료 (result 포함)
    - failed: 실패 (error 포함)
    """
    job = job_manager.get_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다")

    # 소유권 검증: job에 user_id가 있는 경우, 요청자가 해당 사용자여야 함
    job_user_id = job.request_data.get("user_id") if job.request_data else None
    request_user_id = current_user.get("user_id") if current_user else None

    if job_user_id and job_user_id != request_user_id:
        raise HTTPException(status_code=403, detail="권한이 없습니다")

    # ReadingResponse 객체로 변환 (completed인 경우)
    result_response = None
    if job.status == JobStatus.COMPLETED and job.result:
        try:
            result_response = ReadingResponse(**job.result)
        except Exception:
            logger.exception(f"[JOB {job_id}] 결과 변환 실패 - failed로 전환")
            job_manager.update_status(
                job_id,
                JobStatus.FAILED,
                error="분석 결과 복원에 실패했습니다. 다시 시도해주세요.",
            )
            job = job_manager.get_job(job_id) or job

    return JobStatusResponse(
        job_id=job.id,
        status=job.status.value,
        progress=job.progress,
        completed_tabs=job.completed_tabs,
        total_tabs=job.total_tabs,
        result=result_response,
        error=job.error,
        created_at=job.created_at.isoformat() if job.created_at else None,
        updated_at=job.updated_at.isoformat() if job.updated_at else None,
    )
