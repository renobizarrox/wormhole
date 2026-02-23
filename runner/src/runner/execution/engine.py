"""
Workflow execution engine: load workflow definition and run steps in order.

MVP: linear step sequence from WorkflowVersion.graph.
Phase 2: support branching and conditions.
"""

import structlog

logger = structlog.get_logger(__name__)


async def execute_workflow(
    workflow_run_id: str,
    workflow_version_id: str,
    tenant_id: str,
    input_data: dict,
) -> None:
    """
    Execute a workflow run.

    - Fetch workflow version (graph, parameterSchema, envConfig) from control plane.
    - Validate input_data against parameterSchema.
    - Resolve env and secret refs from envConfig.
    - Traverse graph and run each step (see step_runner).
    - Update WorkflowRun and StepRun status; write logs to MongoDB.
    """
    logger.info(
        "Starting workflow execution",
        workflow_run_id=workflow_run_id,
        workflow_version_id=workflow_version_id,
        tenant_id=tenant_id,
    )
    # TODO: Fetch workflow definition via GraphQL or control plane API
    # TODO: Validate input_data
    # TODO: For each step in graph: run step, update status, write logs
    # TODO: On completion or failure: update WorkflowRun status
    raise NotImplementedError("Execution engine not yet implemented")
