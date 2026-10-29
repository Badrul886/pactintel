-- Migration: 0011_phase3_saml_scim_soc2
-- Purpose: Adds SAML SSO connection ID and organization-level SSO policy enforcement (Sprint 3.9)

-- Step 1 (Expand): Add sso_policy and workos_saml_connection_id to organizations table
ALTER TABLE "organizations" 
ADD COLUMN IF NOT EXISTS "sso_policy" TEXT NOT NULL DEFAULT 'optional',
ADD COLUMN IF NOT EXISTS "workos_saml_connection_id" TEXT;

-- Step 2: Add check constraint for valid SSO policy values
ALTER TABLE "organizations" 
DROP CONSTRAINT IF EXISTS "check_sso_policy",
ADD CONSTRAINT "check_sso_policy" CHECK ("sso_policy" IN ('optional', 'required', 'required_admin_bypass'));

-- Step 3: Index for fast lookup by WorkOS SAML connection ID
CREATE INDEX IF NOT EXISTS "idx_organizations_workos_saml_connection" 
ON "organizations"("workos_saml_connection_id") 
WHERE "workos_saml_connection_id" IS NOT NULL;

