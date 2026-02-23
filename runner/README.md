# Wormhole Runner

Python execution plane for the Wormhole SaaS Integration Platform.

## Responsibilities

- Consume workflow run jobs from the queue (Redis/BullMQ).
- Load workflow definition and action metadata from the control plane.
- Execute steps in order: build HTTP requests from Action metadata, apply auth, invoke external APIs.
- Retry/backoff/timeout per step.
- Report step/run status to PostgreSQL (via control plane API).
- Write execution logs to MongoDB.

## Setup

```bash
# From repo root
cd runner
uv sync   # or: pip install -e .
```

## Configuration

Environment variables (see `.env.example`):

- `REDIS_URL`: Queue connection.
- `CONTROL_PLANE_URL`: Base URL for control plane API (status updates, fetch workflow/action definitions).
- `MONGODB_URI`: MongoDB connection for execution logs.
- `LOG_LEVEL`: Optional (default: INFO).

## Run

```bash
uv run python -m runner.main
# or
uv run runner
```

## Project structure

- `src/runner/main.py`: Entrypoint, queue consumer.
- `src/runner/execution/`: Workflow execution loop, step runner.
- `src/runner/actions/`: HTTP client, auth adapters (API_KEY, BASIC, OAUTH2, CUSTOM_HEADER).
- `src/runner/mapping/`: Template and output extraction.
- `src/runner/retry.py`: Retry/backoff logic.
- `src/runner/reporting.py`: Status updates and MongoDB log writes.

## Tests

```bash
uv run pytest
```
