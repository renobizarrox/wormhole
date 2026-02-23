-- Enums
CREATE TYPE "HttpMethod" AS ENUM ('GET', 'POST', 'PUT', 'PATCH', 'DELETE');
CREATE TYPE "RetryStrategy" AS ENUM ('NONE', 'FIXED', 'EXPONENTIAL');

-- Actions table
CREATE TABLE "actions" (
    "id" TEXT NOT NULL,
    "app_version_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "method" "HttpMethod" NOT NULL,
    "endpoint_template" TEXT NOT NULL,
    "headers_template" JSONB,
    "query_schema" JSONB,
    "path_schema" JSONB,
    "body_schema" JSONB,
    "output_schema" JSONB,
    "retry_strategy" "RetryStrategy" NOT NULL DEFAULT 'FIXED',
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "initial_delay_ms" INTEGER NOT NULL DEFAULT 1000,
    "max_delay_ms" INTEGER,
    "timeout_ms" INTEGER NOT NULL DEFAULT 30000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "actions_pkey" PRIMARY KEY ("id")
);

-- Indexes and constraints
CREATE UNIQUE INDEX "actions_app_version_id_key_key" ON "actions"("app_version_id", "key");
CREATE INDEX "actions_app_version_id_idx" ON "actions"("app_version_id");

ALTER TABLE "actions"
  ADD CONSTRAINT "actions_app_version_id_fkey"
  FOREIGN KEY ("app_version_id") REFERENCES "app_versions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

