# Contributing

## Before you start

1. Read [CONVENTIONS.md](./CONVENTIONS.md).
2. Ensure you have the repo structure and tooling from the main [README](../README.md).

## Development workflow

1. Create a branch from `main`: `feature/your-feature` or `fix/your-fix`.
2. Implement changes; keep commits focused.
3. Run lint and tests:
   - **api**: `cd api && pnpm lint && pnpm test`
   - **web**: `cd web && pnpm lint`
   - **runner**: `cd runner && uv run ruff check . && uv run pytest`
4. Open a PR; link any checklist or issue.
5. After review, squash-merge to `main`.

## Checklist updates

When you complete work that matches an item in [SAAS_INTEGRATION_PLATFORM_CHECKLIST.md](../SAAS_INTEGRATION_PLATFORM_CHECKLIST.md), update the checklist: change `- [ ]` to `- [x]` for that item and add a short note in the PR if helpful.
