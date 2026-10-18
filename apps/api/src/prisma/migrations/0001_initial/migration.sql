-- =============================================================================
-- Migration: 0001_initial
-- Complete Phase-0 Schema with RLS, Immutable Triggers, and Indexes
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Organizations
CREATE TABLE organizations (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  cell_id TEXT NOT NULL DEFAULT 'gcp-us1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- 2. Workspaces
CREATE TABLE workspaces (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (organization_id, slug)
);
CREATE INDEX idx_workspaces_org ON workspaces (organization_id);

-- 3. Teams
CREATE TABLE teams (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_teams_org ON teams (organization_id);

-- 4. Users
CREATE TABLE users (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workos_user_id TEXT UNIQUE,
  email TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','manager','member','collaborator')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','pending','deactivated')),
  seat_type TEXT NOT NULL DEFAULT 'full' CHECK (seat_type IN ('full','collab')),
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (organization_id, email)
);
CREATE INDEX idx_users_org_status ON users (organization_id, status);

-- 5. Workspace Memberships
CREATE TABLE workspace_memberships (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','manager','member','collaborator')),
  has_content_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, workspace_id)
);
CREATE INDEX idx_wm_workspace ON workspace_memberships (workspace_id);
CREATE INDEX idx_wm_user ON workspace_memberships (user_id);

-- 6. Team Memberships
CREATE TABLE team_memberships (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  is_manager BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, team_id)
);
CREATE INDEX idx_tm_team ON team_memberships (team_id);

-- 7. Folders
CREATE TABLE folders (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES folders(id),
  name TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('document','template')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- 8. Templates
CREATE TABLE templates (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT,
  industry_tags TEXT[],
  content JSONB NOT NULL,
  default_settings JSONB NOT NULL DEFAULT '{}',
  variable_fields JSONB NOT NULL DEFAULT '[]',
  signer_roles JSONB NOT NULL DEFAULT '[]',
  is_system BOOLEAN NOT NULL DEFAULT false,
  folder_id UUID REFERENCES folders(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_templates_workspace ON templates (workspace_id) WHERE deleted_at IS NULL;

-- 9. Documents
CREATE TABLE documents (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_template_id UUID REFERENCES templates(id),
  is_template_linked BOOLEAN NOT NULL DEFAULT false,
  type TEXT NOT NULL DEFAULT 'proposal' CHECK (type IN ('proposal','quote','contract','brochure','sow','sign_off','job_offer','form')),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','viewed','signed','declined','expired','archived','voided')),
  custom_domain TEXT,
  slug TEXT NOT NULL,
  password_hash TEXT,
  expires_at TIMESTAMPTZ,
  max_views INTEGER,
  domain_restriction TEXT[],
  currency TEXT NOT NULL DEFAULT 'USD',
  total_value NUMERIC(15,2),
  metadata JSONB NOT NULL DEFAULT '{}',
  current_version_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (organization_id, slug)
);
CREATE INDEX idx_documents_workspace ON documents (workspace_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_owner ON documents (owner_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_status ON documents (organization_id, status) WHERE deleted_at IS NULL;

-- 10. Document Versions
CREATE TABLE document_versions (
  id UUID PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  content_snapshot JSONB NOT NULL,
  content_hash TEXT NOT NULL,
  is_signed BOOLEAN NOT NULL DEFAULT false,
  is_current BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, version_number)
);
CREATE INDEX idx_docver_document ON document_versions (document_id, is_current);

-- 11. Content Blocks
CREATE TABLE content_blocks (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  content JSONB NOT NULL,
  tags TEXT[],
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_cb_workspace ON content_blocks (workspace_id);

-- 12. Comments
CREATE TABLE comments (
  id UUID PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES comments(id),
  block_id TEXT,
  body TEXT NOT NULL,
  is_suggestion BOOLEAN NOT NULL DEFAULT false,
  resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_comments_document ON comments (document_id) WHERE deleted_at IS NULL;

-- 13. Signature Requests
CREATE TABLE signature_requests (
  id UUID PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  document_version_id UUID NOT NULL REFERENCES document_versions(id) ON DELETE CASCADE,
  external_provider_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','declined','voided','expired')),
  signing_order TEXT NOT NULL DEFAULT 'parallel' CHECK (signing_order IN ('parallel','sequential')),
  sent_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sigreq_document ON signature_requests (document_id);

-- 14. Signers
CREATE TABLE signers (
  id UUID PRIMARY KEY,
  signature_request_id UUID NOT NULL REFERENCES signature_requests(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  email TEXT NOT NULL,
  name TEXT,
  role_label TEXT,
  signing_order INTEGER NOT NULL DEFAULT 0,
  verification_method TEXT NOT NULL DEFAULT 'none' CHECK (verification_method IN ('none','email','passcode','sms','kba','id_document','qes')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','viewed','signed','declined','reassigned')),
  signature_data JSONB,
  signed_at TIMESTAMPTZ,
  ip_address TEXT,
  user_agent TEXT,
  external_signer_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_signers_request ON signers (signature_request_id);
CREATE INDEX idx_signers_email ON signers (email);

-- 15. Signature Events (Append-Only)
CREATE TABLE signature_events (
  id UUID PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  signer_id UUID REFERENCES signers(id),
  event_type TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sigevents_document ON signature_events (document_id, created_at);

-- 16. Payment Provider Connections
CREATE TABLE payment_provider_connections (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider_type TEXT NOT NULL CHECK (provider_type IN ('stripe','paypal','square','razorpay','mollie','payment_link','custom')),
  display_name TEXT NOT NULL,
  encrypted_credentials BYTEA,
  dek_ciphertext BYTEA,
  kms_key_id TEXT,
  payment_link_url_template TEXT,
  supported_currencies TEXT[] NOT NULL DEFAULT '{USD}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_ppc_org ON payment_provider_connections (organization_id) WHERE deleted_at IS NULL;

-- 17. Payments
CREATE TABLE payments (
  id UUID PRIMARY KEY,
  document_id UUID REFERENCES documents(id),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider_connection_id UUID NOT NULL REFERENCES payment_provider_connections(id) ON DELETE CASCADE,
  payer_email TEXT NOT NULL,
  payer_name TEXT,
  amount NUMERIC(15,2) NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed','refunded','disputed')),
  payment_type TEXT NOT NULL DEFAULT 'full' CHECK (payment_type IN ('full','deposit','installment','recurring')),
  recurring_config JSONB,
  external_transaction_id TEXT,
  external_checkout_url TEXT,
  paid_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_document ON payments (document_id);
CREATE INDEX idx_payments_org ON payments (organization_id, status);

-- 18. Payment Credential Audit Logs (Append-Only)
CREATE TABLE payment_credential_audit_logs (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider_connection_id UUID NOT NULL REFERENCES payment_provider_connections(id) ON DELETE CASCADE,
  actor_id UUID,
  action TEXT NOT NULL CHECK (action IN ('created','read','updated','deleted','used_for_payment','rotated')),
  ip_address TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pcal_org ON payment_credential_audit_logs (organization_id, created_at);

-- 19. Subscriptions
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  paddle_subscription_id TEXT UNIQUE,
  paddle_customer_id TEXT,
  plan_tier TEXT NOT NULL DEFAULT 'free' CHECK (plan_tier IN ('free','starter','professional','business','enterprise')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','past_due','paused','cancelled','trialing')),
  full_seat_limit INTEGER NOT NULL DEFAULT 1,
  full_seat_count INTEGER NOT NULL DEFAULT 1,
  collab_seat_limit INTEGER NOT NULL DEFAULT 0,
  collab_seat_count INTEGER NOT NULL DEFAULT 0,
  document_limit INTEGER,
  documents_used_this_period INTEGER NOT NULL DEFAULT 0,
  billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly','annual')),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  add_ons JSONB NOT NULL DEFAULT '[]',
  paddle_plan_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 20. Billing Events (Append-Only)
CREATE TABLE billing_events (
  id UUID PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  paddle_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_billing_events_org ON billing_events (organization_id, created_at);

-- 21. API Keys
CREATE TABLE api_keys (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);
CREATE INDEX idx_api_keys_org ON api_keys (organization_id) WHERE revoked_at IS NULL;

-- 22. Webhooks
CREATE TABLE webhooks (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  events TEXT[] NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  failure_count INTEGER NOT NULL DEFAULT 0,
  last_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- 23. Audit Log Entries (Append-Only)
CREATE TABLE audit_log_entries (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES users(id),
  actor_type TEXT NOT NULL DEFAULT 'user' CHECK (actor_type IN ('user','api_key','system')),
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID,
  changes JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_org ON audit_log_entries (organization_id, created_at);
CREATE INDEX idx_audit_resource ON audit_log_entries (resource_type, resource_id);

-- 24. Brand Kits
CREATE TABLE brand_kits (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  primary_color TEXT,
  secondary_color TEXT,
  accent_color TEXT,
  logo_url TEXT,
  favicon_url TEXT,
  font_heading TEXT,
  font_body TEXT,
  custom_css TEXT,
  email_from_name TEXT,
  email_from_domain TEXT,
  remove_badge BOOLEAN NOT NULL DEFAULT false,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_brand_kits_org ON brand_kits (organization_id) WHERE deleted_at IS NULL;

-- 25. Outbox Events (Transactional Outbox - Invariant I-06)
CREATE TABLE outbox_events (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);
CREATE INDEX idx_outbox_unprocessed ON outbox_events (processed_at, created_at);
CREATE INDEX idx_outbox_org ON outbox_events (organization_id, created_at);

-- =============================================================================
-- Row Level Security (RLS) Configuration
-- Predicate uses (SELECT current_setting('app.current_tenant', true)::uuid) (X-01)
-- =============================================================================

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE signature_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE signers ENABLE ROW LEVEL SECURITY;
ALTER TABLE signature_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_provider_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_credential_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_kits ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'workspaces', 'teams', 'users', 'workspace_memberships', 'team_memberships',
    'folders', 'templates', 'documents', 'document_versions', 'content_blocks',
    'comments', 'signature_requests', 'signers', 'signature_events',
    'payment_provider_connections', 'payments', 'payment_credential_audit_logs',
    'subscriptions', 'billing_events', 'api_keys', 'webhooks',
    'audit_log_entries', 'brand_kits', 'outbox_events'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('
      CREATE POLICY tenant_isolation ON %I
      FOR ALL
      USING (organization_id = (SELECT current_setting(''app.current_tenant'', true)::uuid))
      WITH CHECK (organization_id = (SELECT current_setting(''app.current_tenant'', true)::uuid));
    ', tbl);
  END LOOP;
END $$;

-- =============================================================================
-- Database Triggers for Immutability & Audit Enforcement
-- =============================================================================

-- Prevent modification of signed document versions (RULE SIG-001)
CREATE OR REPLACE FUNCTION prevent_signed_version_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_signed = true THEN
    RAISE EXCEPTION 'Cannot modify a signed document version (id: %)', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_immutable_signed_version
  BEFORE UPDATE ON document_versions
  FOR EACH ROW
  EXECUTE FUNCTION prevent_signed_version_mutation();

-- Prevent any UPDATE or DELETE on append-only audit tables
CREATE OR REPLACE FUNCTION prevent_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit trail records are immutable and cannot be modified or deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_immutable_signature_events
  BEFORE UPDATE OR DELETE ON signature_events
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_mutation();

CREATE TRIGGER trg_immutable_payment_audit
  BEFORE UPDATE OR DELETE ON payment_credential_audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_mutation();

CREATE TRIGGER trg_immutable_audit_log
  BEFORE UPDATE OR DELETE ON audit_log_entries
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_mutation();

-- Mark document version as signed when first signature event occurs (RULE SIG-002)
CREATE OR REPLACE FUNCTION mark_version_signed()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.event_type = 'signed' THEN
    UPDATE document_versions
    SET is_signed = true
    WHERE id = (
      SELECT document_version_id
      FROM signature_requests
      WHERE document_id = NEW.document_id
      ORDER BY created_at DESC LIMIT 1
    ) AND is_signed = false;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_mark_version_on_sign
  AFTER INSERT ON signature_events
  FOR EACH ROW
  WHEN (NEW.event_type = 'signed')
  EXECUTE FUNCTION mark_version_signed();
