-- =============================================================================
-- Migration: 0007_phase3_portfolio_intelligence
-- Phase 3 Sprint 3.5: AI Data Extraction + Portfolio Agreement Intelligence
-- Tables: counterparties, custom_extraction_fields, obligation_records
-- Alterations: documents (counterparty_id), document_versions (content_embedding)
-- Adheres strictly to Invariants I-01..I-15, RULE PORT-001, and ADR-0052.
-- =============================================================================

-- Ensure pgvector extension exists
CREATE EXTENSION IF NOT EXISTS vector;

-- ═══════════════════════════════════════════════════════════════════════
-- 1. COUNTERPARTIES (Canonical entity directory & alias normalization)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS counterparties (
  id              UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  canonical_name  TEXT NOT NULL,
  aliases         TEXT[] NOT NULL DEFAULT '{}',
  domain          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE counterparties ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON counterparties
  FOR ALL
  USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
  WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));

CREATE INDEX IF NOT EXISTS idx_counterparties_org_canonical ON counterparties (organization_id, canonical_name);
CREATE INDEX IF NOT EXISTS idx_counterparties_org ON counterparties (organization_id);

-- ═══════════════════════════════════════════════════════════════════════
-- 2. CUSTOM_EXTRACTION_FIELDS (Admin-configured natural language fields)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS custom_extraction_fields (
  id              UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  field_name      TEXT NOT NULL,
  description     TEXT NOT NULL,
  field_type      TEXT NOT NULL CHECK (field_type IN ('text', 'numeric', 'date', 'boolean', 'list')),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,
  CONSTRAINT uq_custom_extraction_fields_org_name UNIQUE (organization_id, field_name)
);
ALTER TABLE custom_extraction_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON custom_extraction_fields
  FOR ALL
  USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
  WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));

CREATE INDEX IF NOT EXISTS idx_custom_extraction_fields_org_active ON custom_extraction_fields (organization_id, is_active) WHERE deleted_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. OBLIGATION_RECORDS (Structured terms & commitments with RULE PORT-001)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS obligation_records (
  id                  UUID PRIMARY KEY,
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  document_id         UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  document_version_id UUID NOT NULL REFERENCES document_versions(id) ON DELETE CASCADE,
  field_name          TEXT NOT NULL,
  field_value         TEXT,
  field_value_numeric NUMERIC(20,4),
  field_value_date    TIMESTAMPTZ,
  field_type          TEXT NOT NULL CHECK (field_type IN ('text', 'numeric', 'date', 'boolean', 'list')),
  confidence_score    NUMERIC(4,3),
  extraction_method   TEXT NOT NULL,
  is_custom_field     BOOLEAN NOT NULL DEFAULT false,
  is_verified         BOOLEAN NOT NULL DEFAULT false,
  pending_update      JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE obligation_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON obligation_records
  FOR ALL
  USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
  WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));

CREATE INDEX IF NOT EXISTS idx_obligation_records_org_doc ON obligation_records (organization_id, document_id);
CREATE INDEX IF NOT EXISTS idx_obligation_records_org_field ON obligation_records (organization_id, field_name);
CREATE INDEX IF NOT EXISTS idx_obligation_records_org_date ON obligation_records (organization_id, field_value_date);

-- ═══════════════════════════════════════════════════════════════════════
-- 4. ALTER DOCUMENTS & DOCUMENT_VERSIONS
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE documents ADD COLUMN IF NOT EXISTS counterparty_id UUID REFERENCES counterparties(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_documents_counterparty ON documents (counterparty_id);

ALTER TABLE document_versions ADD COLUMN IF NOT EXISTS content_embedding vector(768);

