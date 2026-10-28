# PactIntel Phase 3 Build Plan

## Scale / Enterprise Readiness - Ultra-Comprehensive Implementation Guide

### Engineered for Gemini Flash Models to Execute at Claude Opus-Level Fidelity

---

## MANDATORY PRE-FLIGHT INSTRUCTIONS (Read before any code)

Before touching a single file in this phase, every implementing agent or engineer MUST:

1. Read docs/MASTER_IMPLEMENTATION_BLUEPRINT.md (ALL sections - especially section 0 invariants,
   section 3 schema, section 5 security, section 12 Phase 3, section 13 edge cases).
2. Read docs/DESIGN_SYSTEM.md (ALL sections, especially section 15 anti-patterns list).
3. Read AGENTS.md (ALL invariants I-01 through I-15 and the forbidden patterns table).
4. Read phase2_build_plan.md to understand what Phase 2 delivered.
5. Verify Phase 2 Definition of Done is 100% complete before starting Sprint 3.1.
6. Check Blueprint section 12 Phase 3 scope - do NOT build anything that belongs to Phase 4.

If you are a Flash or mini model: Every numbered rule, every schema column, every test case
listed in this plan is mandatory. Do NOT skip, simplify, or optimize away any item.
If uncertain, stop and ask rather than guess.

---

## Architecture Invariants (Apply to Every Sprint in Phase 3)

Violation of any invariant = stop and revert immediately.

I-01: Defer capacity, never structure. Structure is final on Day 1. Capacity is raised by config.
I-02: No cross-cell database joins or foreign keys. Cells exchange only signed events.
I-03: Every tenant-owned datum lives in exactly one cell (its home cell).
I-04: Everything is infrastructure-as-code. Zero console-created GCP resources.
I-05: Every external dependency sits behind a port with at least one tested adapter.
I-06: Every side-effect goes through the transactional outbox. Consumers are idempotent.
I-07: No @Cron in application code. All schedules via BullMQ job schedulers or Cloud Scheduler.
I-08: Public identifiers, API contracts, token formats, hostnames are permanent and versioned.
I-09: Sealed (signed) content is never migrated. Only read-time upcasting. Canonical bytes stored.
I-10: Every datastore, table, bucket prefix, Redis keyspace is registered in libs/data-manifest.
I-11: Key hierarchy is fixed. No per-tenant CMK by default. Use TK-based crypto-shredding.
I-12: Non-critical dependencies degrade gracefully. Readiness reflects only critical dependencies.
I-13: Per-tenant quotas and fair queues (noisy-neighbor controls) exist from Day 1.
I-14: Everything is region-aware: telemetry, email, AI, analytics, backups, replication.
I-15: Every scale trigger maps to a documented lever that is a configuration change.

## Forbidden Patterns (Any of these = immediate revert, no exceptions)

- Any AWS service reference (ECS, Fargate, S3, Aurora, RDS, ElastiCache, SES, Lambda, etc.)
- Fly.io, Supabase, Upstash, EKS, Kubernetes (except GKE if ADR-0036 requires it)
- @Cron or @nestjs/schedule in application code
- EventEmitter2 as a cross-module mechanism (outbox events only)
- Vendor SDK imports outside libs/ai/adapters/ or libs/ports/adapters/ packages
- Direct cross-module database access bypassing repository/port layer
- Console-created GCP resources (everything must be IaC)
- gen_random_uuid() as a primary-key default (use UUIDv7 via generateId())
- Offset pagination (cursor/keyset pagination only with opaque cursors)
- Inline prompts in application code (all prompts in libs/ai/prompts/)
- Provider/model names in feature code (task IDs through AiGateway only)
- Unregistered tables or stores (no data-manifest entry)
- bcrypt/Argon2 for API key hashing per-request (use SHA-256 or peppered HMAC)
- Cross-tenant retrieval or cache sharing in AI
- minio/minio Docker image (use SeaweedFS/Garage)

---

## Phase 3 Overview

Estimated Duration: 16-20 weeks (12 sprints of approximately 1.5 weeks each)

Goal: Enterprise features, compliance, and platform maturity. After Phase 3 completion,
PactIntel must be:

- SOC 2 Type II certified (formal audit passed)
- Full CPQ layer with bundles, rules engine, guided-selling playbooks
- Deal Rooms live and in use by customers
- Portfolio Agreement Intelligence operational
- Advanced AI (guided proposal builder, data extraction at portfolio scale)
- ID-Verification signing (KBA, Gov ID, QES)
- Risk-Adaptive Identity Verification
- Multi-Workspace with parent-account oversight
- SAML SSO configured via WorkOS
- Advanced analytics with custom report builder
- Standalone Forms fully live
- Full REST API with SDK, Postman collection, OpenAPI spec
- Mobile app architecture fully designed (implementation deferred until demand)

Sprint Map:

- Sprint 3.1: Full CPQ + Bundles + Pricing Rules Engine + Approval Thresholds (1.5 wks)
- Sprint 3.2: Workflow Orchestration Visual Builder (1.5 wks)
- Sprint 3.3: Deal Rooms Full Implementation (1.5 wks)
- Sprint 3.4: Guided AI Proposal Builder (1.5 wks)
- Sprint 3.5: AI Data Extraction + Portfolio Intelligence (2 wks)
- Sprint 3.6: ID-Verification Signing KBA + Gov ID + QES (1.5 wks)
- Sprint 3.7: Risk-Adaptive Identity Verification (1 wk)
- Sprint 3.8: Multi-Workspace + Parent-Account Oversight (1.5 wks)
- Sprint 3.9: SAML SSO + SOC 2 Audit Prep (1 wk)
- Sprint 3.10: Advanced Analytics + Custom Report Builder (1.5 wks)
- Sprint 3.11: Standalone Forms Full Build (1.5 wks)
- Sprint 3.12: Full REST API + SDKs + Mobile App Architecture (2 wks)

---

## Pre-Phase-3 Verification Checklist

Run all checks before starting Sprint 3.1. If any fail, fix Phase 2 first.

pnpm nx run-many --target=test --all
pnpm nx run api:test --testPathPattern=rls
pnpm nx run api:test --testPathPattern=casl
pnpm nx run api:validate-manifest
pnpm nx run-many --target=lint --all
pnpm nx run api:test --testPathPattern=boldsign-reconciliation
pnpm nx run collab-server:test
pnpm nx run api:test --testPathPattern=outbox

Expected: All green. Zero failing tests. Zero lint violations.

---

## Sprint 3.1 - Full CPQ + Bundles + Pricing Rules Engine + Approval Thresholds

### Context and Phase 2 Baseline

Phase 2 delivered Basic CPQ: product catalog CRUD, line-item discounting, fee library (Sprint 2.8).
Phase 3 Sprint 3.1 extends this to the FULL CPQ layer that rivals enterprise tools.

### What Gets Built

1. Product Bundle Builder
   - A bundle is an ordered set of ProductCatalogItems sold together at a bundle price
   - Bundles can have: fixed price, sum-of-items price, or percent-of-list discount
   - Optional/required line items within a bundle (buyer can deselect optional items)
   - Bundle versioning: when a bundle is updated, existing documents using it are unaffected
     (copy-on-create semantics, same as templates)
   - CRM-synced bundles: bundle selections written back to the connected CRM deal record

2. Pricing and Discount Rules Engine
   - Org-level rules that auto-apply to pricing tables
   - Rule types:
     a. Volume discount: quantity >= N, apply D% discount to that line item
     b. Deal-value threshold: total >= X, unlock a special discount tier
     c. Customer-segment rule: if CRM field matches a value, apply segment pricing
     d. Time-based rule: discount valid only between date A and date B
     e. Stacking rule: define whether multiple rules can stack or highest-wins
   - Rules apply at document-creation time AND at document-send time (re-evaluation)
   - If rules change after a document is sent, the sent document is NOT affected
     (copy-on-create; the send action creates a locked version)
   - Admin UI: visual rule builder with preview (shows sample quote before/after rule)

3. Guided-Selling Playbooks
   - A playbook is a pre-configured CPQ flow the admin builds for reps
   - Playbook steps: (1) capture deal attributes (industry, company size, region),
     (2) auto-filter the product catalog to eligible items, (3) suggest bundles,
     (4) auto-apply the right discount rules, (5) flag items needing approval
   - Playbooks reduce quoting time from hours to minutes
   - Playbooks are workspace-scoped (different workspaces can have different playbooks)

4. CPQ Approval Thresholds
   - Approval chains (from Phase 2) can now be triggered by CPQ-specific conditions:
     a. Total deal value > requires manager approval
     b. Discount percentage > Y% requires finance approval
     c. Bundle contains a restricted product requires legal approval
   - Threshold rules are configured in the CPQ Workspace admin panel
   - When a threshold is triggered, document send is blocked until all approvals are collected
   - The approval UI shows the threshold that triggered it and the approval chain progress

5. Native CRM-Embedded CPQ Experience
   - HubSpot: a CPQ iframe sidebar inside the HubSpot Deal page
   - Salesforce: a CPQ component inside Opportunity
   - Allows reps to build a quote without leaving their CRM
   - Quote data syncs bidirectionally (quote total, line items back to CRM deal fields)

### Database Schema Changes

New table: product_bundles
id TEXT PRIMARY KEY (UUIDv7 via generateId())
organization_id UUID NOT NULL REFERENCES organizations(id)
workspace_id UUID NOT NULL REFERENCES workspaces(id)
name TEXT NOT NULL
description TEXT
bundle_type TEXT NOT NULL CHECK (bundle_type IN ('fixed','sum_of_items','percent_discount'))
fixed_price NUMERIC(15,4)
discount_percent NUMERIC(5,2)
is_active BOOLEAN NOT NULL DEFAULT true
version INTEGER NOT NULL DEFAULT 1
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
deleted_at TIMESTAMPTZ

New table: bundle_items
id TEXT PRIMARY KEY (UUIDv7)
bundle_id TEXT NOT NULL REFERENCES product_bundles(id) ON DELETE CASCADE
organization_id UUID NOT NULL REFERENCES organizations(id)
product_item_id UUID NOT NULL REFERENCES product_catalog_items(id)
is_required BOOLEAN NOT NULL DEFAULT true
sort_order INTEGER NOT NULL DEFAULT 0
quantity NUMERIC(15,4) NOT NULL DEFAULT 1
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at TIMESTAMPTZ NOT NULL DEFAULT now()

New table: pricing_rules
id TEXT PRIMARY KEY (UUIDv7)
organization_id UUID NOT NULL REFERENCES organizations(id)
workspace_id UUID NOT NULL REFERENCES workspaces(id)
name TEXT NOT NULL
rule_type TEXT NOT NULL CHECK (rule_type IN (
'volume_discount','deal_value_threshold','customer_segment',
'time_based','stacking_policy'))
conditions JSONB NOT NULL DEFAULT '{}'
actions JSONB NOT NULL DEFAULT '{}'
priority INTEGER NOT NULL DEFAULT 0
stacking_mode TEXT NOT NULL DEFAULT 'highest_wins'
CHECK (stacking_mode IN ('stack_all','highest_wins','first_match'))
is_active BOOLEAN NOT NULL DEFAULT true
valid_from TIMESTAMPTZ
valid_until TIMESTAMPTZ
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
deleted_at TIMESTAMPTZ

New table: cpq_playbooks
id TEXT PRIMARY KEY (UUIDv7)
organization_id UUID NOT NULL REFERENCES organizations(id)
workspace_id UUID NOT NULL REFERENCES workspaces(id)
name TEXT NOT NULL
description TEXT
steps JSONB NOT NULL DEFAULT '[]'
is_active BOOLEAN NOT NULL DEFAULT true
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
deleted_at TIMESTAMPTZ

Modify existing table: approval_chains
ADD COLUMN cpq_conditions JSONB NOT NULL DEFAULT '{}'
(threshold rules: deal_value_gt, discount_pct_gt, restricted_product_ids)

IMPORTANT: ALL new tables require:

- organization_id column with NOT NULL constraint
- Index on organization_id
- ALTER TABLE <table> ENABLE ROW LEVEL SECURITY
- CREATE POLICY tenant_isolation ON <table>
  USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
  WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
- Entry in libs/data-manifest (CI will reject the migration otherwise)

### Backend Implementation

Module: apps/api/src/modules/cpq/

Files to create:
cpq.module.ts
cpq.controller.ts (REST endpoints listed below)
cpq.service.ts (business logic)
cpq.repository.ts (thin Prisma wrapper)
cpq-rules.engine.ts (pricing rules evaluation - pure functions, fully testable)
cpq-playbook.service.ts (playbook execution)
dto/
create-bundle.dto.ts
update-bundle.dto.ts
bundle-response.dto.ts
create-pricing-rule.dto.ts
pricing-rule-response.dto.ts
create-playbook.dto.ts
playbook-response.dto.ts
evaluate-cpq.dto.ts (input for rules evaluation: line items, deal attributes)
cpq-evaluation-result.dto.ts
events/
bundle-created.event.ts
pricing-rule-activated.event.ts
listeners/
cpq-event.listener.ts
**tests**/
cpq.service.spec.ts
cpq-rules.engine.spec.ts
cpq.controller.spec.ts
cpq.e2e-spec.ts

REST Endpoints:

Bundles:
POST /api/v1/cpq/bundles Create bundle
GET /api/v1/cpq/bundles List bundles (cursor paginated)
GET /api/v1/cpq/bundles/:id Get bundle with items
PATCH /api/v1/cpq/bundles/:id Update bundle (creates new version if sent docs exist)
DELETE /api/v1/cpq/bundles/:id Soft-delete bundle

Bundle items:
POST /api/v1/cpq/bundles/:id/items Add item to bundle
PATCH /api/v1/cpq/bundles/:id/items/:itemId Update item
DELETE /api/v1/cpq/bundles/:id/items/:itemId Remove item

Pricing rules:
POST /api/v1/cpq/rules Create rule
GET /api/v1/cpq/rules List rules
PATCH /api/v1/cpq/rules/:id Update rule
DELETE /api/v1/cpq/rules/:id Soft-delete rule
POST /api/v1/cpq/rules/evaluate Evaluate rules for a given quote (preview)

Playbooks:
POST /api/v1/cpq/playbooks Create playbook
GET /api/v1/cpq/playbooks List playbooks
GET /api/v1/cpq/playbooks/:id Get playbook
PATCH /api/v1/cpq/playbooks/:id Update playbook
DELETE /api/v1/cpq/playbooks/:id Soft-delete playbook
POST /api/v1/cpq/playbooks/:id/execute Execute playbook for a given set of deal attributes

### CPQ Rules Engine Implementation

The rules engine is a pure function (no side effects, no DB calls) for testability.

File: apps/api/src/modules/cpq/cpq-rules.engine.ts

export interface CpqEvaluationContext {
lineItems: LineItem[]
dealAttributes: Record<string, string | number | boolean>
orgId: string
timestamp: Date
}

export interface CpqEvaluationResult {
appliedRules: AppliedRule[]
finalLineItems: LineItem[]
totalBeforeDiscount: number
totalAfterDiscount: number
discountAmount: number
requiresApproval: boolean
approvalReasons: string[]
}

export function evaluateCpqRules(
context: CpqEvaluationContext,
rules: PricingRule[],
): CpqEvaluationResult {
// 1. Filter active rules valid at context.timestamp
// 2. Sort by priority (lower number = higher priority)
// 3. Apply each rule, respecting stacking_mode
// 4. Accumulate applied rules, discounts
// 5. Check approval thresholds
// 6. Return result
}

NEVER call the database inside evaluateCpqRules. Fetch data before calling it.
NEVER call external APIs inside evaluateCpqRules.
This function must be pure and deterministic for testing.

### CASL Permissions for CPQ

Add to ability.factory.ts:

Owner/Admin: can manage all CPQ subjects (Bundle, PricingRule, Playbook)
Manager: can manage CPQ if workspace admin or if granted CPQ admin overlay
Member: can read Bundle, PricingRule, Playbook; can use them in documents
Collaborator: cannot manage CPQ

New CASL subjects: Bundle, PricingRule, Playbook, CpqApproval

### ADR Required

Before implementing: create docs/adr/ADR-0048-phase3-sprint31-full-cpq-rules-engine.md

ADR must document:

- Decision to implement rules engine as pure function (not a stored procedure)
- Stacking mode design choices
- CRM-embedded CPQ scope (iframe approach)
- Approval threshold integration with existing approval_chains table

### Tests Required (All Must Pass Before Sprint is Done)

Unit tests (cpq.service.spec.ts):

- createBundle() creates bundle with correct version number
- updateBundle() when existing docs use bundle, creates new version
- evaluateRules() volume discount applies correctly
- evaluateRules() multiple rules with highest_wins stacking
- evaluateRules() multiple rules with stack_all stacking
- evaluateRules() time_based rule ignored when outside valid range
- evaluateRules() deal_value_threshold triggers approval requirement
- evaluateRules() discount_pct_gt triggers approval requirement
- evaluateRules() restricted_product triggers approval requirement
- executePlaybook() returns filtered catalog for given deal attributes

Integration tests (cpq.e2e-spec.ts):

- POST /api/v1/cpq/bundles returns 201 with bundle ID (Admin role)
- POST /api/v1/cpq/bundles returns 403 for Member role
- POST /api/v1/cpq/rules/evaluate returns correct discounts for test data
- RLS: Org A cannot see Org B bundles
- Approval threshold: document send blocked when threshold triggered
- Approval threshold: document send allowed after approval collected

### Definition of Done for Sprint 3.1

- [ ] All 4 new tables created via Prisma migration
- [ ] RLS enabled on all 4 tables
- [ ] All tables registered in libs/data-manifest
- [ ] All CASL rules implemented and tested
- [ ] REST API endpoints all implemented (see list above)
- [ ] Rules engine is a pure function with 100% unit test coverage
- [ ] CRM-embedded CPQ iframe endpoint created
- [ ] Approval threshold integration with existing approval_chains works
- [ ] ADR-0048 written and in docs/adr/
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] Zero lint violations
- [ ] Design System compliance verified (no banned UI patterns)

---

## Sprint 3.2 - Workflow Orchestration Visual Builder (5.19 Maestro-equivalent)

### Context

Phase 2 delivered rule-based automations (simple trigger->action) and approval chains.
Sprint 3.2 delivers a full visual no-code workflow builder that spans the ENTIRE agreement
lifecycle as one connected flow, not separate triggers stitched together.

### What Gets Built

1. Visual Workflow Builder (Frontend)
   - Drag-and-drop canvas using React Flow (or equivalent)
   - Node types:
     a. Trigger node: document.created, document.sent, document.signed, schedule, CRM event,
     ERP event, form_submitted, payment.completed, approval.decided
     b. Condition node: if/else branching (deal value, document type, signer role, CRM field value)
     c. Action node: send_document, request_approval, collect_payment, send_notification,
     update_crm_field, update_erp_field, create_project, trigger_webhook, wait_for_event
     d. Risk-assessment node: route to stronger/lighter verification based on risk score (ties to 5.20)
     e. Delay node: wait N minutes/hours/days before proceeding
     f. End node: marks completion of the flow
   - Connection lines with conditional labels (yes/no on condition nodes)
   - Workflow templates gallery (pre-built flows for common scenarios)
   - Save/publish workflow; version history; rollback to previous version

2. Workflow Engine (Backend)
   - Workflows are stored as a DAG (directed acyclic graph) in JSONB
   - Each workflow instance (execution) is tracked with current node and state
   - Execution is event-driven via BullMQ:
     - An inbound event triggers a lookup for all active workflows for that org
     - For each matching workflow, a BullMQ job is created: ProcessWorkflowNodeJob
     - The job processes the current node, then enqueues the next node
     - Delay nodes use BullMQ delayed jobs
   - Workflow count per org is metered per plan tier (enforced at activation time)
   - Maximum chain depth: 20 nodes per workflow (guard against runaway flows)
   - Loop detection: if a workflow instance visits the same node twice, it is halted

3. Enterprise System Integration
   - ITSM: ServiceNow, Jira Service Management (webhook-based; outbound webhooks to these systems)
   - ERP: SAP, NetSuite (webhook-based for v1; native API adapters in Phase 4)
   - Integration via the existing IntegrationPort pattern - no direct SDK imports in workflow module

4. Workflow Visibility Dashboard
   - Lists all active workflow instances (in-flight)
   - Per-instance detail: current node, history of visited nodes with timestamps
   - Failed instances highlighted with error reason
   - Admin can manually resume, halt, or skip a stuck node
   - Org-level workflow execution metrics: total triggered, completed, failed

### Database Schema Changes

New table: workflow_definitions
id TEXT PRIMARY KEY (UUIDv7)
organization_id UUID NOT NULL REFERENCES organizations(id)
workspace_id UUID NOT NULL REFERENCES workspaces(id)
name TEXT NOT NULL
description TEXT
trigger_event TEXT NOT NULL
dag JSONB NOT NULL -- the full node graph definition
status TEXT NOT NULL DEFAULT 'draft'
CHECK (status IN ('draft','active','paused','archived'))
version INTEGER NOT NULL DEFAULT 1
max_instances INTEGER NOT NULL DEFAULT 1000
created_by UUID NOT NULL REFERENCES users(id)
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
deleted_at TIMESTAMPTZ

New table: workflow_instances
id TEXT PRIMARY KEY (UUIDv7)
organization_id UUID NOT NULL REFERENCES organizations(id)
workflow_id TEXT NOT NULL REFERENCES workflow_definitions(id)
trigger_payload JSONB NOT NULL DEFAULT '{}'
current_node_id TEXT
status TEXT NOT NULL DEFAULT 'running'
CHECK (status IN ('running','completed','failed','halted','paused'))
chain_depth INTEGER NOT NULL DEFAULT 0
visited_nodes JSONB NOT NULL DEFAULT '[]' -- for loop detection
error_message TEXT
started_at TIMESTAMPTZ NOT NULL DEFAULT now()
completed_at TIMESTAMPTZ
updated_at TIMESTAMPTZ NOT NULL DEFAULT now()

New table: workflow_node_executions
id TEXT PRIMARY KEY (UUIDv7)
organization_id UUID NOT NULL REFERENCES organizations(id)
instance_id TEXT NOT NULL REFERENCES workflow_instances(id)
node_id TEXT NOT NULL
node_type TEXT NOT NULL
input JSONB NOT NULL DEFAULT '{}'
output JSONB
status TEXT NOT NULL DEFAULT 'pending'
CHECK (status IN ('pending','running','completed','failed','skipped'))
started_at TIMESTAMPTZ
completed_at TIMESTAMPTZ
error_message TEXT
created_at TIMESTAMPTZ NOT NULL DEFAULT now()

IMPORTANT: RLS required on all 3 tables. Data-manifest registration required.

### Backend Implementation

Module: apps/api/src/modules/workflow/

Note: The existing workflow module (Phase 2) covered automation_rules and approval_chains.
This sprint EXTENDS the module with workflow_definitions and workflow_instances.
Do NOT remove or modify existing automation_rules functionality.

New files to add:
workflow-definition.service.ts
workflow-instance.service.ts
workflow-engine.service.ts (the execution engine - pure orchestration, no business logic)
workflow-node-executor.ts (executes individual node types - dispatches to action modules)
processors/
process-workflow-node.processor.ts (BullMQ processor)
dto/
create-workflow-definition.dto.ts
workflow-definition-response.dto.ts
workflow-instance-response.dto.ts
**tests**/
workflow-engine.service.spec.ts
process-workflow-node.processor.spec.ts

BullMQ Queue Name: workflow-engine

Job: ProcessWorkflowNodeJob
Payload: { instanceId: string; nodeId: string; organizationId: string }
The processor:

1. Sets tenant context: cls.set('organizationId', job.data.organizationId)
2. Loads instance and current node definition from DB
3. Checks loop detection: if nodeId already in visited_nodes, halt instance
4. Checks chain_depth: if >= 20, halt instance with error 'MAX_CHAIN_DEPTH_EXCEEDED'
5. Executes the node via workflow-node-executor.ts
6. Records execution in workflow_node_executions
7. Determines next node(s) based on output
8. Enqueues next node job(s)
9. If final node, marks instance as completed
10. At end of process(), clears tenant context: cls.set('organizationId', null)

Plan limit enforcement:
In workflow-definition.service.ts, before activating a workflow:

- Count active workflow_definitions for org
- Check against subscriptions.add_ons for workflow_count limit
- If at limit, return 402 with WORKFLOW_LIMIT_REACHED error code

Edge case RULE WF-002 (Loop Detection) - MANDATORY:
Every automation execution carries a chain_depth counter (starts at 0).
Maximum chain_depth: 20 (configurable constant MAX_WORKFLOW_CHAIN_DEPTH).
A chain_id is generated at the first trigger and propagated.
Automation rate cap: 100 executions per org per minute.
If exceeded, circuit breaker pauses all workflow rules for org for 5 minutes.
Admin is notified. Log to audit_log_entries.

### Tests Required

Unit tests (workflow-engine.service.spec.ts):

- triggerWorkflow() finds matching workflows for trigger event
- processNode() action node: send_notification calls NotificationService
- processNode() condition node: branches correctly on true/false
- processNode() delay node: enqueues BullMQ delayed job with correct delay
- processNode() risk_assessment node: calls RiskScoringPort
- Loop detection: visiting the same node twice halts the instance
- Chain depth: exceeding MAX_WORKFLOW_CHAIN_DEPTH halts the instance
- Plan limit: activating workflow beyond plan limit returns 402
- Rate cap: exceeding 100 executions/org/minute triggers circuit breaker

Integration tests:

- POST /api/v1/workflows creates workflow definition (Admin only)
- RLS: Org A cannot see Org B workflow instances
- Full flow test: trigger event -> workflow executes all nodes -> instance completed
- Failed node: instance status set to 'failed', error_message populated
- Admin resume: POST /api/v1/workflows/instances/:id/resume continues from current node

### Definition of Done for Sprint 3.2

- [x] 3 new tables created via Prisma migration with RLS and data-manifest
- [x] Visual workflow builder frontend implemented (React Flow canvas)
- [x] All node types implemented (trigger, condition, action, risk-assessment, delay, end)
- [x] BullMQ processor for workflow node execution
- [x] Loop detection and chain depth guard
- [x] Rate cap circuit breaker
- [x] Plan limit enforcement
- [x] Workflow visibility dashboard
- [x] ADR-0049 written (workflow engine design decisions)
- [x] All unit tests pass
- [x] All integration tests pass

---

## Sprint 3.3 - Deal Rooms Full Implementation (5.11)

### Context

The deal_rooms and deal_room_members tables exist in the schema from Phase 0 (reserved).
Sprint 3.3 fully implements the Deal Room feature.

### What Gets Built

1. Deal Room Creation and Management
   - Create a Deal Room from a document or standalone
   - Deal Room has: title, slug (URL-safe unique identifier), brand kit selection,
     mutual action plan, document feed, message thread, member list
   - Slugs are org-scoped unique. URL: app.pactintel.com/rooms/<slug>
   - Custom domain support: docs.theircompany.com/rooms/<slug>

2. Document Feed
   - All documents in this Deal Room displayed as a feed (newest first)
   - External members (buyers) can view documents shared with the room
   - Documents can be added/removed by room owner or member (role=owner or member)
   - Shared documents link to the recipient viewing page (no separate render needed)

3. Mutual Action Plan (MAP)
   - A collaborative milestone timeline stored in deal_rooms.mutual_action_plan (JSONB)
   - Milestones: title, owner (internal or external), due_date, status (pending/complete/blocked)
   - Real-time collaborative editing of the MAP via Yjs + Hocuspocus
   - MAP changes are tracked in audit_log_entries

4. Deal Room Messaging
   - Thread-based messages within the Deal Room
   - Internal messages (only visible to internal team members)
   - External messages (visible to all room members including buyers)
   - Real-time delivery via WebSocket (Hocuspocus or separate socket.io channel)
   - Message attachments: link to a document in the room (not file upload)

5. Activity Feed
   - All parties activity visible: document views, signatures, payments, messages, MAP updates
   - Activity stored in ClickHouse as analytics_events with deal_room_id dimension
   - Frontend polls or subscribes to real-time updates

6. Deal Room Members
   - Internal members: PactIntel users (role: owner or member)
   - External members: buyers (identified by email, no PactIntel account required)
   - External members receive magic-link invites to access the Deal Room
   - Magic links are valid for 30 days, cryptographically random tokens
   - External members can only see: documents shared to the room, MAP, external messages

### Database Schema Changes

New table: deal_room_messages
id TEXT PRIMARY KEY (UUIDv7)
deal_room_id UUID NOT NULL REFERENCES deal_rooms(id)
organization_id UUID NOT NULL REFERENCES organizations(id)
author_user_id UUID REFERENCES users(id)
author_email TEXT -- for external members
author_name TEXT
body TEXT NOT NULL
visibility TEXT NOT NULL DEFAULT 'external'
CHECK (visibility IN ('internal','external'))
parent_id TEXT REFERENCES deal_room_messages(id) -- threading
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
deleted_at TIMESTAMPTZ

New table: deal_room_documents
id TEXT PRIMARY KEY (UUIDv7)
deal_room_id UUID NOT NULL REFERENCES deal_rooms(id)
organization_id UUID NOT NULL REFERENCES organizations(id)
document_id UUID NOT NULL REFERENCES documents(id)
added_by UUID NOT NULL REFERENCES users(id)
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
UNIQUE (deal_room_id, document_id)

New table: deal_room_magic_links
id TEXT PRIMARY KEY (UUIDv7)
deal_room_id UUID NOT NULL REFERENCES deal_rooms(id)
organization_id UUID NOT NULL REFERENCES organizations(id)
member_id UUID NOT NULL REFERENCES deal_room_members(id)
token_hash TEXT NOT NULL UNIQUE -- SHA-256 of token
expires_at TIMESTAMPTZ NOT NULL -- 30 days
used_at TIMESTAMPTZ
created_at TIMESTAMPTZ NOT NULL DEFAULT now()

IMPORTANT: RLS required. Data-manifest required. All existing deal_rooms and
deal_room_members tables need RLS policies added if not already present.

### Backend Implementation

Module: apps/api/src/modules/deal-room/

Files to add in this sprint:
deal-room-message.service.ts
deal-room-document.service.ts
deal-room-magic-link.service.ts
deal-room-analytics.service.ts
dto/
create-deal-room.dto.ts
create-message.dto.ts
deal-room-response.dto.ts (comprehensive - includes members, docs, messages, MAP)
deal-room-activity.dto.ts

REST Endpoints:
POST /api/v1/deal-rooms Create deal room
GET /api/v1/deal-rooms List deal rooms (cursor paginated)
GET /api/v1/deal-rooms/:id Get deal room with full data
PATCH /api/v1/deal-rooms/:id Update title, brand, MAP
DELETE /api/v1/deal-rooms/:id Soft-delete deal room

POST /api/v1/deal-rooms/:id/members Invite member (internal or external)
DELETE /api/v1/deal-rooms/:id/members/:memberId Remove member

POST /api/v1/deal-rooms/:id/documents Add document to room
DELETE /api/v1/deal-rooms/:id/documents/:docId Remove document from room

POST /api/v1/deal-rooms/:id/messages Post message
GET /api/v1/deal-rooms/:id/messages List messages (cursor paginated)
DELETE /api/v1/deal-rooms/:id/messages/:msgId Soft-delete message

GET /api/v1/deal-rooms/:id/activity Activity feed from ClickHouse
GET /api/v1/deal-rooms/:id/map Get mutual action plan
PATCH /api/v1/deal-rooms/:id/map Update MAP (full replace of JSONB)

External-facing (no auth required, magic link):
GET /r/:slug External Deal Room view page (server-rendered)
POST /api/v1/deal-rooms/access/:token Validate magic link token, create session

### Deal Room Real-Time

For real-time MAP collaboration: extend existing Hocuspocus setup.
Add a new document namespace: deal-room:<roomId>
Authentication in Hocuspocus onAuthenticate: also accept magic link session tokens

For real-time message delivery: use existing WebSocket infrastructure
(Server-Sent Events as fallback if WebSocket unavailable)

### Tests Required

Unit tests:

- createDealRoom() generates unique slug (collision-safe)
- inviteMember() external: creates magic link, sends email
- validateMagicLink() expired token returns 401
- validateMagicLink() already-used token returns 401
- postMessage() internal visibility: external members cannot see it

Integration tests:

- Full deal room flow: create -> invite buyer -> buyer accesses via magic link ->
  posts message -> internal member replies -> MAP updated -> activity recorded
- RLS: Org A cannot access Org B deal rooms
- External magic link: valid token grants scoped access (only to that room)
- External magic link: expired token rejected

### Definition of Done for Sprint 3.3

- [x] All new tables with RLS and data-manifest
- [x] Full backend API implemented
- [x] Deal Room frontend page built (Design System compliant)
- [x] External Deal Room view page (magic link accessible)
- [x] Real-time MAP collaboration via Hocuspocus
- [x] Real-time message delivery
- [x] Activity feed from ClickHouse
- [x] Email invites for external members with magic link
- [x] ADR-0050 written
- [x] All tests pass

---

## Sprint 3.4 - Guided AI Proposal Builder

Phase 2 delivered in-editor AI drafting. Sprint 3.4 delivers the GUIDED proposal builder.
A rep answers a short set of questions and the engine assembles a complete document,
pulling live CRM data at build time. Also delivers the URL-to-draft free tool.

### What Gets Built

1. Guided Proposal Builder UI
   - Multi-step form: Choose template -> Answer intake questions -> AI assembles document
   - -> Preview in editor -> User reviews and saves/sends as normal
   - Admin configures intake questions per-template (stored in templates.variable_fields JSONB)
   - Question types: text, number, date, single_select, multi_select, crm_field
   - Conditional questions: show/hide based on other answers

2. CRM Data Pull at Build Time
   - Fetch live CRM data for the connected account when builder runs
   - Map CRM fields to document variable tags
   - NEVER block document creation if CRM unavailable (I-12: degrade gracefully)
   - If CRM unavailable: warn user, use placeholders, continue

3. AI Assembly via AiGateway
   - Task ID: guided-proposal-assembly (registered in task catalog)
   - Prompt: libs/ai/prompts/guided-proposal-assembly.ts (NOT inline in service code)
   - Input: template structure + answers + CRM data + variable tag definitions
   - Output: Tiptap-compatible JSONB document content
   - AI output is ALWAYS a draft - user must Accept before it becomes the document
   - AI blocks marked with metadata: { createdBy: ai } per RULE AI-002

4. URL-to-Draft Tool (Free, No Login)
   - Public page: app.pactintel.com/ai/url-to-draft
   - Rate limited: 3 drafts per IP per hour (Redis sliding window)
   - NEVER persist scraped content beyond the session
   - Output: read-only preview + CTA to sign up and import

### CRITICAL AI Rules (Non-Negotiable)

RULE AI-001: Customer content not used for model training

- All AiGateway calls use provider enterprise API with data-use opt-out
- Verify no-training agreement in place for Claude via Vertex AI

RULE AI-002: AI-generated content clearly marked

- AI blocks in Tiptap: metadata { createdBy: ai }
- Editor shows AI icon (not visible to recipient)
- User must explicitly click Accept/Insert (no auto-insertion)

RULE AI-003: AI guardrails enforced server-side

- Before ANY LLM call, check organizations.settings.ai_guardrails
- If violation: return 403 with AI_GUARDRAIL_VIOLATION
- Client-side hiding of AI button is UX convenience only, not security boundary

RULE GDPR-002: Data residency for AI calls

- EU orgs: use Vertex AI EU endpoint
- If EU endpoint unavailable: return 503 FEATURE_UNAVAILABLE_IN_REGION (never silently route to US)

### REST Endpoints

POST /api/v1/ai/guided-proposal/assemble (authenticated) Assemble from answers
POST /api/v1/ai/url-to-draft (public, rate limited) Draft from URL

### Tests Required

Unit:

- assembleProposal() calls AiGateway with guided-proposal-assembly task ID (not model name)
- assembleProposal() checks AI guardrails BEFORE calling LLM
- assembleProposal() returns 403 when guardrail violated
- assembleProposal() uses EU endpoint for EU-resident orgs
- urlToDraft() rate limit: 4th request in hour returns 429
- urlToDraft() does NOT write scraped content to any database table
- AI blocks in output have metadata.createdBy = ai

### Definition of Done for Sprint 3.4

- [x] Guided proposal builder UI (multi-step, Design System compliant)
- [x] Admin question bank configuration in template settings
- [x] CRM data pull with graceful degradation
- [x] AiGateway integration with guided-proposal-assembly task
- [x] AI blocks marked created_by:ai in editor
- [x] URL-to-draft public page with rate limiting
- [x] AI guardrail enforcement server-side
- [x] Data residency enforcement for all LLM calls
- [x] ADR-0051 written
- [x] All tests pass

---

## Sprint 3.5 - AI Data Extraction + Portfolio Agreement Intelligence

Highest-complexity AI sprint. Delivers per-document AI Data Extraction (100+ structured fields,
OCR for scanned PDFs) AND Portfolio Agreement Intelligence (entire back-catalog as queryable asset).
Also delivers Meilisearch migration (Blueprint Section 12 Phase 3 requirement).

### New Database Tables

Table: obligation_records (reserved in Blueprint Section 3.2.10)
id TEXT PRIMARY KEY (UUIDv7 via generateId())
organization_id UUID NOT NULL REFERENCES organizations(id)
document_id UUID NOT NULL REFERENCES documents(id)
document_version_id UUID NOT NULL REFERENCES document_versions(id)
field_name TEXT NOT NULL
field_value TEXT
field_value_numeric NUMERIC(20,4)
field_value_date TIMESTAMPTZ
field_type TEXT NOT NULL CHECK (field_type IN (text,numeric,date,boolean,list))
confidence_score NUMERIC(4,3)
extraction_method TEXT NOT NULL
is_custom_field BOOLEAN NOT NULL DEFAULT false
is_verified BOOLEAN NOT NULL DEFAULT false
pending_update JSONB -- for amendment review per RULE PORT-001
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at TIMESTAMPTZ NOT NULL DEFAULT now()

Table: counterparties
id TEXT PRIMARY KEY (UUIDv7)
organization_id UUID NOT NULL REFERENCES organizations(id)
canonical_name TEXT NOT NULL
aliases TEXT[]
domain TEXT
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at TIMESTAMPTZ NOT NULL DEFAULT now()

Table: custom_extraction_fields
id TEXT PRIMARY KEY (UUIDv7)
organization_id UUID NOT NULL REFERENCES organizations(id)
field_name TEXT NOT NULL
description TEXT NOT NULL -- natural language for LLM
field_type TEXT NOT NULL CHECK (field_type IN (text,numeric,date,boolean,list))
is_active BOOLEAN NOT NULL DEFAULT true
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
deleted_at TIMESTAMPTZ
UNIQUE (organization_id, field_name)

Modify documents: ADD COLUMN counterparty_id TEXT REFERENCES counterparties(id)
Modify document_versions: ADD COLUMN content_embedding vector(768)
ALL new tables: RLS required + data-manifest registration required.

### CRITICAL RULE PORT-001 - Obligation Amendment Review (NEVER Auto-Apply)

When a document is amended (new version created):

1. AI extraction runs on the new version in background (BullMQ job)
2. Compare extractions with existing obligation_records for this document
3. If values differ: write to obligation_records.pending_update ONLY
   Do NOT overwrite field_value or field_value_date
4. Notify document owner: AI detected changes, please review and confirm
5. UI shows side-by-side diff with Confirm and Dismiss buttons
6. Show AI confidence score alongside each change
7. NEVER auto-apply changes. Every obligation update requires explicit human action.

### Meilisearch Migration

Replace PostgreSQL FTS with Meilisearch for document/template/portfolio search.

Architecture:

- Meilisearch runs as Cloud Run service (IaC: infra/modules/cell/meilisearch.tf)
- Local docker-compose: add meilisearch:latest on port 7700
- Per-org indexes: docs_{orgId}, templates_{orgId}
- IndexDocumentJob (BullMQ): triggered on document status change
- Search API: MeilisearchAdapter primary, PostgresFtsAdapter fallback (I-12)

SearchPort interface (libs/ports/search/search.port.ts):
search(query, filters, orgId): Promise<SearchResult[]>
index(document: SearchableDocument): Promise<void>
deleteIndex(documentId): Promise<void>

Adapters:
libs/ports/adapters/search/meilisearch.adapter.ts (primary)
libs/ports/adapters/search/postgres-fts.adapter.ts (fallback)

### Backend New Module: portfolio

apps/api/src/modules/portfolio/
portfolio.module.ts, portfolio.controller.ts, portfolio.service.ts
portfolio.repository.ts, obligation.service.ts, counterparty.service.ts

New AI prompts (libs/ai/prompts/):
document-extraction.ts, portfolio-report.ts, counterparty-normalization.ts

New BullMQ queues: document-extraction, obligation-reminders, index-document

REST Endpoints:
GET /api/v1/portfolio/search
GET /api/v1/portfolio/obligations
GET /api/v1/portfolio/counterparties
GET /api/v1/portfolio/counterparties/:id
POST /api/v1/portfolio/reports (async, returns jobId)
GET /api/v1/portfolio/reports/:jobId
POST|GET|PATCH|DELETE /api/v1/portfolio/custom-fields
GET /api/v1/documents/:id/obligations
POST /api/v1/documents/:id/obligations/:oblId/verify
POST /api/v1/documents/:id/obligations/:oblId/confirm-update

Obligation Reminder: Cloud Scheduler (NOT @Cron) triggers daily
Finds obligations expiring within 30 days -> notifications at 30d, 7d, 1d

### Tests Required

Unit:

- extractDocument() calls AiGateway with document-extraction task ID
- extractDocument() OCR path: calls OcrPort before LLM for scanned PDFs
- extractDocument() includes custom extraction fields in prompt
- counterpartyNormalize() merges aliases into canonical_name
- obligationReminderJob() finds expiring items within 30 days
- RULE PORT-001: obligation update writes to pending_update, NOT field_value
- search() falls back to PostgresFtsAdapter when Meilisearch unavailable

Integration:

- Full extraction: document signed -> job runs -> obligation_records created
- Amendment flow: new version -> pending_update set, NOT auto-applied
- Confirm update: POST confirm-update -> field_value updated -> is_verified=true
- Portfolio search: Meilisearch result (mocked client)
- RLS: Org A cannot search Org B portfolio

### Definition of Done for Sprint 3.5

- [x] obligation_records, counterparties, custom_extraction_fields tables with RLS + manifest
- [x] AI extraction BullMQ pipeline
- [x] OCR integration (Cloud Vision via OcrPort) for scanned PDFs
- [x] Meilisearch as Cloud Run service + docker-compose local
- [x] SearchPort with Meilisearch + PostgreSQL FTS adapters
- [x] Portfolio search with fallback
- [x] Counterparty normalization and tracking
- [x] Obligation notifications (30d/7d/1d) via Cloud Scheduler
- [x] Amendment review (RULE PORT-001 - never auto-apply)
- [x] AI portfolio report async generation
- [x] Custom admin extraction fields
- [x] pgvector embeddings
- [x] ADR-0052 written
- [x] All tests pass

---

## Sprint 3.6 - Advanced ID-Verification Signing: KBA, Government ID, QES

Phase 0 delivered basic signer verification (email OTP, passcode, SMS OTP).
Sprint 3.6 delivers KBA, Government ID document verification, and QES (highest eIDAS tier).

### What Gets Built

1. KBA (Knowledge-Based Authentication)
   - BoldSign KBA API: signer answers credit-bureau questions before signing
   - KBA failure threshold: configurable per signature request (default 3 attempts)
   - After max failures: lock signer, notify sender, log kba_locked in signature_events
   - US-only: KBA requires US credit data. Enforce jurisdiction check (IP + country).

2. Government ID Document Verification
   - Signer uploads front+back of government ID, takes a live selfie
   - Liveness detection: vendor confirms selfie is a live person (not a static photo)
   - Biometric comparison: selfie matched against ID photo
   - PII from ID (name, DOB, document number) is NOT stored by PactIntel
     Only store: verification result status, confidence score, vendor reference ID
   - Available globally (not US-restricted)

3. QES (Qualified Electronic Signature)
   - BoldSign QES feature (eIDAS Qualified level - highest legal weight in EU)
   - Requires EU-issued electronic identity (eID) from a trust service provider
   - A formal proof-of-verification file stored with signed document
   - EU signers only - enforce jurisdiction check

4. Plan Gating
   - KBA: Professional and above
   - Government ID: Business and above
   - QES: Enterprise only

### Schema Changes

Modify signers table:
ALTER TABLE signers DROP CONSTRAINT signers_verification_method_check;
ALTER TABLE signers ADD CONSTRAINT signers_verification_method_check
CHECK (verification_method IN (none,email,passcode,sms,kba,id_document,qes));

Add to signers:
ADD COLUMN verification_attempts INTEGER NOT NULL DEFAULT 0
ADD COLUMN verification_result JSONB
ADD COLUMN kba_locked_at TIMESTAMPTZ

New signature_events.event_type values (no schema change - just new enum values):
kba_attempt, kba_passed, kba_failed, kba_locked,
id_verification_submitted, id_verification_passed, id_verification_failed, qes_applied

### Backend Changes

Extend BoldSign adapter (libs/ports/adapters/signing/boldsign.adapter.ts):
initiateKba(signerId, signerEmail): Promise<KbaSession>
submitKbaAnswers(sessionId, answers): Promise<KbaResult>
initiateIdVerification(signerId): Promise<IdVerificationSession>
getIdVerificationResult(sessionId): Promise<IdVerificationResult>
initiateQes(signerId): Promise<QesSession>
getQesResult(sessionId): Promise<QesResult>

New REST Endpoints:
POST /api/v1/signing/signers/:id/kba/initiate
POST /api/v1/signing/signers/:id/kba/submit
POST /api/v1/signing/signers/:id/id-verify/initiate
GET /api/v1/signing/signers/:id/id-verify/result
POST /api/v1/signing/signers/:id/qes/initiate

### CRITICAL RULE RISK-001 - Verification Service Outage

If verification vendor unreachable (timeout > 5s or error):

1. Apply MOST CONSERVATIVE verification method configured for the org
2. Log: signature_events event_type=risk_scoring_fallback, metadata.reason=vendor_unreachable
3. If no verification configured: proceed with standard signing
4. Circuit breaker: 5 failures in 10 min -> open for 30 min -> use fallback
   NEVER skip verification entirely when vendor unreachable
   NEVER block ALL signing for the entire org

### Tests Required

Unit:

- initiateKba() plan gate (Professional+ only)
- submitKbaAnswers() wrong answers increment verification_attempts
- submitKbaAnswers() 3 failures: set kba_locked_at, log kba_locked, notify sender
- initiateQes() plan gate (Enterprise only)
- initiateQes() jurisdiction check (EU signer only)
- verification outage: circuit breaker opens after 5 failures
- verification outage: falls back to conservative method (not skip)

Integration:

- Full KBA flow: initiate -> submit correct answers -> signer allowed to sign
- Full KBA lockout: 3 wrong -> locked, signature_events has kba_locked event
- Government ID flow (mocked vendor): initiate -> result passed -> sign
- QES plan gate: Business plan returns 402
- KBA US-only: non-US signer rejected

### Definition of Done for Sprint 3.6

- [x] Signers table updated (new verification methods, new columns)
- [x] BoldSign adapter extended with KBA, ID verification, QES methods
- [x] New REST endpoints implemented
- [x] Plan gating enforced
- [x] RULE RISK-001: conservative fallback + circuit breaker
- [x] Verification UI in signing flow
- [x] Audit trail includes verification method and result
- [x] ADR-0053 written
- [x] All tests pass

---

## Sprint 3.7 - Risk-Adaptive Identity Verification (5.20)

Delivers the layer that AUTOMATICALLY selects which verification method to apply per recipient
in real time based on a computed fraud-risk score. Also delivers:

- Biometric liveness detection (already gated by Gov ID in Sprint 3.6)
- Pre-verified user network (skip repeat verification for recognized individuals)
- Formal exportable proof-of-verification file for AML/KYC regulatory contexts
- Risk-assessment node in the Workflow Builder (Sprint 3.2) now fully functional

### What Gets Built

1. Risk Scoring Service
   - Calls a risk-scoring vendor API (to be selected and documented in ADR-0054)
   - Risk score computed per signer per signing event (not per login)
   - Factors: IP reputation, device fingerprint, email domain, signing history, deal size
   - Score range: 0.0 (low risk) to 1.0 (high risk)
   - Score mapped to verification tiers: low -> passcode, medium -> SMS, high -> ID document
   - Tier mapping is configurable by org admin

2. Pre-Verified User Network
   - Signers who have previously been ID-verified (in any org using PactIntel)
   - Store verification status in a shared pre_verified_signers table (NOT tenant-scoped)
   - IMPORTANT: only store: email hash (SHA-256) + verification_status + verified_at
   - NEVER store cross-tenant PII or business data (I-03 respected via email hash only)
   - When signer is recognized as pre-verified: skip repeat ID verification
   - Log: risk_scoring_pre_verified event in signature_events

3. Proof-of-Verification Export
   - A formal PDF or JSON export: method used, result, confidence score, supporting evidence
   - Built to a named assurance standard (AML/KYC compliance artifact)
   - Stored in Cloud Storage alongside the signed document
   - Accessible via: GET /api/v1/signing/signature-requests/:id/verification-report

4. Risk Assessment Node in Workflow Builder
   - The node defined in Sprint 3.2 now calls RiskScoringPort instead of being a stub
   - Node output: risk_level (low/medium/high) routes to different workflow branches

### New Database Tables

Table: pre_verified_signers (NOT tenant-scoped - shared global table)
id TEXT PRIMARY KEY (UUIDv7)
email_hash TEXT NOT NULL UNIQUE -- SHA-256 of lowercase email
verification_method TEXT NOT NULL
verified_at TIMESTAMPTZ NOT NULL
expires_at TIMESTAMPTZ NOT NULL -- pre-verification valid for 1 year
created_at TIMESTAMPTZ NOT NULL DEFAULT now()

IMPORTANT: This table has NO organization_id. It is NOT RLS-protected.
It contains only SHA-256 hashes of emails - no PII.
Access is controlled via application-level authorization (no tenant scoping needed).
Register in data-manifest with residency = global.

RiskScoringPort (libs/ports/risk/risk-scoring.port.ts):
computeRiskScore(context: RiskContext): Promise<RiskScore>
isPreVerified(emailHash: string): Promise<boolean>
recordVerification(emailHash: string, result: VerificationResult): Promise<void>

### RULE RISK-001 (Already required in Sprint 3.6 - verify also here)

Risk scoring service outage MUST fail conservative, not open.
This rule was partially implemented in Sprint 3.6 for the verification vendor.
Sprint 3.7 adds it specifically for the risk-scoring vendor itself.

### Tests Required

Unit:

- computeRiskScore() returns low/medium/high tier based on score range
- computeRiskScore() outage: circuit breaker opens, conservative fallback applied
- isPreVerified() email hash matches -> skip ID verification
- isPreVerified() expired pre-verification -> NOT considered pre-verified
- generateVerificationReport() creates PDF with all required fields

Integration:

- Full risk-adaptive flow: low-risk signer -> passcode only
- Full risk-adaptive flow: high-risk signer -> ID document required
- Pre-verified signer: email hash found -> verification skipped
- Workflow risk-assessment node: branches correctly on risk level
- Verification report download: PDF accessible at expected endpoint

### Definition of Done for Sprint 3.7

- [x] RiskScoringPort interface defined
- [x] At least one RiskScoringAdapter implemented (vendor TBD, documented in ADR-0054)
- [x] RULE RISK-001 implemented for risk-scoring vendor outage
- [x] pre_verified_signers table created (global, email hash only)
- [x] Pre-verified network lookup integrated into signing flow
- [x] Proof-of-verification PDF generation and storage
- [x] Workflow risk-assessment node functional
- [x] ADR-0054 written (risk-scoring vendor selection)
- [x] All tests pass

---

## Sprint 3.8 - Multi-Workspace + Parent-Account Oversight

Phase 0 delivered basic workspace support (a single workspace per org by default).
Sprint 3.8 delivers FULL multi-workspace: franchises, departments, child companies,
with parent-account oversight and shared asset libraries.

### What Gets Built

1. Multi-Workspace Creation and Management
   - Owner/Admin can create multiple workspaces under one organization
   - Each workspace has: its own branding defaults, template library scope,
     content library scope, reporting roll-up, document list, member list
   - User can be a Member in Workspace A and a Manager in Workspace B (per-workspace role)
   - Workspace-scoped pricing rules and CPQ playbooks (from Sprint 3.1)
   - Workspace slug: used in URLs and API filtering

2. Parent-Account Oversight
   - Owner (account-wide) can see all documents and analytics across ALL workspaces
   - Admin can be granted cross-workspace read access by Owner
   - Workspace Manager sees ONLY their workspace data
   - Owner-level dashboards show cross-workspace aggregates
   - A cross-workspace document search (portfolio search from Sprint 3.5 supports this already)

3. Shared Asset Libraries
   - Templates can be: workspace-private or org-wide (shared)
   - Content Library blocks: workspace-private or org-wide
   - Brand kits: workspace-specific OR shared across workspaces
   - Admin configures which assets are shared from the organization settings panel
   - Workspace members can only use shared assets (cannot modify them)

4. Sub-Account (Enterprise Tier)
   - In Phase 3, sub-accounts are workspaces with their own isolated billing
   - Full sub-account isolation (separate subscription, separate seat count) is Phase 4
   - For now: multi-workspace shares the organization subscription

### Schema Changes

The workspaces table already exists. Changes needed:

Modify workspaces table:
ADD COLUMN slug TEXT NOT NULL UNIQUE -- URL-safe, org-scoped
ADD COLUMN parent_workspace_id UUID REFERENCES workspaces(id) -- for hierarchy (Phase 4)
ADD COLUMN is_shared_library_enabled BOOLEAN NOT NULL DEFAULT false

Modify templates table:
ADD COLUMN visibility TEXT NOT NULL DEFAULT workspace
CHECK (visibility IN (workspace, organization))

Modify content_blocks table:
ADD COLUMN visibility TEXT NOT NULL DEFAULT workspace
CHECK (visibility IN (workspace, organization))

Modify brand_kits table (if exists, else create):
ADD COLUMN visibility TEXT NOT NULL DEFAULT workspace
CHECK (visibility IN (workspace, organization))

Modify workspace_memberships table:
role column already exists with per-workspace roles
No schema change needed - verify existing RLS policies cover multi-workspace correctly

### CRITICAL: RLS Policy Updates for Multi-Workspace

All workspace-scoped tables currently have policy:
USING (organization_id = (SELECT current_setting(app.current_tenant, true)::uuid))

They need workspace scoping added where appropriate:
For workspace-private assets:
USING (organization_id = current_org AND workspace_id = current_workspace)
For org-wide shared assets:
USING (organization_id = current_org AND (visibility = organization OR workspace_id = current_workspace))

Implement by adding app.current_workspace to the tenant context (alongside app.current_tenant).
Update CLS (AsyncLocalStorage) to carry both orgId and workspaceId.
Update all RLS policies that need workspace-scoping.

RULE AUTH-003 (from Blueprint): Workspace context is validated on every request.
The active workspace is set from the JWT claim or request header X-Workspace-Id.
If the workspace does not belong to the org in the JWT, return 403.

### Backend Changes

Modify auth middleware / tenant context:
cls.set(workspaceId, workspaceId) on every authenticated request
Validate workspaceId belongs to orgId before setting

Modify WorkspaceService:
createWorkspace(): enforce max_workspaces limit per subscription plan
getWorkspacesForOrg(): Owner sees all; Admin sees all; Manager sees own
transferWorkspaceOwnership(): for reassigning workspace admin

New REST Endpoints:
POST /api/v1/workspaces Create workspace
GET /api/v1/workspaces List workspaces (scoped to caller role)
GET /api/v1/workspaces/:id Get workspace details
PATCH /api/v1/workspaces/:id Update workspace
DELETE /api/v1/workspaces/:id Soft-delete workspace

POST /api/v1/workspaces/:id/members Add member to workspace
PATCH /api/v1/workspaces/:id/members/:userId Change role
DELETE /api/v1/workspaces/:id/members/:userId Remove member

GET /api/v1/workspaces/:id/overview Owner-level cross-workspace analytics

### Tests Required

Unit:

- createWorkspace() enforces max_workspaces plan limit
- workspace context validation: workspaceId not in org -> 403
- shared template visible in both workspaces (visibility=organization)
- workspace-private template NOT visible in other workspace

Integration:

- Full multi-workspace: create 2 workspaces, member in each with different roles
- Member in Workspace A cannot see Workspace B documents
- Owner can see both workspaces data
- Shared template visible in both workspaces
- Workspace-private template only visible in its workspace
- RLS: organization_id isolation still works with workspace context

### Definition of Done for Sprint 3.8

- [ ] Workspace slug added, validated unique per org
- [ ] Template and content block visibility (workspace/organization)
- [ ] RLS policies updated for workspace-scoped filtering
- [ ] Tenant context carries both orgId and workspaceId
- [ ] Multi-workspace CRUD endpoints
- [ ] Owner cross-workspace overview analytics
- [ ] Max workspace limit enforcement per plan
- [ ] ADR-0055 written
- [x] All tests pass

---

## Sprint 3.9 - SAML SSO + SOC 2 Audit Preparation

Phase 2 delivered OAuth SSO via WorkOS AuthKit.
Sprint 3.9 delivers SAML SSO (Enterprise tier) and the full SOC 2 Type II audit preparation.

### What Gets Built

1. SAML SSO via WorkOS
   - WorkOS handles the SAML implementation (SP-initiated and IdP-initiated)
   - PactIntel UI: SSO configuration page in Security settings
   - Admin enters: IdP entity ID, IdP SSO URL, IdP certificate
   - WorkOS stores and manages the SAML connection
   - User login flow when SSO enabled: WorkOS SSO -> JWT issued by PactIntel
   - Fallback: if SSO fails, admin can use backup codes (WorkOS managed)
   - Enforce SSO policy: if org has SAML, can require ALL members to use it
   - JIT (Just-In-Time) provisioning: new user auto-created on first SSO login
   - Attribute mapping: map IdP attributes to PactIntel user fields

2. SCIM Provisioning (Phase 3 preview, full in Phase 4)
   - WorkOS provides SCIM endpoints
   - In Phase 3: basic SCIM user sync (create, deactivate) wired up
   - Group-to-workspace mapping: Phase 4

3. SOC 2 Type II Audit Preparation
   - Audit evidence collection tooling (automated where possible)
   - Complete the following for SOC 2 Type II readiness:

   Trust Service Criteria (TSC) coverage:
   CC1 - Control Environment:
   Ensure all employees have signed security awareness training acknowledgment
   Document access control matrix (AGENTS.md is part of this)
   Background check process documented
   CC2 - Communication:
   Security policy published at /security
   Incident response plan documented in docs/runbooks/incident-response.md
   Vulnerability disclosure policy at /security/vulnerability-disclosure
   CC3 - Risk Assessment:
   Annual risk assessment process documented
   Threat model document in docs/security/threat-model.md
   CC4 - Monitoring Activities:
   All audit_log_entries queries working (export endpoint exists from Phase 0)
   Cloud Armor WAF alerts documented
   Grafana dashboards for anomaly detection in place
   CC5 - Logical and Physical Access Controls:
   WorkOS MFA enforced for all admin-role users
   API keys require MFA to create (verify this is enforced)
   Deactivated users: verify access revoked within 24 hours
   Verify least-privilege IAM roles in GCP (IaC in infra/iam.tf)
   CC6 - System Operations:
   Cloud SQL PITR enabled (verify IaC)
   Cloud Storage WORM enabled for evidence bucket (verify IaC)
   Deployment process documented (GitHub Actions CI/CD)
   Change management process in AGENTS.md and GEMINI.md
   CC7 - Change Management:
   ADR process enforced (all structural changes have ADRs)
   Prisma migration process documented
   PR review requirements in GitHub branch protection rules
   CC8 - Risk Mitigation:
   Vanta integration setup (Vanta is the compliance monitoring tool from Phase 3)
   Penetration test scheduled (annual)
   CC9 - Incident Management:
   Sentry alerts configured
   PagerDuty (or equivalent) on-call rotation documented

   Artifacts to create:
   docs/security/soc2-evidence-index.md -- Index of all SOC 2 evidence artifacts
   docs/security/threat-model.md -- STRIDE threat model for PactIntel
   docs/runbooks/incident-response.md -- Incident response playbook
   docs/security/access-control-matrix.md -- Who has access to what
   infra/iam.tf -- GCP IAM least-privilege roles

### Backend Changes (SAML/SCIM)

Extend AuthModule (apps/api/src/modules/auth/):
saml-sso.service.ts -- WorkOS SAML connection management
scim.service.ts -- Basic SCIM user sync
scim.controller.ts -- SCIM endpoints (WorkOS SCIM format)

New REST Endpoints:
POST /api/v1/auth/sso/saml/configure Configure SAML connection (Admin only)
GET /api/v1/auth/sso/saml/config Get current SAML configuration
DELETE /api/v1/auth/sso/saml/config Remove SAML configuration
POST /api/v1/auth/sso/saml/test Test SAML connection

SCIM endpoints (WorkOS compatible):
GET /scim/v2/Users List users
POST /scim/v2/Users Provision user
GET /scim/v2/Users/:id Get user
PUT /scim/v2/Users/:id Update user
PATCH /scim/v2/Users/:id Partial update
DELETE /scim/v2/Users/:id Deprovision user (soft-deactivate)

Modify organizations table:
ADD COLUMN sso_policy TEXT NOT NULL DEFAULT optional
CHECK (sso_policy IN (optional, required, required_admin_bypass))
ADD COLUMN workos_saml_connection_id TEXT

### Tests Required

Unit:

- configureSaml() stores workos_saml_connection_id on org
- sso_policy=required: login without SSO returns 403 for non-admin
- scim deprovision: user set to deactivated=true, does NOT delete historical data
- JIT provisioning: first SSO login creates user with correct workspace role

Integration:

- SAML configuration saved and retrievable
- SSO policy enforcement works end-to-end (mocked WorkOS in integration tests)
- SCIM create user: user created in PactIntel with correct role
- SCIM delete user: user deactivated, audit log entry created
- RLS: org A cannot see org B SSO configuration

### Definition of Done for Sprint 3.9

- [ ] SAML SSO configuration UI and backend (via WorkOS)
- [ ] JIT provisioning on first SSO login
- [ ] SSO policy enforcement (optional/required)
- [ ] Basic SCIM user sync endpoints
- [ ] Organizations table updated with SSO fields
- [ ] All SOC 2 artifact docs created (soc2-evidence-index, threat-model, incident-response)
- [ ] Vanta integration configured
- [ ] GCP IAM least-privilege reviewed and IaC updated
- [ ] ADR-0056 written (SAML implementation)
- [x] All tests pass

---

## Sprint 3.10 - Advanced Analytics + Custom Report Builder

Phase 1 delivered basic document analytics (views, opens, time-on-section).
Phase 2 delivered section-level tracking and stakeholder tracking.
Sprint 3.10 delivers the full analytics suite: company/team roll-ups, conversion reports,
custom report builder with scheduling, and engagement scoring.

### What Gets Built

1. Company-Wide and Team Roll-Up Analytics
   - Owner/Admin: company-wide view (all reps, all workspaces)
   - Manager: team-level view (their teams only)
   - Member: own documents only
   - Metrics: documents sent, viewed, signed, conversion rate, avg time-to-sign,
     avg time-to-view, revenue closed, templates used (by conversion rate)
   - Time range: today, this week, this month, this quarter, custom range
   - All metrics sourced from ClickHouse (not PostgreSQL)

2. Conversion Reports
   - Which templates have the highest conversion rate (sent -> signed)
   - Which reps have the highest conversion rate
   - Funnel visualization: created -> sent -> viewed -> signed
   - Deal velocity: avg days from created to signed by template, rep, or deal size bucket
   - Lost deal analysis: documents that expired or were declined (where they dropped off)

3. Engagement Scoring (Proprietary)
   - Score ranges: 0-100 for each sent document
   - Factors: time spent on page, sections viewed, links clicked, return visits,
     number of viewers, time since last view
   - Disengaged flag: previously active buyer goes quiet (score drops significantly)
   - Re-engaged flag: stalled deal re-opened (new view on document > 7 days inactive)
   - Score stored in ClickHouse as a computed metric, updated on each view event
   - API: GET /api/v1/analytics/documents/:id/engagement-score

4. Custom Report Builder
   - UI: drag-and-drop report builder with dimension/metric picker
   - Dimensions: document type, template, workspace, rep, team, date range, status
   - Metrics: count, sum, avg, min, max of any numeric field
   - Filters: any dimension can be filtered
   - Output formats: table (default), bar chart, line chart, pie chart
   - Save report: stored in custom_reports table as a JSONB definition
   - Schedule report: send via email on a defined schedule (daily/weekly/monthly)
   - Export: CSV download of any report
   - Available on Business and above plans

5. Manager Overview (Overdue Follow-Ups)
   - A Manager-specific view: documents sent by their team that have NOT been viewed
     or signed beyond a threshold (configurable, default 3 days)
   - Shows: document title, rep, recipient, days since sent, last view date
   - Quick action: send a follow-up reminder from this view

### New Database Tables

Table: custom_reports
id TEXT PRIMARY KEY (UUIDv7)
organization_id UUID NOT NULL REFERENCES organizations(id)
workspace_id UUID NOT NULL REFERENCES workspaces(id)
created_by UUID NOT NULL REFERENCES users(id)
name TEXT NOT NULL
definition JSONB NOT NULL -- dimensions, metrics, filters, chart type
schedule JSONB -- {frequency: daily/weekly/monthly, recipients: [...]}
last_run_at TIMESTAMPTZ
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
deleted_at TIMESTAMPTZ

RLS required. Data-manifest required.

ClickHouse tables (already exist from Phase 1/2):
analytics_events table needs new columns if not already present:

- engagement_score FLOAT (computed and updated per event)
- is_disengaged UInt8 (0/1)
- is_reengaged UInt8 (0/1)

### Backend Implementation

Module: apps/api/src/modules/analytics/ (extend existing)

New files:
engagement-scoring.service.ts
custom-report.service.ts
custom-report-scheduler.service.ts
processors/
compute-engagement-score.processor.ts (BullMQ)
run-scheduled-report.processor.ts (BullMQ)
dto/
custom-report-definition.dto.ts
custom-report-response.dto.ts
engagement-score-response.dto.ts
analytics-overview-response.dto.ts

New REST Endpoints:
GET /api/v1/analytics/overview Company/team/personal overview
GET /api/v1/analytics/conversion Conversion funnel metrics
GET /api/v1/analytics/templates Template performance report
GET /api/v1/analytics/documents/:id/engagement-score Engagement score for one doc
GET /api/v1/analytics/manager/overdue-followups Manager overdue follow-up list

POST /api/v1/analytics/reports Create custom report
GET /api/v1/analytics/reports List custom reports
GET /api/v1/analytics/reports/:id Get report definition
POST /api/v1/analytics/reports/:id/run Execute report (async)
GET /api/v1/analytics/reports/:id/results Get last run results
GET /api/v1/analytics/reports/:id/export Download CSV
PATCH /api/v1/analytics/reports/:id Update report
DELETE /api/v1/analytics/reports/:id Soft-delete report

Engagement score BullMQ job: ComputeEngagementScoreJob
Triggered: after each analytics event is recorded in ClickHouse
Computes score for the document and updates ClickHouse

Scheduled report BullMQ job: RunScheduledReportJob
Triggered by Cloud Scheduler (NOT @Cron in code)
Queries ClickHouse with the report definition JSONB
Sends result as CSV attachment via email to recipients in schedule.recipients

RULE AN-002: Stakeholder/Forwarding Tracking (verify from Phase 2)
Unknown viewer prompt: floats after 10 seconds of viewing
Once identified: session associated with their email
Sender gets real-time notification of new viewer
Anonymous viewer still tracked (session, time, sections) even if declined

### Tests Required

Unit:

- computeEngagementScore() weights time-on-page correctly
- computeEngagementScore() disengaged flag: score drop after 7-day inactivity
- computeEngagementScore() reengaged flag: new view after 7-day inactivity
- runCustomReport() queries ClickHouse with correct SQL from JSONB definition
- runScheduledReport() sends email with CSV attachment
- Plan gate: custom reports only available on Business+

Integration:

- GET /api/v1/analytics/overview returns org-level metrics from ClickHouse
- Manager: GET /api/v1/analytics/overview returns team-only metrics
- Member: GET /api/v1/analytics/overview returns only own metrics
- Custom report: create -> run -> export CSV
- RLS: Org A cannot access Org B reports or analytics

### Definition of Done for Sprint 3.10

- [ ] Company, team, personal analytics dashboards
- [ ] Conversion funnel and template performance reports
- [ ] Engagement scoring pipeline (BullMQ job + ClickHouse update)
- [ ] Disengaged/re-engaged flags computed and surfaced in UI
- [ ] Custom report builder UI (drag-and-drop, filter, chart type)
- [ ] Scheduled report delivery (email CSV, Cloud Scheduler)
- [ ] Manager overdue follow-up view
- [ ] CSV export for any report
- [ ] Plan gating for custom reports
- [ ] custom_reports table with RLS + data-manifest
- [x] All tests pass

---

## Sprint 3.11 - Standalone Forms (Full Build) (5.12)

Phase 0 reserved the forms tables. Phase 3 delivers the full standalone forms product:
No-code web forms shareable by link or embeddable on a website, independent of document flow.
Supports signing order, payment collection, multiple roles, reusable templates.

### What Gets Built

1. Form Builder UI
   - Drag-and-drop canvas (similar to document editor block structure)
   - Field types: text, textarea, email, phone, number, date, time, dropdown,
     checkbox (multi-select), radio (single-select), file upload, signature, payment
   - Section grouping: multiple pages/sections per form
   - Field validation: required, min/max length, regex pattern, email format
   - Conditional logic: show/hide fields based on answers to other fields
   - Pre-fill: URL parameters can pre-fill specific fields
   - Form settings: collect one response per email, limit total submissions,
     close submissions after a date, require login (optional)
   - Custom branding: use org brand kit (colors, logo, fonts)
   - Custom success page: redirect to URL or show a custom thank-you message

2. Form Sharing
   - Shareable public link: form.pactintel.com/{orgSlug}/{formSlug}
     OR custom domain: form.theircompany.com/{formSlug}
   - Embed code: iframe snippet for embedding on a website
   - QR code generation for the form link

3. Submission Collection and Management
   - All submissions stored in form_submissions table
   - Submission inbox: filterable/sortable list of all submissions
   - Per-submission detail view: all field values, timestamp, IP, submission ID
   - Submission notifications: email to org admin (configurable)
   - Export submissions: CSV download
   - If form has signature field: embedded BoldSign signing flow within the form
   - If form has payment field: payment collection via the org Payment Link method

4. Multiple Roles (Multi-Step Forms with Role Routing)
   - A form can have multiple signer roles (e.g., Applicant, Manager, HR)
   - Applicant fills their fields -> submission routed to Manager for their fields
   - Manager fills their section -> routed to HR if needed
   - Each role receives an email link to their portion of the form
   - Completion only when all roles have submitted

5. Form Versioning
   - Published forms can be edited: edits apply going forward (new submissions)
   - Existing submissions reference the form version they were submitted against
   - Edits to a published form do NOT break existing submissions

6. Routing Rules
   - Based on submission answers, route to different email recipients, webhooks, or automations
   - E.g.: if answer to Company Size >= 50, notify enterprise sales rep

### Database Schema

Table: forms
id TEXT PRIMARY KEY (UUIDv7)
organization_id UUID NOT NULL REFERENCES organizations(id)
workspace_id UUID NOT NULL REFERENCES workspaces(id)
created_by UUID NOT NULL REFERENCES users(id)
name TEXT NOT NULL
slug TEXT NOT NULL
status TEXT NOT NULL DEFAULT draft
CHECK (status IN (draft, published, closed, archived))
definition JSONB NOT NULL DEFAULT {} -- form field definitions + logic
settings JSONB NOT NULL DEFAULT {} -- branding, limits, success page, etc.
version INTEGER NOT NULL DEFAULT 1
custom_domain TEXT
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
deleted_at TIMESTAMPTZ
UNIQUE (organization_id, slug)

Table: form_submissions
id TEXT PRIMARY KEY (UUIDv7)
organization_id UUID NOT NULL REFERENCES organizations(id)
form_id TEXT NOT NULL REFERENCES forms(id)
form_version INTEGER NOT NULL
submitter_email TEXT
submitter_ip TEXT
data JSONB NOT NULL DEFAULT {} -- field_id -> answer
status TEXT NOT NULL DEFAULT partial
CHECK (status IN (partial, complete, voided))
current_role TEXT -- for multi-role forms: which role is next
submitted_at TIMESTAMPTZ
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at TIMESTAMPTZ NOT NULL DEFAULT now()

Table: form_roles
id TEXT PRIMARY KEY (UUIDv7)
organization_id UUID NOT NULL REFERENCES organizations(id)
form_id TEXT NOT NULL REFERENCES forms(id)
role_name TEXT NOT NULL
sort_order INTEGER NOT NULL DEFAULT 0
fields JSONB NOT NULL DEFAULT [] -- field IDs assigned to this role
routing_email TEXT -- static email for routing, if not dynamic
created_at TIMESTAMPTZ NOT NULL DEFAULT now()

Table: form_magic_links
id TEXT PRIMARY KEY (UUIDv7)
organization_id UUID NOT NULL REFERENCES organizations(id)
form_id TEXT NOT NULL REFERENCES forms(id)
submission_id TEXT NOT NULL REFERENCES form_submissions(id)
role_name TEXT NOT NULL
token_hash TEXT NOT NULL UNIQUE -- SHA-256
expires_at TIMESTAMPTZ NOT NULL -- 7 days
used_at TIMESTAMPTZ
created_at TIMESTAMPTZ NOT NULL DEFAULT now()

All tables: RLS required + data-manifest registration.

### Backend Implementation

Module: apps/api/src/modules/forms/ (NEW module)

Files:
forms.module.ts
forms.controller.ts
forms-submission.controller.ts
forms.service.ts
forms-submission.service.ts
forms-routing.service.ts
forms-magic-link.service.ts
processors/
process-form-submission.processor.ts (BullMQ)
dto/
create-form.dto.ts
form-response.dto.ts
submit-form.dto.ts
form-submission-response.dto.ts
**tests**/
forms.service.spec.ts
forms-submission.service.spec.ts
forms.e2e-spec.ts

External-facing (no auth required):
GET /f/:orgSlug/:formSlug Public form view (server-rendered Next.js page)
POST /api/v1/public/forms/:formId/submit Submit a form response (rate limited)
GET /api/v1/public/forms/continue/:token Continue multi-role form via magic link

Authenticated REST Endpoints:
POST /api/v1/forms Create form
GET /api/v1/forms List forms (cursor paginated)
GET /api/v1/forms/:id Get form with definition
PATCH /api/v1/forms/:id Update form (version bump if published)
DELETE /api/v1/forms/:id Soft-delete form
POST /api/v1/forms/:id/publish Publish draft form
POST /api/v1/forms/:id/close Close form to new submissions

GET /api/v1/forms/:id/submissions List submissions (cursor paginated)
GET /api/v1/forms/:id/submissions/:subId Get one submission
GET /api/v1/forms/:id/submissions/export Download CSV

Routing rules enforcement:
In process-form-submission.processor.ts:

1. Validate submission data against form definition
2. Check form status (reject if closed)
3. Check one-response-per-email limit
4. Store submission to form_submissions table
5. Evaluate routing rules
6. If multi-role: create magic link for next role, send email
7. If complete: fire outbox event form.completed
8. If signing field: initiate BoldSign signing via SigningProviderPort
9. If payment field: initiate payment via payment method

### Tests Required

Unit:

- createForm() generates slug collision-safe
- submitForm() validates required fields
- submitForm() one-response-per-email: second submission from same email rejected
- submitForm() closed form returns 403
- submitForm() total submissions limit enforced
- multi-role routing: after role 1 submission, magic link created for role 2
- magic link: expired token returns 401
- magic link: used token returns 401

Integration:

- Full form flow: create -> publish -> public submit -> submission stored
- Multi-role: role 1 submit -> email sent -> role 2 fills their section -> complete
- CSV export contains all submission data
- Form versioning: edit after publish -> existing submissions still reference old version
- RLS: Org A cannot access Org B forms or submissions
- Rate limiting: 10 submissions per IP per minute enforced

### Definition of Done for Sprint 3.11

- [ ] forms, form_submissions, form_roles, form_magic_links tables with RLS + manifest
- [ ] Form builder UI (drag-and-drop, all field types, conditional logic)
- [ ] Public form page (server-rendered, accessible without login)
- [ ] Form submission API (rate limited, validation, one-per-email enforcement)
- [ ] Multi-role routing with magic links
- [ ] Form versioning (edits to published form do not break existing submissions)
- [ ] Routing rules (answer-based email routing)
- [ ] Submission inbox and CSV export
- [ ] Embed code and QR code generation
- [ ] ADR-0057 written
- [x] All tests pass

---

## Sprint 3.12 - Full REST API + SDKs + Mobile App Architecture

This sprint finalizes the developer platform (public REST API, SDKs, Postman, OpenAPI)
AND produces the complete mobile app architecture specification.
The mobile app implementation itself is deferred until demand warrants it.

### Part A: Full Public REST API

1. API Versioning and Stability
   - All public endpoints are under /api/v1/ (versioned, permanent per I-08)
   - Breaking changes require a new version (/api/v2/)
   - Deprecated endpoints: return Deprecation: true header with sunset date
   - API changelog maintained in docs/api/CHANGELOG.md

2. API Key Management (finalize from Phase 0)
   - API keys generated via: POST /api/v1/api-keys
   - Keys are shown ONCE on creation (plaintext)
   - Stored as SHA-256 hash (NOT bcrypt - per forbidden patterns)
   - Key scopes: read:documents, write:documents, read:analytics, etc.
   - Key rate limits: 1000 req/min per key (configurable per plan)
   - Admin MFA required to create or revoke API keys (verify enforced)
   - Keys appear in audit_log_entries on every authenticated API call

3. OpenAPI Spec (Blueprint requirement)
   - Auto-generated from NestJS @ApiProperty decorators (swagger module)
   - File: docs/api/openapi.yaml (generated on every CI build)
   - All endpoints documented with: description, request body, response schemas, errors
   - Authentication documented: Bearer token (JWT) and API key (header X-Api-Key)
   - Available at: GET /api/docs (Swagger UI in dev, disable in production)

4. Postman Collection
   - Auto-generated from OpenAPI spec using openapi-to-postman
   - Includes: environment variables (base URL, API key), pre-request scripts,
     example requests for all major flows
   - Exported to: docs/api/pactintel.postman_collection.json
   - GitHub Actions step to regenerate on every openapi.yaml change

5. JavaScript/TypeScript SDK
   - Package: @pactintel/sdk (published to npm)
   - Location: libs/sdk/ in the monorepo
   - Generated from OpenAPI spec using openapi-generator-cli (typescript-axios template)
   - Manual wrappers for complex flows: createAndSendDocument(), trackDocumentStatus()
   - Includes: type definitions for all entities, error classes, retry logic
   - README with quickstart examples
   - npm publish via GitHub Actions on version tag

6. Webhook Documentation and Testing
   - All webhook events documented in docs/api/webhooks.md
   - Webhook events: document.sent, document.viewed, document.signed, document.expired,
     signature.completed, payment.completed, form.submitted, workflow.completed, etc.
   - Webhook delivery: POST to configured URL with HMAC-SHA256 signature header
   - Retry policy: 3 retries with exponential backoff (1s, 4s, 16s)
   - Webhook test endpoint: POST /api/v1/webhooks/:id/test (sends example payload)

7. MCP Connector
   - Blueprint Section 5.13: An MCP connector so AI agents can trigger document/signature/workflow actions
   - MCP server: apps/mcp-server/ (a separate Cloud Run service)
   - MCP tools exposed: create_document, send_document, get_document_status,
     list_documents, create_signature_request, get_signature_status,
     trigger_workflow, search_portfolio
   - Authentication: API key in MCP client config
   - IaC: infra/modules/cell/mcp-server.tf

8. Embedded API (White-Label)
   - Embedded editing API: create a document editor that loads inside an iframe on customers website
   - Embedded signing API: create a signing flow that loads inside an iframe on customers site
   - These require: postMessage communication, CSP headers allowing embedding,
     a dedicated /embed/editor and /embed/sign routes

### Part B: Mobile App Architecture Specification

NOTE: Implementation is deferred. This section is the COMPLETE architecture specification
so that when implementation begins, zero design decisions remain open.

Technology Decision:

- Framework: React Native with Expo (managed workflow)
- Navigation: Expo Router (file-based routing)
- State: Zustand (matches web app pattern)
- HTTP: Axios (same interceptors as web app)
- Push Notifications: Expo Notifications (maps to FCM for Android, APNs for iOS)
- Storage: Expo SecureStore (replaces localStorage for auth tokens)
- Document Rendering: WebView (loads the recipient web page - NOT a native renderer)
- Signing: WebView (loads the signing flow - NOT native reimplementation)
- Camera: Expo Camera (for camera-scan-to-document feature)
- OCR: Google Cloud Vision API (same as web, via API call)

Mobile App Screens (Phase 3 Architecture, Phase 4+ Implementation):
Screen M-01: Login / Auth (WorkOS AuthKit mobile flow)
Screen M-02: Home Dashboard (recent docs, pending actions, quick-create)
Screen M-03: Documents Hub (list with status filters, search)
Screen M-04: Document Detail (status, recipients, analytics, actions)
Screen M-05: Recipient View (WebView of the recipient web page)
Screen M-06: Signing Flow (WebView of the signing flow)
Screen M-07: Signing Center (pending/completed/declined)
Screen M-08: Analytics Dashboard (mobile-optimized charts)
Screen M-09: Notifications Center (push + in-app)
Screen M-10: Camera Scan (scan paper doc, upload to PactIntel)
Screen M-11: Profile / Settings

Mobile Features (Phase 3 Architecture, Phase 4 Implementation):

- Create from template (fill variables, no full editing in Phase 4)
- Full editing: Phase 5 (requires mobile-optimized Tiptap editor component)
- Track documents: full status + analytics
- E-sign: as a signer (WebView of signing flow)
- In-person signing on shared device (existing feature, works in WebView)
- Real-time push alerts (FCM + APNs via Expo)
- Camera scan to document (Expo Camera -> Cloud Vision OCR -> upload)

Backend Changes Required for Mobile (implement NOW in Sprint 3.12):

1. FCM/APNs device token registration:
   POST /api/v1/devices/register (saves device_token to devices table)
2. Push notification delivery:
   Extend NotificationService to dispatch via FCM/APNs when device token exists
3. Device token table:
   Table: devices
   id TEXT PRIMARY KEY (UUIDv7)
   organization_id UUID NOT NULL REFERENCES organizations(id)
   user_id UUID NOT NULL REFERENCES users(id)
   platform TEXT NOT NULL CHECK (platform IN (ios, android))
   token TEXT NOT NULL UNIQUE
   created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
   RLS required. Data-manifest required.
4. On user logout: DELETE /api/v1/devices/:id (remove token)

Mobile Authentication Flow:

- WorkOS AuthKit React Native SDK handles OAuth/SAML login
- Refresh tokens stored in Expo SecureStore (NOT AsyncStorage)
- Token rotation: when access token expires, use refresh token silently
- Biometric unlock: Expo LocalAuthentication protects app entry
- On biometric failure > 3 times: require full re-login

Mobile API Contracts (permanent from I-08):

- Mobile uses the same REST API as the web app (/api/v1/)
- User-Agent header: PactIntel-Mobile/1.0.0 (iOS/Android)
- Mobile-specific endpoints (ONLY these additional ones):
  POST /api/v1/devices/register Register push token
  DELETE /api/v1/devices/:id Deregister push token
  POST /api/v1/documents/scan Upload camera scan for OCR
- All other endpoints are shared with the web app

Mobile IaC:

- Firebase project for FCM (GCP Firebase, not a separate vendor)
- APNs certificate stored in Secret Manager
- infra/modules/cell/fcm.tf

Mobile Monorepo Location:

- apps/mobile/ (Expo project)
- libs/shared/ (shared TypeScript types with web and API)
- Nx project: @pactintel/mobile

### REST Endpoints Summary for Sprint 3.12

API Keys:
POST /api/v1/api-keys Create key (MFA required)
GET /api/v1/api-keys List keys (hashed, never plaintext)
DELETE /api/v1/api-keys/:id Revoke key

Webhooks:
POST /api/v1/webhooks Create webhook subscription
GET /api/v1/webhooks List webhooks
PATCH /api/v1/webhooks/:id Update webhook
DELETE /api/v1/webhooks/:id Delete webhook
POST /api/v1/webhooks/:id/test Send test payload to webhook URL

Devices (for mobile):
POST /api/v1/devices/register Register device push token
DELETE /api/v1/devices/:id Deregister device

Documents (for scan):
POST /api/v1/documents/scan Upload camera scan image -> OCR -> return text + presigned upload

### Tests Required

Unit:

- API key creation: returns plaintext once, stores SHA-256 hash
- API key authentication: request with valid API key -> authenticated as org
- API key rate limit: 1001st request in minute returns 429
- Webhook delivery: HMAC-SHA256 signature correct in X-Webhook-Signature header
- Webhook retry: failed delivery retried 3 times with exponential backoff
- Device registration: stores FCM/APNs token for user
- Push notification: when device registered, NotificationService dispatches to FCM/APNs

Integration:

- Full API key flow: create -> authenticate via X-Api-Key -> access endpoint -> audit log
- API key rate limiting enforced
- Webhook: document.signed event triggers delivery to configured URL (mocked target)
- Webhook HMAC signature verifiable by recipient
- OpenAPI spec generated and valid (run openapi-validator in CI)
- SDK: auto-generated from spec and compiles without errors

### Definition of Done for Sprint 3.12

- [ ] API key management with SHA-256 hashing and rate limiting
- [ ] OpenAPI spec auto-generated in CI and committed to docs/api/
- [ ] Postman collection auto-generated from OpenAPI spec
- [ ] TypeScript SDK generated and builds cleanly
- [ ] Webhook subscriptions with HMAC-SHA256 signing
- [ ] Webhook retry policy (3 attempts, exponential backoff)
- [ ] Webhook test endpoint
- [ ] MCP server Cloud Run service deployed (IaC)
- [ ] Embedded editor and signing iframe routes
- [ ] devices table with RLS + data-manifest (for mobile push)
- [ ] FCM/APNs push notification delivery in NotificationService
- [ ] Mobile app architecture document in docs/mobile/ARCHITECTURE.md
- [ ] apps/mobile/ Expo project scaffold created (empty, not implemented)
- [ ] ADR-0058 written (public API design + SDK generation)
- [x] All tests pass

---

---

## Cross-Cutting Phase 3 Requirements

These apply across ALL sprints, not just one. Every implementing agent must verify these
are met at every PR review.

### 1. i18n Framework (Multi-Language Support)

Blueprint Phase 3 requires: react-intl i18n framework with initial support for 5 languages.

Implementation:

- Install react-intl in apps/web/
- Extract all hardcoded strings to libs/i18n/messages/{locale}.json
- Supported locales in Phase 3: en-US, fr-FR, de-DE, es-ES, pt-BR
- Default locale: en-US
- Locale detection: Accept-Language header on first visit, saved to user preferences
- Language switcher: in user profile settings
- Outbound emails: sent in the org configured language (stored in organizations.locale)
- Document CONTENT is still user-generated, no auto-translation of document content
- RTL support: not required in Phase 3 (deferred)

Backend:

- Modify organizations table: ADD COLUMN locale TEXT NOT NULL DEFAULT en-US
- Modify users table: ADD COLUMN locale TEXT NOT NULL DEFAULT en-US
- NotificationService: pass locale to email template renderer
- Email templates: one version per supported locale in libs/notifications/templates/

### 2. AI Guardrails (Full Implementation)

Blueprint Section 13.13 RULE AI-003: AI guardrails are enforced server-side.
Phase 2 delivered basic guardrails. Phase 3 delivers the FULL guardrail system.

What is added in Phase 3:

- Guardrail configuration UI: Admin panel for AI settings
- Guardrail types:
  a. Workspace restriction: AI disabled for specific workspaces
  b. Data source restriction: which CRM fields AI can use
  c. Content variation restriction: which content Smart Content can vary
  d. AI feature kill switch: completely disable all AI features for org
- Guardrails stored in organizations.settings.ai_guardrails JSONB
- AiGateway checks guardrails before every LLM call (not just some)
- If violation: 403 with structured error { code: AI_GUARDRAIL_VIOLATION, violated_rule: ... }

### 3. Design System Compliance (ALL Sprints)

Before submitting any frontend PR, verify ALL of the following:

Colors:

- Primary color (#2563EB Blue 600): ONLY for interactive elements, never decoration
- No gradient backgrounds
- No glassmorphism
- No cream-terracotta or near-black-acid-accent palettes
- Only Gray-900 to Gray-50 scale for neutrals

Typography:

- Inter is the ONLY typeface
- No second fonts added anywhere
- No ALL-CAPS eyebrow labels

Layout:

- Tables for list data (Documents Hub, Contracts, Payments, Submissions)
- Real <table> elements, not card grids
- Borders for structure, shadows ONLY for floating elements

Animations:

- No scattered fade-in animations
- Respect prefers-reduced-motion media query on ALL animations

Accessibility:

- WCAG AA: 4.5:1 contrast ratio minimum on all text
- Visible focus rings on all interactive elements
- All forms: proper labels, error states, ARIA roles

States (Required on EVERY screen):

- Empty state: illustration + helpful message + primary action
- Loading state: skeleton screens (not spinners unless inside a button)
- Error state: inline error message + retry action

External-Facing Pages (Recipient, Signing, Payment, Form, Deal Room):

- These get MORE design attention than internal screens
- Must be stunning on mobile (recipient views from phone)
- Must work offline-gracefully (show last-known content if network drops)

### 4. Security Headers (All HTTP Responses)

Verify these headers are set on ALL responses (should be from Phase 0, verify in Phase 3):
Content-Security-Policy: strict-dynamic; script-src self; object-src none
X-Frame-Options: DENY (except /embed/ routes which need SAMEORIGIN or specific origin)
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload

Phase 3 addition: /embed/ routes (iframe embedding) need relaxed CSP:
Frame-ancestors: <allowed origins from org configuration>
This requires the org to whitelist their domain in security settings.

### 5. Error Handling (All Sprints)

RULE ERR-001: Never expose stack traces, database errors, or internal IDs to end users.
RULE ERR-002: All external API calls have timeouts and circuit breakers.

Every new external HTTP client in Phase 3 MUST have:

- Request timeout: 10 seconds
- Connection timeout: 5 seconds
- Circuit breaker: 5 failures in 60 seconds -> open for 30 seconds
- Retry: 2 retries for idempotent operations only (GET requests)
- Non-idempotent operations (POST to create charge): NO automatic retry
- Circuit breaker state stored in Redis (shared across instances)
- When circuit opens: alert sent to ops channel

External clients added in Phase 3 requiring circuit breakers:

- Risk scoring vendor (Sprint 3.7)
- Meilisearch (Sprint 3.5) - fallback to PostgreSQL FTS when open
- SCIM IdP (Sprint 3.9) - graceful degradation on failure
- FCM (Sprint 3.12) - retry but do not block document operations
- APNs (Sprint 3.12) - same as FCM

### 6. Outbox Pattern (All Side Effects)

Every new event that crosses module boundaries in Phase 3 MUST use the outbox pattern.

New outbox event types introduced in Phase 3:
cpq.bundle.created
cpq.rule.activated
workflow.triggered
workflow.completed
workflow.failed
deal_room.member.invited
deal_room.message.posted
guided_proposal.assembled
obligation.pending_update
obligation.reminder
form.submitted
form.completed
verification.kba.passed
verification.kba.locked
verification.id.passed
verification.qes.applied
analytics.engagement.disengaged
analytics.engagement.reengaged
push_notification.sent

All outbox events: written to outbox_events table in same DB transaction as the business operation.
The outbox relay (already running from Phase 0) picks them up and publishes to BullMQ.

### 7. Data Manifest (All New Tables)

Every new table added in Phase 3 MUST be registered in libs/data-manifest/ before the
migration is run. CI will block merges that add unregistered tables.

Required manifest fields for each table:
name: table name
module: which NestJS module owns it
owner: team/squad responsible
residency: which cells this table lives in (e.g., gcp-us1, gcp-eu1)
retention: data retention policy (e.g., 7 years for legal evidence, 2 years for analytics)
erasure: how data is erased when requested (GDPR right to erasure)
export: how data is exported on customer request
rls_enabled: true for all tenant-scoped tables
backup: included in PITR backup policy

New tables in Phase 3 requiring manifest entries:
Sprint 3.1: product_bundles, bundle_items, pricing_rules, cpq_playbooks
Sprint 3.2: workflow_definitions, workflow_instances, workflow_node_executions
Sprint 3.3: deal_room_messages, deal_room_documents, deal_room_magic_links
Sprint 3.4: no new tables (uses existing AI infrastructure)
Sprint 3.5: obligation_records, counterparties, custom_extraction_fields
Sprint 3.6: no new tables (modifies signers)
Sprint 3.7: pre_verified_signers (global, not tenant-scoped)
Sprint 3.8: no new tables (modifies existing)
Sprint 3.9: no new tables (modifies organizations)
Sprint 3.10: custom_reports
Sprint 3.11: forms, form_submissions, form_roles, form_magic_links
Sprint 3.12: devices

### 8. Prisma Migration Rules (All Sprints)

Every migration MUST follow the expand-and-contract pattern (RULE INFRA-001):

Step 1 (Expand): Add new column as NULLABLE or with DEFAULT. Deploy migration.
Step 2 (Backfill): Run data migration to populate existing rows if needed.
Step 3 (Contract): In SUBSEQUENT migration, add NOT NULL constraint.

NEVER: Drop a column and update app code in the same deployment.
NEVER: Add a NOT NULL column without a DEFAULT in a single migration.
NEVER: Rename a column directly (create new, backfill, update code, drop old).

Every migration must be accompanied by:

1. Update to libs/data-manifest (required or CI blocks)
2. RLS policy creation if new tenant-scoped table
3. Immutability trigger if the table is audit-only (signature_events style)

### 9. Testing Standards (All Sprints)

Minimum test coverage targets for Phase 3:

- Unit tests: 80% line coverage on all new service files
- Integration tests: At least one happy-path and one RLS isolation test per new module
- CASL tests: At least one test per new CASL subject verifying role boundaries
- Contract tests: For every new external port adapter

Test file naming conventions:
Unit: *.spec.ts (co-located with source file in **tests**/ subdirectory)
Integration: *.e2e-spec.ts (in module **tests**/ subdirectory)
Contract: *.contract-spec.ts (in port adapter directory)

Test utilities (from Phase 2, use these - do not recreate):
TestDatabaseModule: spins up isolated PostgreSQL with RLS context set
TestClickhouseModule: mocked ClickHouse client
TestBullmqModule: in-memory BullMQ for processor testing
TestAiGateway: mock AI responses without calling real LLM APIs
TestSigningProvider: mock BoldSign responses
TestPaymentProvider: mock Paddle responses

---

## ADR Registry - Phase 3 Required ADRs

Before the end of Phase 3, all the following ADRs must exist in docs/adr/:

ADR-0048: Phase 3 Sprint 3.1 - Full CPQ Rules Engine Design
ADR-0049: Phase 3 Sprint 3.2 - Workflow Orchestration Engine Design
ADR-0050: Phase 3 Sprint 3.3 - Deal Room Architecture and Magic Link Pattern
ADR-0051: Phase 3 Sprint 3.4 - Guided AI Proposal Builder and URL-to-Draft
ADR-0052: Phase 3 Sprint 3.5 - AI Data Extraction Architecture and Meilisearch Migration
ADR-0053: Phase 3 Sprint 3.6 - Advanced ID Verification (KBA, Gov ID, QES)
ADR-0054: Phase 3 Sprint 3.7 - Risk-Adaptive Identity Verification Vendor Selection
ADR-0055: Phase 3 Sprint 3.8 - Multi-Workspace Architecture and RLS Strategy
ADR-0056: Phase 3 Sprint 3.9 - SAML SSO Implementation via WorkOS
ADR-0057: Phase 3 Sprint 3.11 - Standalone Forms Architecture
ADR-0058: Phase 3 Sprint 3.12 - Public REST API Design, SDK Generation, MCP Connector

Each ADR must use the standard format:

## Status: Proposed | Accepted | Superseded

## Context: Why this decision was needed

## Decision: What was decided

## Consequences: Pros and cons

## Alternatives Considered: What else was evaluated

---

## Phase 3 Definition of Done

Phase 3 is COMPLETE when ALL of the following are true:

Product:

- [ ] Sprint 3.1 through 3.12 Definition of Done items all checked
- [ ] All 12 ADRs written and in docs/adr/
- [ ] SOC 2 Type II audit passed (or formal audit scheduled with evidence submitted)
- [ ] 5 languages live in the UI (en-US, fr-FR, de-DE, es-ES, pt-BR)
- [ ] URL-to-draft free tool live at /ai/url-to-draft
- [ ] Mobile app architecture document complete in docs/mobile/ARCHITECTURE.md
- [ ] apps/mobile/ scaffold created (empty Expo project wired into Nx)

Quality:

- [ ] pnpm nx run-many --target=test --all - all green
- [ ] pnpm nx run-many --target=lint --all - zero violations
- [ ] pnpm nx run api:validate-manifest - all tables registered
- [ ] No forbidden patterns in codebase (verified by ESLint custom rules)
- [ ] All external clients have circuit breakers (verified by integration tests)
- [ ] All new tenant-scoped tables have RLS (verified by RLS test suite)

Security:

- [ ] SAML SSO live and tested with at least one real IdP (Okta or Azure AD)
- [ ] SCIM user provisioning working
- [ ] MFA enforced for all admin-role users creating API keys
- [ ] Penetration test completed (Phase 3 SOC 2 requirement)
- [ ] Vanta compliance monitoring active

Infrastructure:

- [ ] All Phase 3 GCP resources created via IaC (zero console-created)
- [ ] Meilisearch Cloud Run service deployed with correct IaC labels
- [ ] MCP server Cloud Run service deployed
- [ ] FCM Firebase project created via IaC
- [ ] All mandatory GCP resource labels present: env, cell, service, tier

Developer Platform:

- [ ] OpenAPI spec committed and valid
- [ ] Postman collection committed
- [ ] TypeScript SDK published to npm (@pactintel/sdk)
- [ ] All webhook events documented in docs/api/webhooks.md
- [ ] API changelog started in docs/api/CHANGELOG.md

---

## Phase 4 Preview (Do Not Build Yet)

The following features are in PHASE 4 scope. Do NOT build them in Phase 3.
If a user story or PR would implement any of these, stop and flag it.

- RON (Remote Online Notarization) live session room (5.19 - Notary add-on)
- Account-level security monitoring and anomaly detection (5.21 - DocuSign Monitor equivalent)
- Full document content translation via LLM (Phase 4 i18n scope)
- Sub-accounts with isolated billing (Enterprise tier)
- Full mobile app implementation (architecture done in Phase 3, code in Phase 4+)
- Custom roles and granular admin-panel permissioning (Enterprise)
- Workspace-to-workspace document sharing across organizations
- Full ERP adapters (SAP, NetSuite native API - Phase 3 uses webhooks)
- Full mobile document editing (requires mobile-optimized Tiptap)
- HIPAA workspace configuration (BAA + 21 CFR Part 11)
- Vanta automated evidence collection (Vanta API integration)

---

## Appendix A - New IaC Resources Required in Phase 3

All must be in infra/ before the corresponding sprint begins.

infra/modules/cell/meilisearch.tf:
Cloud Run service: pactintel-{env}-{cell}-meilisearch
Labels: env={env}, cell={cell}, service=meilisearch, tier=data
Min instances: 1, Max instances: 3
Memory: 2Gi, CPU: 1
Env vars: MEILI_MASTER_KEY from Secret Manager

infra/modules/cell/mcp-server.tf:
Cloud Run service: pactintel-{env}-{cell}-mcp
Labels: env={env}, cell={cell}, service=mcp, tier=api
Min instances: 0, Max instances: 5
Memory: 512Mi, CPU: 1

infra/modules/cell/fcm.tf:
Firebase project for FCM (google_firebase_project resource)
Labels: env={env}, cell={cell}, service=fcm, tier=notifications

infra/modules/cell/vanta.tf:
GCP service account for Vanta integration (read-only audit access)
IAM role: roles/viewer (org-level, scoped)

---

## Appendix B - Phase 3 Environment Variables

All new environment variables added in Phase 3.
Add to .env.example with placeholder values and comments.
Production values go in GCP Secret Manager.

Sprint 3.5 (AI/Portfolio):
MEILISEARCH_URL=http://localhost:7700
MEILISEARCH_API_KEY=<from Secret Manager>
CLOUD_VISION_ENDPOINT=https://vision.googleapis.com/v1/images:annotate

Sprint 3.7 (Risk Scoring):
RISK_SCORING_VENDOR_URL=<vendor API URL> [VERIFY: vendor to be selected in ADR-0054]
RISK_SCORING_API_KEY=<from Secret Manager>
RISK_SCORING_TIMEOUT_MS=5000

Sprint 3.9 (SAML/SCIM):
WORKOS_CLIENT_ID=<from WorkOS dashboard>
WORKOS_API_KEY=<from Secret Manager>
SCIM_API_KEY=<random 32-byte hex, from Secret Manager>

Sprint 3.12 (FCM/APNs):
FIREBASE_PROJECT_ID=<GCP Firebase project ID>
FIREBASE_SERVER_KEY=<from Secret Manager>
APNS_KEY_ID=<Apple APNs key ID>
APNS_TEAM_ID=<Apple developer team ID>
APNS_PRIVATE_KEY=<PEM from Secret Manager>
APNS_BUNDLE_ID=com.pactintel.app

---

END OF PHASE 3 BUILD PLAN

Total sprints: 12
Total estimated duration: 16-20 weeks
Total new database tables: 21
Total new ADRs: 11
Total new BullMQ queues: 7 (workflow-engine, document-extraction, obligation-reminders,
index-document, obligation-reminders, push-notifications, run-scheduled-report)
Total new Cloud Run services: 3 (meilisearch, mcp-server, mobile push relay)

For any question not answered in this plan: re-read docs/MASTER_IMPLEMENTATION_BLUEPRINT.md
before asking. If still not answered: ask the human engineer rather than guessing.
