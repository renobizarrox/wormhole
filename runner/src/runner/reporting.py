"""
Report step/run status to control plane and write execution logs to MongoDB.

- update_step_status(step_run_id, status, output, error_code, error_message)
- update_run_status(workflow_run_id, status, error_code, error_message)
- write_log(tenant_id, workflow_run_id, step_run_id, level, message, context)

Status updates go to PostgreSQL via control plane API (Hasura Action or HTTP).
Logs go to MongoDB (execution_logs collection).
"""

import structlog
from typing import Any

logger = structlog.get_logger(__name__)


async def update_step_status(
    step_run_id: str,
    status: str,
    output: dict | None = None,
    error_code: str | None = None,
    error_message: str | None = None,
) -> None:
    """Call control plane API to update StepRun in PostgreSQL."""
    # TODO: HTTP PATCH or GraphQL mutation to control plane
    logger.debug("Update step status", step_run_id=step_run_id, status=status)


async def update_run_status(
    workflow_run_id: str,
    status: str,
    error_code: str | None = None,
    error_message: str | None = None,
) -> None:
    """Call control plane API to update WorkflowRun in PostgreSQL."""
    # TODO: HTTP PATCH or GraphQL mutation to control plane
    logger.debug("Update run status", workflow_run_id=workflow_run_id, status=status)


async def write_log(
    tenant_id: str,
    workflow_run_id: str,
    level: str,
    message: str,
    step_run_id: str | None = None,
    context: dict[str, Any] | None = None,
) -> None:
    """Write one execution log entry to MongoDB."""
    # TODO: Insert into MongoDB execution_logs collection
    # Ensure no secrets in context; truncate large payloads
    logger.debug(
        "Write log",
        tenant_id=tenant_id,
        workflow_run_id=workflow_run_id,
        level=level,
        message=message,
    )
