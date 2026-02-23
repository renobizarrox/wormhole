# Coding conventions

## General

- **API**: GraphQL for the control plane. Use PascalCase for types/fields, camelCase for query/mutation arguments and variables. Errors via GraphQL error extensions.
- **Database**: PostgreSQL for all persistent data.
- **Frontend**: Nuxt 3 + Vuetify.js; consume backend via GraphQL.
- **Tenant isolation**: Every resource is scoped by `tenantId`. Resolvers must resolve tenant from context (JWT/header) and filter all queries.
- **Ids**: Use UUID v4 for all primary keys and external references.
- **Timestamps**: `createdAt`, `updatedAt` in UTC; store and return ISO 8601.

## Node (api/, web/)

- TypeScript strict mode.
- Prefer `const` and explicit return types for public APIs.
- Use async/await; avoid raw `.then()`.
- Naming: PascalCase types/classes, camelCase functions/variables, UPPER_SNAKE for constants.
- API errors: consistent JSON shape `{ code, message, details? }` and appropriate HTTP status codes.

## Python (runner/)

- Python 3.11+.
- Type hints for all public functions and module boundaries.
- Prefer Pydantic for config and payloads.
- Naming: snake_case; PascalCase for classes.
- No bare `except`; log and re-raise or handle explicitly.

## Git

- Branch naming: `feature/`, `fix/`, `chore/`.
- Commits: present tense, concise (e.g. "Add tenant scoping to apps list").
- Do not commit `.env` or secrets.
