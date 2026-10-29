-- Phase 3 Sprint 3.8: Multi-Workspace + Parent-Account Oversight

-- 1. Modify workspaces table
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "parent_workspace_id" UUID REFERENCES "workspaces"("id") ON DELETE SET NULL;
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "is_shared_library_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "branding_defaults" JSONB DEFAULT '{}';

CREATE INDEX IF NOT EXISTS "workspaces_parent_workspace_id_idx" ON "workspaces"("parent_workspace_id");

-- 2. Modify templates table: add visibility
ALTER TABLE "templates" ADD COLUMN IF NOT EXISTS "visibility" VARCHAR(20) NOT NULL DEFAULT 'workspace';
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'templates_visibility_check'
  ) THEN
    ALTER TABLE "templates" ADD CONSTRAINT "templates_visibility_check" CHECK ("visibility" IN ('workspace', 'organization'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "templates_organization_id_visibility_idx" ON "templates"("organization_id", "visibility");

-- 3. Modify content_blocks table: add visibility
ALTER TABLE "content_blocks" ADD COLUMN IF NOT EXISTS "visibility" VARCHAR(20) NOT NULL DEFAULT 'workspace';
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'content_blocks_visibility_check'
  ) THEN
    ALTER TABLE "content_blocks" ADD CONSTRAINT "content_blocks_visibility_check" CHECK ("visibility" IN ('workspace', 'organization'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "content_blocks_organization_id_visibility_idx" ON "content_blocks"("organization_id", "visibility");

-- 4. Modify brand_kits table: add workspace_id and visibility
ALTER TABLE "brand_kits" ADD COLUMN IF NOT EXISTS "workspace_id" UUID REFERENCES "workspaces"("id") ON DELETE SET NULL;
ALTER TABLE "brand_kits" ADD COLUMN IF NOT EXISTS "visibility" VARCHAR(20) NOT NULL DEFAULT 'workspace';
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'brand_kits_visibility_check'
  ) THEN
    ALTER TABLE "brand_kits" ADD CONSTRAINT "brand_kits_visibility_check" CHECK ("visibility" IN ('workspace', 'organization'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "brand_kits_workspace_id_idx" ON "brand_kits"("workspace_id");
CREATE INDEX IF NOT EXISTS "brand_kits_organization_id_visibility_idx" ON "brand_kits"("organization_id", "visibility");

-- 5. Update RLS policies for shared asset libraries (Invariant I-10, RULE AUTH-003)
-- Templates RLS policy supporting org-wide shared visibility
DROP POLICY IF EXISTS templates_isolation ON "templates";
CREATE POLICY templates_isolation ON "templates" FOR ALL
USING (
  organization_id = (SELECT current_setting('app.current_tenant', true)::uuid)
  AND (
    visibility = 'organization'
    OR (SELECT current_setting('app.current_workspace', true)) IS NULL
    OR (SELECT current_setting('app.current_workspace', true)) = ''
    OR workspace_id = (SELECT current_setting('app.current_workspace', true)::uuid)
  )
)
WITH CHECK (
  organization_id = (SELECT current_setting('app.current_tenant', true)::uuid)
  AND (
    (SELECT current_setting('app.current_workspace', true)) IS NULL
    OR (SELECT current_setting('app.current_workspace', true)) = ''
    OR workspace_id = (SELECT current_setting('app.current_workspace', true)::uuid)
  )
);

-- Content blocks RLS policy supporting org-wide shared visibility
DROP POLICY IF EXISTS content_blocks_isolation ON "content_blocks";
CREATE POLICY content_blocks_isolation ON "content_blocks" FOR ALL
USING (
  organization_id = (SELECT current_setting('app.current_tenant', true)::uuid)
  AND (
    visibility = 'organization'
    OR (SELECT current_setting('app.current_workspace', true)) IS NULL
    OR (SELECT current_setting('app.current_workspace', true)) = ''
    OR workspace_id = (SELECT current_setting('app.current_workspace', true)::uuid)
  )
)
WITH CHECK (
  organization_id = (SELECT current_setting('app.current_tenant', true)::uuid)
  AND (
    (SELECT current_setting('app.current_workspace', true)) IS NULL
    OR (SELECT current_setting('app.current_workspace', true)) = ''
    OR workspace_id = (SELECT current_setting('app.current_workspace', true)::uuid)
  )
);

-- Brand kits RLS policy supporting org-wide shared visibility
DROP POLICY IF EXISTS brand_kits_isolation ON "brand_kits";
CREATE POLICY brand_kits_isolation ON "brand_kits" FOR ALL
USING (
  organization_id = (SELECT current_setting('app.current_tenant', true)::uuid)
  AND (
    visibility = 'organization'
    OR (SELECT current_setting('app.current_workspace', true)) IS NULL
    OR (SELECT current_setting('app.current_workspace', true)) = ''
    OR workspace_id IS NULL
    OR workspace_id = (SELECT current_setting('app.current_workspace', true)::uuid)
  )
)
WITH CHECK (
  organization_id = (SELECT current_setting('app.current_tenant', true)::uuid)
);

