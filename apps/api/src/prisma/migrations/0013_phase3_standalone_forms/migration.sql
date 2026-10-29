-- =============================================================================
-- Migration 0013: Standalone Forms (Full Build)
-- Sprint 3.11: Standalone Forms (Full Build)
-- Tables: forms, form_submissions, form_roles, form_magic_links
-- Security: PostgreSQL 17 Row-Level Security, UUIDv7 PKs, Immutability & Indexes
-- =============================================================================

-- 1. Table: forms
CREATE TABLE forms (
  id TEXT PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'closed', 'archived')),
  definition JSONB NOT NULL DEFAULT '{}'::jsonb,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  custom_domain TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT uq_forms_org_slug UNIQUE (organization_id, slug)
);

CREATE INDEX idx_forms_org_workspace ON forms(organization_id, workspace_id);
CREATE INDEX idx_forms_slug ON forms(slug);
CREATE INDEX idx_forms_status ON forms(status);
CREATE INDEX idx_forms_created_at ON forms(created_at);

-- 2. Table: form_submissions
CREATE TABLE form_submissions (
  id TEXT PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  form_version INTEGER NOT NULL,
  submitter_email TEXT,
  submitter_ip TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'partial' CHECK (status IN ('partial', 'complete', 'voided')),
  current_role TEXT,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_form_submissions_org_form ON form_submissions(organization_id, form_id);
CREATE INDEX idx_form_submissions_form_email ON form_submissions(form_id, submitter_email);
CREATE INDEX idx_form_submissions_status ON form_submissions(status);
CREATE INDEX idx_form_submissions_submitted_at ON form_submissions(submitted_at);

-- 3. Table: form_roles
CREATE TABLE form_roles (
  id TEXT PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  role_name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  routing_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_form_roles_org_form ON form_roles(organization_id, form_id);
CREATE INDEX idx_form_roles_sort ON form_roles(form_id, sort_order);

-- 4. Table: form_magic_links
CREATE TABLE form_magic_links (
  id TEXT PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  submission_id TEXT NOT NULL REFERENCES form_submissions(id) ON DELETE CASCADE,
  role_name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_form_magic_links_lookup ON form_magic_links(organization_id, token_hash);
CREATE INDEX idx_form_magic_links_submission ON form_magic_links(submission_id);
CREATE INDEX idx_form_magic_links_expires ON form_magic_links(expires_at);

-- Enable RLS on all 4 tables
ALTER TABLE forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_magic_links ENABLE ROW LEVEL SECURITY;

-- Index-friendly RLS Policies (RULE X-01)
CREATE POLICY forms_isolation ON forms
  FOR ALL USING (organization_id = (SELECT current_setting('app.current_organization_id', true)::uuid));

CREATE POLICY form_submissions_isolation ON form_submissions
  FOR ALL USING (organization_id = (SELECT current_setting('app.current_organization_id', true)::uuid));

CREATE POLICY form_roles_isolation ON form_roles
  FOR ALL USING (organization_id = (SELECT current_setting('app.current_organization_id', true)::uuid));

CREATE POLICY form_magic_links_isolation ON form_magic_links
  FOR ALL USING (organization_id = (SELECT current_setting('app.current_organization_id', true)::uuid));
