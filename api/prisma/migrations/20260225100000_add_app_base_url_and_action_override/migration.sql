-- AlterTable
ALTER TABLE "apps" ADD COLUMN IF NOT EXISTS "base_url" TEXT;

-- AlterTable
ALTER TABLE "actions" ADD COLUMN IF NOT EXISTS "override_base_url" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "actions" ADD COLUMN IF NOT EXISTS "base_url_override" TEXT;
