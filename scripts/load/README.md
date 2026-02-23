# Load tests (k6)

Requires [k6](https://k6.io/docs/get-started/installation/) installed.

- **health.js** – Hits `GET /health` with 10 VUs for 30s; asserts p95 < 500ms and failure rate < 1%.

Run against local API (default `http://localhost:3000`):

```bash
k6 run scripts/load/health.js
```

Run against staging:

```bash
k6 run -e BASE_URL=https://your-api.example.com scripts/load/health.js
```

See Part 10 (Testing Strategy) and docs/OBSERVABILITY.md for non-functional testing and baselines.
