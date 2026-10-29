# ADR-0058: Phase 3 Sprint 3.11 - Standalone Forms Architecture, Public Ingestion Pipeline, and Multi-Role Routing

## Status

Accepted

## Context

PactIntel is expanding beyond linear contract execution to support high-velocity, standalone inbound data collection (Product Blueprint §5.12, Master Implementation Blueprint §12 Phase 3). Use cases include client intake forms, employment applications, customer feedback, registration forms, donation forms, and self-serve agreement execution.

Unlike document workflows which are tied to predefined templates and linear signer flows, Standalone Forms require:

1. Public, unauthenticated, shareable web URLs (`/f/:orgSlug/:formSlug`) and embeddable iframe snippets with customizable branding.
2. High-throughput submission ingestion with robust DoS and brute-force defenses (IP sliding-window rate limiting, payload size caps).
3. Copy-on-submit versioning: Published forms can be edited continuously without breaking historical submission schemas or invalidating past legal records.
4. Multi-role sequential routing: Submissions can transition across multiple distinct roles (e.g. Applicant -> Manager -> HR) with secure, unguessable magic links.
5. Strict anti-malware and anti-injection defenses: OWASP formula injection protection in CSV exports, XSS sanitization, and strict input schema validation.
6. Seamless integration with existing core SaaS capabilities: E-signatures (`SigningService` / BoldSign), payments (`PaymentsService` / BYOK), and notifications (`NotificationService`).
7. Enterprise tenancy isolation: Enforced via PostgreSQL 17 Row-Level Security (RLS) and registration in the Data Manifest.

## Decision

1. **Dedicated Relational Models**:
   Create four tenant-scoped tables with application-generated UUIDv7 primary keys:
   - `forms`: Master form record containing slug, version, definition (JSONB AST), settings (JSONB), and status (`draft`, `published`, `closed`, `archived`).
   - `form_submissions`: Submissions capturing submitter metadata (IP, email, timestamp), status (`partial`, `complete`, `voided`), current role pointer, and answer data (JSONB).
   - `form_roles`: Staged multi-role configuration defining the role hierarchy, assigned field IDs, and routing emails.
   - `form_magic_links`: Ephemeral magic link credentials for downstream roles, storing a SHA-256 hash of a 32-byte CSPRNG token with a 7-day TTL and single-use invalidation.

2. **Copy-on-Submit Versioning**:
   When an admin updates a form that is currently in `published` status, the application increments `version = version + 1`. Existing submissions reference `formVersion` and permanently reflect the schema active when the submission occurred.

3. **Public Ingestion Hardening**:
   - Rate limiting: 10 submissions per minute per IP using a Redis sliding-window algorithm (with local memory fallback).
   - Guardrails: Ingestion immediately rejects submissions if the form is closed, if `settings.closeDate` has elapsed, if `settings.submissionLimit` is reached, or if `settings.oneResponsePerEmail` detects a duplicate email.
   - Payload limit: Request body restricted to 1MB.

4. **Multi-Role Staged Routing**:
   - Initial submission by Role 0 (e.g. Applicant) records `status: 'partial'` and `currentRole: 'Manager'`.
   - A 32-byte CSPRNG token is generated, hashed with SHA-256, and stored in `form_magic_links`.
   - The raw token is delivered via email (`/f/continue/{rawToken}`).
   - Upon resolution, the token hash is verified. Expired tokens or already-used tokens (`used_at IS NOT NULL`) return `401 Unauthorized`.
   - When the final role submits, the submission transitions to `status: 'complete'`, sets `submitted_at = now()`, and emits outbox event `'form.completed'`.

5. **OWASP CSV Sanitization**:
   In submission CSV exports, all cells beginning with `=`, `+`, `-`, `@`, `\t`, or `\r` are prefixed with a single quote `'` and quoted according to RFC-4180 to prevent spreadsheet formula execution attacks.

6. **Transactional Outbox & BullMQ**:
   All lifecycle events (`form.created`, `form.published`, `form.submitted`, `form.completed`, `form.role_advanced`) are written to `outbox_events` within the database transaction. Downstream routing rules and notifications are handled asynchronously by BullMQ worker `ProcessFormSubmissionProcessor`.

## Consequences

- **Pros**:
  - Independent, high-velocity intake without compromising the core document signing lifecycle.
  - Full audit trail, immutable historical submissions, and GDPR compliance (retention and crypto-shredding).
  - Strong resistance to DoS, spam, and CSV injection attacks.
  - Zero cross-tenant data leaks guaranteed by PostgreSQL RLS.
- **Cons**:
  - Managing JSONB form schemas requires thorough client and server-side validation.
  - Multi-role forms introduce asynchronous state transitions that depend on email delivery and token management.

## Alternatives Considered

1. _Reusing Document Templates for Forms_: Rejected because document templates are tightly coupled to document layout, pages, and PDF generation, whereas web forms require dynamic multi-page responsive web layouts, pre-fills, conditional logic, and rapid intake.
2. _Third-Party Form Integrations (Typeform / Google Forms)_: Rejected because legal-tech documents require data residency, strict chain-of-custody, SOC 2 compliance, and direct e-sign/payment rails within the tenant boundary.
