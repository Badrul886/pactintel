# ADR-0043: Multi-Step Approval Workflows, Step Immutability, and Event-Driven Automation Engine

**Status:** Accepted  
**Date:** 2026-10-24  
**Authors:** System Architecture Team  
**Related:** [Blueprint §7, §8, §16, Invariant I-01, I-02, I-06, I-07, I-10, I-12, I-13](../MASTER_IMPLEMENTATION_BLUEPRINT.md), [Product Blueprint §7](../PRODUCT_BLUEPRINT.md), [Design System §15](../DESIGN_SYSTEM.md), [Phase 2 Build Plan](../../phase2_build_plan.md)

---

## Context

In enterprise contract negotiation and deal desk operations, documents exceeding specific commercial thresholds (e.g. $25,000) or containing non-standard legal language require multi-stage managerial or legal sign-offs before transmission or final counter-signature.
Additionally, revenue operations and legal teams require event-driven automation rules to trigger webhooks, notify stakeholders, and enqueue follow-ups based on document lifecycle events.

Key architectural and legal hazards:

1. **Decision Immutability (RULE WF-003)**: In legal compliance, an approval or rejection decision must be tamper-proof. Once an approver registers a decision, it cannot be silently flipped or retracted.
2. **Orphaned Approval Prevention (RULE WF-001)**: If an approver leaves the company or is deactivated while a contract is stalled at their step, the workflow must deterministically escalate to a fallback approver or workspace admin.
3. **No In-Process Cron (Invariant I-07)**: Automated checks for stalled approval steps must use BullMQ job schedulers (`upsertJobScheduler`), never in-process `@Cron` or memory loops.
4. **Automation Recursion & Cascading Loops (RULE WF-002)**: An automation rule triggered by `document.signed` that updates document tags could re-trigger another rule. The engine must enforce strict loop detection (`chainDepth <= 5`) and org-level circuit breaking (`100 executions/org/min`).
5. **Fault Isolation (Invariant I-12)**: If an external webhook or notification service fails during an automation sequence, it must not abort sibling actions or break the primary business transaction.
6. **Financial Precision**: All deal value evaluations (`minDealValue`) must use `Decimal.js` to eliminate IEEE 754 floating-point inaccuracies.

---

## Decisions

### 1. Approval Chain & Step State Machine

- `approval_chains` define conditions: `triggerOn` (`document.sent`, `document.signed`, `manual`), `minDealValue` (Decimal.js evaluated against CPQ total or document value), and optional `workspaceIds`.
- `approval_steps` are instantiated sequentially (`stepOrder = 1..N`):
  - Initial step starts in `status = 'pending'`. Remaining steps start in `status = 'pending'` or are activated sequentially.
  - Step status transitions: `pending` → `approved` | `rejected` | `skipped`.
  - Rejection cascade: When a step is rejected, all remaining pending steps are updated to `'skipped'`, the document status is updated to `'approval_rejected'`, and an outbox event `approval.chain.rejected` is emitted.
  - Approval cascade: When a non-final step is approved, the subsequent step order is activated (`status = 'pending'`) and the next approver is notified. When the final step is approved, the document status is updated to `'approval_complete'`, and `approval.chain.approved` is emitted.

### 2. Decision Immutability (RULE WF-003)

- Immutability is enforced at both the database and application levels:
  - Database: PostgreSQL trigger `prevent_approval_step_remutation()` raises an exception if any `UPDATE` is attempted on a step already in `'approved'` or `'rejected'` status.
  - Application: `ApprovalService` checks step status and throws `ConflictException` if a step is already decided.
  - Audit trail: Every decision appends an entry to `audit_log_entries` and emits `approval.step.decided` through the transactional outbox.

### 3. Approver Deactivation Escalation (RULE WF-001)

- Hooked into `OrganizationService.deactivateUser()`:
  - Queries all `approval_steps` where `approver_id = userId` and `status = 'pending'`.
  - Reassigns each step to `fallback_approver_id` if active; otherwise reassigns to the first active workspace admin/owner.
  - Writes audit log `approval.step.auto_reassigned` and notifies the new approver and document owner.

### 4. Stalled Step Timeout Job (Invariant I-07)

- Scheduled via BullMQ `upsertJobScheduler('approval-timeout-check-hourly', { pattern: '0 * * * *' })`.
- Queries steps where `status = 'pending'` and `now() > created_at + interval '1 hour' * timeout_hours`.
- Escalates stalled steps to the fallback approver or workspace admin.

### 5. Automation Rules Engine & Loop Detection (RULE WF-002)

- Evaluates rules matching outbox trigger events.
- Loop Prevention:
  - Propagates an `ExecutionContext { chainDepth, chainId, organizationId }`.
  - If `chainDepth >= 5`, aborts execution, logs warning, and writes `automation.skipped_loop` to audit log.
- Rate Limiting & Circuit Breaker:
  - Redis counter `automation:execcount:{orgId}` enforces a maximum of 100 executions per minute per tenant.
  - Exceeding 100 sets `automation:paused:{orgId}` for 5 minutes and alerts the administrator.
- Fault Isolation (Invariant I-12):
  - Each action (`send_notification`, `send_email`, `add_to_follow_up`, `trigger_webhook`, `update_document_tag`) executes within isolated `try/catch` boundaries. Action errors are logged and recorded without throwing or aborting sibling actions.

---

## Consequences

- **Positive:** Enterprise contracts are safeguarded with verifiable, legally defensible, tamper-proof approval audit trails.
- **Positive:** Automations execute reliably without risk of infinite loops, memory leaks, or unhandled third-party downtime.
- **Positive:** Full compatibility with Invariant I-07 (no in-memory cron) and Invariant I-10 (data manifest verified).
