# ADR-0049: Phase 3 Sprint 3.2 — Visual Workflow Orchestration Engine (5.19 Maestro-equivalent)

## Status: Accepted

## Context

Phase 2 provided simple trigger-action automation rules (`automation_rules`) and linear approval workflows (`approval_chains`). However, enterprise contract lifecycles require a unified, multi-step orchestration engine capable of coordinating document generation, multi-party reviews, automated compliance checks, dynamic branching, delays, payment collection, and bi-directional synchronisation with enterprise systems (ITSM and ERP) as a single connected flow.

Key enterprise requirements:

1. **Full Agreement Lifecycle DAGs**: Workflows defined as Directed Acyclic Graphs (DAGs) containing trigger, condition (branching), action, risk-assessment, delay, and end nodes.
2. **Reliable Asynchronous Execution**: Node processing must be robust, horizontally scalable, and distributed across background worker pools via BullMQ.
3. **Infinite Loop & Runaway Guardrails (`RULE WF-002`)**: Guarding against circular dependencies, self-triggering document loops, and recursive cascade storms.
4. **Tenant Isolation & Rate Limiting**: Workflows must be tenant-isolated with per-organization rate limits (100 executions/min) and circuit breakers.
5. **Subscription Tier Enforcement**: Active workflow count per organization must respect plan tier limits with 402 `WORKFLOW_LIMIT_REACHED` gating.
6. **Enterprise System Integration**: Standardized integration with ITSM (ServiceNow, Jira Service Management) and ERP (SAP, NetSuite) systems via outbound webhooks adhering to the `IntegrationPort` boundary.
7. **Execution Visibility & Auditability**: Real-time instance tracking, step-by-step audit logs, error reporting, and administrative resume/halt controls.

---

## Decisions

### 1. Directed Acyclic Graph (DAG) Storage Model

- Workflow definitions are stored in PostgreSQL table `workflow_definitions` with a `dag` JSONB column.
- The DAG data model consists of:
  - `nodes`: Array of `{ id: string; type: 'trigger' | 'condition' | 'action' | 'risk_assessment' | 'delay' | 'end'; label: string; config: Record<string, any>; position: { x: number; y: number } }`.
  - `edges`: Array of `{ id: string; source: string; target: string; sourceHandle?: 'true' | 'false' | 'default'; label?: string }`.
- Graph cycles are rejected at definition save/publish time through depth-first search (DFS) cycle detection.

### 2. BullMQ Event-Driven Queue & Execution Mechanics

- A dedicated BullMQ queue named `workflow-engine` processes workflow nodes asynchronously.
- Inbound domain events (from transactional outbox relay) trigger workflow engine evaluation:
  - When an event occurs (`document.created`, `document.sent`, `document.signed`, `payment.completed`, `approval.decided`), `WorkflowEngineService` queries all active `workflow_definitions` for the tenant matching `trigger_event`.
  - For each matching definition, a `workflow_instances` record is initialized with status `'running'`.
  - The trigger node's downstream successor nodes are enqueued into BullMQ as `ProcessWorkflowNodeJob` jobs:
    `{ instanceId: string; nodeId: string; organizationId: string }`.
- Delay nodes leverage BullMQ's native delayed job scheduling (`{ delay: delayInMilliseconds }`), upholding **Invariant I-07** (no in-process `@Cron` or `setTimeout`).
- Worker execution strictly manages tenant context via `ClsService` (`cls.set('organizationId', job.data.organizationId)`), resetting it upon completion.

### 3. Loop Detection & Runaway Guardrails (`RULE WF-002`)

To prevent infinite loops and runaway compute resource exhaustion:

1. **Chain Depth Limit**: Each instance maintains a `chain_depth` integer counter starting at 0 and incremented at every node execution. If `chain_depth >= 20` (`MAX_WORKFLOW_CHAIN_DEPTH`), the instance is terminated with status `'halted'` and error code `'MAX_CHAIN_DEPTH_EXCEEDED'`.
2. **Node Re-entry Detection**: Each instance maintains a `visited_nodes` JSONB array of executed node IDs. If the processor encounters a `nodeId` that is already present in `visited_nodes`, the instance is immediately halted with error code `'LOOP_DETECTED'`.
3. **Tenant Rate Cap Circuit Breaker**: Workflow executions per organization are rate-limited to 100 executions per minute (tracked in Redis via sliding window / fixed window counter). Exceeding this activates a 5-minute circuit breaker pausing workflow dispatches for that organization, logging a security audit event, and alerting administrators.

### 4. Enterprise Integration (ITSM & ERP) via Port Boundaries (Invariant I-05)

- Standardized actions `trigger_webhook`, `update_crm_field`, and `update_erp_field` communicate externally using `IntegrationPort` / `WebhookService` adapters.
- No direct vendor SDKs (e.g. ServiceNow SDK or SAP SDK) are imported into the workflow module, enforcing lint rule `ADP-001`.
- Payloads are structured using standardized JSON schemas.

### 5. Multi-Tenant Database Design & RLS (Invariants I-02, I-03, I-10)

- Three new tables are introduced:
  - `workflow_definitions`: Defines the workflow template, version, trigger, and DAG.
  - `workflow_instances`: Tracks each runtime execution instance, state, visited nodes, and error reasons.
  - `workflow_node_executions`: Immutable step log capturing input, output, duration, and execution status per node.
- All three tables have non-nullable `organization_id` columns, indexed foreign keys, and PostgreSQL Row-Level Security enabled with `tenant_isolation` policies.
- Primary keys are generated as UUIDv7 via `generateId()`.
- All tables are registered in `libs/data-manifest/src/manifest.ts`.

### 6. Outbox Pattern for Lifecycle Events (Invariant I-06)

- Transitions emit outbox events within the same transaction: `workflow.triggered`, `workflow.completed`, and `workflow.failed`.

---

## Consequences

- **Pros**:
  - Provides a visual, no-code orchestration engine capable of replacing complex multi-tool enterprise orchestration (e.g., DocuSign Maestro).
  - High resilience through BullMQ distributed queues, isolation from API worker threads, and graceful delay handling.
  - Provable safety against infinite execution loops and runaway cascades.
  - Full audit trail of every automated decision and branch.
- **Cons**:
  - Requires maintaining BullMQ queue workers and state tracking in Redis alongside Cloud SQL.
  - Dynamic branching with conditional expressions requires strict validation to avoid runtime evaluation errors.

---

## Alternatives Considered

1. **Temporal / Cadence**: Considered for long-running workflows, but rejected to maintain zero-AWS/zero-heavy external orchestrator dependency in compliance with GCP-only Cloud Run and Memorystore architecture.
2. **In-process Promise Chains**: Rejected due to vulnerability to server restarts, lack of visibility into step state, and inability to handle multi-day delays safely.
3. **Database Stored Procedures**: Rejected because stored procedures cannot interact with external services, BullMQ queues, or emit outbox events cleanly.
