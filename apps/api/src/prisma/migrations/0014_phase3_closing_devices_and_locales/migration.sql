-- =============================================================================
-- Migration 0014: Phase 3 Closing - Locales & Mobile Devices Push Registry
-- Sprint 3.12 & Phase 3 Cross-Cutting Requirements (i18n & Mobile Readiness)
-- Tables: devices; Columns: organizations.locale, users.locale
-- Security: PostgreSQL 17 Row-Level Security, UUIDv7 PKs, Tenant Isolation
-- =============================================================================

-- 1. Add locale column to organizations (expand-and-contract safe with default)
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'en-US';

-- 2. Add locale column to users (expand-and-contract safe with default)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'en-US';

-- 3. Table: devices (mobile push token registry for FCM/APNs)
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for high-throughput push dispatch and lookup
CREATE INDEX IF NOT EXISTS idx_devices_org_id ON devices(organization_id);
CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);

-- Enable RLS on devices table
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;

-- Index-friendly RLS Policy (RULE X-01 & Invariant I-03)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'devices' AND policyname = 'devices_isolation'
  ) THEN
    CREATE POLICY devices_isolation ON devices
      FOR ALL USING (organization_id = (SELECT current_setting('app.current_organization_id', true)::uuid));
  END IF;
END $$;

