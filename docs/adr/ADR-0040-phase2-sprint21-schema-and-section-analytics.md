# ADR-0040: Phase 2 Schema Extensions and Section-Level Engagement Analytics

**Status:** Accepted  
**Date:** 2026-10-24  
**Authors:** System Architecture Team  
**Related:** [Blueprint §3, §12, §16, §20](../MASTER_IMPLEMENTATION_BLUEPRINT.md), [Product Blueprint §6](../PRODUCT_BLUEPRINT.md), [Design System §2, §8](../DESIGN_SYSTEM.md), [Phase 2 Build Plan](../../phase2_build_plan.md)

---

## Context

Phase 1 established the foundation for core document lifecycle, e-signature orchestration, CPQ interactive pricing, custom domains, CRM sync, and basic document viewing telemetry.
Phase 2 introduces deep collaborative and engagement capabilities:

1. Threaded block-level comments and server-enforced content locks
2. Multi-step approval workflows with timeout escalations and automation rules
3. Follow-up rep review queue and AI generation audit logging
4. Webhooks (Zapier integration) with HMAC signing and delivery idempotency
5. Clickwrap agreements with immutable acceptance records
6. Bring Your Own Key (BYOK) envelope-encrypted payment credentials
7. High-resolution section-level viewer engagement analytics and heatmap visualization

To support these capabilities without architectural drift or violation of Invariants I-01 through I-15, the database schema, data manifest, event buffering architecture, and analytics APIs must be codified before module feature code is introduced.

---

## Decisions

### 1. Database Schema Additions (PostgreSQL 17 / Cloud SQL)

All 12 Phase 2 tables are added via migration `0003_phase2_additions`:

- `document_comments`: Threaded, block-anchored discussions with resolution tracking.
- `content_locks`: Server-enforced block locking with user attribution.
- `approval_chains`: Workspace approval workflows conditioned on deal values and triggers.
- `approval_steps`: Sequential approver steps with database-level immutability triggers (`prevent_approval_step_remutation`, RULE WF-003).
- `automation_rules`: Org-scoped rule triggers with condition matching and action dispatch.
- `follow_up_queue`: Rep review digest queue for inactivity and expiry nudges (RULE FOLLOW-001).
- `ai_generation_logs`: Audit trail for AI requests with prompt hashing (`sha256`) and token metrics (RULE AI-002).
- `webhooks` / `webhook_delivery_logs`: Outbound event subscriptions with HMAC secrets stored in GCP Secret Manager and per-attempt delivery logging (RULE WH-001).
- `clickwrap_agreements`, `clickwrap_versions`, and `clickwrap_acceptances`: Terms consent capture with append-only database triggers (`prevent_clickwrap_acceptance_mutation`, RULE CW-001).
- Document version and document table additions: `yjs_state` BYTEA on `document_versions` and document expiry/reminder columns (`expires_at`, `inactivity_reminder_days`, `last_viewed_at`).

Every tenant table enforces Row-Level Security (`ENABLE ROW LEVEL SECURITY`) with `app.current_tenant` parameter matching (MT-001). UUIDv7 via `generateId()` is used exclusively for application PKs.

### 2. High-Volume Section Analytics Store (ClickHouse Cloud + Pub/Sub Buffer)

In compliance with Invariant I-10, AN-001, and ACC-001:

- Direct ClickHouse inserts from client or web servers are strictly prohibited.
- High-volume telemetry (`section_view` events) enters through `POST /api/v1/analytics/section-events` (unauthenticated, validated by documentSlug and sessionId).
- Section view events are validated against duration anomalies (max 50 events per batch, sum of durations per session per minute capped at 120,000ms to eliminate replay attacks).
- Events are buffered via Pub/Sub (or fast in-memory buffer in dev/test) before micro-batch insertion into ClickHouse table `section_views`.
- Aggregated metrics (`GET /api/v1/documents/:id/analytics/sections`) are cached for 5 minutes in Redis Cache.
- Buffer failures degrade gracefully (RULE I-12): never return 5xx errors to the recipient page.

### 3. Analytics Dashboard & Recipient Tracking Instrumentation

- Recipient tracking: Uses `IntersectionObserver` with thresholds `[0.25, 0.5, 0.75, 1.0]`. Events are batched and flushed every 10 seconds or on page hide (`visibilitychange`).
- Analytics dashboard: Follows `DESIGN_SYSTEM.md` specifications strictly.
  - Three distinct panels: Overview KPI cards, Section Heatmap with discrete color buckets (`.heat-low`, `.heat-med`, `.heat-high`, `.heat-peak`), and real `<table>` Viewer Sessions.
  - No gradients, no glassmorphism, cool slate neutrals, Inter typography, and full Empty/Loading/Error states.

---

## Consequences

### Positive

- Strict isolation of high-volume telemetry from transactional PostgreSQL storage.
- Immutable legal evidence guarantees for approvals, clickwraps, and audit logs enforced at database engine level.
- Complete data manifest coverage enabling CI-automated compliance verification.
- Zero breaking changes to existing Phase 0/1 APIs and schema.

### Negative / Trade-offs

- Section analytics queries require caching to prevent heavy aggregation load on analytics stores.
- Client-side instrumentation requires debounced batching to manage network overhead on mobile devices.
