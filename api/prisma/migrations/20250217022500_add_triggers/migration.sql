-- Triggers table for manual/webhook/cron triggers

CREATE TYPE "TriggerType" AS ENUM ('MANUAL', 'WEBHOOK', 'CRON');

CREATE TABLE "triggers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "TriggerType" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "manual_allowed" BOOLEAN NOT NULL DEFAULT false,
    "webhook_path" TEXT,
    "webhook_secret_cipher" BYTEA,
    "webhook_signature_header" TEXT,
    "cron_expression" TEXT,
    "cron_timezone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "triggers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "triggers_tenant_id_key_key" ON "triggers"("tenant_id", "key");
CREATE INDEX "triggers_tenant_id_workflow_id_idx" ON "triggers"("tenant_id", "workflow_id");
CREATE INDEX "triggers_tenant_id_type_is_active_idx" ON "triggers"("tenant_id", "type", "is_active");

ALTER TABLE "triggers"
  ADD CONSTRAINT "triggers_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "triggers"
  ADD CONSTRAINT "triggers_workflow_id_fkey"
  FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

