# ADR-0048: Phase 3 Sprint 3.1 — Full CPQ Rules Engine, Product Bundles, Playbooks & Approval Thresholds

## Status: Accepted

## Context

Phase 2 established basic CPQ primitives (Sprint 2.8), including product catalog CRUD, line-item level discounting, and fee libraries. However, enterprise customer requirements mandate a comprehensive Configure, Price, Quote (CPQ) layer capable of rivaling dedicated enterprise CPQ platforms:

1. **Product Bundles**: Grouping product catalog items with flexible pricing mechanics (fixed price, sum-of-items, percent discount), optional vs. required item toggling, copy-on-create bundle versioning, and CRM deal-record synchronisation.
2. **Pricing & Discount Rules Engine**: Organization-level automated rules governing volume discounts, total deal-value thresholds, customer segmentation parameters, and promotional time windows with deterministic stacking policies (`highest_wins`, `stack_all`, `first_match`).
3. **Guided-Selling Playbooks**: Guided multi-step selection workflows allowing sales reps to input deal criteria (industry, size, geography) and automatically receive filtered catalogs, recommended bundles, and pre-calculated discounts.
4. **CPQ Approval Thresholds**: Integration with approval workflows to prevent document dispatch whenever deal attributes violate pre-configured discount, deal size, or restricted SKU limits until formal management/finance approval is recorded.
5. **Native CRM-Embedded CPQ**: Frictionless quote generation via embeddable iframes for HubSpot Deal views and Salesforce Opportunity tabs, maintaining bidirectional synchronization.

As a platform governing legally enforceable commercial commitments, all calculations must be mathematically exact, auditable, tenant-isolated, and resilient against race conditions.

## Decisions

### 1. Pure Function Architecture for the Rules Engine

The CPQ Pricing Rules Engine (`evaluateCpqRules`) is implemented as a **pure function** free of side effects, database queries, and external network calls:

- All required state (line items, catalog definitions, active pricing rules, deal attributes, current timestamp) is queried by caller services prior to engine invocation.
- Deterministic evaluation guarantees 100% unit-testability, instant preview calculations, and zero database round-trips during interactive slider or quantity manipulations.
- All monetary arithmetic utilizes `Decimal.js` to exact 4 decimal precision (`db.Decimal(15, 4)` for prices and `db.Decimal(5, 2)` for percentages), strictly forbidding native floating-point math (`RULE CPQ-001`).

### 2. Deterministic Rule Stacking Policies

To eliminate pricing ambiguities across overlapping promotional rules:

- Rules are prioritized by explicit integer `priority` (ascending order).
- Stacking modes are strictly enforced:
  - `highest_wins`: The single rule offering the greatest discount value across the evaluated scope is applied.
  - `stack_all`: All matching rules apply cumulatively, calculating subsequent percentage discounts either on initial list subtotal or compounded net subtotal based on configuration.
  - `first_match`: The first rule matching criteria in priority sequence applies, terminating further evaluation.

### 3. Copy-on-Create Bundle Versioning & Immutability (Invariant I-09)

- Similar to template instantiation, adding a bundle to a document copies all item definitions into document `line_items`.
- Updating a `product_bundles` record increments its `version` integer. Documents generated under previous bundle revisions remain strictly immutable, preserving historic quote integrity.

### 4. CPQ Approval Threshold Integration (Rule WF-003)

- Existing `approval_chains` table is extended with a `cpq_conditions` JSONB column containing threshold parameters: `deal_value_gt`, `discount_pct_gt`, and `restricted_product_ids`.
- `DocumentService.sendDocument()` evaluates pending approval states: if an approval chain was triggered and step approvals remain unresolved (`status = 'pending'`), document dispatch is rejected with HTTP 403 `APPROVAL_REQUIRED`.

### 5. CRM-Embedded CPQ Scope (Iframe & PostMessage)

- A dedicated CRM embed route (`/api/v1/cpq/embed`) provides lightweight, white-labelable quoting capabilities for CRM host windows.
- Communication with HubSpot Deal and Salesforce Opportunity tabs uses typed, origin-validated `window.postMessage` protocols, emitting bidirectional updates to quote totals and line item breakdowns.

### 6. Row-Level Security & Tenant Isolation (Invariants I-02, I-03)

- All new database tables (`product_bundles`, `bundle_items`, `pricing_rules`, `cpq_playbooks`) include non-nullable `organization_id` foreign keys with PostgreSQL Row-Level Security (`RLS`) enabled and enforced via `tenant_isolation` policies.
- Primary keys are generated at the application layer via `generateId()` utilizing UUIDv7 (Invariant I-08).

### 7. Transactional Outbox Events (Invariant I-06)

- Lifecycle transitions emit outbox events (`cpq.bundle.created`, `cpq.rule.activated`) within the same PostgreSQL transaction.

## Consequences

- **Pros**:
  - Millisecond rule evaluation for real-time interactive pricing without database latency.
  - Provable financial accuracy and immunity to IEEE 754 floating-point rounding bugs.
  - Strict compliance with tenant isolation and immutability invariants.
  - Enterprise sales teams can configure complex discounting guardrails without code changes.
- **Cons**:
  - Pre-fetching all candidate rules and catalog metadata transfers rule filtering responsibility to memory, requiring indexed lookups for active rules by organization and workspace.
