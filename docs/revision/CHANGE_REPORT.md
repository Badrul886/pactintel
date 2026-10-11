# Architecture Revision Change Report — v1.1.0 → v2.0.0

**Document:** `docs/revision/CHANGE_REPORT.md`  
**Created:** 2026-10-08  
**Blueprint version:** 2.0.0  
**Basis:** [Architecture Revision Brief](../ARCHITECTURE_REVISION_BRIEF.md) + [Addendum A — Google Cloud + AI Platform](../ARCHITECTURE_REVISION_BRIEF_ADDENDUM_A.md)

---

## Executive Summary

This report documents the changes applied to the PactIntel architecture documentation to implement the "Build Once, Scale Forever" revision. The primary driver was the owner's decision to select **Google Cloud Platform (GCP) as the permanent, sole cloud platform**, replacing the Fly.io → AWS migration path that was planned in v1.1.0.

The revision eliminates **every scheduled migration** in the previous blueprint. All structural decisions that were previously deferred to Phase 3+ are now made on Day 1.

---

## Files Changed

| File | Change Type | Summary |
|---|---|---|
| `AGENTS.md` | Full rewrite | GCP invariants, forbidden patterns table, required workflow, updated architecture quick reference |
| `GEMINI.md` | Full rewrite | GCP context, ADR/IaC/AI-specific rules, blueprint update protocol |
| `docs/MASTER_IMPLEMENTATION_BLUEPRINT.md` | Major revision (v1.1.0 → v2.0.0) | See section-by-section detail below |

## Files Created

| File | Purpose |
|---|---|
| `docs/adr/ADR-0001-cloud-platform-gcp-only.md` | Formal ADR for the GCP-only platform selection |
| `docs/revision/OPEN_VERIFICATIONS.md` | Tracker for all `[VERIFY]` tags in the blueprint |
| `docs/revision/QUESTIONS_FOR_OWNER.md` | Owner-decision queue with phase-gate priority |
| `docs/revision/REVISION_PROGRESS.md` | Session-to-session progress tracker |
| `docs/revision/CHANGE_REPORT.md` | This file |

---

## AWS → GCP Translation Table (Applied)

| AWS / Old Service | GCP Replacement | Blueprint Location |
|---|---|---|
| AWS ECS / Fargate / EKS | Cloud Run (services, worker pools, jobs) | §1, §2.1, §8.1 |
| Fly.io | Cloud Run (permanent, Day 1) | §1, §2.1, §8 |
| Fly Postgres (Supabase-backed) | Cloud SQL for PostgreSQL 17 (HA, PITR) | §2.1, §8.1, §8.5 |
| AWS RDS / Aurora | Cloud SQL for PostgreSQL 17 | §2.1 |
| AWS ElastiCache / Redis | Memorystore (Valkey/Redis, role-split) | §2.1 |
| AWS S3 | Cloud Storage | §2.1 |
| AWS KMS | Cloud KMS | §2.1, §5.3 |
| AWS Secrets Manager / Fly.io Secrets | Secret Manager | §2.1, §5.4 |
| AWS SES | Resend (unchanged primary) + second adapter | §2.1 |
| AWS IAM (for CI) | Workload Identity Federation (GitHub OIDC → GCP) | §2.1, §8.3 |
| AWS ECR | Artifact Registry | §2.1, §8.3 |
| AWS ELB/ALB | External Application Load Balancer | §2.1 |
| AWS WAF / Shield | Cloud Armor + Cloudflare WAF | §2.1, §5.4 |
| AWS CloudTrail | Cloud Audit Logs | §2.1, §10 |
| AWS CloudWatch | Cloud Logging / Monitoring / Trace | §2.1, §10 |
| AWS Kinesis (analytics ingestion) | Cloud Pub/Sub | §2.1 |
| `minio/minio` (local compose) | SeaweedFS/Garage (Cloud Storage-compatible) `[VERIFY]` | §8.4 |
| Amazon SES (email) | Resend primary + second adapter (EmailPort) | §2.1 |
| Gemini API (primary AI) | `AiGateway` → Claude via Vertex AI (primary) | §2.1, §20 (TBD) |
| OpenAI API (fallback) | `AiGateway` chain (second/third per eval) | §2.1, §20 (TBD) |

---

## Section-by-Section Changes (Blueprint v2.0.0)

### Header
- Version `1.0.0` → `2.0.0`
- Date `2026-09-16` → `2026-10-08`
- Status `DRAFT — Awaiting owner approval` → `ACTIVE — Google Cloud architecture`
- Added GCP-only warning callout

### ToC
- Added §0 (Architecture Invariants & Scale Model)
- Added §15–§20 (Cloud Foundation, Async/Eventing, Data Governance, Resilience, Vendor Strategy, AI Platform)
- Added Appendices B–E

### §0 (New)
- No-Migration Principle with "structure vs. capacity" golden rule
- Architecture Invariants I-01 through I-15
- Cell architecture definition (cell, control plane, edge routing)
- Design envelope table (per-cell capacity targets)

### §1 System Architecture Overview
- Opening statement: "modular-monolith codebase, multi-process runtime, cell-based deployment on GCP" replaces "single Node.js process for Phases 0–2"
- Architecture diagram: completely rewritten — shows GCP control plane + data plane (`gcp-us1`), all Cloud Run process types, Cloud SQL, Memorystore, ClickHouse, Cloud Storage, Cloud KMS, Secret Manager; replaces AWS/S3 diagram
- §1.2 Module communication: EventEmitter2 demoted; transactional outbox is the mechanism
- §1.3: "Why Modular Monolith, Not Microservices" → "Why Modular Monolith Codebase, Multi-Process Runtime"
- §1.4 (New): Module Extraction Path (No Migration)

### §2.1 Tech Stack Table
- Every infrastructure row rewritten for GCP (see translation table above)
- AI row: `AiGateway` → Claude via Vertex AI (primary); provider-neutral; no provider names in app code
- Email: `EmailPort`; no Amazon SES
- CDN: Cloudflare for SaaS detail added; origin lockdown documented
- Added: Load Balancer / WAF row (External ALB + Cloud Armor)
- Added: Compute / Orchestrator row (Cloud Run permanent)
- Added: IaC row (Terraform/OpenTofu, GCS state, module structure)
- Added: Secrets / KMS row (Cloud KMS + Secret Manager detail)
- Added: Event Pipeline row (Pub/Sub + outbox)
- Observability: Cloud Logging/Monitoring/Trace added as primary; Grafana Cloud via Alloy/OTel

### §2.2
- Added: "Spec §8 suggests PaaS before Kubernetes → Cloud Run from Day 1" row
- BoldSign: now documented as `SigningProviderPort`

### §2.3 (New)
- Every migration scheduled in v1.1.0 documented as eliminated, with method

### §2.4 (New)
- Reference to §19 Port/Adapter Matrix

### §3.4 RLS Policies
- Fixed: `organization_id::text = current_setting(...)` → `organization_id = (SELECT current_setting(...)::uuid)` (X-01 fix: index-friendly, no cast)
- Added: pooler connection-sharing note (X-02)

### §5.1 Compliance Targets
- HIPAA: updated to Google Cloud BAA + Assured Workloads
- AES-256: updated to Cloud KMS CMEK (Cloud SQL, Cloud Storage, Memorystore)

### §5.3 BYOK Key Security
- Key hierarchy diagram: completely rewritten — Cloud KMS (per-cell CMKs) → per-tenant TK → per-record DEK; removes "AWS KMS / GCP KMS" ambiguity
- Implementation rules: Cloud KMS replaces AWS KMS; no per-org CMK by default; TK-based crypto-shredding
- Network controls: GCP IAM with IAM conditions replaces `kms:ViaService`; `app_vault` PostgreSQL role documented

### §5.4 Security Measures
- Secrets: Secret Manager replaces Fly.io Secrets and "AWS Secrets Manager (e.g., Fly.io Secrets)"
- Added: Cloud Armor WAF at origin
- Added: SSRF containment for `worker-pdf`
- Added: GCP metadata server access prohibition
- Added: Supply chain (SBOM, signed images in Artifact Registry)

### §8 Infrastructure (full rewrite)
- §8.1: Fly.io → AWS migration plan removed; Cloud Run process-type catalog; GCP project/folder layout
- §8.2: Docker Compose `preview` (Fly.io) environment removed; `dev` environment added (GCP project); MinIO replaced; Redis role-split
- §8.3: GitHub Actions → WIF → Artifact Registry → Cloud Run; no JSON keys; traffic-splitting deploy
- §8.4: Docker Compose completely rewritten (MinIO removed; Redis role-split; SeaweedFS; Mailpit; `[VERIFY]` tags)
- §8.5: WAL/pg_dump to S3 removed; Cloud SQL PITR + Backup and DR; jurisdiction constraint
- §8.6 (New): IaC structure (`infra/` tree)
- §8.7 (New): Runbook index

### §14 Change Log
- v2.0.0 entry added with full rationale

---

## Defects Addressed (from Brief §B4)

| Defect ID | Description | Resolution in v2.0.0 |
|---|---|---|
| X-01 | RLS predicate casts `organization_id::text` — cannot use index | Fixed in §3.4 |
| X-24 | "PostgreSQL TDE" cited as at-rest encryption method | Fixed: Cloud KMS CMEK in §5.1 |
| X-46 | Fly.io `fly deploy` in CI — platform removed | Removed in §8.3 |
| X-55 | `minio/minio` Docker image — discontinued Oct 2025 | Replaced with `[VERIFY]` SeaweedFS in §8.4 |

---

## Defects Noted but Not Yet Resolved (Phase 3+ Pass)

| Defect ID | Description | Target Section | Priority |
|---|---|---|---|
| X-14 | `gen_random_uuid()` as default PK — must be UUIDv7 | §3.2 schema | P1 |
| X-15 | Missing partition declarations on high-growth tables | §3.2 schema | P1 |
| X-21 | `bcrypt`/`Argon2` for API key hashing (per-request) → SHA-256 HMAC | §5.2 | P1 |
| X-23 | `x-no-training` HTTP header is fictional | §5.3 (will check) | P1 |
| X-49 | Offset pagination in API examples → cursor pagination | §4 | P1 |
| D-13 | API key hashing: bcrypt is not safe for high-frequency index lookups | §5.2 | P1 |
| D-21 | i18n and cursor pagination not mentioned | §4, §12 | P1 |
| EVT-001 to EVT-010 | Outbox/event rules | §16 (new) | P2 |
| JOB-001 | `@Cron` forbidden; Cloud Scheduler / BullMQ scheduler | §16 (new) | P2 |
| AI-001 to AI-020 | AI Platform rules | §20 (new) | P1 |

---

## What Was Not Changed

- `docs/PRODUCT_BLUEPRINT.md` — product specification is platform-agnostic; no changes required
- `docs/DESIGN_SYSTEM.md` — UI specification is platform-agnostic; no changes required
- §3.2 Core Schema SQL — structural schema correct; UUIDv7 and partition defects logged for Phase-3 pass
- §4 API Contracts — functionally correct; cursor pagination defect logged
- §6 Payments Architecture — BYOK model unchanged; no infrastructure changes needed
- §7 Multi-Tenancy & Permissions — CASL/RLS design unchanged
- §9 Testing Strategy — tooling unchanged; TestContainers works with GCP-local emulators
- §10 Observability — updated references (Cloud Logging); full OTel config deferred to §16
- §11 Coding Standards — unchanged; GCP label convention added in `AGENTS.md`
- §12 Build Sequencing — Phase 0a/0b split noted for Phase-3 pass
- §13 Edge Cases — unchanged
- Appendix A — unchanged
