-- Invitations table and relations

CREATE TABLE "invitations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'Viewer',
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "created_by_user_id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invitations_token_key" ON "invitations"("token");
CREATE INDEX "invitations_tenant_id_email_idx" ON "invitations"("tenant_id", "email");
CREATE INDEX "invitations_token_idx" ON "invitations"("token");

ALTER TABLE "invitations"
  ADD CONSTRAINT "invitations_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "invitations"
  ADD CONSTRAINT "invitations_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

