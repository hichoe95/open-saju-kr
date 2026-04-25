"""Lunar-to-solar birth date normalization utility.

Provides a single function to convert lunar birth dates to solar,
ensuring consistent saju calculation across all API endpoints.
"""

import logging
from korean_lunar_calendar import KoreanLunarCalendar

logger = logging.getLogger(__name__)


def normalize_birth_to_solar(
    birth_date: str,
    calendar_type: str,
    is_leap_month: bool = False,
) -> str:
    """Convert lunar birth_date to solar if calendar_type is 'lunar'.

    Args:
        birth_date: Date string in YYYY-MM-DD format.
        calendar_type: 'solar' or 'lunar'.
        is_leap_month: Whether the lunar date is in a leap month.

    Returns:
        Solar date string in YYYY-MM-DD format.
    """
    if calendar_type != "lunar":
        return birth_date

    try:
        cal = KoreanLunarCalendar()
        y, m, d = map(int, birth_date.split("-"))
        if cal.setLunarDate(y, m, d, is_leap_month):
            solar = cal.getSolarIsoFormat()
            logger.debug(
                "[birth_normalizer] Lunar %d-%d-%d -> Solar %s", y, m, d, solar
            )
            return solar
        logger.warning(
            "[birth_normalizer] setLunarDate returned False for %s", birth_date
        )
    except Exception as e:
        logger.warning("[birth_normalizer] Lunar conversion failed: %s", e)

    return birth_date
