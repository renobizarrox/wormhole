"""
Runner entrypoint: consume workflow run jobs from the queue and execute them.

Each job payload is expected to contain:
- workflow_run_id
- workflow_version_id
- tenant_id
- input (runtime parameters)
"""

import asyncio
import structlog

from runner.config import settings

logger = structlog.get_logger(__name__)


async def process_job(payload: dict) -> None:
    """Process a single workflow run job."""
    workflow_run_id = payload.get("workflow_run_id")
    logger.info("Processing workflow run", workflow_run_id=workflow_run_id)
    # TODO: Load workflow definition from control plane
    # TODO: Run execution engine (step loop, action invocation, retry, reporting)
    # TODO: Update run/step status; write logs to MongoDB
    await asyncio.sleep(0)


async def run_worker() -> None:
    """Main worker loop: poll queue and process jobs."""
    logger.info("Runner starting", redis_url=settings.redis_url)
    # TODO: Connect to Redis/BullMQ and consume workflow_run queue
    while True:
        await asyncio.sleep(1)


def main() -> None:
    structlog.configure(
        processors=[
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.dev.ConsoleRenderer(),
        ]
    )
    asyncio.run(run_worker())


if __name__ == "__main__":
    main()
