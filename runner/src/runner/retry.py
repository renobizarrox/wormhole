"""
Retry/backoff logic for action invocation.

Strategies: NONE, FIXED, EXPONENTIAL.
Uses max_attempts, initial_delay_ms, max_delay_ms from Action.
"""

import asyncio
import random
from typing import Callable, TypeVar

T = TypeVar("T")


async def with_retry(
    fn: Callable[..., T],
    max_attempts: int = 3,
    initial_delay_ms: int = 1000,
    max_delay_ms: int | None = None,
    strategy: str = "FIXED",
) -> T:
    """
    Execute fn(); on exception, wait and retry up to max_attempts.

    strategy: NONE (no retry), FIXED (constant delay), EXPONENTIAL (exponential backoff).
    """
    last_error = None
    for attempt in range(1, max_attempts + 1):
        try:
            if asyncio.iscoroutinefunction(fn):
                return await fn()
            return fn()
        except Exception as e:
            last_error = e
            if attempt == max_attempts:
                raise
            delay_ms = initial_delay_ms
            if strategy == "EXPONENTIAL":
                delay_ms = min(initial_delay_ms * (2 ** (attempt - 1)), max_delay_ms or delay_ms)
            if max_delay_ms:
                delay_ms = min(delay_ms, max_delay_ms)
            await asyncio.sleep(delay_ms / 1000.0)
    raise last_error  # type: ignore
