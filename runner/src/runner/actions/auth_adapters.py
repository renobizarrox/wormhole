"""
Auth adapters: build headers (or query params) for API_KEY, BASIC, OAUTH2, CUSTOM_HEADER.

Credentials are passed in as a dict (e.g. from control plane); never logged or persisted.
"""

from typing import Any

# Auth types aligned with Prisma AuthType enum
AUTH_API_KEY = "API_KEY"
AUTH_OAUTH2 = "OAUTH2"
AUTH_BASIC = "BASIC"
AUTH_CUSTOM_HEADER = "CUSTOM_HEADER"


def apply_auth(auth_type: str, credentials: dict[str, Any], headers: dict[str, str]) -> dict[str, str]:
    """
    Apply authentication to request headers (and optionally query params).

    - API_KEY: add header or query param (key name from config).
    - BASIC: Authorization: Basic base64(user:pass).
    - OAUTH2: Authorization: Bearer <access_token>; refresh if expired.
    - CUSTOM_HEADER: add custom headers from credentials.
    """
    out = dict(headers)
    if auth_type == AUTH_API_KEY:
        # e.g. credentials = {"api_key": "xxx", "header_name": "X-API-Key"}
        name = credentials.get("header_name") or "X-API-Key"
        out[name] = credentials.get("api_key", "")
    elif auth_type == AUTH_BASIC:
        import base64
        user = credentials.get("username", "")
        password = credentials.get("password", "")
        out["Authorization"] = "Basic " + base64.b64encode(f"{user}:{password}".encode()).decode()
    elif auth_type == AUTH_OAUTH2:
        out["Authorization"] = "Bearer " + (credentials.get("access_token") or "")
    elif auth_type == AUTH_CUSTOM_HEADER:
        for k, v in credentials.items():
            if k.startswith("header:") or isinstance(v, str):
                key = k.replace("header:", "") if k.startswith("header:") else k
                out[key] = v
    return out
