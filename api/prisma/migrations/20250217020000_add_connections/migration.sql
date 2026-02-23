-- Connections table to store per-tenant/app credentials (encrypted)

CREATE TABLE "connections" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "app_version_id" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "auth_type" "AuthType" NOT NULL,
    "config" JSONB,
    "secret_cipher" BYTEA NOT NULL,
    "secret_version" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "rotated_at" TIMESTAMP(3),

    CONSTRAINT "connections_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "connections_tenant_id_app_id_idx" ON "connections"("tenant_id", "app_id");
CREATE INDEX "connections_tenant_id_app_id_is_active_idx" ON "connections"("tenant_id", "app_id", "is_active");

ALTER TABLE "connections"
  ADD CONSTRAINT "connections_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "connections"
  ADD CONSTRAINT "connections_app_id_fkey"
  FOREIGN KEY ("app_id") REFERENCES "apps"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "connections"
  ADD CONSTRAINT "connections_app_version_id_fkey"
  FOREIGN KEY ("app_version_id") REFERENCES "app_versions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

