"""Redis-based distributed seat locking for seat-service."""

import logging
import os

import redis.asyncio as redis
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
LOCK_TTL_SECONDS = 300  # 5 minutes


class SeatLocker:
    """Manages distributed seat locks using Redis SET NX."""

    def __init__(self):
        self._redis = redis.from_url(REDIS_URL)

    async def lock(self, seat_id: str) -> bool:
        """Attempt to acquire a lock on the seat. Returns True if acquired."""
        key = f"seat_lock:{seat_id}"
        acquired = await self._redis.set(key, "locked", nx=True, ex=LOCK_TTL_SECONDS)
        if acquired:
            logger.info("Lock acquired for seat %s", seat_id)
        else:
            logger.warning("Lock already held for seat %s", seat_id)
        return bool(acquired)

    async def unlock(self, seat_id: str) -> None:
        """Release the lock on the seat."""
        key = f"seat_lock:{seat_id}"
        await self._redis.delete(key)
        logger.info("Lock released for seat %s", seat_id)

    async def is_locked(self, seat_id: str) -> bool:
        """Check if a seat is currently locked."""
        key = f"seat_lock:{seat_id}"
        return await self._redis.exists(key) == 1

    async def close(self) -> None:
        """Close the Redis connection."""
        await self._redis.aclose()
