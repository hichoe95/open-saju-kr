from datetime import datetime, timedelta, timezone
from typing import Optional
import threading
import logging
from jose import jwt, JWTError
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
import hmac
import hashlib
import secrets
from ..config import get_settings
import os
import base64
import binascii
import uuid

logger = logging.getLogger(__name__)

settings = get_settings()

CURRENT_KEY_VERSION = settings.current_key_version or "v1"

# Refresh token expiry (days)
REFRESH_TOKEN_EXPIRE_DAYS = 7

# Cache for derived HMAC keys (purpose -> key)
_hmac_keys: dict[str, bytes] = {}

# Token blacklist (in-memory + Redis optional)
# TODO OPS-2: Token blacklist has in-memory fallback when Redis is unavailable.
# On restart without Redis, all blacklisted tokens become valid again.
# Mitigation: Ensure Redis is always available in production.
_token_blacklist: dict[str, datetime] = {}
_blacklist_lock = threading.Lock()

# Redis client for blacklist (lazy initialization)
_blacklist_redis_client: Optional[object] = None
_blacklist_redis_initialized: bool = False


def _get_master_key() -> bytes:
    """Get master key from environment, validate it's 32 bytes base64."""
    key_str = (
        settings.encryption_key_v1
        or settings.encryption_key
        or settings.data_enc_key_v1
    )
    if not key_str:
        raise ValueError(
            "ENCRYPTION_KEY_V1 (or ENCRYPTION_KEY / DATA_ENC_KEY_V1) is not set"
        )

    try:
        raw_key = base64.b64decode(key_str)
        if len(raw_key) != 32:
            raise ValueError(f"v1 encryption key must be 32 bytes, got {len(raw_key)}")
        return raw_key
    except (ValueError, binascii.Error) as e:
        raise ValueError(f"v1 encryption key must be valid base64: {e}")


def _decode_aes_key(key_str: str, key_name: str) -> bytes:
    try:
        raw_key = base64.b64decode(key_str)
    except (ValueError, binascii.Error) as e:
        raise ValueError(f"{key_name} must be valid base64: {e}")

    if len(raw_key) not in [16, 24, 32]:
        raise ValueError(f"{key_name} must be 16/24/32 bytes, got {len(raw_key)}")
    return raw_key


def _derive_hmac_key(purpose: str) -> bytes:
    """Derive purpose-specific HMAC key using HKDF."""
    if purpose in _hmac_keys:
        return _hmac_keys[purpose]

    raw_key = _get_master_key()

    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=b"saju:hkdf:root:v1",
        info=f"saju:pii:hmac:{purpose}:v1".encode("utf-8"),
    )
    derived_key = hkdf.derive(raw_key)
    _hmac_keys[purpose] = derived_key
    return derived_key


def _get_hmac_key() -> bytes:
    """Legacy: Get HMAC key for birth_key (backward compatibility)."""
    return _derive_hmac_key("saju_cache:birth_key")


def _get_blacklist_redis():
    """Redis client for token blacklist (lazy init)"""
    global _blacklist_redis_client, _blacklist_redis_initialized
    if _blacklist_redis_initialized:
        return _blacklist_redis_client

    _blacklist_redis_initialized = True
    if not settings.redis_url:
        return None

    try:
        import redis

        _blacklist_redis_client = redis.from_url(
            settings.redis_url, decode_responses=True
        )
        _blacklist_redis_client.ping()
        return _blacklist_redis_client
    except Exception:
        return None


def add_to_blacklist(jti: str, exp: datetime) -> None:
    """Add token to blacklist until expiry."""
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)

    redis_client = _get_blacklist_redis()
    if redis_client:
        try:
            key = f"jwt_blacklist:{jti}"
            ttl = int((exp - datetime.now(timezone.utc)).total_seconds())
            if ttl > 0:
                redis_client.setex(key, ttl, "revoked")
            return
        except Exception:
            pass

    with _blacklist_lock:
        _token_blacklist[jti] = exp
        now = datetime.now(timezone.utc)
        expired = [k for k, v in _token_blacklist.items() if v < now]
        for k in expired:
            del _token_blacklist[k]


def is_token_blacklisted(jti: str) -> bool:
    """Check if token is blacklisted."""
    redis_client = _get_blacklist_redis()
    if redis_client:
        try:
            return bool(redis_client.exists(f"jwt_blacklist:{jti}"))
        except Exception:
            pass

    with _blacklist_lock:
        if jti in _token_blacklist:
            if _token_blacklist[jti] > datetime.now(timezone.utc):
                return True
            del _token_blacklist[jti]
    return False


def hmac_birth_key(canonical_string: str) -> str:
    """HMAC hash for saju_cache birth_key lookup."""
    key = _get_hmac_key()
    signature = hmac.new(key, canonical_string.encode("utf-8"), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(signature).decode("utf-8").rstrip("=")


def hmac_provider_id(provider: str, provider_user_id: str) -> str:
    """
    HMAC hash for OAuth provider_user_id lookup.
    Uses provider-specific salt to prevent cross-provider collisions.
    """
    key = _derive_hmac_key(f"user_identities:provider_user_id:{provider}")
    # Canonicalize: strip whitespace, ensure string
    canonical = str(provider_user_id).strip()
    signature = hmac.new(key, canonical.encode("utf-8"), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(signature).decode("utf-8").rstrip("=")


class EncryptionManager:
    _LEGACY_NO_AAD_KEY_IDS = {"legacy", "v0"}

    """AES-GCM Encryption Manager with AAD support for PII protection."""

    def __init__(self, key_str: Optional[str] = None):
        self.aesgcm = None
        self.key_version = CURRENT_KEY_VERSION
        self._key_registry: dict[str, bytes] = {}

        if key_str:
            try:
                self._key_registry["v1"] = _decode_aes_key(
                    key_str, "explicit encryption key"
                )
            except ValueError as e:
                logger.warning(f"WARNING: {e}. AES-GCM disabled.")
        else:
            v1_key_str = (
                settings.encryption_key_v1
                or settings.encryption_key
                or settings.data_enc_key_v1
            )
            if v1_key_str:
                try:
                    self._key_registry["v1"] = _decode_aes_key(
                        v1_key_str, "v1 encryption key"
                    )
                except ValueError as e:
                    logger.warning(f"WARNING: {e}. AES-GCM disabled.")

            if settings.encryption_key_v2:
                try:
                    self._key_registry["v2"] = _decode_aes_key(
                        settings.encryption_key_v2, "v2 encryption key"
                    )
                except ValueError as e:
                    logger.warning(f"WARNING: {e}. v2 key disabled.")

        try:
            self.aesgcm = AESGCM(self._get_key(self.key_version))
        except ValueError as e:
            logger.warning(f"WARNING: {e}. AES-GCM disabled.")

    def _get_key(self, key_id: str) -> bytes:
        normalized_key_id = key_id or "v1"
        if normalized_key_id not in self._key_registry:
            raise ValueError(f"Encryption key '{normalized_key_id}' is not configured")
        return self._key_registry[normalized_key_id]

    def _get_aesgcm_for_key(self, key_id: str) -> AESGCM:
        key = self._get_key(key_id)
        return AESGCM(key)

    def encrypt(self, plaintext: str, aad: Optional[str] = None) -> dict:
        """Encrypt with optional AAD (Associated Authenticated Data)."""
        if not self.aesgcm:
            raise ValueError("Encryption key not correctly configured")

        nonce = os.urandom(12)
        data = plaintext.encode("utf-8")
        aad_bytes = aad.encode("utf-8") if aad else None

        full_ct = self.aesgcm.encrypt(nonce, data, aad_bytes)

        tag = full_ct[-16:]
        ciphertext = full_ct[:-16]

        return {
            "ciphertext": base64.b64encode(ciphertext).decode("utf-8"),
            "iv": base64.b64encode(nonce).decode("utf-8"),
            "tag": base64.b64encode(tag).decode("utf-8"),
            "key_id": self.key_version,
        }

    def decrypt(
        self,
        iv: str,
        ciphertext: str,
        tag: str,
        aad: Optional[str] = None,
        key_id: str = "v1",
    ) -> str:
        """Decrypt with optional AAD verification."""
        if not self._key_registry:
            raise ValueError("Encryption key not correctly configured")

        aesgcm = self._get_aesgcm_for_key(key_id or "v1")
        nonce_bytes = base64.b64decode(iv)
        ct_bytes = base64.b64decode(ciphertext)
        tag_bytes = base64.b64decode(tag)
        aad_bytes = aad.encode("utf-8") if aad else None

        full_ct = ct_bytes + tag_bytes

        plaintext = aesgcm.decrypt(nonce_bytes, full_ct, aad_bytes)
        return plaintext.decode("utf-8")

    def encrypt_field(self, table: str, column: str, value: str) -> dict:
        """Encrypt a specific field with table/column as AAD for integrity."""
        aad = f"{table}:{column}:{self.key_version}"
        return self.encrypt(value, aad)

    def decrypt_field(
        self,
        table: str,
        column: str,
        iv: str,
        ciphertext: str,
        tag: str,
        key_id: str = "v1",
    ) -> str:
        """Decrypt a field with AAD verification."""
        normalized_key_id = key_id or "v1"
        aad = f"{table}:{column}:{normalized_key_id}"
        return self.decrypt(iv, ciphertext, tag, aad, normalized_key_id)

    def decrypt_field_with_fallbacks(
        self,
        table: str,
        column: str,
        iv: str,
        ciphertext: str,
        tag: str,
        key_id: str = "v1",
    ) -> str:
        normalized_key_id = key_id or "v1"
        attempted_key_ids: list[str] = []
        candidate_key_ids = [normalized_key_id, *self._key_registry.keys()]
        last_error: Optional[Exception] = None
        allow_legacy_fallback = normalized_key_id in self._LEGACY_NO_AAD_KEY_IDS

        for candidate_key_id in candidate_key_ids:
            if candidate_key_id in attempted_key_ids:
                continue
            attempted_key_ids.append(candidate_key_id)

            try:
                return self.decrypt_field(
                    table, column, iv, ciphertext, tag, candidate_key_id
                )
            except Exception as exc:
                last_error = exc

            if allow_legacy_fallback:
                try:
                    return self.decrypt(iv, ciphertext, tag, key_id=candidate_key_id)
                except Exception as exc:
                    last_error = exc

        if last_error is not None:
            raise last_error
        raise ValueError("Encrypted field could not be decrypted")


# Singleton instance
crypto_manager = EncryptionManager()


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create JWT Access Token"""
    if not settings.jwt_secret_key:
        raise ValueError("JWT_SECRET_KEY is not set")

    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=settings.access_token_expire_minutes
        )

    to_encode.update(
        {
            "exp": expire,
            "jti": uuid.uuid4().hex,
            "iat": datetime.now(timezone.utc),
        }
    )
    encoded_jwt = jwt.encode(
        to_encode, settings.jwt_secret_key, algorithm=settings.jwt_algorithm
    )
    return encoded_jwt


def create_refresh_token() -> tuple[str, str]:
    """
    Create refresh token.
    Returns: (raw_token, hashed_token)
    - raw_token: returned to client
    - hashed_token: stored in DB
    """
    raw_token = secrets.token_urlsafe(32)
    hashed_token = hashlib.sha256(raw_token.encode()).hexdigest()
    return raw_token, hashed_token


def verify_refresh_token(raw_token: str, stored_hash: str) -> bool:
    """Verify refresh token."""
    return hashlib.sha256(raw_token.encode()).hexdigest() == stored_hash


def decode_access_token(token: str) -> Optional[dict]:
    """Verify and Decode JWT"""
    if not settings.jwt_secret_key:
        return None

    try:
        payload = jwt.decode(
            token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
        )

        if payload.get("purpose"):
            return None

        jti = payload.get("jti")
        if jti and is_token_blacklisted(jti):
            return None
        return payload
    except JWTError:
        return None


def create_oauth_state(provider: str) -> str:
    if not settings.jwt_secret_key:
        raise ValueError("JWT_SECRET_KEY is not set")

    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.oauth_state_expire_minutes)
    payload = {
        "sub": "oauth_state",
        "provider": provider,
        "nonce": uuid.uuid4().hex,
        "iat": int(now.timestamp()),
        "exp": expire,
        "purpose": "oauth_state",
    }
    return jwt.encode(
        payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm
    )


def verify_oauth_state(state: str, provider: str) -> Optional[dict]:
    if not state:
        return None

    if not settings.jwt_secret_key:
        return None

    try:
        payload = jwt.decode(
            state, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
        )
    except JWTError:
        return None

    if payload.get("purpose") != "oauth_state":
        return None
    if payload.get("provider") != provider:
        return None

    nonce = payload.get("nonce")
    if nonce and is_token_blacklisted(f"oauth_state:{nonce}"):
        logger.warning(f"[AUTH] OAuth state replay detected: nonce={nonce}")
        return None

    if nonce:
        exp = payload.get("exp")
        if isinstance(exp, (int, float)):
            exp_dt = datetime.fromtimestamp(exp, tz=timezone.utc)
            add_to_blacklist(f"oauth_state:{nonce}", exp_dt)

    return payload
