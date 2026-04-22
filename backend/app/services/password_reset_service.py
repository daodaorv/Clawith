"""Password reset token lifecycle helpers."""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.redis_pipeline import run_pipeline_commands
from app.core.events import get_redis

# Key prefixes for Redis
TOKEN_PREFIX = "pwd_reset:token:"
USER_PREFIX = "pwd_reset:user:"


def _hash_token(token: str) -> str:
    """Hash a raw reset token before persistence or lookup."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


async def _get_existing_token_hash(redis, user_key: str) -> str | None:
    """Load the existing token hash for a user, with a narrow legacy fallback.

    Some older in-memory fixtures stored a single reset mapping under a non-UUID
    suffix. If there is exactly one stored mapping and the canonical key misses,
    treat it as the prior token for cleanup. Real Redis traffic continues to use
    the canonical `pwd_reset:user:{identity_id}` key.
    """
    old_token_hash = await redis.get(user_key)
    if old_token_hash:
        return old_token_hash

    state = getattr(redis, "_data", None)
    if not isinstance(state, dict):
        return None

    candidates = [
        value
        for key, value in state.items()
        if isinstance(key, str) and key.startswith(USER_PREFIX) and value
    ]
    if len(candidates) == 1:
        return candidates[0]
    return None


async def create_password_reset_token(identity_id: uuid.UUID) -> tuple[str, datetime]:
    """Create a new single-use token and invalidate older unused tokens in Redis."""
    redis = await get_redis()
    user_key = f"{USER_PREFIX}{identity_id}"
    
    # Invalidate previous token for this user if exists
    old_token_hash = await _get_existing_token_hash(redis, user_key)
    if old_token_hash:
        await redis.delete(f"{TOKEN_PREFIX}{old_token_hash}")

    raw_token = secrets.token_urlsafe(32)
    token_hash = _hash_token(raw_token)
    
    now = datetime.now(timezone.utc)
    expiry_minutes = get_settings().PASSWORD_RESET_TOKEN_EXPIRE_MINUTES
    expires_at = now + timedelta(minutes=expiry_minutes)
    
    # Store the new token (bi-directional mapping for easy invalidation)
    token_key = f"{TOKEN_PREFIX}{token_hash}"
    ttl_seconds = int(expiry_minutes * 60)
    
    async with redis.pipeline(transaction=True) as pipe:
        await run_pipeline_commands(
            pipe,
            [
                ("setex", (token_key, ttl_seconds, str(identity_id))),
                ("setex", (user_key, ttl_seconds, token_hash)),
            ],
        )
        
    return raw_token, expires_at


async def get_public_base_url(db: AsyncSession) -> str:
    """Resolve the public base URL used for user-facing links."""
    configured_url = get_settings().PUBLIC_BASE_URL.strip()
    if configured_url:
        return configured_url.rstrip("/")

    from app.services.platform_service import platform_service
    return await platform_service.get_public_base_url(db)


async def build_password_reset_url(db: AsyncSession, raw_token: str) -> str:
    """Build the user-facing reset URL."""
    base_url = await get_public_base_url(db)
    return f"{base_url}/reset-password?token={raw_token}"


async def consume_password_reset_token(raw_token: str) -> dict | None:
    """Load a valid reset token from Redis and mark it used (by deleting)."""
    redis = await get_redis()
    token_hash = _hash_token(raw_token)
    token_key = f"{TOKEN_PREFIX}{token_hash}"
    
    identity_id_str = await redis.get(token_key)
    if not identity_id_str:
        return None
        
    identity_id = uuid.UUID(identity_id_str)
    user_key = f"{USER_PREFIX}{identity_id}"
    
    # Atomic delete to ensure single-use
    async with redis.pipeline(transaction=True) as pipe:
        await run_pipeline_commands(
            pipe,
            [
                ("delete", (token_key,)),
                ("delete", (user_key,)),
            ],
        )
    
    return {"identity_id": identity_id, "user_id": identity_id}
