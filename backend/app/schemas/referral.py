from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class ReferralCreateResponse(BaseModel):
    referral_code: str
    share_url: str
    created_at: datetime


class ReferralRedemption(BaseModel):
    referred_user_id: str
    status: str
    reward_amount: int
    created_at: datetime
    completed_at: Optional[datetime] = None


class ReferralStatusResponse(BaseModel):
    referral_code: Optional[str] = None
    total_referred: int = 0
    total_completed: int = 0
    total_coins_earned: int = 0
    recent_redemptions: List[ReferralRedemption] = Field(default_factory=list)


class ReferralRedeemRequest(BaseModel):
    referral_code: str
    user_id: str
