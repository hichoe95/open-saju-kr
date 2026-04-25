from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, UniqueConstraint, Text, Integer
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
from .base import Base

class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_login_at = Column(DateTime(timezone=True), onupdate=func.now())
    status = Column(String, default="active") # active, blocked

    identities = relationship("UserIdentity", back_populates="user", cascade="all, delete-orphan")
    consents = relationship("UserConsent", back_populates="user", cascade="all, delete-orphan")
    profiles = relationship("SajuProfile", back_populates="user", cascade="all, delete-orphan")
    readings = relationship("UserReading", back_populates="user", cascade="all, delete-orphan")

class UserIdentity(Base):
    __tablename__ = "user_identities"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    provider = Column(String, nullable=False)
    provider_user_id = Column(String, nullable=False)
    email = Column(String, nullable=True)
    name = Column(String, nullable=True)
    profile_image = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="identities")

    __table_args__ = (
        UniqueConstraint('provider', 'provider_user_id', name='uq_provider_uid'),
    )

class UserConsent(Base):
    __tablename__ = "user_consents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    consent_type = Column(String, nullable=False) # e.g. "SAJU_PROFILE_STORE"
    version = Column(String, nullable=False) # "2026-01-07_v1"
    is_granted = Column(Boolean, default=False, nullable=False)
    granted_at = Column(DateTime(timezone=True), server_default=func.now())
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    
    user = relationship("User", back_populates="consents")

class SajuProfile(Base):
    __tablename__ = "saju_profiles"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    label = Column(String, nullable=False) # e.g. "내 사주"
    
    # Key Management (which key version was used)
    key_id = Column(String, nullable=False) # e.g. "v1"
    
    # Encrypted Fields (ciphertext, iv, tag) - Base64 Encoded Strings
    
    # Birth Date (YYYY-MM-DD)
    birth_date_ct = Column(String, nullable=False)
    birth_date_iv = Column(String, nullable=False)
    birth_date_tag = Column(String, nullable=False)
    
    # Hour Branch / Time
    hour_branch_ct = Column(String, nullable=False)
    hour_branch_iv = Column(String, nullable=False)
    hour_branch_tag = Column(String, nullable=False)
    
    # Calendar Type (solar/lunar)
    calendar_type_ct = Column(String, nullable=False)
    calendar_type_iv = Column(String, nullable=False)
    calendar_type_tag = Column(String, nullable=False)

    # Gender
    gender_ct = Column(String, nullable=False)
    gender_iv = Column(String, nullable=False)
    gender_tag = Column(String, nullable=False)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    cache_id = Column(UUID(as_uuid=True), ForeignKey("saju_cache.id", ondelete="SET NULL"), nullable=True)
    
    user = relationship("User", back_populates="profiles")


class SajuCache(Base):
    __tablename__ = "saju_cache"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    birth_key = Column(String(100), unique=True, nullable=False)
    
    pillars_json = Column(JSONB, nullable=True)
    card_json = Column(JSONB, nullable=True)
    tabs_json = Column(JSONB, nullable=True)
    advanced_json = Column(JSONB, nullable=True)
    one_liner = Column(Text, nullable=True)
    
    extras_json = Column(JSONB, nullable=True)
    
    model_version = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=True)
    
    readings = relationship("UserReading", back_populates="cache")


class UserReading(Base):
    __tablename__ = "user_readings"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    cache_id = Column(UUID(as_uuid=True), ForeignKey("saju_cache.id", ondelete="SET NULL"), nullable=True)
    profile_id = Column(UUID(as_uuid=True), ForeignKey("saju_profiles.id", ondelete="SET NULL"), nullable=True)
    
    label = Column(String(100), default="내 사주")
    persona = Column(String(20), nullable=True)
    context_json = Column(JSONB, nullable=True)
    processing_time_ms = Column(Integer, nullable=True)  # 분석 소요 시간 (밀리초)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    user = relationship("User", back_populates="readings")
    cache = relationship("SajuCache", back_populates="readings")
