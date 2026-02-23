"""
HTTP client for invoking external APIs (Actions).

Uses httpx for async requests. Timeout and retry are applied by the caller (retry engine).
"""

import httpx

# TODO: Implement request building from Action metadata (method, url, headers, body)
# TODO: Invoke with httpx.AsyncClient; return response and optionally validated body


async def invoke(
    method: str,
    url: str,
    headers: dict | None = None,
    params: dict | None = None,
    json: dict | None = None,
    timeout_ms: int = 30000,
) -> httpx.Response:
    """Send HTTP request and return response."""
    timeout = timeout_ms / 1000.0
    async with httpx.AsyncClient(timeout=timeout) as client:
        return await client.request(
            method=method.upper(),
            url=url,
            headers=headers or {},
            params=params,
            json=json,
        )
