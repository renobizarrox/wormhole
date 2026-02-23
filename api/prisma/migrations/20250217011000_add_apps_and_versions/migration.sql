-- Enums
CREATE TYPE "AppStatus" AS ENUM ('Draft', 'Published', 'Deprecated');
CREATE TYPE "AuthType" AS ENUM ('API_KEY', 'OAUTH2', 'BASIC', 'CUSTOM_HEADER');

-- Apps table
CREATE TABLE "apps" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vendor" TEXT,
    "category" TEXT,
    "description" TEXT,
    "icon_url" TEXT,
    "status" "AppStatus" NOT NULL DEFAULT 'Draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "apps_pkey" PRIMARY KEY ("id")
);

-- App versions table
CREATE TABLE "app_versions" (
    "id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "auth_type" "AuthType" NOT NULL,
    "settings_schema" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "app_versions_pkey" PRIMARY KEY ("id")
);

-- Indexes and constraints
CREATE UNIQUE INDEX "apps_tenant_id_key_key" ON "apps"("tenant_id", "key");
CREATE INDEX "apps_tenant_id_idx" ON "apps"("tenant_id");

CREATE UNIQUE INDEX "app_versions_app_id_version_key" ON "app_versions"("app_id", "version");
CREATE INDEX "app_versions_app_id_idx" ON "app_versions"("app_id");

ALTER TABLE "apps"
  ADD CONSTRAINT "apps_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app_versions"
  ADD CONSTRAINT "app_versions_app_id_fkey"
  FOREIGN KEY ("app_id") REFERENCES "apps"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

