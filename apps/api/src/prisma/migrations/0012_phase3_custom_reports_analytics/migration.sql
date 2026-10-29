-- Migration 0012: Phase 3 Sprint 3.10 - Custom Reports & Analytics
-- Invariant I-01, I-02, I-03, I-10: Tenant isolation with RLS and UUIDv7 primary keys
-- Follows expand-and-contract pattern (RULE INFRA-001)

CREATE TABLE IF NOT EXISTS "custom_reports" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "definition" JSONB NOT NULL,
    "schedule" JSONB,
    "last_run_at" TIMESTAMP(3) WITH TIME ZONE,
    "created_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3) WITH TIME ZONE,

    CONSTRAINT "custom_reports_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "custom_reports_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "custom_reports_workspace_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "custom_reports_creator_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "custom_reports_organization_id_idx" ON "custom_reports"("organization_id");
CREATE INDEX IF NOT EXISTS "custom_reports_workspace_id_idx" ON "custom_reports"("workspace_id");
CREATE INDEX IF NOT EXISTS "custom_reports_created_by_idx" ON "custom_reports"("created_by");

-- Tenant Row-Level Security (RLS) Policy
ALTER TABLE "custom_reports" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "custom_reports_tenant_isolation" ON "custom_reports";
CREATE POLICY "custom_reports_tenant_isolation" ON "custom_reports"
    FOR ALL
    USING (organization_id = (SELECT current_setting('app.current_organization_id', true)::text))
    WITH CHECK (organization_id = (SELECT current_setting('app.current_organization_id', true)::text));

