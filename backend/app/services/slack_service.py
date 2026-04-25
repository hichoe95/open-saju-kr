import logging
import json
from typing import Optional, Dict, List

import httpx

from ..config import get_settings

logger = logging.getLogger(__name__)


class SlackService:
    def __init__(self):
        self._webhook_url: Optional[str] = None

    @property
    def webhook_url(self) -> Optional[str]:
        if self._webhook_url is None:
            settings = get_settings()
            self._webhook_url = getattr(settings, "slack_webhook_url", "") or ""
        return self._webhook_url if self._webhook_url else None

    def set_webhook_url(self, url: str) -> None:
        self._webhook_url = url

    async def _get_configured_url(self) -> Optional[str]:
        configured_in_db = False
        try:
            from ..db.supabase_client import supabase, db_execute

            result = await db_execute(
                lambda: (
                    supabase.table("app_config")
                    .select("value")
                    .eq("key", "slack_webhook_url")
                    .single()
                    .execute()
                )
            )
            result_data = result.data
            if isinstance(result_data, dict) and "value" in result_data:
                configured_in_db = True
                raw_value = result_data.get("value")
                if raw_value is None:
                    return None
                if isinstance(raw_value, str):
                    stripped = raw_value.strip()
                    if not stripped:
                        return None
                    try:
                        parsed = json.loads(stripped)
                    except (json.JSONDecodeError, TypeError):
                        parsed = stripped
                    if isinstance(parsed, str):
                        return parsed.strip() or None
                return None
        except Exception as e:
            logger.warning("[SLACK] Failed to fetch webhook URL from DB: %s", e)
        if configured_in_db:
            return None
        return self.webhook_url

    async def send_message(
        self,
        title: str,
        text: str,
        color: str = "#36a64f",
        fields: Optional[List[Dict[str, str]]] = None,
    ) -> bool:
        url = await self._get_configured_url()
        if not url:
            logger.warning("Slack webhook URL not configured, skipping alert")
            return False

        attachment = {
            "color": color,
            "title": title,
            "text": text,
            "ts": __import__("time").time(),
        }
        if fields:
            attachment["fields"] = [
                {
                    "title": f["title"],
                    "value": f["value"],
                    "short": f.get("short", True),
                }
                for f in fields
            ]

        payload = {"attachments": [attachment]}

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(url, json=payload)
                if response.status_code == 200:
                    logger.info(f"Slack alert sent: {title}")
                    return True
                logger.error(
                    f"Slack webhook failed: {response.status_code} {response.text}"
                )
                return False
        except Exception as e:
            logger.exception(f"Failed to send Slack message: {e}")
            return False

    async def send_alert(
        self,
        alert_type: str,
        message: str,
        severity: str = "warning",
    ) -> bool:
        color_map = {
            "info": "#36a64f",
            "warning": "#ff9800",
            "critical": "#f44336",
        }
        severity_prefix = {
            "info": "INFO",
            "warning": "WARNING",
            "critical": "CRITICAL",
        }
        return await self.send_message(
            title=f"[{severity_prefix.get(severity, 'ALERT')}] [{alert_type}] 알림",
            text=message,
            color=color_map.get(severity, "#ff9800"),
        )


slack_service = SlackService()
