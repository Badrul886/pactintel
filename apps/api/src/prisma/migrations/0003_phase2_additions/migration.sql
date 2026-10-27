-- =============================================================================
-- Migration: 0003_phase2_additions
-- Phase 2 Additions: Document Comments, Content Locks, Approval Workflows,
-- Automation Rules, Follow-Up Queue, AI Generation Audit Logs, Webhooks & Delivery Logs,
-- Clickwrap Agreements/Versions/Acceptances (with Immutability Triggers),
-- Yjs Collab State, and Document Expiry Tracking.
-- Adheres strictly to Invariants I-01..I-15, MT-001, WF-003, CW-001, and ADP-001.
-- =============================================================================

-- ═══════════════════════════════════════════════════════════════════════
-- 1. DOCUMENT_COMMENTS (threaded, block-level)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS document_comments (
  id                  UUID PRIMARY KEY,
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  document_id         UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  document_version_id UUID REFERENCES document_versions(id) ON DELETE SET NULL,
  author_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id           UUID REFERENCES document_comments(id) ON DELETE CASCADE,
  block_id            TEXT,
  content             TEXT NOT NULL,
  is_resolved         BOOLEAN NOT NULL DEFAULT false,
  resolved_by_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);
ALTER TABLE document_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON document_comments
  FOR ALL
  USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
  WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));

CREATE INDEX IF NOT EXISTS idx_comments_document ON document_comments (document_id, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_comments_block ON document_comments (document_id, block_id)
  WHERE deleted_at IS NULL AND parent_id IS NULL;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. CONTENT_LOCKS (server-enforced; Hocuspocus onUpdate validates this)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS content_locks (
  id              UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  block_id        TEXT NOT NULL,
  locked_by_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  locked_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, block_id)
);
ALTER TABLE content_locks ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON content_locks
  FOR ALL
  USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
  WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));

-- ═══════════════════════════════════════════════════════════════════════
-- 3. APPROVAL_CHAINS (workflow chain definition)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS approval_chains (
  id              UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  conditions      JSONB NOT NULL DEFAULT '{}',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);
ALTER TABLE approval_chains ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON approval_chains
  FOR ALL
  USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
  WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));

-- ═══════════════════════════════════════════════════════════════════════
-- 4. APPROVAL_STEPS (immutable once decided — RULE WF-003)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS approval_steps (
  id                   UUID PRIMARY KEY,
  approval_chain_id    UUID NOT NULL REFERENCES approval_chains(id) ON DELETE CASCADE,
  organization_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  document_id          UUID REFERENCES documents(id) ON DELETE SET NULL,
  step_order           INTEGER NOT NULL,
  approver_id          UUID REFERENCES users(id) ON DELETE SET NULL,
  fallback_approver_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status               TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','approved','rejected','skipped')),
  timeout_hours        INTEGER NOT NULL DEFAULT 168,
  decided_at           TIMESTAMPTZ,
  comment              TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE approval_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON approval_steps
  FOR ALL
  USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
  WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));

CREATE INDEX IF NOT EXISTS idx_approval_steps_pending ON approval_steps (approver_id, status)
  WHERE status = 'pending';

-- Immutability trigger for approval_steps (RULE WF-003)
CREATE OR REPLACE FUNCTION prevent_approval_step_remutation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IN ('approved','rejected') AND NEW.status != OLD.status THEN
    RAISE EXCEPTION 'approval_steps.status is immutable once decided (id: %)', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_immutable_approval_step ON approval_steps;
CREATE TRIGGER trg_immutable_approval_step
  BEFORE UPDATE ON approval_steps
  FOR EACH ROW EXECUTE FUNCTION prevent_approval_step_remutation();

-- ═══════════════════════════════════════════════════════════════════════
-- 5. AUTOMATION_RULES (nudge + workflow triggers)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS automation_rules (
  id               UUID PRIMARY KEY,
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id     UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  trigger_event    TEXT NOT NULL,
  conditions       JSONB NOT NULL DEFAULT '[]',
  actions          JSONB NOT NULL DEFAULT '[]',
  is_active        BOOLEAN NOT NULL DEFAULT true,
  execution_count  INTEGER NOT NULL DEFAULT 0,
  last_executed_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ
);
ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON automation_rules
  FOR ALL
  USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
  WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));

-- ═══════════════════════════════════════════════════════════════════════
-- 6. FOLLOW_UP_QUEUE (nudge-style rep review queue)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS follow_up_queue (
  id               UUID PRIMARY KEY,
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  document_id      UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  owner_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scheduled_for    TIMESTAMPTZ NOT NULL,
  reason           TEXT NOT NULL CHECK (reason IN ('inactivity','expiry_warning','custom')),
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','sent','snoozed','dismissed')),
  sent_at          TIMESTAMPTZ,
  snoozed_until    TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE follow_up_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON follow_up_queue
  FOR ALL
  USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
  WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));

CREATE INDEX IF NOT EXISTS idx_follow_up_pending ON follow_up_queue (owner_id, scheduled_for)
  WHERE status = 'pending';

-- ═══════════════════════════════════════════════════════════════════════
-- 7. AI_GENERATION_LOGS (audit trail for AI content — RULE AI-002)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ai_generation_logs (
  id               UUID PRIMARY KEY,
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  document_id      UUID REFERENCES documents(id) ON DELETE SET NULL,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id          TEXT NOT NULL,
  prompt_hash      TEXT NOT NULL,
  model_used       TEXT,
  tokens_input     INTEGER,
  tokens_output    INTEGER,
  latency_ms       INTEGER,
  status           TEXT NOT NULL CHECK (status IN ('success','error','rejected')),
  error_code       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE ai_generation_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ai_generation_logs
  FOR ALL
  USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
  WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));

CREATE INDEX IF NOT EXISTS idx_ai_logs_org ON ai_generation_logs (organization_id, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════
-- 8. WEBHOOKS & WEBHOOK_DELIVERY_LOGS (WH-001)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS webhooks (
  id                UUID PRIMARY KEY,
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  url               TEXT NOT NULL,
  secret_hash       TEXT,
  secret            TEXT,
  events            TEXT[] NOT NULL,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  failure_count     INTEGER NOT NULL DEFAULT 0,
  last_triggered_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);
ALTER TABLE webhooks ADD COLUMN IF NOT EXISTS secret_hash TEXT;
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON webhooks;
CREATE POLICY tenant_isolation ON webhooks
  FOR ALL
  USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
  WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));

CREATE TABLE IF NOT EXISTS webhook_delivery_logs (
  id               UUID PRIMARY KEY,
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  webhook_id       UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event_id         TEXT NOT NULL,
  event_type       TEXT NOT NULL,
  payload_hash     TEXT NOT NULL,
  attempt_number   INTEGER NOT NULL DEFAULT 1,
  http_status      INTEGER,
  response_body    TEXT,
  delivered_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE webhook_delivery_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON webhook_delivery_logs
  FOR ALL
  USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
  WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));

CREATE UNIQUE INDEX IF NOT EXISTS idx_wdl_idempotency ON webhook_delivery_logs (webhook_id, event_id, attempt_number);

-- ═══════════════════════════════════════════════════════════════════════
-- 9. CLICKWRAP_AGREEMENTS
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS clickwrap_agreements (
  id              UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,
  UNIQUE (organization_id, slug)
);
ALTER TABLE clickwrap_agreements ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON clickwrap_agreements
  FOR ALL
  USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
  WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));

-- ═══════════════════════════════════════════════════════════════════════
-- 10. CLICKWRAP_VERSIONS
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS clickwrap_versions (
  id                     UUID PRIMARY KEY,
  organization_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  clickwrap_agreement_id UUID NOT NULL REFERENCES clickwrap_agreements(id) ON DELETE CASCADE,
  version_number         INTEGER NOT NULL,
  content                TEXT NOT NULL,
  content_hash           TEXT NOT NULL,
  is_current             BOOLEAN NOT NULL DEFAULT false,
  published_at           TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at             TIMESTAMPTZ,
  UNIQUE (clickwrap_agreement_id, version_number)
);
ALTER TABLE clickwrap_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON clickwrap_versions
  FOR ALL
  USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
  WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));

-- ═══════════════════════════════════════════════════════════════════════
-- 11. CLICKWRAP_ACCEPTANCES (APPEND-ONLY — RULE CW-001)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS clickwrap_acceptances (
  id                   UUID PRIMARY KEY,
  organization_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  clickwrap_version_id UUID NOT NULL REFERENCES clickwrap_versions(id) ON DELETE RESTRICT,
  acceptor_email       TEXT NOT NULL,
  acceptor_name        TEXT,
  ip_address           INET,
  user_agent           TEXT,
  accepted_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE clickwrap_acceptances ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON clickwrap_acceptances
  FOR ALL
  USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
  WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));

CREATE INDEX IF NOT EXISTS idx_cwa_version ON clickwrap_acceptances (clickwrap_version_id, accepted_at DESC);

-- Immutability trigger for clickwrap_acceptances (RULE CW-001)
CREATE OR REPLACE FUNCTION prevent_clickwrap_acceptance_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'clickwrap_acceptances is append-only (id: %)', OLD.id;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_immutable_clickwrap_acceptance ON clickwrap_acceptances;
CREATE TRIGGER trg_immutable_clickwrap_acceptance
  BEFORE UPDATE OR DELETE ON clickwrap_acceptances
  FOR EACH ROW EXECUTE FUNCTION prevent_clickwrap_acceptance_mutation();

-- ═══════════════════════════════════════════════════════════════════════
-- 12. ADDITIONS TO EXISTING TABLES: DOCUMENT_VERSIONS & DOCUMENTS
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE document_versions ADD COLUMN IF NOT EXISTS yjs_state BYTEA;
ALTER TABLE document_versions ADD COLUMN IF NOT EXISTS schema_version INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_doc_version_yjs ON document_versions (document_id)
  WHERE yjs_state IS NOT NULL;

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expiry_warning_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS inactivity_reminder_days INTEGER,
  ADD COLUMN IF NOT EXISTS last_viewed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_doc_expiry ON documents (expires_at)
  WHERE expires_at IS NOT NULL AND status NOT IN ('expired','signed','voided');
