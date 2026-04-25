import logging
import re

import httpx

from ..config import get_settings

logger = logging.getLogger(__name__)


def escape_markdown(text: str) -> str:
    return re.sub(r"([_*`\[])", r"\\\1", str(text))


class TelegramService:
    async def send_message(self, text: str) -> bool:
        settings = get_settings()
        token = settings.telegram_bot_token
        chat_id = settings.telegram_chat_id
        if not token or not chat_id:
            logger.debug("[TELEGRAM] Not configured, skipping")
            return False
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    f"https://api.telegram.org/bot{token}/sendMessage",
                    json={"chat_id": chat_id, "text": text, "parse_mode": "Markdown"},
                )
                if response.status_code == 200:
                    logger.info("[TELEGRAM] Message sent")
                    return True
                logger.error(f"[TELEGRAM] Failed: {response.status_code}")
                return False
        except Exception:
            logger.exception("[TELEGRAM] Failed to send message")
            return False

    async def send_alert(self, title: str, body: str, severity: str = "info") -> bool:
        emoji = {
            "critical": "\U0001f6a8",
            "warning": "\u26a0\ufe0f",
            "info": "\u2139\ufe0f",
        }.get(severity, "\u2139\ufe0f")
        text = f"{emoji} *{title}*\n{body}"
        return await self.send_message(text)


telegram_service = TelegramService()
