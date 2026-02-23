# Architecture – Storage Strategy

This document describes the storage architecture: **PostgreSQL** for transactional data (exposed via Hasura GraphQL) and **MongoDB** for execution logs.

---

## 1. PostgreSQL (Primary Database)

**Purpose:** All transactional metadata and business entities.

**Exposed via:** Hasura GraphQL (auto-generated schema from Prisma models).

**Contains:**
- Tenants, Users, Memberships, Invitations
- Apps, AppVersions, Actions
- Connections (credentials)
- Workflows, WorkflowVersions, Triggers
- WorkflowRuns, StepRuns

**Managed by:** Prisma ORM + Hasura GraphQL Engine.

---

## 2. MongoDB (Execution Logs)

**Purpose:** High-volume execution logs for fast writes and queries.

**Why MongoDB:**
- High write throughput (logs generated continuously during workflow execution).
- Flexible schema (log context can vary by step/action type).
- Fast queries by tenant/run/step with indexes.
- Time-series-like queries (logs over time ranges).
- Better suited for unstructured/semi-structured log data.

**Schema (MongoDB collections):**

### Collection: `execution_logs`

```javascript
{
  _id: ObjectId,
  tenantId: String (indexed),
  workflowRunId: String (indexed),
  stepRunId: String? (indexed),
  level: String, // "DEBUG" | "INFO" | "WARN" | "ERROR"
  message: String,
  context: Object?, // flexible JSON object
  timestamp: Date (indexed, TTL index for retention)
}
```

**Indexes:**
- `{ tenantId: 1, workflowRunId: 1 }`
- `{ tenantId: 1, workflowRunId: 1, stepRunId: 1 }`
- `{ tenantId: 1, level: 1 }`
- `{ timestamp: 1 }` (with TTL for automatic cleanup after retention period)

**Access:**
- Written by Python runner during execution.
- Read via:
  - Direct MongoDB queries from Node.js service layer.
  - Hasura Remote Schema (if exposing MongoDB via GraphQL).
  - Or dedicated REST/GraphQL endpoints that query MongoDB.

---

## 3. Integration Points

### Hasura GraphQL
- Auto-generates GraphQL schema from PostgreSQL tables.
- Custom Actions (Node.js) handle:
  - Auth, RBAC, tenant scoping.
  - Complex business logic.
  - MongoDB log queries (via Remote Schema or Action).

### Python Runner
- Reads workflow/action metadata from PostgreSQL (via Hasura GraphQL or direct Prisma).
- Writes execution logs directly to MongoDB.
- Updates WorkflowRun/StepRun status in PostgreSQL (via Hasura GraphQL or direct Prisma).

---

## 4. Deployment (Coolify)

- **PostgreSQL container:** Managed by Coolify or external service.
- **MongoDB container:** Managed by Coolify (for logs).
- **Hasura container:** Connects to PostgreSQL, exposes GraphQL API.
- **Node.js service:** Custom Hasura Actions + business logic.
- **Python runner:** Executes workflows, writes logs to MongoDB.

---

## 5. Data Flow

1. **User creates workflow** → PostgreSQL (via Hasura GraphQL).
2. **Trigger fires** → Creates WorkflowRun in PostgreSQL.
3. **Python runner starts** → Reads workflow definition from PostgreSQL.
4. **During execution** → Writes logs to MongoDB (high volume).
5. **Step completes** → Updates StepRun in PostgreSQL.
6. **Run completes** → Updates WorkflowRun in PostgreSQL.
7. **User queries logs** → Reads from MongoDB (fast queries by tenant/run/step).

---

This separation ensures:
- PostgreSQL handles transactional integrity and relationships.
- MongoDB handles high-volume log writes efficiently.
- Hasura provides unified GraphQL API over PostgreSQL.
- Custom services bridge PostgreSQL and MongoDB as needed.
