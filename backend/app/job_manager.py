"""
비동기 작업 관리자
- 작업 상태 저장 (메모리 기반, 프로덕션에서는 Redis 권장)
- 작업 시작/상태 조회/결과 조회
"""

import uuid
import asyncio
from datetime import datetime, timedelta
from typing import Dict, Any, Optional
from enum import Enum
from dataclasses import dataclass
import threading


class JobStatus(str, Enum):
    PENDING = "pending"  # 대기 중
    PROCESSING = "processing"  # 처리 중
    COMPLETED = "completed"  # 완료
    FAILED = "failed"  # 실패


@dataclass
class Job:
    id: str
    status: JobStatus
    created_at: datetime
    updated_at: datetime
    request_data: Dict[str, Any]
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    push_subscription: Optional[Dict[str, Any]] = None
    progress: int = 0
    completed_tabs: int = 0
    total_tabs: int = 11


class JobManager:
    """인메모리 작업 관리자"""

    # TODO OPS-1: Job state is in-memory only. On restart, all pending jobs are lost.
    # Consider: 1) Persist to Redis/DB 2) Webhook-based job completion 3) Client-side retry

    def __init__(self, ttl_hours: int = 24):
        self._jobs: Dict[str, Job] = {}
        self._lock = threading.Lock()
        self._ttl = timedelta(hours=ttl_hours)

    def create_job(
        self, request_data: Dict[str, Any], push_subscription: Optional[Dict] = None
    ) -> str:
        """새 작업 생성"""
        job_id = str(uuid.uuid4())
        now = datetime.utcnow()

        job = Job(
            id=job_id,
            status=JobStatus.PENDING,
            created_at=now,
            updated_at=now,
            request_data=request_data,
            push_subscription=push_subscription,
        )

        with self._lock:
            self._jobs[job_id] = job
            self._cleanup_old_jobs()

        return job_id

    def get_job(self, job_id: str) -> Optional[Job]:
        """작업 조회"""
        with self._lock:
            return self._jobs.get(job_id)

    def find_job_by_request(
        self, user_id: Optional[str], client_request_id: str
    ) -> Optional[Job]:
        with self._lock:
            for job in self._jobs.values():
                req = job.request_data or {}
                if (
                    req.get("user_id") == user_id
                    and req.get("client_request_id") == client_request_id
                ):
                    return job
        return None

    def update_status(
        self,
        job_id: str,
        status: JobStatus,
        result: Optional[Dict] = None,
        error: Optional[str] = None,
    ):
        """작업 상태 업데이트"""
        with self._lock:
            job = self._jobs.get(job_id)
            if job:
                job.status = status
                job.updated_at = datetime.utcnow()
                if result:
                    job.result = result
                if error:
                    job.error = error

    def update_progress(self, job_id: str, completed_tabs: int, total_tabs: int = 11):
        """진행률 업데이트"""
        with self._lock:
            job = self._jobs.get(job_id)
            if job:
                job.completed_tabs = completed_tabs
                job.total_tabs = total_tabs
                job.progress = int((completed_tabs / total_tabs) * 100)
                job.updated_at = datetime.utcnow()

    def _cleanup_old_jobs(self):
        """오래된 작업 정리"""
        cutoff = datetime.utcnow() - self._ttl
        expired = [jid for jid, job in self._jobs.items() if job.created_at < cutoff]
        for jid in expired:
            del self._jobs[jid]


# 싱글톤 인스턴스
job_manager = JobManager()
