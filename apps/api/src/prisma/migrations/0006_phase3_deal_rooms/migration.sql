-- =============================================================================
-- Migration: 0006_phase3_deal_rooms
-- Phase 3 Sprint 3.3: Deal Rooms Full Implementation (5.11 Maestro-equivalent)
-- Tables: deal_rooms, deal_room_members, deal_room_documents, deal_room_messages, deal_room_magic_links.
-- Adheres strictly to Invariants I-01..I-15, D-13, and ADR-0050.
-- =============================================================================

-- ═══════════════════════════════════════════════════════════════════════
-- 1. DEAL_ROOMS (Collaborative workspaces for buyer and seller)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS deal_rooms (
  id                 UUID PRIMARY KEY,
  organization_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id       UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title              TEXT NOT NULL,
  slug               TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'archived')),
  brand_kit_id       UUID REFERENCES brand_kits(id) ON DELETE SET NULL,
  mutual_action_plan JSONB NOT NULL DEFAULT '[]',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at         TIMESTAMPTZ
);
ALTER TABLE deal_rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON deal_rooms
  FOR ALL
  USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
  WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));

CREATE UNIQUE INDEX IF NOT EXISTS idx_deal_rooms_org_slug_active ON deal_rooms (organization_id, slug) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_deal_rooms_org ON deal_rooms (organization_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_deal_rooms_workspace ON deal_rooms (workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_deal_rooms_org_status ON deal_rooms (organization_id, status) WHERE deleted_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. DEAL_ROOM_MEMBERS (Internal reps and external buyer committee)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS deal_room_members (
  id              UUID PRIMARY KEY,
  deal_room_id    UUID NOT NULL REFERENCES deal_rooms(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  external_email  TEXT,
  external_name   TEXT,
  role            TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'member', 'viewer')),
  invited_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  joined_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE deal_room_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON deal_room_members
  FOR ALL
  USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
  WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));

CREATE INDEX IF NOT EXISTS idx_deal_room_members_room ON deal_room_members (deal_room_id);
CREATE INDEX IF NOT EXISTS idx_deal_room_members_org ON deal_room_members (organization_id);
CREATE INDEX IF NOT EXISTS idx_deal_room_members_email ON deal_room_members (deal_room_id, external_email);

-- ═══════════════════════════════════════════════════════════════════════
-- 3. DEAL_ROOM_DOCUMENTS (Shared proposals, contracts, attachments)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS deal_room_documents (
  id              UUID PRIMARY KEY,
  deal_room_id    UUID NOT NULL REFERENCES deal_rooms(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  added_by        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_deal_room_documents UNIQUE (deal_room_id, document_id)
);
ALTER TABLE deal_room_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON deal_room_documents
  FOR ALL
  USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
  WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));

CREATE INDEX IF NOT EXISTS idx_deal_room_docs_room ON deal_room_documents (deal_room_id);
CREATE INDEX IF NOT EXISTS idx_deal_room_docs_org ON deal_room_documents (organization_id);

-- ═══════════════════════════════════════════════════════════════════════
-- 4. DEAL_ROOM_MESSAGES (Threaded chat partitioned by internal/external)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS deal_room_messages (
  id              UUID PRIMARY KEY,
  deal_room_id    UUID NOT NULL REFERENCES deal_rooms(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  author_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  author_email    TEXT,
  author_name     TEXT,
  body            TEXT NOT NULL,
  visibility      TEXT NOT NULL DEFAULT 'external' CHECK (visibility IN ('internal', 'external')),
  parent_id       UUID REFERENCES deal_room_messages(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);
ALTER TABLE deal_room_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON deal_room_messages
  FOR ALL
  USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
  WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));

CREATE INDEX IF NOT EXISTS idx_deal_room_messages_room_time ON deal_room_messages (deal_room_id, created_at);
CREATE INDEX IF NOT EXISTS idx_deal_room_messages_room_vis ON deal_room_messages (deal_room_id, visibility);
CREATE INDEX IF NOT EXISTS idx_deal_room_messages_org ON deal_room_messages (organization_id);

-- ═══════════════════════════════════════════════════════════════════════
-- 5. DEAL_ROOM_MAGIC_LINKS (Frictionless CSPRNG access tokens for buyers)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS deal_room_magic_links (
  id              UUID PRIMARY KEY,
  deal_room_id    UUID NOT NULL REFERENCES deal_rooms(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  member_id       UUID NOT NULL REFERENCES deal_room_members(id) ON DELETE CASCADE,
  token_hash      TEXT NOT NULL UNIQUE,
  expires_at      TIMESTAMPTZ NOT NULL,
  used_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE deal_room_magic_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON deal_room_magic_links
  FOR ALL
  USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
  WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));

CREATE INDEX IF NOT EXISTS idx_deal_room_magic_links_hash ON deal_room_magic_links (token_hash);
CREATE INDEX IF NOT EXISTS idx_deal_room_magic_links_room ON deal_room_magic_links (deal_room_id);
CREATE INDEX IF NOT EXISTS idx_deal_room_magic_links_org ON deal_room_magic_links (organization_id);

