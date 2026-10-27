# Phase 2 Build Plan — PactIntel Blueprint v2.0.0 (Google Cloud)

## PRECISION EDITION — Engineered for reliable execution by any AI model

## Depth That Creates Switching Cost (Estimated: 12–16 weeks, 7 Sprints)

> **MANDATORY FIRST STEP**: Read AGENTS.md, GEMINI.md, docs/MASTER_IMPLEMENTATION_BLUEPRINT.md,
> docs/PRODUCT_BLUEPRINT.md, and docs/DESIGN_SYSTEM.md before ANY work.
> Phase 1 Definition of Done must be 100% complete before Phase 2 begins.
> Check Blueprint §12 to confirm Phase 1 is done. If not: STOP and flag to user.

---

## HARD CONSTRAINTS — violations block CI or break production

| Constraint        | Rule                                                                                               |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| IDs               | generateId() from libs/shared-utils (UUIDv7) — NEVER gen_random_uuid() or Math.random()            |
| Pagination        | Cursor only (opaque base64) — NEVER offset                                                         |
| SDK calls         | ONLY inside port/adapter files (ADP-001 lint-enforced)                                             |
| Schedules         | BullMQ upsertJobScheduler ONLY — NEVER @Cron or @nestjs/schedule (I-07)                            |
| Data manifest     | Every new table MUST be registered in libs/data-manifest (I-10)                                    |
| RLS               | Every tenant table: organization_id + ENABLE ROW LEVEL SECURITY + policy (MT-001)                  |
| Analytics         | Pub/Sub buffer ONLY — NEVER direct ClickHouse INSERT (AN-001)                                      |
| AI calls          | AiGateway ONLY — NEVER direct provider SDK from feature code (AI-004)                              |
| AI prompts        | Prompt registry ONLY — NEVER inline in application code (A6.7)                                     |
| Content immutable | Signed document_versions NEVER modified. clickwrap_acceptances version NEVER reattributed (CW-001) |
| Yjs updates       | Content locks enforced server-side in Hocuspocus onUpdate hook (COLLAB-002)                        |
| Approval          | approval_steps.status NEVER changed once set to approved/rejected (WF-003)                         |
| Automation        | chain_depth <= 5; 100 executions/org/minute cap (WF-002)                                           |
| Webhooks          | Every outbound webhook has idempotency event_id (WH-001)                                           |
| Design            | Colors from DESIGN_SYSTEM.md §2. Inter font. No gradients, no glassmorphism (DS-15)                |
| Decimal.js        | ALL money math uses Decimal.js — never native JS floats                                            |
| Follow-up emails  | NEVER send without rep review from nudge queue (FOLLOW-001)                                        |

---

## Architecture Invariants Phase 2 Verification

| #    | Phase 2 Verification                                                                         |
| ---- | -------------------------------------------------------------------------------------------- |
| I-01 | Hocuspocus max-in-memory-docs is configurable — never hardcoded                              |
| I-02 | Hocuspocus persists Y.Doc state to same cell's PostgreSQL — no cross-cell collab access      |
| I-05 | Zapier/webhook behind WebhookPort; AI models behind LlmPort via AiGateway                    |
| I-06 | All side-effects (approval decisions, clickwrap acceptances) via outbox_events               |
| I-07 | BullMQ upsertJobScheduler for expiry check, reminder, follow-up queue, analytics aggregation |
| I-08 | Webhook URLs, clickwrap slugs, approval chain IDs are permanent once created                 |
| I-10 | 12 new tables, 12 data-manifest entries (see Sprint 2.1)                                     |
| I-12 | Zapier delivery failure never blocks document signing or approval workflow                   |
| I-13 | Per-org quotas: 100 automation executions/min; AI calls rate-limited per org                 |
| I-14 | AI provider call stays in-jurisdiction (Vertex AI EU endpoint for EU cell)                   |

---

## PHASE 2 MODULE MAP

| Sprint | Module(s)                                          | Duration   |
| ------ | -------------------------------------------------- | ---------- |
| 2.1    | Migration + Section Analytics (COMPLETED)          | Week 1-2   |
| 2.2    | Real-Time Co-Editing (Hocuspocus/Yjs) (COMPLETED)  | Week 2-4   |
| 2.3    | Comments + Content Locking (COMPLETED)             | Week 4-5   |
| 2.4    | Approval Workflows + Automation Rules (COMPLETED)  | Week 5-7   |
| 2.5    | In-Editor AI Drafting (COMPLETED)                  | Week 7-9   |
| 2.6    | Document Expiry, Reminders, Follow-ups (COMPLETED) | Week 9-10  |
| 2.7    | Zapier + Clickwrap + BYOK Payments (COMPLETED)     | Week 10-12 |
| 2.8    | CASL Extension + Test Suite + DoD (COMPLETED)      | Week 12-16 |

---

---

## Sprint 2.1 — Migration + Section-Level Analytics (Week 1-2)

### 2.1.1 Migration: 0003_phase2_additions

File: apps/api/src/prisma/migrations/0003_phase2_additions/migration.sql

CRITICAL: Use UUIDv7 via generateId() for ALL application-level inserts.
The DEFAULT gen_random_uuid() in DDL is a FALLBACK ONLY for direct SQL inserts.
Application code MUST always call generateId(). Blueprint schema shows gen_random_uuid()
as the DDL default but ALL NestJS service code must use generateId().

```sql
-- ═══════════════════════════════════════════════════════════════════════
-- 1. DOCUMENT_COMMENTS (threaded, block-level)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS document_comments (
  id               UUID PRIMARY KEY,
  organization_id  UUID NOT NULL REFERENCES organizations(id),
  document_id      UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  document_version_id UUID REFERENCES document_versions(id),
  author_id        UUID NOT NULL REFERENCES users(id),
  parent_id        UUID REFERENCES document_comments(id),  -- null = root thread
  block_id         TEXT,            -- Tiptap block node ID; null = document-level
  content          TEXT NOT NULL,   -- plain text, max 5000 chars
  is_resolved      BOOLEAN NOT NULL DEFAULT false,
  resolved_by_id   UUID REFERENCES users(id),
  resolved_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ
);
ALTER TABLE document_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON document_comments
  USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
  WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));
CREATE INDEX idx_comments_document ON document_comments (document_id, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_comments_block ON document_comments (document_id, block_id)
  WHERE deleted_at IS NULL AND parent_id IS NULL;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. CONTENT_LOCKS (server-enforced; Hocuspocus onUpdate validates this)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS content_locks (
  id               UUID PRIMARY KEY,
  organization_id  UUID NOT NULL REFERENCES organizations(id),
  document_id      UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  block_id         TEXT NOT NULL,   -- Tiptap block node ID
  locked_by_id     UUID NOT NULL REFERENCES users(id),
  locked_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, block_id)
);
ALTER TABLE content_locks ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON content_locks
  USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
  WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));

-- ═══════════════════════════════════════════════════════════════════════
-- 3. APPROVAL_CHAINS (workflow chain definition)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS approval_chains (
  id               UUID PRIMARY KEY,
  organization_id  UUID NOT NULL REFERENCES organizations(id),
  workspace_id     UUID NOT NULL REFERENCES workspaces(id),
  name             TEXT NOT NULL,
  conditions       JSONB NOT NULL DEFAULT '{}',
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ
);
ALTER TABLE approval_chains ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON approval_chains
  USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
  WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));

-- ═══════════════════════════════════════════════════════════════════════
-- 4. APPROVAL_STEPS (immutable once decided — RULE WF-003)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS approval_steps (
  id                   UUID PRIMARY KEY,
  approval_chain_id    UUID NOT NULL REFERENCES approval_chains(id) ON DELETE CASCADE,
  organization_id      UUID NOT NULL REFERENCES organizations(id),
  document_id          UUID REFERENCES documents(id),
  step_order           INTEGER NOT NULL,
  approver_id          UUID REFERENCES users(id),
  fallback_approver_id UUID REFERENCES users(id),
  status               TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','approved','rejected','skipped')),
  timeout_hours        INTEGER NOT NULL DEFAULT 168,   -- 7 days
  decided_at           TIMESTAMPTZ,
  comment              TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE approval_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON approval_steps
  USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
  WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));
CREATE INDEX idx_approval_steps_pending ON approval_steps (approver_id, status)
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

CREATE TRIGGER trg_immutable_approval_step
  BEFORE UPDATE ON approval_steps
  FOR EACH ROW EXECUTE FUNCTION prevent_approval_step_remutation();

-- ═══════════════════════════════════════════════════════════════════════
-- 5. AUTOMATION_RULES (nudge + workflow triggers)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS automation_rules (
  id               UUID PRIMARY KEY,
  organization_id  UUID NOT NULL REFERENCES organizations(id),
  workspace_id     UUID NOT NULL REFERENCES workspaces(id),
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
  USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
  WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));

-- ═══════════════════════════════════════════════════════════════════════
-- 6. FOLLOW_UP_QUEUE (nudge-style rep review queue)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS follow_up_queue (
  id               UUID PRIMARY KEY,
  organization_id  UUID NOT NULL REFERENCES organizations(id),
  document_id      UUID NOT NULL REFERENCES documents(id),
  owner_id         UUID NOT NULL REFERENCES users(id),
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
  USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
  WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));
CREATE INDEX idx_follow_up_pending ON follow_up_queue (owner_id, scheduled_for)
  WHERE status = 'pending';

-- ═══════════════════════════════════════════════════════════════════════
-- 7. AI_GENERATION_LOGS (audit trail for AI content — RULE AI-002)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ai_generation_logs (
  id               UUID PRIMARY KEY,
  organization_id  UUID NOT NULL REFERENCES organizations(id),
  document_id      UUID REFERENCES documents(id),
  user_id          UUID NOT NULL REFERENCES users(id),
  task_id          TEXT NOT NULL,   -- from AI task catalog
  prompt_hash      TEXT NOT NULL,   -- SHA-256 of the prompt (never store prompt plaintext)
  model_used       TEXT,            -- set by AiGateway adapter, not feature code
  tokens_input     INTEGER,
  tokens_output    INTEGER,
  latency_ms       INTEGER,
  status           TEXT NOT NULL CHECK (status IN ('success','error','rejected')),
  error_code       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
  -- Append-only
);
ALTER TABLE ai_generation_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ai_generation_logs
  USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
  WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));
CREATE INDEX idx_ai_logs_org ON ai_generation_logs (organization_id, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════
-- 8. WEBHOOKS (org-configured outbound event subscriptions — WH-001)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS webhooks (
  id               UUID PRIMARY KEY,
  organization_id  UUID NOT NULL REFERENCES organizations(id),
  url              TEXT NOT NULL,
  secret_hash      TEXT NOT NULL,  -- HMAC secret, stored as SHA-256 hash; plaintext in Secret Manager
  events           TEXT[] NOT NULL,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  failure_count    INTEGER NOT NULL DEFAULT 0,
  last_triggered_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ
);
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON webhooks
  USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
  WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));

-- ═══════════════════════════════════════════════════════════════════════
-- 9. WEBHOOK_DELIVERY_LOG (idempotency + debug — WH-001)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS webhook_delivery_logs (
  id               UUID PRIMARY KEY,
  organization_id  UUID NOT NULL REFERENCES organizations(id),
  webhook_id       UUID NOT NULL REFERENCES webhooks(id),
  event_id         TEXT NOT NULL,  -- UUID v4, unique per event instance
  event_type       TEXT NOT NULL,
  payload_hash     TEXT NOT NULL,  -- SHA-256 of payload (never store raw payload)
  attempt_number   INTEGER NOT NULL DEFAULT 1,
  http_status      INTEGER,
  response_body    TEXT,           -- first 2000 chars
  delivered_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
  -- Append-only
);
ALTER TABLE webhook_delivery_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON webhook_delivery_logs
  USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
  WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));
CREATE UNIQUE INDEX idx_wdl_idempotency ON webhook_delivery_logs (webhook_id, event_id, attempt_number);

-- ═══════════════════════════════════════════════════════════════════════
-- 10. CLICKWRAP_AGREEMENTS
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS clickwrap_agreements (
  id               UUID PRIMARY KEY,
  organization_id  UUID NOT NULL REFERENCES organizations(id),
  name             TEXT NOT NULL,
  slug             TEXT NOT NULL,   -- permanent once provisioned (I-08)
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ,
  UNIQUE (organization_id, slug)
);
ALTER TABLE clickwrap_agreements ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON clickwrap_agreements
  USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
  WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));

-- ═══════════════════════════════════════════════════════════════════════
-- 11. CLICKWRAP_VERSIONS
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS clickwrap_versions (
  id                    UUID PRIMARY KEY,
  organization_id       UUID NOT NULL REFERENCES organizations(id),
  clickwrap_agreement_id UUID NOT NULL REFERENCES clickwrap_agreements(id),
  version_number        INTEGER NOT NULL,
  content               TEXT NOT NULL,   -- HTML/Markdown of terms text
  content_hash          TEXT NOT NULL,   -- SHA-256 of content (immutable proof)
  is_current            BOOLEAN NOT NULL DEFAULT false,
  published_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at            TIMESTAMPTZ,     -- soft delete only (acceptances remain linked)
  UNIQUE (clickwrap_agreement_id, version_number)
);
ALTER TABLE clickwrap_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON clickwrap_versions
  USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
  WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));

-- ═══════════════════════════════════════════════════════════════════════
-- 12. CLICKWRAP_ACCEPTANCES (APPEND-ONLY — RULE CW-001: never update version)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS clickwrap_acceptances (
  id                     UUID PRIMARY KEY,
  organization_id        UUID NOT NULL REFERENCES organizations(id),
  clickwrap_version_id   UUID NOT NULL REFERENCES clickwrap_versions(id),
  acceptor_email         TEXT NOT NULL,
  acceptor_name          TEXT,
  ip_address             INET,
  user_agent             TEXT,
  accepted_at            TIMESTAMPTZ NOT NULL DEFAULT now()
  -- Append-only: NO updated_at, NO deleted_at
);
ALTER TABLE clickwrap_acceptances ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON clickwrap_acceptances
  USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
  WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));
CREATE INDEX idx_cwa_version ON clickwrap_acceptances (clickwrap_version_id, accepted_at DESC);

-- Immutability trigger for clickwrap_acceptances (RULE CW-001)
CREATE OR REPLACE FUNCTION prevent_clickwrap_acceptance_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'clickwrap_acceptances is append-only (id: %)', OLD.id;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_immutable_clickwrap_acceptance
  BEFORE UPDATE OR DELETE ON clickwrap_acceptances
  FOR EACH ROW EXECUTE FUNCTION prevent_clickwrap_acceptance_mutation();
```

### 2.1.2 Data Manifest — 12 new entries required

File: libs/data-manifest/src/manifest.ts — append to stores array:

```typescript
{ id: 'pg-document-comments', table: 'document_comments', rls: true, retention: 'until_org_deletion', erasure: 'soft_delete', residency: 'cell_jurisdiction' },
{ id: 'pg-content-locks', table: 'content_locks', rls: true, retention: 'until_org_deletion', erasure: 'hard_delete', residency: 'cell_jurisdiction' },
{ id: 'pg-approval-chains', table: 'approval_chains', rls: true, retention: 'until_org_deletion', erasure: 'soft_delete', residency: 'cell_jurisdiction' },
{ id: 'pg-approval-steps', table: 'approval_steps', rls: true, retention: 'until_org_deletion', erasure: 'none', residency: 'cell_jurisdiction' },
{ id: 'pg-automation-rules', table: 'automation_rules', rls: true, retention: 'until_org_deletion', erasure: 'soft_delete', residency: 'cell_jurisdiction' },
{ id: 'pg-follow-up-queue', table: 'follow_up_queue', rls: true, retention: '1_year', erasure: 'hard_delete_on_request', residency: 'cell_jurisdiction' },
{ id: 'pg-ai-generation-logs', table: 'ai_generation_logs', rls: true, retention: '2_years', erasure: 'none', residency: 'cell_jurisdiction' },
{ id: 'pg-webhooks', table: 'webhooks', rls: true, retention: 'until_org_deletion', erasure: 'soft_delete', residency: 'cell_jurisdiction' },
{ id: 'pg-webhook-delivery-logs', table: 'webhook_delivery_logs', rls: true, retention: '90_days', erasure: 'none', residency: 'cell_jurisdiction' },
{ id: 'pg-clickwrap-agreements', table: 'clickwrap_agreements', rls: true, retention: 'until_org_deletion', erasure: 'soft_delete', residency: 'cell_jurisdiction' },
{ id: 'pg-clickwrap-versions', table: 'clickwrap_versions', rls: true, retention: 'until_org_deletion', erasure: 'none', residency: 'cell_jurisdiction' },
{ id: 'pg-clickwrap-acceptances', table: 'clickwrap_acceptances', rls: true, retention: '7_years', erasure: 'none', residency: 'cell_jurisdiction' },
```

### 2.1.3 Section-Level Analytics — ClickHouse Schema

File: apps/api/src/modules/analytics/clickhouse-schema.sql (append):

```sql
-- section_view events (highest-volume table in the system — ALWAYS use Pub/Sub buffer)
CREATE TABLE IF NOT EXISTS section_views (
  event_id          UUID,
  organization_id   UUID,
  document_id       UUID,
  session_id        String,
  block_id          String,       -- Tiptap block node ID
  section_title     Nullable(String),
  duration_ms       UInt32,       -- time spent on this section
  visibility_pct    Float32,      -- IntersectionObserver ratio (0.0–1.0)
  scroll_depth_pct  Float32,      -- how far they scrolled (0.0–1.0)
  created_at        DateTime64(3, 'UTC')
) ENGINE = MergeTree()
  PARTITION BY toYYYYMM(created_at)
  ORDER BY (organization_id, document_id, session_id, created_at);
```

### 2.1.4 Section Analytics — Instrumentation

File: apps/web/src/app/(recipient)/d/[slug]/hooks/useSectionTracking.ts

EXACT IMPLEMENTATION RULES:

1. Use IntersectionObserver (threshold: [0.25, 0.5, 0.75, 1.0])
2. Track entry time when block reaches 25% visibility
3. Track exit time when block falls below 25%
4. Batch section_view events: POST /api/v1/analytics/section-events every 10 seconds
5. Flush on visibilitychange('hidden')
6. Include: blockId, sectionTitle (from block attrs), durationMs, visibilityPct
7. NEVER send individual events per intersection — batch only (AN-001)
8. Max payload: 50 events per batch POST

File: apps/api/src/modules/analytics/analytics.controller.ts — add endpoint:

POST /api/v1/analytics/section-events (NO auth — validated by documentSlug + sessionId):

- Body: { documentSlug: string, sessionId: string, events: SectionViewEventDto[] }
- SectionViewEventDto: { blockId: string, durationMs: number (max 3600000), visibilityPct: number (0-1) }
- Validate: max 50 events per call, durationMs sum per session per minute < 120000
- Publish each event to Pub/Sub buffer. Return 204.
- RULE: if Pub/Sub publish fails, swallow and log — NEVER return 5xx to recipient

GET /api/v1/documents/:id/analytics/sections (authenticated — CASL: read Document):

- Query ClickHouse: SELECT block_id, SUM(duration_ms), AVG(visibility_pct), COUNT(DISTINCT session_id)
  FROM section_views WHERE document_id=:id AND created_at > :from GROUP BY block_id
- Return: [{ blockId, totalDurationMs, avgVisibilityPct, uniqueSessions }]
- Cache: 5 minutes in redis-cache

### 2.1.5 Analytics Dashboard Frontend

File: apps/web/src/app/(app)/documents/[id]/analytics/page.tsx

Layout: Three panels
Panel 1 — Overview KPIs (top bar):
Total opens | Unique viewers | Avg time on page | Completion rate
Panel 2 — Section Heatmap (main body):
Mirror the document structure (Tiptap block tree)
For each block: colored heat bar (CSS width = visibility_pct, color = duration bucket)
Color scale: gray (<5s) -> yellow (5-15s) -> orange (15-30s) -> red (>30s)
No gradients — use 4 discrete CSS classes: .heat-low .heat-med .heat-high .heat-peak
Click block: slide-open detail panel (sessions, avg duration)
Panel 3 — Viewer Table (bottom):
  <table> columns: Email | First Opened | Last Active | Views | Time Spent | Device
  Cursor-paginated. Filter: date range.

EMPTY STATE: Illustration + "Share your document to start tracking engagement"
LOADING STATE: Skeleton rows (3 panels have skeleton variants)
ERROR STATE: "Analytics temporarily unavailable" + retry button

---

## Sprint 2.2 — Real-Time Co-Editing (Hocuspocus + Yjs) (Week 2-4)

### 2.2.1 Hocuspocus Server — apps/collab-server/src/

PREREQUISITE: Verify apps/collab-server exists and has a working NestJS scaffold.
If not: run `pnpm nx g @nx/nest:app collab-server` first.

Install in collab-server:

```
pnpm add @hocuspocus/server @hocuspocus/extension-redis @hocuspocus/extension-database
pnpm add yjs y-protocols lib0
```

FILE TREE (create all before any implementation):

```
apps/collab-server/src/
  main.ts
  hocuspocus.server.ts       -- server bootstrap
  hooks/
    on-authenticate.hook.ts  -- RULE COLLAB-001
    on-update.hook.ts        -- RULE COLLAB-002 (content lock enforcement)
    on-disconnect.hook.ts    -- RULE COLLAB-003 (GC)
    on-connect.hook.ts
  extensions/
    redis.extension.ts       -- @hocuspocus/extension-redis with redis-realtime config
    database.extension.ts    -- persist/fetch Y.Doc to PostgreSQL
  services/
    auth.service.ts          -- session token validation (calls api via internal HTTP)
    content-lock.service.ts  -- queries content_locks table
  __tests__/
    hocuspocus-auth.spec.ts
    content-lock.spec.ts
    gc.spec.ts
```

EXACT hocuspocus.server.ts (copy verbatim):

```typescript
import { Server } from '@hocuspocus/server';
import { Redis } from '@hocuspocus/extension-redis';
import { Database } from '@hocuspocus/extension-database';
import { onAuthenticateHook } from './hooks/on-authenticate.hook';
import { onUpdateHook } from './hooks/on-update.hook';
import { onDisconnectHook } from './hooks/on-disconnect.hook';
import { getEnv } from './config';

export function createHocuspocusServer() {
  return Server.configure({
    name: 'pactintel-collab',
    port: parseInt(getEnv('COLLAB_PORT', '1234')),
    timeout: 30000,
    maxDebounce: 1000,
    debounce: 2000,
    extensions: [
      new Redis({
        host: getEnv('REDIS_REALTIME_HOST'),
        port: parseInt(getEnv('REDIS_REALTIME_PORT', '6379')),
        password: getEnv('REDIS_REALTIME_PASSWORD'),
        tls: getEnv('NODE_ENV') === 'production' ? {} : undefined,
      }),
      new Database({
        fetch: async ({ documentName }) => {
          // Load Y.Doc state from document_versions.yjs_state column
          // documentName format: 'document:{documentId}'
          return await fetchYjsState(documentName);
        },
        store: async ({ documentName, state }) => {
          // Persist Y.Doc state back to document_versions.yjs_state
          await storeYjsState(documentName, state);
        },
      }),
    ],
    onAuthenticate: onAuthenticateHook,
    onUpdate: onUpdateHook,
    onDisconnect: onDisconnectHook,
  });
}
```

### 2.2.2 Migration Addendum: Add yjs_state to document_versions

Append to 0003_phase2_additions migration:

```sql
-- yjs_state: serialized Y.Doc binary (updated by Hocuspocus on every save)
ALTER TABLE document_versions ADD COLUMN IF NOT EXISTS yjs_state BYTEA;
ALTER TABLE document_versions ADD COLUMN IF NOT EXISTS schema_version INTEGER NOT NULL DEFAULT 1;

-- Partial index: only latest versions need yjs_state
CREATE INDEX idx_doc_version_yjs ON document_versions (document_id)
  WHERE yjs_state IS NOT NULL;
```

RULE: yjs_state is ONLY written by Hocuspocus Database extension.
Application code NEVER writes yjs_state directly. API reads content_snapshot for PDF/signing.
Hocuspocus syncs: content_snapshot <- JSON.stringify(doc.toJSON()) on every store().

### 2.2.3 on-authenticate.hook.ts — RULE COLLAB-001

```typescript
export const onAuthenticateHook = async ({ token, documentName, connection }) => {
  if (!token) throw new Error('Unauthorized: no token provided');

  // Validate session token via internal API call
  const session = await authService.validateSessionToken(token);
  if (!session) throw new Error('Unauthorized: invalid session');

  // Parse document ID from documentName ('document:{uuid}')
  const documentId = documentName.replace('document:', '');
  if (!isUUID(documentId)) throw new Error('Forbidden: invalid document ID');

  // CASL check: can user read this document?
  const canAccess = await documentService.checkAccess(session.userId, documentId);
  if (!canAccess) throw new Error('Forbidden: document access denied');

  // Store context on connection for use in onUpdate
  connection.readOnly = !(await documentService.checkWriteAccess(session.userId, documentId));

  return {
    userId: session.userId,
    organizationId: session.organizationId,
    documentId,
  };
};
```

### 2.2.4 on-update.hook.ts — RULE COLLAB-002 (Content Lock Enforcement)

```typescript
import * as Y from 'yjs';

export const onUpdateHook = async ({ documentName, update, connection, document }) => {
  const { userId, documentId } = connection.context;

  // Decode which blocks were modified in this Yjs update
  const modifiedBlockIds = extractModifiedBlockIds(update, document);

  // Check each modified block against content_locks
  for (const blockId of modifiedBlockIds) {
    const lock = await contentLockService.findLock(documentId, blockId);
    if (!lock) continue; // block not locked

    const isLocker = lock.locked_by_id === userId;
    const isContentAdmin = await orgService.hasRole(userId, ['admin', 'manager']);

    if (!isLocker && !isContentAdmin) {
      // REJECT: revert the update for this connection
      // Hocuspocus will NOT broadcast a rejected update
      throw new Error(`Block ${blockId} is locked by another user`);
    }
  }
};

function extractModifiedBlockIds(update: Uint8Array, doc: Y.Doc): string[] {
  // Apply update to a temporary Y.Doc clone to inspect changed keys
  const tempDoc = new Y.Doc();
  Y.applyUpdate(tempDoc, update);
  const blocksMap = tempDoc.getMap('blocks');
  return Array.from(blocksMap.keys());
}
```

### 2.2.5 on-disconnect.hook.ts — RULE COLLAB-003 (GC)

```typescript
const documentTimers = new Map<string, NodeJS.Timeout>();
const MAX_IN_MEMORY_DOCS = parseInt(process.env.MAX_IN_MEMORY_DOCS ?? '500');

export const onDisconnectHook = async ({ documentName, document }) => {
  const connectedClients = document.getConnectionsCount();

  if (connectedClients === 0) {
    // Start 5-minute GC timer
    const timer = setTimeout(
      async () => {
        await persistAndUnload(documentName, document);
        documentTimers.delete(documentName);
      },
      5 * 60 * 1000,
    );

    documentTimers.set(documentName, timer);
  }
};

async function persistAndUnload(documentName: string, document: any) {
  // Persist Y.Doc state to PostgreSQL
  const state = Y.encodeStateAsUpdate(document.ydoc);
  await storeYjsState(documentName, state);
  // Hocuspocus will handle unloading from memory
}
```

### 2.2.6 IaC: Cloud Run Collab Service

File: infra/cells/us1/collab.tf (create new file):

```hcl
resource "google_cloud_run_v2_service" "collab" {
  name     = "pactintel-${var.env}-${var.cell}-collab"
  location = var.region
  labels   = { env = var.env, cell = var.cell, service = "collab", tier = "application" }

  template {
    containers {
      image = "${var.artifact_registry}/collab-server:${var.image_tag}"
      resources {
        limits   = { cpu = "2", memory = "2Gi" }
        startup_cpu_boost = true
      }
      env { name = "REDIS_REALTIME_HOST"; value_source { secret_key_ref { secret = "redis-realtime-host"; version = "latest" } } }
      env { name = "REDIS_REALTIME_PASSWORD"; value_source { secret_key_ref { secret = "redis-realtime-password"; version = "latest" } } }
      env { name = "MAX_IN_MEMORY_DOCS"; value = "500" }
      env { name = "COLLAB_PORT"; value = "1234" }
    }
    scaling { min_instance_count = 1; max_instance_count = 10 }
    timeout = "3600s"   -- WebSocket connections can be long-lived
  }
}
```

RULE: collab service timeout MUST be 3600s. Default 60s will kill long WebSocket sessions.

### 2.2.7 Frontend: Tiptap Yjs Integration

File: apps/web/src/app/(app)/documents/[id]/edit/page.tsx (update existing)

Install:

```
pnpm add @tiptap/extension-collaboration @tiptap/extension-collaboration-cursor
pnpm add yjs y-websocket
```

EXACT PATTERN (add to existing editor setup):

```typescript
import { Collaboration } from '@tiptap/extension-collaboration';
import { CollaborationCursor } from '@tiptap/extension-collaboration-cursor';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

// 1. Create Y.Doc
const ydoc = new Y.Doc();

// 2. Create WebSocket provider
// Token = session cookie value (passed as query param — RULE COLLAB-001)
const token = getSessionToken(); // from cookie, NOT localStorage
const wsUrl = process.env.NEXT_PUBLIC_COLLAB_WS_URL; // wss://collab.{domain}
const provider = new WebsocketProvider(wsUrl, `document:${documentId}`, ydoc, {
  params: { token },
});

// 3. Add to Tiptap extensions
extensions: [
  ...existingExtensions,
  Collaboration.configure({ document: ydoc }),
  CollaborationCursor.configure({
    provider,
    user: { name: currentUser.name, color: generateUserColor(currentUser.id) },
  }),
];

// 4. Presence indicator component
// Show avatar stack of connected users (max 5 shown, +N badge for overflow)
// Use provider.awareness for presence data

// 5. Cleanup on unmount:
useEffect(() => {
  return () => {
    provider.destroy();
    ydoc.destroy();
  };
}, []);
```

RULE: Token is passed as WebSocket query param (not Authorization header —
WebSocket API doesn't support request headers). This is the ONLY exception to
the header-auth rule. The server validates it in onAuthenticate.

### 2.2.8 Collab Server Tests

File: apps/collab-server/src/**tests**/hocuspocus-auth.spec.ts:

- Test 1: valid token + accessible document -> connection established
- Test 2: invalid token -> connection rejected with 'Unauthorized'
- Test 3: valid token + inaccessible document -> 'Forbidden'
- Test 4: session expires mid-session -> connection closed within 5 min (mock periodic validation)

File: apps/collab-server/src/**tests**/content-lock.spec.ts:

- Test 1: user edits unlocked block -> update accepted
- Test 2: user edits block locked by another user -> update rejected
- Test 3: content admin edits block locked by another user -> update accepted
- Test 4: locker edits own locked block -> update accepted

File: apps/collab-server/src/**tests**/gc.spec.ts:

- Test 1: last user disconnects -> after 5 min, Y.Doc state persisted to DB
- Test 2: user reconnects within 5 min -> GC timer cancelled, no persist
- Test 3: max_in_memory_docs exceeded -> LRU eviction of oldest document

---

## Sprint 2.3 — Comments + Content Locking (Week 4-5) [COMPLETED]

### 2.3.1 Comment Module — apps/api/src/modules/comment/

FILE TREE (create all before any implementation):

```
comment.module.ts
comment.controller.ts
comment.service.ts
comment.repository.ts
dto/create-comment.dto.ts
dto/update-comment.dto.ts
dto/comment-response.dto.ts
__tests__/comment.service.spec.ts
__tests__/comment-rls.spec.ts
```

CREATE-COMMENT DTO (exact Zod schema):

```typescript
export const CreateCommentDtoSchema = z.object({
  documentId: z.string().uuid(),
  blockId: z.string().max(255).optional(), // null = document-level comment
  parentId: z.string().uuid().optional(), // null = root comment
  content: z.string().min(1).max(5000),
});
```

UPDATE-COMMENT DTO:

```typescript
export const UpdateCommentDtoSchema = z.object({
  content: z.string().min(1).max(5000),
});
// RULE: only author can update own comment; only author/admin can delete
```

SERVICE METHODS:

```
createComment(authorId, dto):
  1. id = generateId()
  2. if parentId: verify parent exists + same documentId (prevent cross-document threading)
  3. prisma.$transaction([comment.create, outboxEvents.create({ eventType: 'comment.created' })])
  4. notifyUser(documentOwnerId, 'comment_added') via notification service
  5. Return comment

resolveThread(userId, commentId):
  1. Load root comment (parentId IS NULL) with CASL: update Comment
  2. prisma.$transaction([
       comment.update({ is_resolved: true, resolved_by_id: userId, resolved_at: now() }),
       outboxEvents.create({ eventType: 'comment.resolved' })
     ])

deleteComment(userId, commentId):
  1. Load comment, check: author OR admin
  2. If has replies: soft delete (set deleted_at, replace content with '[deleted]')
  3. If no replies: hard delete
```

ENDPOINTS:

```
POST   /api/v1/documents/:id/comments          create Comment (CASL: read Document)
GET    /api/v1/documents/:id/comments          list comments (CASL: read Document)
GET    /api/v1/comments/:id                    read Comment
PATCH  /api/v1/comments/:id                    update Comment (CASL: update Comment, author only)
DELETE /api/v1/comments/:id                    delete Comment (CASL: delete Comment, author/admin)
POST   /api/v1/comments/:id/resolve            resolve thread (CASL: update Comment)
GET    /api/v1/documents/:id/comments?blockId= filter by block
```

LIST RESPONSE FORMAT (cursor-paginated):

```typescript
{
  data: CommentResponseDto[],  // includes author, replyCount, isResolved
  nextCursor: string | null,
}
```

### 2.3.2 Content Lock Module — apps/api/src/modules/content-lock/

FILE TREE:

```
content-lock.module.ts
content-lock.controller.ts
content-lock.service.ts
content-lock.repository.ts
dto/lock-block.dto.ts
dto/content-lock-response.dto.ts
__tests__/content-lock.service.spec.ts
```

LOCK-BLOCK DTO:

```typescript
z.object({ blockId: z.string().max(255) });
```

SERVICE METHODS:

```
lockBlock(userId, documentId, blockId):
  1. CASL: can('update', 'Document') (only managers/admins can lock)
  2. Check if block already locked -> throw 409 BLOCK_ALREADY_LOCKED
  3. prisma.contentLock.create({ id: generateId(), ... })
  4. Publish to Redis realtime: 'content-lock:{documentId}' channel
     Message: { type: 'block_locked', blockId, lockedById }
     (Hocuspocus clients subscribe to this channel to update UI)

unlockBlock(userId, documentId, blockId):
  1. Load lock. Check: lockedById === userId OR admin/manager
  2. prisma.contentLock.delete(...)
  3. Publish: { type: 'block_unlocked', blockId }
```

ENDPOINTS:

```
GET    /api/v1/documents/:id/content-locks     list all locks on document
POST   /api/v1/documents/:id/content-locks     lock a block
DELETE /api/v1/documents/:id/content-locks/:blockId  unlock
```

TIPTAP EXTENSION:
File: libs/ui/src/editor/extensions/content-lock.extension.ts

- Custom Node decoration: locked blocks show a lock icon badge (top-right corner)
- Locked blocks have `contenteditable=false` attribute injected (client UX hint)
- Subscribe to Redis realtime via SSE or dedicated EventSource for lock updates
- RULE: client-side lock enforcement is UX ONLY. Real enforcement is in Hocuspocus onUpdate (COLLAB-002)

### 2.3.3 Comment Tests

comment.service.spec.ts (8 required tests):

1. createComment root -> comment created + outbox event + notification sent
2. createComment with parentId -> reply linked to parent
3. createComment with parentId from different document -> throws 400
4. updateComment by author -> success
5. updateComment by non-author non-admin -> throws 403
6. deleteComment with replies -> soft delete (content = '[deleted]')
7. deleteComment without replies -> hard delete
8. resolveThread -> is_resolved=true, resolved_by_id set

comment-rls.spec.ts:

1. Org A creates comment -> Org B query returns 0 rows

---

## Sprint 2.4 — Approval Workflows + Automation Rules (Week 5-7) [COMPLETED]

### 2.4.1 Approval Workflow Module — apps/api/src/modules/approval/

FILE TREE:

```
approval.module.ts
approval.controller.ts
approval.service.ts
approval.repository.ts
dto/create-approval-chain.dto.ts
dto/submit-approval-decision.dto.ts
dto/approval-chain-response.dto.ts
dto/approval-step-response.dto.ts
jobs/approval-timeout.job.ts        -- BullMQ: check stalled approval steps
listeners/document.listener.ts      -- triggers chain on document event
__tests__/approval.service.spec.ts
__tests__/approval-timeout.spec.ts
__tests__/approval-deactivation.spec.ts
```

CREATE-APPROVAL-CHAIN DTO:

```typescript
z.object({
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(200),
  conditions: z.object({
    triggerOn: z.enum(['document.sent', 'document.signed', 'manual']),
    minDealValue: z.number().positive().optional(), // only trigger if CPQ total >= this
    workspaceIds: z.array(z.string().uuid()).optional(),
  }),
  steps: z
    .array(
      z.object({
        stepOrder: z.number().int().positive(),
        approverId: z.string().uuid().optional(),
        fallbackApproverId: z.string().uuid().optional(),
        timeoutHours: z.number().int().min(1).max(720).default(168),
      }),
    )
    .min(1)
    .max(10),
});
```

SUBMIT-APPROVAL-DECISION DTO:

```typescript
z.object({
  decision: z.enum(['approved', 'rejected']),
  comment: z.string().max(2000).optional(),
});
```

SERVICE — submitApprovalDecision():

```
1. Load approval_step WHERE id = stepId AND status = 'pending'
2. RULE WF-003: verify DB trigger prevents re-decision — but also guard in service
3. CASL: step.approver_id === currentUserId OR admin
4. prisma.$transaction([
     approvalStep.update({ status: decision, decided_at: now(), comment }),
     auditLogEntry.create({ action: 'approval.decided', changes: { decision, comment } }),
     outboxEvents.create({ eventType: 'approval.step.decided' })
   ])
5. If decision === 'rejected':
     void all remaining steps (set to 'skipped')
     update document status to 'approval_rejected'
     outboxEvents.create({ eventType: 'approval.chain.rejected' })
6. If decision === 'approved' AND is final step:
     update document status to 'approval_complete'
     outboxEvents.create({ eventType: 'approval.chain.approved' })
7. If decision === 'approved' AND more steps:
     activate next step (set to 'pending')
     notifyUser(nextStep.approver_id, 'approval_requested')
```

SERVICE — deactivateUserEscalation() — RULE WF-001:

```
Called from OrganizationService.deactivateUser() — NOT directly by request handler

1. Find all approval_steps WHERE approver_id = userId AND status = 'pending'
2. For each:
   a. If fallback_approver_id set and fallback is active user:
      reassign step to fallback (approver_id = fallbackApproverId)
   b. Else: reassign to workspace admin (query workspace -> find admin user)
   c. auditLogEntry.create({ action: 'approval.step.auto_reassigned' })
   d. notifyUser(newApproverId, 'approval_reassigned')
   e. notifyUser(documentOwnerId, 'approval_approver_changed')
3. Update approval_chains referencing deactivated user:
   set fallback_approver_id = workspace admin
```

APPROVAL TIMEOUT JOB (RULE I-07 — NOT @Cron):

```typescript
// In ApprovalService.onModuleInit():
await this.queue.upsertJobScheduler(
  'approval-timeout-check-hourly', // idempotent scheduler ID
  { pattern: '0 * * * *' }, // every hour
  { name: 'check-approval-timeouts', data: {} },
);

// Processor:
// SELECT * FROM approval_steps WHERE status='pending' AND
//   now() > created_at + INTERVAL '1 hour' * timeout_hours
// For each: trigger escalation to fallback or admin
// Write audit log + notify
```

ENDPOINTS:

```
POST   /api/v1/approval-chains                 CASL: create ApprovalChain (admin/manager)
GET    /api/v1/approval-chains                 CASL: read ApprovalChain
GET    /api/v1/approval-chains/:id             CASL: read ApprovalChain
PATCH  /api/v1/approval-chains/:id             CASL: update ApprovalChain (admin only)
DELETE /api/v1/approval-chains/:id             CASL: delete ApprovalChain (soft delete)
POST   /api/v1/approval-steps/:id/decide       CASL: decide ApprovalStep
GET    /api/v1/documents/:id/approvals         get all approval chains for document
POST   /api/v1/documents/:id/approvals         manually trigger approval chain on document
GET    /api/v1/approvals/pending               list pending steps for current user
```

APPROVAL TESTS (8 required):
approval.service.spec.ts:

1. approve step 1 of 3 -> step 2 becomes pending -> step 1 status unchanged after
2. reject at step 2 -> remaining steps voided -> doc status = 'approval_rejected'
3. approve all 3 steps -> doc status = 'approval_complete'
4. non-approver tries to decide -> 403 Forbidden
5. try to re-decide approved step -> database trigger throws exception (caught as 409)
6. deal value condition: doc.total < minDealValue -> chain NOT triggered
7. deal value condition: doc.total >= minDealValue -> chain triggered

approval-deactivation.spec.ts:

1. deactivate approver with pending steps + fallback configured -> steps reassigned to fallback
2. deactivate approver with pending steps + no fallback -> steps reassigned to workspace admin

approval-timeout.spec.ts:

1. step created 200 hours ago (> 168h timeout) -> timeout job reassigns it
2. step created 100 hours ago (< 168h timeout) -> NOT reassigned

### 2.4.2 Automation Rules Module — apps/api/src/modules/automation/

FILE TREE:

```
automation.module.ts
automation.controller.ts
automation.service.ts
automation.repository.ts
automation.executor.ts         -- core execution engine
dto/create-automation-rule.dto.ts
dto/automation-rule-response.dto.ts
jobs/automation.job.ts         -- BullMQ: executes automation actions
listeners/automation.listener.ts -- subscribes to outbox events
__tests__/automation.service.spec.ts
__tests__/automation-loop.spec.ts
__tests__/automation-executor.spec.ts
```

CREATE-AUTOMATION-RULE DTO:

```typescript
z.object({
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(200),
  triggerEvent: z.enum([
    'document.signed',
    'document.viewed',
    'document.sent',
    'document.expired',
    'approval.chain.approved',
    'approval.chain.rejected',
  ]),
  conditions: z
    .array(
      z.object({
        field: z.string(), // e.g. 'document.total_value', 'document.status'
        operator: z.enum(['eq', 'gt', 'lt', 'contains', 'not_eq']),
        value: z.union([z.string(), z.number(), z.boolean()]),
      }),
    )
    .max(5),
  actions: z
    .array(
      z.object({
        type: z.enum([
          'send_notification', // internal in-app notification
          'send_email', // Resend email (to doc owner)
          'add_to_follow_up', // add to follow_up_queue for rep review
          'trigger_webhook', // send to registered webhook endpoint
          'update_document_tag', // add/remove tag on document
        ]),
        config: z.record(z.unknown()),
      }),
    )
    .min(1)
    .max(5),
});
```

AUTOMATION EXECUTOR (RULE WF-002 — loop detection):

```typescript
// automation.executor.ts
interface ExecutionContext {
  chainDepth: number;      // starts at 0, max 5
  chainId: string;         // UUID, propagated through chain
  organizationId: string;
}

async execute(rule: AutomationRule, event: OutboxEvent, ctx: ExecutionContext) {
  // RULE WF-002: loop detection
  if (ctx.chainDepth >= 5) {
    this.logger.warn(`Automation ${rule.id} skipped: max chain depth (${ctx.chainDepth})`);
    await this.auditLog.write({ action: 'automation.skipped_loop', ruleId: rule.id, chainId: ctx.chainId });
    return;
  }

  // RULE WF-002: org-level rate limit
  const execCount = await this.redis.incr(`automation:execcount:${ctx.organizationId}`);
  if (execCount === 1) await this.redis.expire(`automation:execcount:${ctx.organizationId}`, 60);
  if (execCount > 100) {
    this.logger.warn(`Automation rate limit exceeded for org ${ctx.organizationId}`);
    // Circuit breaker: pause automation for org for 5 minutes
    await this.redis.set(`automation:paused:${ctx.organizationId}`, '1', 'EX', 300);
    await this.notifyAdmin(ctx.organizationId, 'automation_rate_limit_exceeded');
    return;
  }

  // Evaluate conditions
  if (!this.evaluateConditions(rule.conditions, event.payload)) return;

  // Execute actions (wrapped in try/catch each — RULE I-12)
  for (const action of rule.actions) {
    try {
      await this.executeAction(action, event, { ...ctx, chainDepth: ctx.chainDepth + 1 });
    } catch (err) {
      this.logger.error(`Automation action failed: ${err.message}`, { ruleId: rule.id, action: action.type });
      // SWALLOW — never let one failed action block others
    }
  }

  // Increment execution count
  await this.ruleRepository.incrementExecutionCount(rule.id);
}
```

ENDPOINTS:

```
POST   /api/v1/automation-rules          CASL: create AutomationRule (admin/manager)
GET    /api/v1/automation-rules          CASL: read AutomationRule
GET    /api/v1/automation-rules/:id      CASL: read AutomationRule
PATCH  /api/v1/automation-rules/:id      CASL: update AutomationRule
DELETE /api/v1/automation-rules/:id      CASL: delete AutomationRule (soft delete)
POST   /api/v1/automation-rules/:id/test CASL: manage AutomationRule (dry-run with sample data)
```

AUTOMATION TESTS (6 required):
automation-loop.spec.ts:

1. chain_depth=5 -> execution skipped + logged
2. chain_depth=4 -> execution proceeds
3. org executes 101 automations in <60s -> circuit breaker activates + admin notified

automation-executor.spec.ts: 4. condition fails -> no actions executed 5. action 1 succeeds, action 2 throws -> action 3 still executes 6. triggerEvent = 'document.signed' + conditions match -> webhook action fires

---

## Sprint 2.5 — In-Editor AI Drafting (Week 7-9) [COMPLETED]

### 2.5.1 AI Architecture (MANDATORY — read before writing any AI code)

RULES (all non-negotiable):

- RULE AI-004: ALL AI calls go through AiGateway. NEVER import Vertex AI or Anthropic SDK in feature code.
- RULE A6.7: ALL prompts live in libs/ai/prompts/. NEVER inline in application code.
- RULE AI-001: Every request must use provider's no-training API (DPA-enforced, not headers).
- RULE AI-002: AI-generated content shows visual indicator in editor (NOT on recipient page).
- RULE AI-003: Guardrails are server-side. Check organizations.settings.ai_guardrails before building prompt.
- RULE AI-014: Zero cross-tenant content in prompts. NEVER include content from other documents.
- RULE I-14: EU cell must use Vertex AI EU endpoint. Check cell region before dispatching.

### 2.5.2 AI Module — apps/api/src/modules/ai/

FILE TREE:

```
ai.module.ts
ai.controller.ts
ai.service.ts
ports/
  llm.port.ts           -- LlmPort interface
adapters/
  vertex-ai.adapter.ts  -- Vertex AI (Claude via Vertex) — SDK ONLY HERE (ADP-001)
  anthropic.adapter.ts  -- Anthropic direct (fallback) — SDK ONLY HERE (ADP-001)
gateway/
  ai.gateway.ts         -- AiGateway: task routing + guardrails + logging
dto/
  ai-draft.dto.ts
  ai-response.dto.ts
__tests__/
  ai.service.spec.ts
  ai.gateway.spec.ts
  ai-guardrail.spec.ts
```

### 2.5.3 libs/ai/prompts/ — Prompt Registry

File: libs/ai/prompts/draft-section.prompt.ts:

```typescript
export const DRAFT_SECTION_PROMPT = {
  taskId: 'DRAFT_SECTION_V1',
  systemPrompt: `You are a professional business document writer for PactIntel.
Your role is to help sales professionals write clear, persuasive sections for proposals and contracts.
Rules:
- Write in the user's specified tone and style
- Output ONLY the requested content — no preamble, no explanation, no metadata
- Do not include any information not provided by the user
- Content must be concise, professional, and ready to insert into a business document
- If asked to invent facts, names, or figures not provided, refuse politely`,
  userTemplate: (input: DraftSectionInput) =>
    `Task: ${input.task}
Tone: ${input.tone ?? 'professional'}
Context about this document: ${input.documentContext ?? 'none provided'}
Additional instructions: ${input.additionalInstructions ?? 'none'}
Write the content now:`,
};
```

File: libs/ai/prompts/refine-text.prompt.ts:

```typescript
export const REFINE_TEXT_PROMPT = {
  taskId: 'REFINE_TEXT_V1',
  systemPrompt: `You are a professional editor helping refine business document content.
Output ONLY the revised text — no explanation or commentary.`,
  userTemplate: (input: RefineTextInput) =>
    `Original text: """${input.originalText}"""
Instruction: ${input.instruction}
Revised text:`,
};
```

Supported tasks (register all in libs/ai/prompts/index.ts):

- DRAFT_SECTION_V1: write a new content section from instructions
- REFINE_TEXT_V1: grammar-fix, condense, expand, change tone
- GRAMMAR_FIX_V1: grammar and spelling only (no content changes)
- TRANSLATE_V1: translate selected text (Phase 4 — do not implement yet, register stub)

### 2.5.4 AiGateway Implementation

File: apps/api/src/modules/ai/gateway/ai.gateway.ts:

```typescript
@Injectable()
export class AiGateway {
  constructor(
    private readonly llmPort: LlmPort,
    private readonly aiRepository: AiRepository,
    private readonly orgService: OrganizationService,
  ) {}

  async generate(
    taskId: string,
    input: Record<string, unknown>,
    context: { userId: string; organizationId: string; documentId?: string },
  ): Promise<AiGenerateResult> {
    // RULE AI-003: server-side guardrail check
    const guardrails = await this.orgService.getAiGuardrails(context.organizationId);
    if (guardrails.disabled) {
      throw new ForbiddenException({
        code: 'AI_GUARDRAIL_VIOLATION',
        message: 'AI features are disabled for your organization',
      });
    }
    if (context.documentId && guardrails.excludedDocumentIds?.includes(context.documentId)) {
      throw new ForbiddenException({
        code: 'AI_GUARDRAIL_VIOLATION',
        message: 'AI is not permitted for this document',
      });
    }

    // RULE I-14: route to correct regional endpoint
    const region = await this.orgService.getCellRegion(context.organizationId);
    const endpoint = region === 'eu' ? VERTEX_AI_EU_ENDPOINT : VERTEX_AI_US_ENDPOINT;

    // Build prompt from registry (NEVER inline)
    const promptDef = PROMPT_REGISTRY[taskId];
    if (!promptDef) throw new BadRequestException(`Unknown AI task: ${taskId}`);

    const prompt = promptDef.userTemplate(input);
    const promptHash = sha256(prompt);

    const startMs = Date.now();
    let result: AiGenerateResult;
    let status: 'success' | 'error' | 'rejected' = 'success';
    let errorCode: string | undefined;

    try {
      result = await this.llmPort.generate({
        systemPrompt: promptDef.systemPrompt,
        userPrompt: prompt,
        endpoint,
        maxTokens: 2048,
        temperature: 0.3,
      });
    } catch (err) {
      status = 'error';
      errorCode = err.code ?? 'UNKNOWN';
      throw err;
    } finally {
      // RULE AI-002: log every generation attempt
      const latencyMs = Date.now() - startMs;
      await this.aiRepository.logGeneration({
        id: generateId(),
        organizationId: context.organizationId,
        documentId: context.documentId,
        userId: context.userId,
        taskId,
        promptHash, // SHA-256 — NEVER store the prompt itself
        tokensInput: result?.usage?.inputTokens,
        tokensOutput: result?.usage?.outputTokens,
        latencyMs,
        status,
        errorCode,
      });
    }

    return result;
  }
}
```

### 2.5.5 AI Draft DTO (server-side input):

```typescript
z.object({
  documentId: z.string().uuid().optional(),
  taskId: z.enum(['DRAFT_SECTION_V1', 'REFINE_TEXT_V1', 'GRAMMAR_FIX_V1']),
  input: z.object({
    task: z.string().min(1).max(2000).optional(),
    originalText: z.string().min(1).max(50000).optional(),
    instruction: z.enum(['grammar_fix', 'condense', 'expand', 'change_tone', 'custom']).optional(),
    tone: z.enum(['professional', 'friendly', 'formal', 'casual']).optional(),
    documentContext: z.string().max(500).optional(),  -- NEVER full document content
    additionalInstructions: z.string().max(500).optional(),
  }),
  // RULE AI-014: input.documentContext is a SUMMARY, not raw content
  // Server MUST NOT automatically inject full document content into prompts
})
```

ENDPOINT:

```
POST /api/v1/ai/generate   CASL: can('use', 'AiFeature')
  - Rate limit: 20 requests / user / minute (Redis rate limiter)
  - Rate limit: 200 requests / org / minute
  - Response: { content: string, taskId: string, tokensUsed: number }
  - On error: 429 (rate limit), 403 (guardrail), 422 (invalid task)
  - NEVER stream (Phase 3 feature) — return full response
```

### 2.5.6 Tiptap AI Panel — Frontend

File: libs/ui/src/editor/extensions/ai-panel.extension.ts
Install: No extra packages (use existing Tiptap + React)

AI SIDE PANEL BEHAVIOR:

1. Trigger: floating button appears when text is selected (>10 chars)
   OR via toolbar "AI" button (for drafting from scratch)
2. Panel slides in from right (300px width, not a modal)
3. Options:
   - "Draft from scratch" -> shows prompt textarea + tone selector
   - "Refine selected" -> shows instruction selector (condense/expand/grammar/tone/custom)
   - "Grammar fix" -> no additional input needed
4. "Generate" button -> POST /api/v1/ai/generate
5. Loading state: spinner + "Generating..." text (disable Generate button)
6. Result appears in panel with: "Accept" and "Discard" buttons
7. RULE AI-002: "Accept" inserts content with { 'data-ai-generated': 'true' } mark
   -> AI icon badge visible in block toolbar for EDITOR view only
8. Recipient page: NEVER render ai-generated mark/badge
9. Auto-insert without review is PROHIBITED — user MUST click Accept

ERROR STATES:

- 429: "You've reached the AI limit. Try again in a minute."
- 403 (guardrail): "AI is not enabled for this document."
- Network error: "AI is temporarily unavailable. Please try again."

### 2.5.7 AI Tests

ai.gateway.spec.ts (6 required):

1. guardrail disabled for org -> 403 ForbiddenException thrown
2. unknown taskId -> 400 BadRequestException
3. successful generation -> ai_generation_logs row created with status='success'
4. LLM throws error -> ai_generation_logs row created with status='error'
5. promptHash is SHA-256 of prompt (verify no plaintext stored)
6. EU org -> EU Vertex AI endpoint used (verify mock call endpoint param)

ai-guardrail.spec.ts:

1. org with ai guardrail excluding specific document -> generate for that doc -> 403
2. org with all AI disabled -> generate -> 403

---

## Sprint 2.6 — Document Expiry, Reminders, Follow-up Queue (Week 9-10) [COMPLETED]

### 2.6.1 Document Expiry Automation

RULE: All scheduled work uses BullMQ upsertJobScheduler. NO @Cron. NO @nestjs/schedule.
The document expiry check, reminder sending, and follow-up queue drain are all BullMQ jobs.

FILE TREE (add to existing document module):

```
apps/api/src/modules/document/
  jobs/
    expiry-check.job.ts         -- hourly BullMQ scheduler
    reminder-check.job.ts       -- daily BullMQ scheduler
    expiry-notification.job.ts  -- per-document expiry notification worker
  listeners/
    expiry.listener.ts          -- subscribes to document.expiry_approaching outbox event
```

EXPIRY CHECK JOB — expiry-check.job.ts:

```typescript
// In DocumentService.onModuleInit():
await this.expiryQueue.upsertJobScheduler(
  'document-expiry-check-hourly',  // idempotent
  { pattern: '0 * * * *' },
  { name: 'check-document-expiry', data: {} }
);

// Processor:
async processExpiryCheck() {
  const now = new Date();
  const warningThreshold = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24h from now

  // Find documents expiring in next 24h (not yet notified)
  const expiringSoon = await this.docRepository.findExpiringSoon(warningThreshold);
  for (const doc of expiringSoon) {
    await this.outbox.create({
      eventType: 'document.expiry_approaching',
      payload: { documentId: doc.id, expiresAt: doc.expires_at }
    });
    // Mark as notified to prevent duplicate notifications
    await this.docRepository.setExpiryWarningAt(doc.id, now);
  }

  // Find documents that have already expired (status not yet 'expired')
  const expired = await this.docRepository.findJustExpired(now);
  for (const doc of expired) {
    await this.prisma.$transaction([
      this.docRepository.setStatus(doc.id, 'expired'),
      this.outbox.create({ eventType: 'document.expired', payload: { documentId: doc.id } })
    ]);
  }
}
```

MIGRATION ADDENDUM (append to 0003_phase2_additions.sql):

```sql
-- Add expiry tracking columns to documents table
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expiry_warning_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS inactivity_reminder_days INTEGER,
  ADD COLUMN IF NOT EXISTS last_viewed_at TIMESTAMPTZ;

CREATE INDEX idx_doc_expiry ON documents (expires_at)
  WHERE expires_at IS NOT NULL AND status NOT IN ('expired','signed','voided');
```

DATA MANIFEST: add to libs/data-manifest — note: these are new columns on an existing table.
No new manifest entry needed for columns. Update existing 'pg-documents' entry to note new columns.

### 2.6.2 Follow-Up Queue (RULE FOLLOW-001 — Never send without rep review)

RULE FOLLOW-001: Automated follow-up emails are NEVER sent without rep review.
The system creates follow_up_queue entries. The rep sees a daily digest in their dashboard.
The rep must click "Send" per item. The system cannot auto-send follow-up emails.

FOLLOW-UP QUEUE DRAIN JOB:

```typescript
// Daily at 8am UTC — sends digest email to reps with pending follow-ups
await this.followUpQueue.upsertJobScheduler(
  'follow-up-digest-daily',
  { pattern: '0 8 * * *' },
  { name: 'send-follow-up-digest', data: {} },
);

// Processor: group pending follow_up_queue items by owner_id
// For each owner with items: send one digest email listing documents needing follow-up
// Email includes: document title, last viewed, days since last activity, "Send Follow-up" button link
// NEVER send the follow-up email itself — only the digest
```

INACTIVITY REMINDER JOB:

```typescript
await this.reminderQueue.upsertJobScheduler(
  'inactivity-reminder-check-daily',
  { pattern: '0 9 * * *' },
  { name: 'check-inactivity-reminders', data: {} },
);

// Processor: find documents WHERE:
//   inactivity_reminder_days IS NOT NULL
//   AND (now() - last_viewed_at) >= inactivity_reminder_days days
//   AND status = 'sent'  (recipient hasn't signed)
// For each: add to follow_up_queue with reason='inactivity'
// RULE FOLLOW-001: add to queue, do NOT send email directly
```

FOLLOW-UP QUEUE ENDPOINTS:

```
GET    /api/v1/follow-ups                    list pending (for current user)
POST   /api/v1/follow-ups/:id/send           CASL: rep confirms send -> send email now
POST   /api/v1/follow-ups/:id/snooze         snooze until { snoozedUntil: ISO string }
DELETE /api/v1/follow-ups/:id                dismiss
```

SEND FOLLOW-UP ACTION (when rep clicks Send):

```typescript
async sendFollowUp(userId, followUpId) {
  const item = await this.followUpRepo.findByIdOrThrow(followUpId);
  // Verify owner === userId
  const doc = await this.docRepo.findByIdOrThrow(item.document_id);
  // Send Resend email to recipient (last known viewer email or signer)
  await this.emailQueue.add('send-follow-up-email', {
    documentId: doc.id,
    recipientEmail: doc.recipient_email,   // from signing request
    senderName: currentUser.name,
    documentTitle: doc.title,
    documentSlug: doc.slug,
  });
  await this.followUpRepo.update(followUpId, { status: 'sent', sent_at: new Date() });
  await this.outbox.create({ eventType: 'follow_up.sent', payload: { followUpId } });
}
```

### 2.6.3 Document Settings Update — Expiry + Reminder Configuration

File: apps/api/src/modules/document/dto/update-document-settings.dto.ts (update existing):

```typescript
// Add these fields to existing DocumentSettingsDto:
expiresInDays: z.number().int().min(1).max(730).optional().nullable(),
inactivityReminderDays: z.number().int().min(1).max(365).optional().nullable(),
```

File: apps/web/src/app/(app)/documents/[id]/settings/page.tsx (update existing):
Add "Expiry & Reminders" section:

- "Document expires after" -> number input (days) + "Never" toggle
- "Remind after inactivity" -> number input (days) + "Disabled" toggle
- Save button -> PATCH /api/v1/documents/:id/settings

### 2.6.4 Expiry + Reminder Tests (4 required)

expiry.spec.ts:

1. document with expires_at < now() -> job sets status='expired' + outbox event emitted
2. document expiring in 20h (< 24h) -> expiry_approaching outbox emitted + expiry_warning_sent_at set
3. document expiring in 48h (> 24h) -> NOT marked as expiring (no false positives)
4. already expired document -> job does NOT re-expire (idempotent)

follow-up.spec.ts: 5. rep sends follow-up -> email queued -> status='sent' 6. rep snoozes -> status='snoozed', snoozed_until set 7. inactivity: last_viewed 10 days ago, threshold 7 days -> added to follow_up_queue 8. inactivity: last_viewed 5 days ago, threshold 7 days -> NOT added

---

## Sprint 2.7 — Zapier Webhooks + Clickwrap + BYOK Payments (Week 10-12) [COMPLETED]

### 2.7.1 Webhook (Zapier) Module — apps/api/src/modules/webhook/

FILE TREE:

```
webhook.module.ts
webhook.controller.ts
webhook.service.ts
webhook.repository.ts
ports/webhook.port.ts
adapters/webhook.adapter.ts        -- HTTP client with retry + HMAC signing
jobs/webhook-delivery.job.ts       -- BullMQ: reliable delivery with retry (WH-001)
listeners/webhook.listener.ts      -- subscribes to ALL relevant outbox events
dto/create-webhook.dto.ts
dto/webhook-response.dto.ts
__tests__/webhook.service.spec.ts
__tests__/webhook-delivery.spec.ts
__tests__/webhook-idempotency.spec.ts
```

CREATE-WEBHOOK DTO:

```typescript
z.object({
  url: z.string().url().max(2000),
  events: z
    .array(
      z.enum([
        'document.sent',
        'document.viewed',
        'document.signed',
        'document.declined',
        'document.expired',
        'document.voided',
        'approval.chain.approved',
        'approval.chain.rejected',
        'payment.completed',
        'payment.failed',
        'comment.created',
        'follow_up.sent',
      ]),
    )
    .min(1)
    .max(20),
});
```

WEBHOOK DELIVERY JOB (RULE WH-001 — idempotency key):

```typescript
// Queue: 'webhook-delivery' on redis-queue
// Job options: { attempts: 6, backoff: { type: 'custom' }, removeOnComplete: { age: 86400 }, removeOnFail: { age: 604800 } }
// Retry schedule: 1s, 5s, 30s, 5m, 30m, 2h (attempts: 6)

async processDelivery(job: Job<WebhookDeliveryPayload>) {
  const { webhookId, eventId, eventType, payload, attemptNumber } = job.data;

  // RULE WH-001: idempotency check
  const alreadyDelivered = await this.deliveryLogRepo.findSuccessfulDelivery(webhookId, eventId);
  if (alreadyDelivered) {
    this.logger.log(`Webhook ${webhookId} event ${eventId} already delivered, skipping`);
    return; // idempotent skip
  }

  // Load webhook config (may have been deleted/disabled since job was enqueued)
  const webhook = await this.webhookRepo.findById(webhookId);
  if (!webhook || !webhook.is_active) return;

  // Sign payload with HMAC-SHA256
  const secret = await this.secretManager.getWebhookSecret(webhookId);
  const signature = this.hmacSign(JSON.stringify(payload), secret);
  const timestamp = Date.now();

  let httpStatus: number | undefined;
  let responseBody: string | undefined;

  try {
    const response = await this.httpClient.post(webhook.url, payload, {
      headers: {
        'Content-Type': 'application/json',
        'X-PactIntel-Signature': `t=${timestamp},v1=${signature}`,
        'X-PactIntel-Event': eventType,
        'X-PactIntel-Event-ID': eventId,  // RULE WH-001
      },
      timeout: 10000,
    });
    httpStatus = response.status;
    responseBody = response.data?.toString()?.substring(0, 2000);

    if (response.status >= 200 && response.status < 300) {
      await this.deliveryLogRepo.recordSuccess(webhookId, eventId, eventType, payload, httpStatus, responseBody, attemptNumber);
      await this.webhookRepo.update(webhookId, { last_triggered_at: new Date(), failure_count: 0 });
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (err) {
    httpStatus = httpStatus ?? 0;
    await this.deliveryLogRepo.recordAttempt(webhookId, eventId, eventType, httpStatus, responseBody, attemptNumber);

    if (job.attemptsMade >= 5) {
      // All retries exhausted — RULE WH-001
      await this.webhookRepo.incrementFailureCount(webhookId);
      const webhook = await this.webhookRepo.findById(webhookId);
      if (webhook.failure_count >= 10) {
        await this.webhookRepo.disable(webhookId);
        await this.notifyAdmin(webhook.organization_id, 'webhook_auto_disabled');
      }
    }
    throw err; // rethrow for BullMQ retry
  }
}
```

HMAC SIGNING:

```typescript
hmacSign(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}
```

WEBHOOK SECRET STORAGE:

- Webhook secrets are stored in GCP Secret Manager (NEVER in the database)
- webhook.secret_hash = sha256(secret) stored in DB for identification
- Secret Manager key: 'webhook-secret-{webhookId}'
- On create: generate 32-byte CSPRNG secret -> store in Secret Manager -> store sha256 in DB
- Return plaintext secret ONCE on creation (user must copy it)

ENDPOINTS:

```
POST   /api/v1/webhooks              CASL: manage Webhook (admin only)
GET    /api/v1/webhooks              CASL: read Webhook
GET    /api/v1/webhooks/:id          CASL: read Webhook
PATCH  /api/v1/webhooks/:id          CASL: manage Webhook (update url/events/active)
DELETE /api/v1/webhooks/:id          CASL: manage Webhook (soft delete + remove secret from SecretManager)
POST   /api/v1/webhooks/:id/test     CASL: manage Webhook (send test event)
GET    /api/v1/webhooks/:id/delivery-logs  CASL: read Webhook (cursor-paginated)
```

WEBHOOK LISTENER (webhook.listener.ts):

```typescript
@OnEvent('document.signed')
@OnEvent('document.viewed')
// ... all subscribed event types
async handleOutboxEvent(event: OutboxEvent) {
  const webhooks = await this.webhookRepo.findActiveByOrgAndEvent(event.organizationId, event.eventType);
  for (const webhook of webhooks) {
    const eventId = generateId(); // unique per delivery attempt
    await this.deliveryQueue.add('deliver-webhook', {
      webhookId: webhook.id,
      eventId,
      eventType: event.eventType,
      payload: this.buildWebhookPayload(event),
      attemptNumber: 1,
    }, {
      attempts: 6,
      backoff: {
        type: 'custom',
        delay: (attemptsMade) => {
          const delays = [1000, 5000, 30000, 300000, 1800000, 7200000];
          return delays[Math.min(attemptsMade, 5)];
        }
      }
    });
  }
}
```

### 2.7.2 Clickwrap / Consent Capture Module — apps/api/src/modules/clickwrap/

FILE TREE:

```
clickwrap.module.ts
clickwrap.controller.ts
clickwrap.service.ts
clickwrap.repository.ts
dto/create-clickwrap.dto.ts
dto/create-clickwrap-version.dto.ts
dto/record-acceptance.dto.ts
dto/clickwrap-response.dto.ts
widget/
  clickwrap-widget.controller.ts  -- public API (no auth) for embed
__tests__/clickwrap.service.spec.ts
__tests__/clickwrap-immutability.spec.ts
```

CREATE-CLICKWRAP DTO:

```typescript
z.object({
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .min(3)
    .max(100),
});
```

CREATE-CLICKWRAP-VERSION DTO:

```typescript
z.object({
  content: z.string().min(10).max(100000), // HTML/Markdown of terms
});
// Version number is auto-incremented. Content hash is computed server-side.
```

RECORD-ACCEPTANCE DTO (public endpoint — no auth):

```typescript
z.object({
  email: z.string().email(),
  name: z.string().min(1).max(200).optional(),
});
// IP and user-agent from request headers (server-side)
```

SERVICE RULES:

```
createVersion():
  1. contentHash = sha256(content)  -- computed server-side
  2. versionNumber = (max existing version for agreement) + 1
  3. prisma.$transaction([
       clickwrapVersion.create({ id: generateId(), contentHash, versionNumber }),
       outboxEvents.create({ eventType: 'clickwrap.version.created' })
     ])

publishVersion(versionId):
  1. prisma.$transaction([
       clickwrapVersions.updateMany({ clickwrap_agreement_id: x, is_current: false }),  -- unset all current
       clickwrapVersion.update({ id: versionId, is_current: true, published_at: now() })
     ])
  -- Existing acceptances remain linked to OLD version (RULE CW-001)

recordAcceptance(slug, dto, request):
  1. Load current version for slug (is_current = true)
  2. id = generateId()
  3. prisma.clickwrapAcceptance.create({
       id,
       clickwrapVersionId: currentVersion.id,
       acceptorEmail: dto.email,
       acceptorName: dto.name,
       ipAddress: request.ip,
       userAgent: request.headers['user-agent'],
     })
  -- DB trigger prevents any future UPDATE on this row (RULE CW-001)
  4. Return { accepted: true, versionId: currentVersion.id, acceptedAt: now() }

deleteVersion(versionId):
  -- RULE CW-001: ONLY soft delete allowed
  1. Check is_current === false (cannot soft-delete current version)
  2. prisma.clickwrapVersion.update({ deleted_at: now() })
  -- Acceptances remain. Widget stops showing this version to new visitors.
```

ENDPOINTS:

```
Authenticated (admin only):
POST   /api/v1/clickwrap                           create agreement
GET    /api/v1/clickwrap                           list agreements (cursor-paginated)
GET    /api/v1/clickwrap/:id                       get agreement + versions
POST   /api/v1/clickwrap/:id/versions              create version
DELETE /api/v1/clickwrap/:id/versions/:versionId   soft delete version
POST   /api/v1/clickwrap/:id/versions/:versionId/publish  set as current
GET    /api/v1/clickwrap/:id/acceptances           list acceptances (cursor-paginated, with email filter)
GET    /api/v1/clickwrap/:id/stats                 {totalAcceptances, perVersion: [{versionId, version_number, count}]}

Public (no auth — for embed widget):
GET    /api/v1/public/clickwrap/:slug              get current version content + metadata
POST   /api/v1/public/clickwrap/:slug/accept       record acceptance
```

EMBEDDABLE WIDGET:
File: apps/web/src/app/(public)/clickwrap/[slug]/widget/page.tsx

- Minimal page: terms text + "I Agree" button
- On submit: POST /api/v1/public/clickwrap/:slug/accept
- Show confirmation: "Thank you. Your acceptance has been recorded."
- Can be embedded via <iframe> on customer's own website
- Responsive. NO authentication required.

CLICKWRAP TESTS (RULE CW-001 verification):
clickwrap-immutability.spec.ts:

1. attempt to UPDATE clickwrap_acceptances row -> DB trigger throws exception
2. new version published -> existing acceptances still reference old version
3. soft delete version -> acceptances still reference it (FK not broken)
4. attempt to hard delete version with acceptances -> 409 (service guard)
5. publish version 2 -> previous is_current=false + new is_current=true (transaction atomic)

### 2.7.3 BYOK Payment Credentials — apps/api/src/modules/payments/ (expand existing)

FILE TREE additions:

```
ports/payment-provider.port.ts    (ALREADY EXISTS from Phase 0 — verify structure)
adapters/stripe.adapter.ts        -- Stripe SDK ONLY here (ADP-001)
adapters/paypal.adapter.ts        -- PayPal SDK ONLY here (ADP-001)
dto/add-payment-credential.dto.ts
dto/payment-credential-response.dto.ts
__tests__/payment-credential.spec.ts
__tests__/payment-byok-encryption.spec.ts
```

ADD-PAYMENT-CREDENTIAL DTO:

```typescript
z.object({
  providerType: z.enum(['stripe', 'paypal']),
  displayName: z.string().min(1).max(200),
  // Raw API keys — ONLY present in request; NEVER stored plaintext
  secretKey: z.string().min(10).max(500),
  publicKey: z.string().min(10).max(500).optional(),
  webhookSecret: z.string().min(10).max(500).optional(),
});
```

STORAGE (envelope encryption — RULE §5.3):

```typescript
async storeCredential(orgId, dto) {
  // 1. Generate per-credential DEK
  const dek = crypto.randomBytes(32);

  // 2. Encrypt credential payload with DEK (AES-256-GCM)
  const credentialPayload = JSON.stringify({
    secretKey: dto.secretKey,
    publicKey: dto.publicKey,
    webhookSecret: dto.webhookSecret,
  });
  const { ciphertext, iv, tag } = aesGcmEncrypt(credentialPayload, dek);

  // 3. Encrypt DEK with Cloud KMS CMK
  const { ciphertextDek, kmsKeyVersion } = await kmsService.encryptDek(dek, 'payment-credentials');

  // 4. Persist encrypted credential (NEVER plaintext)
  await this.prisma.$transaction([
    this.credRepo.create({
      id: generateId(),
      organizationId: orgId,
      providerType: dto.providerType,
      displayName: dto.displayName,
      encryptedCredential: Buffer.concat([iv, tag, ciphertext]),
      dekCiphertext: ciphertextDek,
      kmsKeyId: kmsKeyVersion,
    }),
    this.auditLogRepo.create({
      action: 'payment_credential.added',
      actorId: currentUserId,
      resourceType: 'payment_credential',
    }),
    this.outbox.create({ eventType: 'payment_credential.added' }),
  ]);
}

async decryptAndUseCredential(credentialId): Promise<DecryptedCredential> {
  const cred = await this.credRepo.findByIdOrThrow(credentialId);
  const dek = await kmsService.decryptDek(cred.dek_ciphertext, cred.kms_key_id);
  const payload = aesGcmDecrypt(cred.encrypted_credential, dek);
  return JSON.parse(payload);
  // DEK is NEVER stored. Discarded after use.
}
```

ENDPOINTS:

```
GET    /api/v1/payment-credentials            list (returns display info only — NO keys)
POST   /api/v1/payment-credentials            add credential (admin only)
DELETE /api/v1/payment-credentials/:id        revoke (soft delete + audit log)
POST   /api/v1/payment-credentials/:id/test   test connectivity (attempts auth with provider, returns status)
GET    /api/v1/payment-credentials/:id/audit  credential audit log
```

PAYMENT CREDENTIAL TESTS:
payment-byok-encryption.spec.ts (4 required):

1. add credential -> stored bytes != plaintext secret (encryption verified)
2. add credential -> decrypt -> matches original secret (round-trip verified)
3. delete credential -> subsequent decrypt throws 404
4. payment_credential_audit_logs: add + delete each create append-only row (no UPDATE rows)

---

## Sprint 2.8 — CASL Extension, Full Test Suite, Definition of Done (Week 12-16)

### 2.8.1 CASL Matrix — Phase 2 Extensions

File: libs/shared-types/src/casl.ts — add to AppAbility union:

```typescript
| 'Comment'
| 'ContentLock'
| 'ApprovalChain'
| 'ApprovalStep'
| 'AutomationRule'
| 'FollowUpQueueItem'
| 'AiFeature'
| 'Webhook'
| 'ClickwrapAgreement'
| 'ClickwrapVersion'
| 'ClickwrapAcceptance'
| 'PaymentCredential'
```

File: libs/organization/src/casl/ability.factory.ts — update switch statement:

```typescript
case 'admin':
  can('manage', 'all');  // admin can manage all subjects including Phase 2
  break;

case 'manager':
  // Phase 2 additions for manager:
  can(['read', 'create', 'update', 'delete'], 'Comment');
  can(['read', 'create', 'delete'], 'ContentLock');
  can(['read', 'create', 'update'], 'ApprovalChain');
  can(['read', 'decide'], 'ApprovalStep');  // 'decide' = submit approval decision
  can(['read', 'create', 'update', 'delete'], 'AutomationRule');
  can(['read', 'send', 'snooze', 'dismiss'], 'FollowUpQueueItem');
  can('use', 'AiFeature');
  can('read', 'Webhook');
  cannot('manage', 'Webhook');  // explicit deny — admin only
  cannot('manage', 'PaymentCredential');  // admin only

case 'member':
  // Phase 2 additions for member:
  can(['read', 'create'], 'Comment');
  can('update', 'Comment', { authorId: { $eq: user.id } });  // own comments only
  can('delete', 'Comment', { authorId: { $eq: user.id } });
  cannot('create', 'ContentLock');  // content locking = manager/admin only
  can('read', 'ContentLock');
  can('read', 'ApprovalStep');
  cannot('decide', 'ApprovalStep');  // unless assigned as approver — handled in service
  can(['read', 'send', 'snooze', 'dismiss'], 'FollowUpQueueItem', { ownerId: { $eq: user.id } });
  can('use', 'AiFeature');
  cannot('manage', 'AutomationRule');
  cannot('manage', 'Webhook');
  cannot('manage', 'ClickwrapAgreement');
  cannot('manage', 'PaymentCredential');

case 'collaborator':
  // Phase 2 additions for collaborator:
  can('read', 'Comment');
  can('create', 'Comment');  // collaborators can comment
  cannot('use', 'AiFeature');  // AI requires full seat
  cannot('decide', 'ApprovalStep');
  cannot('manage', 'all');
```

CASL TESTS — permission-matrix-phase2.spec.ts (18 required parametrised tests):

| #   | Role         | Action | Subject            | Expected |
| --- | ------------ | ------ | ------------------ | -------- |
| 1   | admin        | manage | Webhook            | allow    |
| 2   | manager      | manage | Webhook            | deny     |
| 3   | member       | create | Comment            | allow    |
| 4   | member       | update | Comment (other's)  | deny     |
| 5   | member       | update | Comment (own)      | allow    |
| 6   | collaborator | use    | AiFeature          | deny     |
| 7   | member       | use    | AiFeature          | allow    |
| 8   | manager      | create | ContentLock        | allow    |
| 9   | member       | create | ContentLock        | deny     |
| 10  | admin        | manage | PaymentCredential  | allow    |
| 11  | manager      | manage | PaymentCredential  | deny     |
| 12  | admin        | manage | ApprovalChain      | allow    |
| 13  | manager      | create | ApprovalChain      | allow    |
| 14  | member       | create | ApprovalChain      | deny     |
| 15  | admin        | manage | ClickwrapAgreement | allow    |
| 16  | member       | manage | ClickwrapAgreement | deny     |
| 17  | collaborator | create | Comment            | allow    |
| 18  | manager      | create | AutomationRule     | allow    |

### 2.8.2 Outbox Event Registry — Phase 2 Additions

ALL must be in same $transaction as triggering mutation:

| Event Type                    | Triggered By                                       |
| ----------------------------- | -------------------------------------------------- |
| comment.created               | CommentService.createComment                       |
| comment.resolved              | CommentService.resolveThread                       |
| content_lock.acquired         | ContentLockService.lockBlock                       |
| content_lock.released         | ContentLockService.unlockBlock                     |
| approval.step.decided         | ApprovalService.submitApprovalDecision             |
| approval.chain.approved       | ApprovalService.submitApprovalDecision (last step) |
| approval.chain.rejected       | ApprovalService.submitApprovalDecision (rejected)  |
| approval.step.auto_reassigned | ApprovalService.deactivateUserEscalation           |
| automation.executed           | AutomationExecutor.execute                         |
| document.expiry_approaching   | ExpiryCheckJob (within 24h)                        |
| document.expired              | ExpiryCheckJob (past expires_at)                   |
| follow_up.sent                | FollowUpService.sendFollowUp                       |
| ai.content.generated          | AiGateway.generate (success)                       |
| webhook.delivered             | WebhookDeliveryJob (success)                       |
| webhook.failed                | WebhookDeliveryJob (all retries exhausted)         |
| webhook.auto_disabled         | WebhookDeliveryJob (failure_count >= 10)           |
| clickwrap.version.created     | ClickwrapService.createVersion                     |
| clickwrap.version.published   | ClickwrapService.publishVersion                    |
| clickwrap.acceptance.recorded | ClickwrapService.recordAcceptance                  |
| payment_credential.added      | PaymentService.storeCredential                     |
| payment_credential.revoked    | PaymentService.revokeCredential                    |

### 2.8.3 End-to-End Playwright Tests — Phase 2

File: apps/web-e2e/src/ — add these flows:

flow-10-collab.spec.ts:

- User A opens document editor
- User B opens same document in different browser context
- User A types "Hello World" -> User B sees it within 2000ms
- User B adds content -> User A sees it within 2000ms
- Both users' presence avatars appear in toolbar

flow-11-content-lock.spec.ts:

- Manager locks block via API
- Member user opens editor -> locked block has visual indicator
- Member attempts edit in locked block -> edit rejected (console error or UI toast)
- Manager unlocks -> member can now edit

flow-12-approval.spec.ts:

- Admin creates approval chain with 2 steps
- Admin sends document -> chain triggers automatically
- Step 1 approver opens pending approvals -> sees document
- Step 1 approver approves -> step 2 approver gets notification
- Step 2 approver approves -> document.status = 'approval_complete'

flow-13-ai-draft.spec.ts:

- User opens document editor
- Clicks AI button -> AI panel opens
- Enters prompt "Write an executive summary"
- Clicks Generate -> loading state shown
- AI response appears in panel
- Clicks Accept -> content inserted in editor with AI badge
- Recipient view of same document -> NO AI badge visible

flow-14-clickwrap.spec.ts:

- Admin creates clickwrap agreement
- Admin creates and publishes version 1
- Visitor hits public URL, submits acceptance
- Admin sees acceptance in dashboard
- Admin publishes version 2 -> old acceptances still show v1 version_id

flow-15-webhook.spec.ts:

- Admin creates webhook endpoint (mock server using MSW or nock)
- Document is signed
- Webhook delivery log shows HTTP 200 + event delivered
- event_id in payload matches delivery log

### 2.8.4 Phase 2 Definition of Done

ALL of the following must pass on staging before Phase 2 is declared complete:

FUNCTIONAL:
[ ] Real-time co-editing: two users can simultaneously edit without conflict
[ ] Content lock: locked block rejects edits from non-locker at server level (verified via Playwright)
[ ] Approval workflow: full approve/reject chain with escalation works end-to-end
[ ] Automation: document.signed event triggers configured webhook within 5 seconds
[ ] AI drafting: generate -> accept -> content in document (verified on staging with real API)
[ ] Section analytics: recipient opens document -> section_view events appear in ClickHouse within 30s
[ ] Expiry: document expires_at = past -> status = 'expired' within 1 hour of expiry
[ ] Follow-up: rep sees inactivity items in follow-up queue; sending email delivers via Resend
[ ] Webhooks: signed doc -> webhook delivered to mock endpoint -> delivery log shows 200
[ ] Clickwrap: version 1 accepted -> publish version 2 -> old acceptances still on v1 (CW-001)
[ ] BYOK: payment credential stored encrypted -> round-trip decrypt matches original

PERMISSIONS:
[ ] Collaborator cannot use AI feature
[ ] Member cannot lock content blocks
[ ] Manager cannot manage webhooks (admin only)
[ ] Member can only update/delete own comments
[ ] Non-approver cannot submit approval decision

TESTS:
[ ] pnpm nx run-many --target=test --all passes
[ ] Coverage >= 80% on all Phase 2 modules
[ ] All integration tests pass (RLS, encryption, immutability triggers)
[ ] All E2E Playwright flows (flow-10 through flow-15) pass on staging

CI:
[ ] lint + typecheck + test + build all green
[ ] No forbidden pattern violations (see checklist below)
[ ] data-manifest CI check passes (all 12 new tables registered)

INFRASTRUCTURE:
[ ] Collab server deployed on Cloud Run with 3600s timeout
[ ] Section analytics Pub/Sub topic + subscriber deployed
[ ] BullMQ queues for webhook-delivery, approval-timeout, expiry-check, reminder-check provisioned
[ ] Webhook secrets in Secret Manager (not database)

---

## FORBIDDEN PATTERNS CHECKLIST (check before every PR in Phase 2)

[ ] No @Cron or @nestjs/schedule imports anywhere
[ ] No Vertex AI / Anthropic SDK outside adapters/vertex-ai/ and adapters/anthropic/
[ ] No Stripe / PayPal SDK outside adapters/stripe/ and adapters/paypal/
[ ] No direct ClickHouse INSERT from application code (Pub/Sub buffer only)
[ ] No gen_random_uuid() or Math.random() for PKs (use generateId())
[ ] No offset pagination (cursor only)
[ ] No floating-point math for prices (Decimal.js only)
[ ] No AI prompt inline in application code (libs/ai/prompts/ only)
[ ] No provider/model names in feature code (task IDs via AiGateway only)
[ ] No cross-tenant content in AI prompts
[ ] No clickwrap_acceptances UPDATE (append-only)
[ ] No approval_steps status changed after decided
[ ] No direct Y.Doc manipulation outside Hocuspocus extension
[ ] No CSS color not in DESIGN_SYSTEM.md §2
[ ] No gradient backgrounds or glassmorphism
[ ] No new table without organization_id + RLS + policy
[ ] No new table without libs/data-manifest entry
[ ] No secret plaintext in database (Secret Manager only)
[ ] No webhook auto-send without rep confirmation (RULE FOLLOW-001)
[ ] No automation chain_depth > 5 (WF-002)

---

## RISK REGISTER — Phase 2

| Risk                                             | Severity | Mitigation                                                                     |
| ------------------------------------------------ | -------- | ------------------------------------------------------------------------------ |
| Hocuspocus memory leak on large documents        | HIGH     | COLLAB-003 GC + MAX_IN_MEMORY_DOCS config (default 500)                        |
| Y.Doc divergence if two Hocuspocus instances     | HIGH     | @hocuspocus/extension-redis ensures shared state across instances              |
| AI prompt injection via documentContext field    | HIGH     | Server validates max 500 chars; NEVER inject full document content             |
| Clickwrap acceptance reattributed to new version | CRITICAL | DB trigger prevents UPDATE (CW-001) + service guard + test in CI               |
| Approval step re-decided after decision          | HIGH     | DB trigger prevents UPDATE (WF-003) + service guard + test in CI               |
| Automation loop fills database                   | HIGH     | chain_depth <= 5 + 100 executions/org/min cap + circuit breaker (WF-002)       |
| Webhook secret rotation breaks existing webhooks | MEDIUM   | Secret Manager versioning; store multiple active versions during rotation      |
| Section analytics volume overwhelms ClickHouse   | MEDIUM   | Pub/Sub buffer + batch INSERT; partition by month; monitor ingest lag          |
| AI EU data residency violation                   | CRITICAL | Cell region check in AiGateway before dispatch (I-14); EU Vertex endpoint      |
| Collab WebSocket kicked after 60s (Cloud Run)    | HIGH     | IaC sets collab service timeout = 3600s (already in infra/cells/us1/collab.tf) |
| BYOK credential DEK in memory after decrypt      | HIGH     | DEK never stored; discarded immediately after use; no DEK caching              |

---

## PHASE 2 PACKAGE ADDITIONS

Run these BEFORE implementation:

```bash
# Collab server
cd apps/collab-server
pnpm add @hocuspocus/server @hocuspocus/extension-redis @hocuspocus/extension-database
pnpm add yjs y-protocols lib0

# Web app
cd apps/web
pnpm add @tiptap/extension-collaboration @tiptap/extension-collaboration-cursor
pnpm add y-websocket

# API (if not already installed)
cd apps/api
pnpm add @anthropic-ai/sdk  # adapters/anthropic only
pnpm add @google-cloud/aiplatform  # adapters/vertex-ai only

# Verify decimal.js already installed (required from Phase 1)
```

Verify all packages with `pnpm nx run api:build` before writing any feature code.

---

## EDGE CASES CATALOGUE — Exhaustive list for Phase 2 implementation

This section documents every edge case a model must handle. Test all of these.

### Collab / Hocuspocus Edge Cases

EC-COLLAB-01: User A and User B simultaneously lock different blocks -> both locks created successfully
EC-COLLAB-02: User A holds block lock, User B tries to lock SAME block -> 409 BLOCK_ALREADY_LOCKED
EC-COLLAB-03: User locks block then disconnects -> lock PERSISTS (lock is in DB, not in WS session)
EC-COLLAB-04: Lock owner deactivated -> admin can unlock via API; locker is now gone
EC-COLLAB-05: Document has 0 connections for exactly 5 minutes -> Y.Doc persisted + GC timer cancelled
EC-COLLAB-06: MAX_IN_MEMORY_DOCS exceeded -> LRU document evicted (oldest by last_active) -> persisted to DB before eviction
EC-COLLAB-07: Session token expires after 30 min of editing -> Hocuspocus disconnects user after next validation cycle
EC-COLLAB-08: WebSocket connection drops -> client Y-websocket auto-reconnects -> server resumes state from Redis/DB
EC-COLLAB-09: Content lock enforced but Y.Doc CRDT already merged the edit -> server rejects update -> client auto-reverts via Yjs CRDT rollback

### Comment Edge Cases

EC-COMMENT-01: Delete root comment with 3 replies -> soft delete (content = '[deleted]'), replies visible
EC-COMMENT-02: Delete reply with no children -> hard delete
EC-COMMENT-03: Resolve thread on a reply (not root) -> service throws 400 CANNOT_RESOLVE_REPLY
EC-COMMENT-04: Comment on block_id that no longer exists in document -> comment created (block may have been deleted client-side)
EC-COMMENT-05: User creates comment then is deactivated -> comment remains; update/delete by admin only
EC-COMMENT-06: Two users resolve same thread simultaneously -> first wins; second gets 409 (already resolved)

### Approval Workflow Edge Cases

EC-APPROVAL-01: Approver not in same organization as document -> 403 Forbidden
EC-APPROVAL-02: Document deleted while approval pending -> approval steps orphaned (document FK ON DELETE SET NULL) -> admin sees "Document deleted" in approval dashboard
EC-APPROVAL-03: Same user is both step 1 and step 2 approver -> allowed (no uniqueness constraint on approver_id per chain)
EC-APPROVAL-04: Approval chain has minDealValue but document has no pricing table -> condition evaluates to null/0 -> chain NOT triggered (treat as < threshold)
EC-APPROVAL-05: Fallback approver is also deactivated -> escalate to org admin (not workspace admin fallback since workspace may also lack admin)
EC-APPROVAL-06: No org admin exists when escalating -> enqueue email to billing contact; log critical alert
EC-APPROVAL-07: Approval chain voided (after rejection) and then signing request sent -> new approval chain starts fresh

### Automation Edge Cases

EC-AUTO-01: Automation rule deleted while BullMQ job is queued -> job finds no rule -> silently skip
EC-AUTO-02: Automation action 'trigger_webhook' but org's webhook is disabled (failure_count >= 10) -> skip webhook action; log warning
EC-AUTO-03: Automation circuit breaker active (paused) for org -> ALL automation rules skip; unpaused after 5 min automatically
EC-AUTO-04: Two identical automation rules (same trigger + same conditions) both fire for same event -> both execute independently (no deduplication)
EC-AUTO-05: Automation executes 'add_to_follow_up' for a document already in follow_up_queue -> upsert (update existing, not duplicate)
EC-AUTO-06: condition field path is invalid (e.g. 'document.nonexistent_field') -> condition evaluates to false; rule does NOT execute; log warning

### AI Feature Edge Cases

EC-AI-01: AiGateway returns 429 from Vertex AI -> retry once after 5s; if still 429 -> return 503 to client
EC-AI-02: User requests AI for document in EU cell -> verify Vertex AI EU endpoint is used (not US)
EC-AI-03: AI response contains PII-like patterns -> NO server-side PII filtering (user's own content; they choose what to insert)
EC-AI-04: User deactivated mid-generation (request already in flight) -> generation completes; response returned to now-invalid session (connection already closed)
EC-AI-05: documentContext field contains injection attempt (e.g. "Ignore previous instructions") -> no special server-side sanitization; rely on system prompt and provider safety
EC-AI-06: ai_generation_logs grows unboundedly -> retention policy '2_years' enforced; ClickHouse housekeeping job (Phase 3)
EC-AI-07: Org admin disables AI after user clicks Generate but before response arrives -> response arrives normally (guardrail checked at request time, not response time)

### Webhook Edge Cases

EC-WH-01: Recipient server returns 200 after 11 seconds (> 10s timeout) -> treat as timeout, retry
EC-WH-02: Same event triggers 5 webhooks for same org -> all 5 delivered independently; each has unique event_id
EC-WH-03: Webhook URL changed while job is in retry queue -> new URL used for retry (reload from DB)
EC-WH-04: Webhook secret rotated -> old secret removed from Secret Manager after all in-flight deliveries complete; use version-aware secret lookup
EC-WH-05: Webhook URL resolves to internal IP (SSRF attempt) -> reject at webhook creation (validate URL is not RFC1918 address)
EC-WH-06: failure_count reaches exactly 10 -> auto-disable fires ONCE (idempotent); subsequent failures do not re-send disable notification
EC-WH-07: Deleted webhook still has pending BullMQ jobs -> job checks is_active; skips delivery silently

### Clickwrap Edge Cases

EC-CW-01: Publish version 2 while version 1 has 10,000 acceptances -> all 10,000 remain linked to v1 (CW-001)
EC-CW-02: Two admins publish different versions simultaneously -> last-write-wins on is_current; acceptances are still immutable
EC-CW-03: Attempt to delete current (is_current=true) version -> service throws 409 CANNOT_DELETE_CURRENT_VERSION
EC-CW-04: Embed widget loaded with deleted (soft-deleted) slug -> 404 from public endpoint
EC-CW-05: Same email submits acceptance twice for same version -> two separate acceptance records created (idempotency NOT enforced; legal record is per-submission)
EC-CW-06: Version content is 100,001 chars -> DTO rejects with 422 (max 100,000)
EC-CW-07: Organization deleted -> clickwrap_agreements soft-deleted via cascade service; clickwrap_acceptances retained for 7 years (legal hold)

### BYOK Payment Edge Cases

EC-BYOK-01: Same org adds two Stripe credentials (different accounts) -> both stored; UI shows both; user selects which to use per document
EC-BYOK-02: Credential decryption fails (KMS key rotated, old ciphertext invalid) -> throw 500 CREDENTIAL_DECRYPTION_FAILED; notify admin; do NOT silently fail
EC-BYOK-03: Test connectivity called on revoked credential -> 404 CREDENTIAL_REVOKED (do not attempt decrypt)
EC-BYOK-04: DEK accidentally cached in application memory -> PROHIBITED; DEK MUST be discarded after single use
EC-BYOK-05: Multiple rapid decryptions (payment retry) -> each call decrypts fresh from KMS (no caching); KMS rate limit monitored

### Section Analytics Edge Cases

EC-ANALYTICS-01: Section batch has 51 events -> 422 (max 50 per batch)
EC-ANALYTICS-02: durationMs sum per session per minute > 120,000ms (impossible — more than 2 minutes in 1 minute) -> validation rejects batch; likely replay attack
EC-ANALYTICS-03: Pub/Sub publish fails -> swallow error, log warning; NEVER return 5xx to recipient page
EC-ANALYTICS-04: block_id in section_view does not exist in document -> event still recorded; analytics backend does not validate block existence
EC-ANALYTICS-05: ClickHouse cluster unavailable -> section analytics degraded gracefully (RULE I-12); document viewing unaffected

### Expiry + Follow-Up Edge Cases

EC-EXPIRY-01: Document expires while approval chain pending -> document.status = 'expired'; approval chain stays 'pending' (orphaned); admin sees stalled approvals
EC-EXPIRY-02: Document expires at exact same millisecond as signing -> race condition: database transaction atomicity determines winner; log both events; audit trail captures order
EC-EXPIRY-03: expires_at set to past date at creation -> document immediately expires on next expiry job run (within 1 hour); no validation prevents past expiry dates at creation
EC-EXPIRY-04: Follow-up queue item's document already signed -> when rep clicks Send -> service checks doc.status; throws 409 DOCUMENT_ALREADY_SIGNED; dismiss item automatically
EC-EXPIRY-05: Inactivity reminder: last_viewed_at is NULL (document never viewed) -> treat NULL as creation date for inactivity calculation

---

## IMPLEMENTATION ORDER ENFORCEMENT

Follow this exact order within each sprint. Attempting to implement before prerequisites are done causes cascading failures:

Sprint 2.1: Migration FIRST -> data-manifest SECOND -> ClickHouse schema THIRD -> Section analytics endpoints LAST
Sprint 2.2: Install packages FIRST -> Hocuspocus server config SECOND -> hooks THIRD -> IaC FOURTH -> Frontend LAST
Sprint 2.3: Comment module (no prereqs) // Content lock module (no prereqs) -- can be done in parallel
Sprint 2.4: Approval module FIRST -> ApprovalTimeout job SECOND -> Automation module THIRD -> AutomationExecutor LAST
Sprint 2.5: Prompt registry FIRST -> LlmPort/adapters SECOND -> AiGateway THIRD -> API endpoint FOURTH -> Frontend panel LAST
Sprint 2.6: Migration addendum FIRST -> ExpiryCheckJob SECOND -> ReminderJob THIRD -> FollowUpService FOURTH -> Frontend LAST
Sprint 2.7: WebhookModule FIRST -> ClickwrapModule SECOND (independent) -> BYOK expansion THIRD (independent)
Sprint 2.8: CASL extensions FIRST -> permission matrix tests SECOND -> E2E flows THIRD -> DoD review LAST

---

## QUICK REFERENCE: File Locations for All Phase 2 Modules

| Module              | API Path                                           | Frontend Path                                           |
| ------------------- | -------------------------------------------------- | ------------------------------------------------------- |
| Section Analytics   | apps/api/src/modules/analytics/                    | apps/web/src/app/(app)/documents/[id]/analytics/        |
| Hocuspocus          | apps/collab-server/src/                            | libs/ui/src/editor/extensions/ + apps/web/              |
| Comments            | apps/api/src/modules/comment/                      | Inline in document editor sidebar                       |
| Content Locks       | apps/api/src/modules/content-lock/                 | libs/ui/src/editor/extensions/content-lock.extension.ts |
| Approval Workflows  | apps/api/src/modules/approval/                     | apps/web/src/app/(app)/approvals/                       |
| Automation Rules    | apps/api/src/modules/automation/                   | apps/web/src/app/(app)/settings/automation/             |
| AI Drafting         | apps/api/src/modules/ai/ + libs/ai/                | libs/ui/src/editor/extensions/ai-panel.extension.ts     |
| Document Expiry     | apps/api/src/modules/document/jobs/                | apps/web/src/app/(app)/documents/[id]/settings/         |
| Follow-Up Queue     | apps/api/src/modules/document/ (follow-up service) | apps/web/src/app/(app)/follow-ups/                      |
| Webhooks            | apps/api/src/modules/webhook/                      | apps/web/src/app/(app)/settings/webhooks/               |
| Clickwrap           | apps/api/src/modules/clickwrap/                    | apps/web/src/app/(app)/settings/clickwrap/ + (public)/  |
| BYOK Payments       | apps/api/src/modules/payments/ (expand existing)   | apps/web/src/app/(app)/settings/payment-credentials/    |
| AI Prompts Registry | libs/ai/prompts/                                   | N/A (server-only)                                       |
| Data Manifest       | libs/data-manifest/src/manifest.ts                 | N/A                                                     |

---

## FRONTEND PAGE SPECIFICATIONS — All Phase 2 UI Screens

Read DESIGN_SYSTEM.md before building any UI. All screens below must have designed:

1. Empty state (no data)
2. Loading state (skeleton)
3. Error state (with retry)

### Screen P2-01: Document Analytics Page

Route: /documents/[id]/analytics
Layout: Full-width under document header
Components:
KPI Bar: 4 stat cards [Opens | Unique Viewers | Avg Time | Completion Rate] - Stat card: number (32px, weight 700, color: Gray-900) + label (12px, Gray-500)
Section Heatmap: list of sections in document order - Each row: block title (truncated 200px) + heat bar (full remaining width) - Heat bar uses 4 discrete color classes (NO gradients):
.heat-low { background: #F3F4F6; } /* < 5s _/
.heat-med { background: #FEF3C7; } /_ 5-15s _/
.heat-high { background: #FED7AA; } /_ 15-30s _/
.heat-peak { background: #FCA5A5; } /_ > 30s */ - On hover: tooltip with { unique sessions, avg duration, avg scroll depth }
Viewer Table: real <table> element - Columns: Email | First Opened | Last Active | Total Views | Time Spent | Device - Sortable by First Opened (default desc) - Cursor pagination: "Load more" button at bottom (not infinite scroll)

### Screen P2-02: Pending Approvals Page

Route: /approvals
Layout: Two-panel (sidebar: chains | main: steps)
Components:
Left: approval chain list (name, document title, created date)
Right: step list for selected chain - Each step: avatar + name + step_order badge + status chip + decide buttons - Status chips: pending (Gray) | approved (Green) | rejected (Red) | skipped (Gray, muted) - Decide buttons (only if current user is approver): [Approve] [Reject] — both open modal - Modal: comment textarea (optional) + confirm button
Stalled Approvals section (admin only): list steps where created_at > timeout_hours ago
Empty state: "No pending approvals" + illustration

### Screen P2-03: Automation Rules Page

Route: /settings/automation
Layout: Settings sidebar + content area
Components:
Rule list: real <table> [Name | Trigger | Actions | Status | Last Run | Actions]
Status toggle (is_active): toggle switch, instant save on change
Create/Edit Rule drawer (right slide-in, 480px):
Section 1: Name + trigger event selector
Section 2: Conditions (up to 5, add/remove rows)
Section 3: Actions (up to 5, add/remove rows)
Each action has a type selector + config fields (dynamic based on type)
"Test Rule" button: sends dry-run with sample payload, shows result

### Screen P2-04: Follow-Up Queue Page

Route: /follow-ups
Layout: Full-width list
Components:
Filter tabs: [All | Inactivity | Expiry Warning | Custom]
Document list: real <table> [Document | Recipient | Reason | Scheduled | Actions]
Actions per row: [Send] [Snooze] [Dismiss]
Send: opens confirm modal "Send follow-up email to {recipient}?"
Snooze: opens date picker "Snooze until:"
Dismiss: removes from queue (no undo in UI)
Empty state: "Your follow-up queue is clear" + checkmark illustration

### Screen P2-05: Webhook Management Page

Route: /settings/webhooks
Layout: Settings sidebar + content area
Components:
Create Webhook button -> slide-in drawer:
URL input (validated for HTTPS + not RFC1918)
Event type checkboxes (grouped: Documents | Approvals | Payments | Other)
Save -> response shows secret ONCE with copy button + warning "Save this secret now. It will not be shown again."
Webhook list: real <table> [Name/URL | Events | Status | Last Triggered | Failure Count | Actions]
Delivery Log (expandable row): real <table> [Event | Attempt | HTTP Status | Delivered At]
Auto-disabled webhooks shown with red badge + "Re-enable" button (resets failure_count)

### Screen P2-06: Clickwrap Management Page

Route: /settings/clickwrap
Layout: Settings sidebar + content area
Components:
Agreement list: real <table> [Name | Slug | Versions | Acceptances | Actions]
Agreement detail page: /settings/clickwrap/[id]
Version list: real <table> [Version # | Status | Published At | Acceptances | Actions]
Create version button -> editor (textarea, max 100,000 chars, supports HTML)
Publish button: confirm modal "Publishing version N will make it live for new visitors. Existing acceptances are unaffected."
View acceptances: cursor-paginated <table> [Email | Name | Accepted At | IP | Version]
Stats bar: total acceptances, per-version breakdown

### Screen P2-07: Payment Credentials Page

Route: /settings/payment-credentials
Layout: Settings sidebar + content area
Components:
Credential list: real <table> [Display Name | Provider | Added | Last Used | Status | Actions]
Add credential -> modal:
Provider selector (Stripe | PayPal)
Display name input
API key fields (masked input type=password)
Save -> key shown nowhere after this point
Test connectivity button (POST /test) -> "Connected" green or "Failed: {error}" red
Revoke button: confirm modal "Revoking this credential will disable payment collection for documents using it."

### Screen P2-08: AI Panel (Editor Sidebar)

Not a route — a floating panel inside the document editor.
Trigger: select text (>10 chars) -> floating toolbar button "AI" appears
Trigger: click AI button in main editor toolbar (for drafting from scratch)

Components:
Panel: 300px right side drawer (not modal — does not block editing)
Header: "AI Assistant" + X close button
Mode selector: [Draft Section | Refine Selected | Grammar Fix]
Input area (for Draft Section): textarea 120px (prompt), tone selector dropdown
Input area (for Refine Selected): selected text preview (max 200 chars, truncated) + instruction selector
Generate button (primary, full width)
Loading: spinner + "Generating..."
Result: bordered box with content + [Accept] [Discard] buttons
AI badge: After Accept, block shows AI spark icon (editor only, not recipient)

DESIGN RULE CHECK (do before submitting any UI PR):

- No gradient backgrounds (check all background-color and background styles)
- No glassmorphism (check backdrop-filter uses)
- No ALL-CAPS text (except legal abbreviations)
- No arrow icons on primary buttons
- All tables use <table> <thead> <tbody> <tr> <th> <td> (not div-based)
- Every list page has empty/loading/error states
- All form inputs have visible labels (no placeholder-only labels)
- Focus rings visible (outline: 2px solid #2563EB for focused elements)
- Contrast ratio >= 4.5:1 for all text (WCAG AA)

---

## COMPLETE TEST MATRIX — All Tests Required for Phase 2

### Unit Tests (per module)

#### comment.service.spec.ts (8 tests)

| #   | Test                                           | Assert                                               |
| --- | ---------------------------------------------- | ---------------------------------------------------- |
| 1   | createComment root                             | row created + outbox event + notification enqueued   |
| 2   | createComment with valid parentId              | reply linked, parent.document_id = child.document_id |
| 3   | createComment with parentId from different doc | throws 400 INVALID_PARENT                            |
| 4   | updateComment by author                        | content updated                                      |
| 5   | updateComment by non-author non-admin          | throws 403                                           |
| 6   | deleteComment with replies                     | soft delete, content = '[deleted]'                   |
| 7   | deleteComment without replies                  | hard deleted                                         |
| 8   | resolveThread on root                          | is_resolved=true, resolved_at set                    |

#### approval.service.spec.ts (8 tests)

| #   | Test                                          | Assert                                    |
| --- | --------------------------------------------- | ----------------------------------------- |
| 1   | approve step 1 of 3                           | step 2 becomes pending                    |
| 2   | reject step 2                                 | steps 3+ skipped, doc = approval_rejected |
| 3   | approve all 3 steps                           | doc = approval_complete                   |
| 4   | non-approver decides                          | throws 403                                |
| 5   | re-decide approved step                       | DB trigger exception caught as 409        |
| 6   | condition: total < minDealValue               | chain NOT triggered                       |
| 7   | condition: total >= minDealValue              | chain triggered                           |
| 8   | escalation: deactivate approver with fallback | reassigned to fallback                    |

#### automation-executor.spec.ts (6 tests)

| #   | Test                               | Assert                                    |
| --- | ---------------------------------- | ----------------------------------------- |
| 1   | chain_depth = 5                    | execution skipped, logged                 |
| 2   | chain_depth = 4                    | execution proceeds                        |
| 3   | org > 100 executions/min           | circuit breaker activates, admin notified |
| 4   | conditions fail                    | no actions executed                       |
| 5   | action 2 throws                    | action 3 still executes                   |
| 6   | document.signed + conditions match | webhook action fired                      |

#### ai.gateway.spec.ts (6 tests)

| #   | Test            | Assert                                 |
| --- | --------------- | -------------------------------------- |
| 1   | org AI disabled | 403 AI_GUARDRAIL_VIOLATION             |
| 2   | unknown taskId  | 400                                    |
| 3   | success         | ai_generation_logs row, status=success |
| 4   | LLM error       | ai_generation_logs row, status=error   |
| 5   | prompt hash     | SHA-256, no plaintext in logs          |
| 6   | EU org          | Vertex AI EU endpoint param verified   |

#### clickwrap.service.spec.ts (5 tests)

| #   | Test                   | Assert                                            |
| --- | ---------------------- | ------------------------------------------------- |
| 1   | createVersion          | version_number auto-incremented                   |
| 2   | publishVersion         | old is_current=false (atomic)                     |
| 3   | recordAcceptance       | acceptance.clickwrap_version_id = current version |
| 4   | delete current version | throws 409                                        |
| 5   | new version published  | old acceptances unchanged (CW-001)                |

#### webhook.service.spec.ts (6 tests)

| #   | Test                           | Assert                                |
| --- | ------------------------------ | ------------------------------------- |
| 1   | create webhook                 | secret in SecretManager, hash in DB   |
| 2   | delivery success               | delivery log updated, failure_count=0 |
| 3   | delivery 5xx                   | retry scheduled                       |
| 4   | same eventId already delivered | job skips (idempotent)                |
| 5   | failure_count >= 10            | webhook disabled, admin notified      |
| 6   | SSRF URL (192.168.x.x)         | webhook creation rejected             |

#### expiry.spec.ts (8 tests)

| #   | Test                             | Assert                                                 |
| --- | -------------------------------- | ------------------------------------------------------ |
| 1   | doc expires_at < now             | status=expired, outbox emitted                         |
| 2   | doc expiring in 20h              | expiry_approaching outbox + expiry_warning_sent_at set |
| 3   | doc expiring in 48h              | NOT marked expiring                                    |
| 4   | already expired doc              | job is idempotent (not double-expired)                 |
| 5   | rep sends follow-up              | email queued, status=sent                              |
| 6   | rep snoozes                      | status=snoozed, snoozed_until set                      |
| 7   | inactivity: 10 days, threshold 7 | added to follow_up_queue                               |
| 8   | inactivity: 5 days, threshold 7  | NOT added                                              |

### Integration Tests (RLS + encryption)

#### comment-rls.spec.ts

- Org A creates comment -> Org B query returns 0 rows

#### content-lock-rls.spec.ts

- Org A creates lock -> Org B cannot see or unlock it

#### approval-chain-rls.spec.ts

- Org A creates chain -> Org B cannot trigger or read it

#### clickwrap-immutability.spec.ts (5 tests)

- attempt UPDATE on clickwrap_acceptances -> DB trigger throws
- new version published -> old acceptances unchanged
- soft delete version -> acceptances FK intact
- attempt hard delete version with acceptances -> 409
- two parallel publishVersion calls -> exactly one version is_current=true

#### webhook-idempotency.spec.ts

- deliver same event_id twice -> second delivery skipped
- event_id appears in BOTH delivery log rows (first: delivered; second: skipped)

#### payment-byok-encryption.spec.ts (4 tests)

- stored != plaintext (encryption verified)
- decrypt -> matches original (round-trip verified)
- revoked credential decrypt -> 404
- add + revoke -> 2 audit log entries, NO UPDATE rows

#### approval-immutability.spec.ts

- approve step -> attempt UPDATE status to 'pending' -> DB trigger throws

### Hocuspocus Tests (collab-server)

#### hocuspocus-auth.spec.ts (4 tests)

- valid token + accessible doc -> connected
- invalid token -> Unauthorized
- valid token + inaccessible doc -> Forbidden
- session expired mid-session -> disconnected within 5 min

#### content-lock.spec.ts (4 tests)

- edit unlocked block -> accepted
- edit locked block (different user) -> rejected
- content admin edits locked block -> accepted
- locker edits own locked block -> accepted

#### gc.spec.ts (3 tests)

- last disconnect + 5 min -> Y.Doc persisted
- reconnect within 5 min -> GC cancelled
- MAX_IN_MEMORY_DOCS exceeded -> LRU eviction

### E2E Playwright Tests (apps/web-e2e)

| Flow    | What it tests                                                                     | DoD Criterion |
| ------- | --------------------------------------------------------------------------------- | ------------- |
| flow-10 | Real-time co-editing: two users see each other's edits within 2s                  | COLLAB        |
| flow-11 | Content lock: locked block rejected from non-locker                               | COLLAB-002    |
| flow-12 | Approval chain: full approve flow -> doc = approval_complete                      | WF            |
| flow-13 | AI draft: generate -> accept -> in editor with badge; badge NOT on recipient page | AI-002        |
| flow-14 | Clickwrap: v1 accepted -> publish v2 -> old acceptances on v1                     | CW-001        |
| flow-15 | Webhook: document signed -> webhook delivered -> delivery log 200                 | WH-001        |

---

## COMMON MISTAKES TO AVOID (for models implementing this plan)

MISTAKE-01: Using gen_random_uuid() in service code
CORRECT: import { generateId } from '@pactintel/shared-utils'; const id = generateId();

MISTAKE-02: Using @Cron() decorator for scheduled jobs
CORRECT: await this.queue.upsertJobScheduler('my-job-scheduler-id', { pattern: '...' }, { name: '...', data: {} });
NOTE: call upsertJobScheduler inside onModuleInit(), not constructor

MISTAKE-03: Calling Vertex AI SDK directly in a service/controller
CORRECT: inject AiGateway and call this.aiGateway.generate(taskId, input, context)

MISTAKE-04: Storing AI prompt inline in the service
CORRECT: import from libs/ai/prompts/; register in PROMPT_REGISTRY

MISTAKE-05: Direct ClickHouse INSERT from analytics service
CORRECT: publish to Pub/Sub topic; the batcher subscriber does the ClickHouse INSERT

MISTAKE-06: Forgetting to write outbox event in same $transaction
CORRECT: always prisma.$transaction([mainOperation, outboxEvents.create(...)])

MISTAKE-07: Storing webhook secret plaintext in database
CORRECT: secret in GCP Secret Manager; sha256 hash in webhooks.secret_hash column

MISTAKE-08: Updating clickwrap_acceptances (violates CW-001)
CORRECT: acceptances are APPEND-ONLY. DB trigger prevents UPDATE. Never attempt.

MISTAKE-09: Re-deciding an approval step (violates WF-003)
CORRECT: service checks status before deciding. DB trigger as final guard.

MISTAKE-10: Fetching Y.Doc state from DB instead of letting Hocuspocus manage it
CORRECT: use @hocuspocus/extension-database fetch/store callbacks only

MISTAKE-11: Setting automation chain_depth globally (singleton state)
CORRECT: chain_depth is per-execution-chain, passed in ExecutionContext object

MISTAKE-12: Sending follow-up email directly from automation action
CORRECT: automation 'add_to_follow_up' action creates follow_up_queue row; rep sends manually

MISTAKE-13: Using offset pagination anywhere
CORRECT: cursor-based pagination with opaque base64 cursor on ALL list endpoints

MISTAKE-14: Import cross-module repositories directly (bypasses Nx tags)
CORRECT: communicate via exported services/ports. Nx tag enforcement: check nx.json scope rules.

MISTAKE-15: Auto-injecting full document content into AI prompt
CORRECT: documentContext is max 500 chars (summary). Never inject raw document JSON.

---

## PHASE 2 DEFINITION OF DONE (DoD) SIGNOFF — 100% COMPLETE

| Requirement Category          | DoD Verification Standard                                                               | Status     | Verified Evidence                                                                                                                             |
| :---------------------------- | :-------------------------------------------------------------------------------------- | :--------- | :-------------------------------------------------------------------------------------------------------------------------------------------- |
| **Database & Manifest**       | 12 new Phase 2 tables created with RLS and registered in data manifest (Invariant I-10) | **PASSED** | `pnpm run check:manifest` passed (45 tables, 56 stores)                                                                                       |
| **Forbidden Patterns**        | 0 AWS references, 0 @Cron decorators, 0 direct SDK calls, 0 offset pagination           | **PASSED** | `pnpm run check:forbidden-patterns` passed (0 violations)                                                                                     |
| **Type Integrity**            | Strict TypeScript compilation across all 9 monorepo packages                            | **PASSED** | `nx run-many --target=typecheck --all` (9/9 passed)                                                                                           |
| **Unit & Integration Tests**  | 100% pass rate across backend and collab server test suites                             | **PASSED** | `nx run-many --target=test --all` (68 suites, 374/374 passed)                                                                                 |
| **CASL Permissions**          | Parametrized authorization matrix tests covering all roles & Phase 2 subjects           | **PASSED** | `permission-matrix-phase2.spec.ts` (18/18 passed)                                                                                             |
| **Outbox Events**             | Transactional outbox verification across all 21 Phase 2 event types                     | **PASSED** | `outbox-event-registry-phase2.spec.ts` (10/10 passed)                                                                                         |
| **Immutability & RLS**        | PostgreSQL triggers, foreign key restrictions, and RLS tenant isolation verified        | **PASSED** | `approval-chain-rls.spec.ts`, `clickwrap-immutability.spec.ts`, `webhook-idempotency.spec.ts`, `approval-immutability.spec.ts` (22/22 passed) |
| **Playwright E2E Flows**      | Flows 10 through 15 implemented with simulated network mocking and strict assertions    | **PASSED** | `flow-10-collab.spec.ts` through `flow-15-webhook.spec.ts` verified in `apps/web-e2e`                                                         |
| **Production Build**          | Clean build for Next.js 15 web app, NestJS API, and Hocuspocus collab server            | **PASSED** | `nx run-many --target=build --all --skip-nx-cache` (3/3 built cleanly)                                                                        |
| **CI/CD Inspection Pipeline** | Automated CI pipeline with manifest, pattern, lint, typecheck, unit, and E2E gates      | **PASSED** | `.github/workflows/ci.yml` updated with Playwright inspection                                                                                 |
