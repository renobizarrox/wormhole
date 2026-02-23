-- Workflows and WorkflowVersions tables

CREATE TYPE "WorkflowStatus" AS ENUM ('Draft', 'Active', 'Archived');

CREATE TABLE "workflows" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'Draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflows_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workflows_tenant_id_key_key" ON "workflows"("tenant_id", "key");
CREATE INDEX "workflows_tenant_id_idx" ON "workflows"("tenant_id");

CREATE TABLE "workflow_versions" (
    "id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "graph" JSONB NOT NULL,
    "parameter_schema" JSONB,
    "env_config" JSONB,
    "is_latest" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "workflow_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workflow_versions_workflow_id_version_key" ON "workflow_versions"("workflow_id", "version");
CREATE INDEX "workflow_versions_workflow_id_idx" ON "workflow_versions"("workflow_id");

ALTER TABLE "workflows"
  ADD CONSTRAINT "workflows_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_versions"
  ADD CONSTRAINT "workflow_versions_workflow_id_fkey"
  FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

