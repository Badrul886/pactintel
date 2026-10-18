-- =============================================================================
-- Migration: 0002_phase1_additions
-- Phase 1 Additions: Custom Domains, Integrations, CRM Events, Notifications,
-- Product Catalog, Pricing Tables, Line Items, Buyer Pricing Selections,
-- and Template Usage Tracking.
-- Strictly adhering to RLS (MT-001) and Invariants I-01 .. I-15.
-- =============================================================================

-- 1. Product Catalog Items (SKUs & Services for CPQ)
CREATE TABLE IF NOT EXISTS product_catalog_items (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sku TEXT,
  name TEXT NOT NULL,
  description TEXT,
  unit_price NUMERIC(15,4) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  billing_frequency TEXT DEFAULT 'one_time'
    CHECK (billing_frequency IN ('one_time','monthly','quarterly','semi_annual','annual')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_pci_org ON product_catalog_items (organization_id) WHERE deleted_at IS NULL;
ALTER TABLE product_catalog_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON product_catalog_items
  FOR ALL
  USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
  WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));

-- 2. Pricing Tables (Interactive pricing table block in documents)
CREATE TABLE IF NOT EXISTS pricing_tables (
  id UUID PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  display_format TEXT NOT NULL DEFAULT 'line_items'
    CHECK (display_format IN ('line_items','tier_cards','combined')),
  discount_rules JSONB NOT NULL DEFAULT '[]',
  tax_config JSONB NOT NULL DEFAULT '{}',
  settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pricing_tables_doc ON pricing_tables (document_id);
ALTER TABLE pricing_tables ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pricing_tables
  FOR ALL
  USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
  WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));

-- 3. Line Items (Line items within a pricing table)
CREATE TABLE IF NOT EXISTS line_items (
  id UUID PRIMARY KEY,
  pricing_table_id UUID NOT NULL REFERENCES pricing_tables(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_item_id UUID REFERENCES product_catalog_items(id),
  name TEXT NOT NULL,
  description TEXT,
  quantity NUMERIC(15,4) NOT NULL DEFAULT 1,
  unit_price NUMERIC(15,4) NOT NULL,
  discount_percent NUMERIC(5,2) DEFAULT 0,
  discount_amount NUMERIC(15,2) DEFAULT 0,
  subtotal NUMERIC(15,2) NOT NULL,
  billing_frequency TEXT DEFAULT 'one_time',
  is_optional BOOLEAN NOT NULL DEFAULT false,
  is_selected BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_line_items_table ON line_items (pricing_table_id);
ALTER TABLE line_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON line_items
  FOR ALL
  USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
  WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));

-- 4. Buyer Pricing Selections (RULE CPQ-001: never mutate line_items)
CREATE TABLE IF NOT EXISTS buyer_pricing_selections (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  pricing_table_id UUID NOT NULL REFERENCES pricing_tables(id) ON DELETE CASCADE,
  viewer_session_id TEXT NOT NULL,
  selections JSONB NOT NULL DEFAULT '[]',
  calculated_total NUMERIC(15,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bps_document ON buyer_pricing_selections (document_id, viewer_session_id);
ALTER TABLE buyer_pricing_selections ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON buyer_pricing_selections
  FOR ALL
  USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
  WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));

-- 5. Custom Domains
CREATE TABLE IF NOT EXISTS custom_domains (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  cloudflare_hostname_id TEXT,
  ssl_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (ssl_status IN ('pending','active','error','expiring_soon')),
  verified_at TIMESTAMPTZ,
  last_health_check TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (organization_id, domain)
);
ALTER TABLE custom_domains ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON custom_domains
  FOR ALL
  USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
  WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));

-- 6. Integration Connections
CREATE TABLE IF NOT EXISTS integration_connections (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('hubspot','salesforce','pipedrive')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked','error')),
  encrypted_oauth_token BYTEA,
  dek_ciphertext BYTEA,
  kms_key_id TEXT,
  token_expires_at TIMESTAMPTZ,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  external_portal_id TEXT,
  sync_cursor JSONB NOT NULL DEFAULT '{}',
  settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
ALTER TABLE integration_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON integration_connections
  FOR ALL
  USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
  WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));

-- 7. CRM Sync Events (Append-only, immutable audit trail)
CREATE TABLE IF NOT EXISTS crm_sync_events (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES integration_connections(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('contact','deal','company')),
  entity_id_local UUID,
  entity_id_external TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('push','pull')),
  status TEXT NOT NULL CHECK (status IN ('success','error','skipped')),
  changes JSONB NOT NULL DEFAULT '{}',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_sync_connection ON crm_sync_events (connection_id, created_at);
ALTER TABLE crm_sync_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON crm_sync_events
  FOR ALL
  USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
  WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));

-- Immutability trigger for append-only crm_sync_events
CREATE TRIGGER trg_immutable_crm_sync_events
  BEFORE UPDATE OR DELETE ON crm_sync_events
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_mutation();

-- 8. Notification Preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email','in_app','push')),
  event_type TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, channel, event_type)
);
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON notification_preferences
  FOR ALL
  USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
  WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));

-- 9. In-App Notifications
CREATE TABLE IF NOT EXISTS in_app_notifications (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  resource_type TEXT,
  resource_id UUID,
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_in_app_notif_user ON in_app_notifications (user_id, is_read, created_at DESC);
ALTER TABLE in_app_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON in_app_notifications
  FOR ALL
  USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
  WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));

-- 10. Update Templates table with usage_count
ALTER TABLE templates ADD COLUMN IF NOT EXISTS usage_count INTEGER NOT NULL DEFAULT 0;
