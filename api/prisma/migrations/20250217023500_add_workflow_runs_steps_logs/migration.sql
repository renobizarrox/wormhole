-- Enums for run/step status
-- Note: ExecutionLog and LogLevel are stored in MongoDB (not PostgreSQL) for fast access

CREATE TYPE "RunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELED');
CREATE TYPE "StepRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCESS', 'FAILED', 'SKIPPED', 'CANCELED');

-- Workflow runs
CREATE TABLE "workflow_runs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "workflow_version_id" TEXT NOT NULL,
    "trigger_id" TEXT,
    "status" "RunStatus" NOT NULL DEFAULT 'QUEUED',
    "idempotency_key" TEXT,
    "input" JSONB,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "canceled_at" TIMESTAMP(3),
    "error_code" TEXT,
    "error_message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "workflow_runs_tenant_id_workflow_id_idx" ON "workflow_runs"("tenant_id", "workflow_id");
CREATE INDEX "workflow_runs_tenant_id_status_idx" ON "workflow_runs"("tenant_id", "status");
CREATE INDEX "workflow_runs_tenant_id_idempotency_key_idx" ON "workflow_runs"("tenant_id", "idempotency_key");

ALTER TABLE "workflow_runs"
  ADD CONSTRAINT "workflow_runs_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_runs"
  ADD CONSTRAINT "workflow_runs_workflow_id_fkey"
  FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_runs"
  ADD CONSTRAINT "workflow_runs_workflow_version_id_fkey"
  FOREIGN KEY ("workflow_version_id") REFERENCES "workflow_versions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_runs"
  ADD CONSTRAINT "workflow_runs_trigger_id_fkey"
  FOREIGN KEY ("trigger_id") REFERENCES "triggers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Step runs
CREATE TABLE "step_runs" (
    "id" TEXT NOT NULL,
    "workflow_run_id" TEXT NOT NULL,
    "step_key" TEXT NOT NULL,
    "action_id" TEXT,
    "status" "StepRunStatus" NOT NULL DEFAULT 'QUEUED',
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "error_code" TEXT,
    "error_message" TEXT,
    "input" JSONB,
    "output" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "step_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "step_runs_workflow_run_id_idx" ON "step_runs"("workflow_run_id");
CREATE INDEX "step_runs_workflow_run_id_step_key_idx" ON "step_runs"("workflow_run_id", "step_key");

ALTER TABLE "step_runs"
  ADD CONSTRAINT "step_runs_workflow_run_id_fkey"
  FOREIGN KEY ("workflow_run_id") REFERENCES "workflow_runs"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "step_runs"
  ADD CONSTRAINT "step_runs_action_id_fkey"
  FOREIGN KEY ("action_id") REFERENCES "actions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Note: ExecutionLog is stored in MongoDB (not PostgreSQL) for fast access and high-volume writes
-- See docs/ARCHITECTURE_STORAGE.md for MongoDB schema

