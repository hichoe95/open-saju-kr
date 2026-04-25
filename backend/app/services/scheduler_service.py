import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


async def _job_daily_report():
    from .alert_service import alert_service

    try:
        success = await alert_service.send_daily_report()
        logger.info(f"[SCHEDULER] Daily report sent: {success}")
    except Exception:
        logger.exception("[SCHEDULER] Daily report failed")


async def _job_reconcile_compatibility_jobs():
    from .compatibility_job_service import reconcile_stale_compatibility_jobs

    try:
        await reconcile_stale_compatibility_jobs()
    except Exception:
        logger.exception("[SCHEDULER] Compatibility reconciliation failed")


def start_scheduler():
    # 23:00 KST = 14:00 UTC
    scheduler.add_job(
        _job_daily_report,
        CronTrigger(hour=14, minute=0, timezone="UTC"),
        id="daily_report",
        replace_existing=True,
    )
    scheduler.add_job(
        _job_reconcile_compatibility_jobs,
        IntervalTrigger(minutes=5, timezone="UTC"),
        id="compatibility_reconcile",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("[SCHEDULER] Started — daily report and compatibility reconciliation")


def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("[SCHEDULER] Stopped")
