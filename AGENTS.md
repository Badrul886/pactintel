# PactIntel — Agent Instructions

## Mandatory Reading Before Any Work

Before making **any** architectural change, adding a feature, or touching the payments, billing,
data-model, security, infrastructure, or **UI** layers, you **MUST** read these documents **in order**:

1. **[Master Implementation Blueprint](docs/MASTER_IMPLEMENTATION_BLUEPRINT.md)** — The authoritative engineering document. Every tech-stack choice, database schema, API contract, security posture, and build-phase dependency is documented here. Do not deviate from it without updating the blueprint first and getting approval.

2. **[Product Blueprint](docs/PRODUCT_BLUEPRINT.md)** — The complete product and feature specification. Every screen, role, permission, feature module, data entity, pricing tier, and edge case. This is the source of truth for **what** we're building.

3. **[Design System](docs/DESIGN_SYSTEM.md)** — The visual identity and UI specification. Every color, font size, spacing token, component pattern, and layout decision. This is the source of truth for **how** the product looks and behaves visually. Do not choose colors, type sizes, shadows, border radii, or component patterns without checking this document first.

---

## Architecture Invariants (I-01 … I-15) — Never Violate

These invariants were established in Blueprint v2.0.0 (GCP migration). Every agent and engineer must uphold them in every task. If a task would violate an invariant, **stop and ask** before proceeding.

- **I-01 Defer capacity, never structure.** Structure is final on Day 1. Capacity is raised by configuration. See Blueprint §0.
- **I-02 One cell = one failure and data domain.** No cross-cell database access, joins, or foreign keys. Cells exchange only signed events via the control plane.
- **I-03 Every tenant-owned datum lives in exactly one cell** (its home cell, in its jurisdiction). The tenant directory is the only global tenant metadata.
- **I-04 Everything is infrastructure-as-code.** No console-created GCP resources. Any cell can be recreated from IaC plus data. "GCP project" replaces "AWS account" in this context.
- **I-05 Every external dependency sits behind a port** with at least one tested adapter. Provider-specific IDs live in mapping tables. Legal evidence and artifacts are duplicated into our own storage.
- **I-06 Every side-effect goes through the transactional outbox.** Consumers are idempotent.
- **I-07 Process types are separated from Day 1.** No in-process `@Cron`. No in-memory-only state. See process-type catalog in Blueprint §16.
- **I-08 Identifiers, public URLs, token formats, hostnames, API/webhook/event contracts are permanent and versioned.**
- **I-09 Sealed (signed) content is never migrated.** Only read-time upcasting. Canonical bytes are stored.
- **I-10 Every datastore, table, bucket prefix, ClickHouse table, Redis keyspace, index, and vector collection is registered in the data manifest.** CI enforces RLS, retention, erasure, export, and residency.
- **I-11 Key hierarchy is fixed.** Multi-region Cloud KMS key locations wherever ciphertext replicates across regions. No per-tenant CMK by default.
- **I-12 Non-critical dependencies degrade gracefully.** Readiness reflects only critical dependencies.
- **I-13 Noisy-neighbor controls** (per-tenant quotas, fair queues) exist from Day 1.
- **I-14 Everything is region-aware:** telemetry, email, AI, analytics, backups, and replication all stay in-jurisdiction.
- **I-15 Every scale trigger maps to a documented lever, and every lever is a configuration change.**

---

## Key Constraints (Never Violate)

- **Cloud platform is Google Cloud (GCP) only.** No AWS. No Fly.io. No Supabase. No multi-cloud. See Blueprint §0 and ADR-0001.
- **Compute is Cloud Run** (services for HTTP, worker pools for BullMQ consumers, jobs for one-offs/migrator). GKE Autopilot only on a verified blocker documented in ADR-0036.
- **Database is Cloud SQL for PostgreSQL** (default). AlloyDB only if a verified Cloud SQL blocker is documented in ADR-0037.
- **Object storage is Cloud Storage** with Object Retention Lock (Locked mode) for evidence. Not S3. Not R2 (only for public-media egress-cost justification, documented in ADR-0010).
- **KMS is Cloud KMS.** Multi-region key locations for any ciphertext that replicates cross-region.
- **Platform billing uses Paddle**, not Stripe. Stripe is unavailable in our operating region.
- **End-user payment collection uses Bring Your Own Key (BYOK)**, not Stripe Connect. Each customer connects their own payment processor.
- **Stored payment credentials** must use envelope encryption with Cloud KMS-managed keys. See Blueprint §5.3.
- **Signed `DocumentVersion` records are immutable.** Database triggers enforce this. Never bypass them.
- **Audit trail tables (`signature_events`, `audit_log_entries`, `payment_credential_audit_logs`) are append-only.** No UPDATEs, no DELETEs.
- **Every tenant-scoped table has `organization_id`** and is protected by PostgreSQL Row-Level Security.
- **Template → Document is copy-on-create**, not a live link (unless explicitly flagged as `is_template_linked`).
- **AI calls go through `AiGateway` only** — never direct provider SDK calls from application code. Claude (via Vertex AI, primary) is the default model family. See Blueprint §20.

---

## Forbidden Patterns — Never Implement

The following patterns are explicitly prohibited. If you encounter them in existing code or are tempted to introduce them, **stop, flag them, and do not proceed**:

| Forbidden                                                                                                      | Reason / Blueprint Reference                                                                 |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Any AWS service reference (ECS, Fargate, S3, Aurora, RDS, ElastiCache, SES, Kinesis, Lambda, CloudTrail, etc.) | Cloud is GCP-only (ADR-0001, §15)                                                            |
| Fly.io, Supabase, Upstash, EKS, Kubernetes (except GKE if ADR-0036 requires it)                                | Explicitly out of scope (§0, §8)                                                             |
| `@Cron` or `@nestjs/schedule` in application code                                                              | All schedules via BullMQ job schedulers or Cloud Scheduler (D-07, JOB-001)                   |
| `EventEmitter2` as a cross-module mechanism                                                                    | Outbox events only; `EventEmitter2` only for non-critical in-transaction hooks (D-07)        |
| Vendor SDK imports outside adapter packages                                                                    | ADP-001 lint-enforced; SDKs only inside `libs/ai/adapters/`, `libs/ports/adapters/`          |
| Direct cross-module database access (bypassing the repository/port layer)                                      | Module boundaries enforced via Nx tags (§11)                                                 |
| Console-created GCP resources                                                                                  | Everything must be IaC (I-04)                                                                |
| Per-event inserts to ClickHouse                                                                                | Batched ingestion via Pub/Sub buffer only (D-10)                                             |
| Per-organization Cloud KMS CMKs by default                                                                     | Key hierarchy with per-cell CMKs and per-tenant data keys (D-09, I-11)                       |
| Mutable `is_signed` / `is_current` columns on `document_versions`                                              | INSERT-only versions; `documents.current_version_id` pointer (X-05)                          |
| Offset pagination                                                                                              | Cursor (keyset) pagination with opaque cursors (D-21, X-49)                                  |
| `gen_random_uuid()` as a primary-key default                                                                   | UUIDv7 for all internal PKs; CSPRNG tokens for public identifiers (D-05)                     |
| `organization_id::text = current_setting(...)` in RLS                                                          | Index-unfriendly; use `organization_id = (SELECT current_setting(...)::uuid)` (X-01)         |
| `x-no-training` header or `safetySettings` as a training opt-out                                               | Fictional; use DPAs and verified provider data-use terms (X-23, D-17)                        |
| `minio/minio` Docker image                                                                                     | Discontinued; use SeaweedFS/Garage or a verified alternative (X-55, §8.4)                    |
| Inline prompts in application code                                                                             | All prompts in the prompt registry (`libs/ai/prompts/`) (A6.7)                               |
| Provider/model names in feature/rule code                                                                      | Task IDs only through `AiGateway`; model names only in adapters, registry, and ADRs (AI-004) |
| Unregistered tables or stores (no data-manifest entry)                                                         | CI fails on any unregistered store (I-10, DATA-001)                                          |
| `bcrypt`/`Argon2` for API key hashing (per-request)                                                            | SHA-256 or peppered HMAC for indexed lookup (D-13, X-21)                                     |
| Cross-tenant retrieval or cache sharing in AI                                                                  | Tenant isolation is absolute (A6.8, AI-014)                                                  |

---

## Required Workflow

1. **ADR for any structural change.** Any decision that changes architecture, vendor, schema shape, public contract, or key hierarchy requires an ADR in `docs/adr/` before implementation. See Blueprint Appendix B for the ADR index.
2. **Manifest update with every schema migration.** Every `pnpm nx run api:prisma:migrate` must be accompanied by an update to `libs/data-manifest`. CI blocks otherwise.
3. **Outbox for all side-effects.** No direct publish to BullMQ or Pub/Sub from business logic. Write to `outbox_events` in the same DB transaction; the relay publishes.
4. **IaC for all infrastructure.** No console-created GCP resources. Every resource is in `infra/` and applied by the CI/IaC pipeline.
5. **Verify vendor facts before writing them.** Do not assert quotas, API headers, pricing, SLAs, or regional availability unless you have confirmed them against official documentation. Record source URL + date in Appendix C. Unverifiable claims become `[VERIFY]` tags.
6. **Blueprint updates require explicit owner approval** before implementation. Update Section 13 (Change Log) with a version bump, add rationale, then request review.
7. **Check build phase.** Confirm the requested feature belongs to the current phase (Blueprint §12) before building it. Flag out-of-phase work to the user.

---

## Architecture Quick Reference

| Layer                   | Technology                                                                                                                   |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Monorepo**            | Nx + pnpm. Apps in `apps/`, shared libs in `libs/`.                                                                          |
| **Backend**             | NestJS 11, Prisma 6, PostgreSQL 17 (Cloud SQL).                                                                              |
| **Frontend**            | Next.js 15, React 19, TypeScript.                                                                                            |
| **Editor**              | Tiptap 3 (ProseMirror) with custom block extensions.                                                                         |
| **Real-time collab**    | Yjs + Hocuspocus (self-hosted; Redis extension for scale-out).                                                               |
| **Auth**                | WorkOS AuthKit (`AuthPort`).                                                                                                 |
| **E-Signature**         | BoldSign API (`SigningProviderPort`).                                                                                        |
| **Platform Billing**    | Paddle (`BillingPort`).                                                                                                      |
| **Compute**             | Cloud Run (services, worker pools, jobs).                                                                                    |
| **Database**            | Cloud SQL for PostgreSQL (HA, private connectivity, PITR).                                                                   |
| **Cache / Queues**      | Memorystore (Valkey/Redis) — role-separated instances; BullMQ.                                                               |
| **Object Storage**      | Cloud Storage (evidence: Object Retention Lock Locked mode; uploads; exports; public-media).                                 |
| **Analytics**           | ClickHouse Cloud (GCP region); Pub/Sub ingestion buffer.                                                                     |
| **Search / Vectors**    | PostgreSQL FTS + pgvector (`SearchPort`, `VectorPort`).                                                                      |
| **KMS / Secrets**       | Cloud KMS (multi-region keys); Secret Manager.                                                                               |
| **AI**                  | `AiGateway` → `LlmPort` → Claude via Vertex AI (primary) / Anthropic direct (second). Gemini/OpenAI in chain per task evals. |
| **Embeddings**          | `EmbeddingPort` → Vertex AI embeddings (or Voyage AI per ADR-0031).                                                          |
| **Edge / CDN**          | Cloudflare (WAF, Workers routing, Turnstile, custom hostnames).                                                              |
| **Load Balancer / WAF** | External Application Load Balancer + Cloud Armor.                                                                            |
| **IaC**                 | Terraform/OpenTofu (`google`/`google-beta` providers + Cloudflare, ClickHouse, Grafana, GitHub).                             |
| **CI/CD**               | GitHub Actions → Workload Identity Federation → Artifact Registry → Cloud Run deploy.                                        |
| **Observability**       | Cloud Logging/Monitoring/Trace + Grafana Cloud (via Grafana Alloy/OTel); Sentry.                                             |
| **Compliance tooling**  | Vanta (Phase 3, GCP integration).                                                                                            |

---

## Build Phases

We are building in phases (0a → 0b → 1 → 2 → 3 → 4). Check Blueprint §12 for what belongs in each phase. Do not build Phase 2 features during Phase 1, etc. Phase 0a is platform foundation (GCP org, IaC, network, cell `gcp-us1`, control plane, CI/CD). Phase 0b is product foundation.

---

## Coding Standards

- See Blueprint §11 for naming conventions, module structure, and file organization.
- Every NestJS module follows the standard structure: `module.ts`, `controller.ts`, `service.ts`, `repository.ts`, `dto/`, `events/`, `listeners/`, `__tests__/`.
- Conventional Commits enforced: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `perf:`.
- Prettier + ESLint enforced. No style debates.
- IaC resource naming: `{product}-{env}-{cell}-{service}` (e.g., `pactintel-prod-us1-api`).
- Mandatory GCP labels: `env`, `cell`, `service`, `tier` on every resource.

---

## UI & Design Constraints (Never Violate)

- **Read `docs/DESIGN_SYSTEM.md` before writing any CSS, choosing any color, or building any component.**
- **One primary color** (`#2563EB` Blue 600) used only for interactive elements — never as decoration.
- **Inter** is the only typeface. No second fonts.
- **Tables for list data** — real `<table>` elements, not card grids, for Documents, Contracts, Payments.
- **Borders for structure, shadows only for floating elements** (dropdowns, modals, popovers).
- **No gradient backgrounds, no glassmorphism, no ALL-CAPS eyebrow labels, no arrows on buttons, no scattered fade-in animations, no cream-terracotta or near-black-acid-accent palettes.** See Design System Section 15 for the complete banned list.
- **Every screen must have designed empty, loading, and error states.**
- **Recipient-facing pages** (signing, viewing, payment) get MORE design attention than internal screens.
- **WCAG AA accessibility floor**: visible focus rings, 4.5:1 contrast, reduced-motion support.

---

## Key Document Pointers

| Document                                                                                           | Purpose                                                                                         |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [`docs/MASTER_IMPLEMENTATION_BLUEPRINT.md`](docs/MASTER_IMPLEMENTATION_BLUEPRINT.md)               | Authoritative engineering reference (v2.0.0, GCP)                                               |
| [`docs/PRODUCT_BLUEPRINT.md`](docs/PRODUCT_BLUEPRINT.md)                                           | Product and feature specification (do not edit)                                                 |
| [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md)                                                   | Visual identity and UI specification                                                            |
| [`docs/ARCHITECTURE_REVISION_BRIEF.md`](docs/ARCHITECTURE_REVISION_BRIEF.md)                       | The "Build Once, Scale Forever" revision brief (reference)                                      |
| [`docs/ARCHITECTURE_REVISION_BRIEF_ADDENDUM_A.md`](docs/ARCHITECTURE_REVISION_BRIEF_ADDENDUM_A.md) | GCP + AI platform addendum (overrides the brief)                                                |
| `docs/adr/`                                                                                        | ADR index — one ADR per architectural decision (ADR-0001 … ADR-0039+)                           |
| `docs/revision/`                                                                                   | Revision artefacts: inventory, open verifications, progress log, change report, owner questions |
| `libs/data-manifest`                                                                               | Machine-readable data manifest (CI-enforced)                                                    |

---

## When You're Unsure

If a decision isn't covered by the blueprint, **ask** rather than guess. If it IS covered but you think it should change, update the blueprint with a rationale and get approval before proceeding. Never fabricate vendor facts, API headers, quotas, or SLA numbers.
