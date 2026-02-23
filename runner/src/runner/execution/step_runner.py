"""
Single step execution: resolve Action + Connection, build HTTP request, invoke, handle retry/timeout.
"""

import structlog

logger = structlog.get_logger(__name__)


async def run_step(
    step_key: str,
    action_id: str,
    connection_id: str,
    step_input: dict,
    tenant_id: str,
    workflow_run_id: str,
    step_run_id: str,
) -> dict:
    """
    Execute one workflow step.

    - Load Action metadata (method, endpointTemplate, headers, schemas, retry, timeout).
    - Load Connection credentials (from control plane; never stored in runner).
    - Build request (path/query/body from step_input and templates).
    - Apply auth adapter.
    - Invoke HTTP with retry/backoff/timeout.
    - Return output for downstream steps; report status and logs.
    """
    logger.info(
        "Running step",
        step_key=step_key,
        action_id=action_id,
        workflow_run_id=workflow_run_id,
    )
    # TODO: Fetch action + connection from control plane
    # TODO: Build URL, headers, body (mapping layer)
    # TODO: Apply auth
    # TODO: httpx request with retry (retry.py) and timeout
    # TODO: Report StepRun status; write logs to MongoDB
    return {}
