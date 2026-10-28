-- =============================================================================
-- Migration: 0004_phase3_cpq_additions
-- Phase 3 Sprint 3.1: Full CPQ, Product Bundles, Pricing Rules Engine,
-- Guided-Selling Playbooks, and CPQ Approval Threshold Conditions.
-- Adheres strictly to Invariants I-01..I-15, RULE CPQ-001, and ADR-0048.
-- =============================================================================

-- ═══════════════════════════════════════════════════════════════════════
-- 1. PRODUCT_BUNDLES (bundle catalog items with versioning & copy-on-create)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS product_bundles (
  id               UUID PRIMARY KEY,
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id     UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  description      TEXT,
  bundle_type      TEXT NOT NULL CHECK (bundle_type IN ('fixed', 'sum_of_items', 'percent_discount')),
  fixed_price      NUMERIC(15, 4),
  discount_percent NUMERIC(5, 2),
  is_active        BOOLEAN NOT NULL DEFAULT true,
  version          INTEGER NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ
);
ALTER TABLE product_bundles ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON product_bundles
  FOR ALL
  USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
  WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));

CREATE INDEX IF NOT EXISTS idx_product_bundles_org ON product_bundles (organization_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_product_bundles_workspace ON product_bundles (workspace_id) WHERE deleted_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. BUNDLE_ITEMS (line items comprising a product bundle)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS bundle_items (
  id              UUID PRIMARY KEY,
  bundle_id       UUID NOT NULL REFERENCES product_bundles(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_item_id UUID NOT NULL REFERENCES product_catalog_items(id) ON DELETE RESTRICT,
  is_required     BOOLEAN NOT NULL DEFAULT true,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  quantity        NUMERIC(15, 4) NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE bundle_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON bundle_items
  FOR ALL
  USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
  WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));

CREATE INDEX IF NOT EXISTS idx_bundle_items_bundle ON bundle_items (bundle_id);
CREATE INDEX IF NOT EXISTS idx_bundle_items_org ON bundle_items (organization_id);

-- ═══════════════════════════════════════════════════════════════════════
-- 3. PRICING_RULES (automated discounting & volume rules engine)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS pricing_rules (
  id              UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  rule_type       TEXT NOT NULL CHECK (rule_type IN (
                    'volume_discount', 'deal_value_threshold', 'customer_segment',
                    'time_based', 'stacking_policy')),
  conditions      JSONB NOT NULL DEFAULT '{}',
  actions         JSONB NOT NULL DEFAULT '{}',
  priority        INTEGER NOT NULL DEFAULT 0,
  stacking_mode   TEXT NOT NULL DEFAULT 'highest_wins'
                    CHECK (stacking_mode IN ('stack_all', 'highest_wins', 'first_match')),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  valid_from      TIMESTAMPTZ,
  valid_until     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);
ALTER TABLE pricing_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pricing_rules
  FOR ALL
  USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
  WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));

CREATE INDEX IF NOT EXISTS idx_pricing_rules_org ON pricing_rules (organization_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pricing_rules_workspace ON pricing_rules (workspace_id) WHERE deleted_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════════
-- 4. CPQ_PLAYBOOKS (guided selling flows for sales representatives)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS cpq_playbooks (
  id              UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  steps           JSONB NOT NULL DEFAULT '[]',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);
ALTER TABLE cpq_playbooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON cpq_playbooks
  FOR ALL
  USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
  WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));

CREATE INDEX IF NOT EXISTS idx_cpq_playbooks_org ON cpq_playbooks (organization_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cpq_playbooks_workspace ON cpq_playbooks (workspace_id) WHERE deleted_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════════
-- 5. APPROVAL_CHAINS CPQ EXTENSION (threshold conditions)
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE approval_chains ADD COLUMN IF NOT EXISTS cpq_conditions JSONB NOT NULL DEFAULT '{}';

