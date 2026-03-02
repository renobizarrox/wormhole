-- CreateTable
CREATE TABLE "workflow_step_outputs" (
    "id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "step_key" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "output" JSONB,
    "error" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_step_outputs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workflow_step_outputs_workflow_id_step_key_key" ON "workflow_step_outputs"("workflow_id", "step_key");

-- CreateIndex
CREATE INDEX "workflow_step_outputs_workflow_id_idx" ON "workflow_step_outputs"("workflow_id");

-- AddForeignKey
ALTER TABLE "workflow_step_outputs" ADD CONSTRAINT "workflow_step_outputs_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
