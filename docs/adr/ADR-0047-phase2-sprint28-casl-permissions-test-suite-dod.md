# ADR-0047: Phase 2 Sprint 2.8 — CASL Permissions, Outbox Event Registry, E2E Test Suite, and CI/CD Quality Gates

## Context

Phase 2 introduces extensive multi-user collaboration and workflow modules across PactIntel:

1. Section Analytics (Sprint 2.1)
2. Real-Time Collaborative Editing via Hocuspocus & Yjs (Sprint 2.2)
3. Block-Level Comments & Content Locking (Sprint 2.3)
4. Multi-Step Approval Workflows & Automation Rules Engine (Sprint 2.4)
5. In-Editor AI Drafting via AiGateway (Sprint 2.5)
6. Document Expiry, Inactivity Reminders & Follow-Up Queue (Sprint 2.6)
7. Webhooks / Zapier Integrations, Clickwrap Agreements & BYOK Payment Credentials (Sprint 2.7)

As a legal-technology platform governing binding agreements, signatures, and payments, access control, auditability, data integrity, and automated inspection are non-negotiable requirements. Sprint 2.8 establishes the comprehensive CASL permission matrix extensions, outbox event verification, multi-user end-to-end Playwright tests, and automated CI inspection pipelines to guarantee the Phase 2 Definition of Done.

## Decisions

### 1. CASL Ability Matrix Extensions

- **Subject Coverage**: Ensure `Comment`, `ContentLock`, `ApprovalChain`, `ApprovalStep`, `AutomationRule`, `FollowUpQueueItem`, `AiFeature`, `Webhook`, `ClickwrapAgreement`, `ClickwrapVersion`, `ClickwrapAcceptance`, and `PaymentCredential` are strictly evaluated.
- **Role Permissions**:
  - `admin`: Full management of all subjects except deleting the root Organization (owner only).
  - `manager`: Can manage comments, content locks, approval chains, automation rules, follow-up items, and use AI. Explicitly denied from managing webhooks and payment credentials (admin only).
  - `member`: Can create comments and update/delete own comments; read content locks (cannot create); read approval steps (cannot decide); read approval chains (cannot create); manage own follow-up items; use AI. Explicitly denied from managing automation rules, webhooks, clickwrap agreements, and payment credentials.
  - `collaborator`: Can read and create comments; read content locks. Explicitly denied from using AI features, deciding approval steps, or managing administrative entities.

### 2. Transactional Outbox Event Registry

- Architecture Invariant **I-06** mandates that every mutation side-effect must emit an `outbox_events` record within the exact same database transaction.
- All 21 Phase 2 event types (`comment.created`, `comment.resolved`, `content_lock.acquired`, `content_lock.released`, `approval.step.decided`, `approval.chain.approved`, `approval.chain.rejected`, `approval.step.auto_reassigned`, `automation.executed`, `document.expiry_approaching`, `document.expired`, `follow_up.sent`, `ai.content.generated`, `webhook.delivered`, `webhook.failed`, `webhook.auto_disabled`, `clickwrap.version.created`, `clickwrap.version.published`, `clickwrap.acceptance.recorded`, `payment_credential.added`, `payment_credential.revoked`) are covered and validated.

### 3. Integration & Immutability Test Suite

- **RLS Isolation**: Cross-tenant separation enforced for `content_locks` and `approval_chains` (`tenant_isolation` policy checking `organization_id`).
- **Clickwrap Immutability (`RULE CW-001`)**: Database triggers and service guards prevent mutating acceptances; publishing new versions preserves historical acceptance mappings.
- **Webhook Idempotency (`RULE WH-001`)**: Unique `event_id` deduplication prevents duplicate dispatches.
- **Approval Immutability (`RULE WF-003`)**: Re-deciding an already approved or rejected step is prohibited by service and database constraints.

### 4. End-to-End Playwright Journeys (Flows 10 to 15)

- Automated Playwright flows verifying real-time co-editing (`flow-10-collab`), content lock visual indication and edit rejection (`flow-11-content-lock`), multi-step approval workflow (`flow-12-approval`), in-editor AI drafting with recipient badge stripping (`flow-13-ai-draft`), clickwrap public consent capture (`flow-14-clickwrap`), and webhook event delivery (`flow-15-webhook`).

### 5. Automated CI/CD Pipeline Inspection

- Continuous integration runs automated checks across data manifest adherence (`Invariant I-10`), forbidden pattern AST linting (`Invariants I-01..I-15`), strict TypeScript verification across all apps and libs, unit/integration test execution, monorepo production bundling, and Playwright verification.

## Consequences

- Zero unauthorized access to administrative or AI capabilities by restricted roles.
- Complete auditability across all mutations via transactional outbox events.
- Strict enforcement of Phase 2 Definition of Done on every pull request.
