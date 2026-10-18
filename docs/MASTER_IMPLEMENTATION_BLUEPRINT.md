# Master Implementation Blueprint — PactIntel

**Version:** 2.0.0
**Date:** 2026-10-08
**Status:** ACTIVE — Google Cloud architecture (revised from v1.1.0)
**Companion document:** [PRODUCT_BLUEPRINT.md](file:///d:/Badrul/All%20files/Programming/Projects/pactintel2/docs/PRODUCT_BLUEPRINT.md) (the full product specification)
**Revision basis:** [Architecture Revision Brief](../ARCHITECTURE_REVISION_BRIEF.md) + [Addendum A — Google Cloud + AI Platform](../ARCHITECTURE_REVISION_BRIEF_ADDENDUM_A.md)

> [!IMPORTANT]
> This is the **authoritative engineering document** for the PactIntel system. Every future agent session, feature branch, and architectural decision must be checked against this document before proceeding. If you are reading this as a new engineer or agent: read §0, §1, §2, §3, §11, and §15 before touching any code.
>
> **Cloud platform is Google Cloud (GCP) only.** No AWS. No Fly.io. No Supabase. No multi-cloud. This is a Day-1 structural decision that cannot be changed without a full data migration — the migration this architecture was designed to prevent. See §0, ADR-0001, and `AGENTS.md`.

---

## Table of Contents

0. [Architecture Invariants & Scale Model](#0-architecture-invariants--scale-model) _(new in v2.0.0)_
1. [System Architecture Overview](#1-system-architecture-overview)
2. [Tech Stack & Rationale](#2-tech-stack--rationale)
3. [Data Architecture](#3-data-architecture)
4. [API Contracts](#4-api-contracts)
5. [Security & Compliance Architecture](#5-security--compliance-architecture)
6. [Payments Architecture](#6-payments-architecture)
7. [Multi-Tenancy & Permissions Implementation](#7-multi-tenancy--permissions-implementation)
8. [Infrastructure, Deployment & Environments](#8-infrastructure-deployment--environments)
9. [Testing & Quality Strategy](#9-testing--quality-strategy)
10. [Observability](#10-observability)
11. [Coding Standards & Repo Conventions](#11-coding-standards--repo-conventions)
12. [Build Sequencing](#12-build-sequencing)
13. [Edge Cases & Mandatory Implementation Rules](#13-edge-cases--mandatory-implementation-rules)
14. [Change Log](#14-change-log)
15. [Cloud Foundation (Google Cloud)](#15-cloud-foundation-google-cloud) _(new in v2.0.0)_
16. [Async, Eventing & Scheduling Architecture](#16-async-eventing--scheduling-architecture) _(new in v2.0.0)_
17. [Data Governance & Tenant Lifecycle](#17-data-governance--tenant-lifecycle) _(new in v2.0.0)_
18. [Resilience, Capacity & Scale Levers](#18-resilience-capacity--scale-levers) _(new in v2.0.0)_
19. [Vendor & Dependency Strategy](#19-vendor--dependency-strategy) _(new in v2.0.0)_
20. [AI Platform Architecture](#20-ai-platform-architecture) _(new in v2.0.0)_

**Appendices:**

- [Appendix A — Ambiguities & Flags in the Product Spec](#appendix-a-ambiguities--flags-in-the-product-spec)
- [Appendix B — ADR Index](#appendix-b-adr-index)
- [Appendix C — Verification Log](#appendix-c-verification-log)
- [Appendix D — Defect Register Resolution Map](#appendix-d-defect-register-resolution-map)
- [Appendix E — Data Manifest Seed](#appendix-e-data-manifest-seed)

---

## 0. Architecture Invariants & Scale Model

_(Revised v2.0.0 — Google Cloud target; see Architecture Revision Brief §B2 and Addendum A §A0)_

### 0.1 The No-Migration Principle

PactIntel is built **once**, on its permanent architecture, and **never needs a migration, re-platforming, re-keying, or public-contract change** as it grows from its first customer to a very large global customer base.

> **Golden rule: defer capacity, never defer structure.**
>
> **Structure — must be final on Day 1:** GCP organization/folder/project layout; network and CIDR plan; cell + control-plane topology and routing; ID formats; public URL/domain contract; schema shape (partitioning, tenancy columns, sealed-content model, content versioning); key hierarchy; ports/adapters; outbox/event contracts; process-type separation; IaC; data manifest; API/webhook/OAuth contracts; i18n/a11y foundations.
>
> **Capacity — may be switched on later by configuration:** extra Cloud Run instances/min-instances, larger Cloud SQL editions (Enterprise → Enterprise Plus), read replicas, more worker-pool instances, a second cell, a standing DR region, dedicated cells, larger ClickHouse tier, extra Memorystore instances for split roles.

**Migration (forbidden by design)** — any future change that requires moving data between data stores, re-platforming compute, re-keying or re-encrypting existing data, rewriting application code that other modules depend on, or changing an identifier/token format/URL/API contract that customers already hold.

**Scaling (allowed)** — raising a capacity setting inside the same service (instance class, replica count, partition count); switching on a pre-designed capacity switch; adding a read replica; adding a new cell from the same IaC modules; adding an adapter behind an existing port.

### 0.2 Architecture Invariants (I-01 … I-15)

| ID       | Invariant                                                                                                                                                                                             |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **I-01** | Defer capacity, never structure (§0.1).                                                                                                                                                               |
| **I-02** | One cell = one failure and data domain. No cross-cell DB access, joins, or foreign keys. Cells exchange only signed events via the control plane.                                                     |
| **I-03** | Every tenant-owned datum lives in exactly one cell (its home cell, in its jurisdiction). The tenant directory is the only global tenant metadata.                                                     |
| **I-04** | Everything is infrastructure-as-code. No console-created GCP resources. Any cell can be recreated from IaC plus data.                                                                                 |
| **I-05** | Every external dependency sits behind a port with at least one tested adapter. Provider-specific IDs live in mapping tables. Legal evidence and artifacts are duplicated into our own storage.        |
| **I-06** | Every side-effect goes through the transactional outbox; consumers are idempotent.                                                                                                                    |
| **I-07** | Process types are separated from Day 1. No in-process `@Cron`. No in-memory-only state.                                                                                                               |
| **I-08** | Identifiers, public URLs, token formats, hostnames, API/webhook/event contracts are permanent and versioned.                                                                                          |
| **I-09** | Sealed (signed) content is never migrated. Only read-time upcasting. Canonical bytes are stored.                                                                                                      |
| **I-10** | Every datastore, table, bucket prefix, ClickHouse table, Redis keyspace, index, and vector collection is registered in the data manifest; CI enforces RLS, retention, erasure, export, and residency. |
| **I-11** | Key hierarchy is fixed. Multi-region Cloud KMS key locations wherever ciphertext replicates across regions. No per-tenant CMK by default.                                                             |
| **I-12** | Non-critical dependencies degrade gracefully. Readiness reflects only critical dependencies.                                                                                                          |
| **I-13** | Noisy-neighbor controls (per-tenant quotas, fair queues) exist from Day 1.                                                                                                                            |
| **I-14** | Everything is region-aware: telemetry, email, AI, analytics, backups, and replication all stay in-jurisdiction.                                                                                       |
| **I-15** | Every scale trigger maps to a documented lever, and every lever is a configuration change.                                                                                                            |

### 0.3 Cell Architecture

PactIntel deploys as a **cell-based** system:

- **Cell** = an independent regional deployment of the data plane: own GCP project (or project set), Cloud Run services, Cloud SQL cluster, Memorystore instances, Cloud Storage buckets, Cloud KMS keys, search/vector, ClickHouse service/database, telemetry routing. Short codes: `gcp-us1`, `gcp-eu1`, `ded-<customer>`.
- **Control plane** = a small global stack: (a) **tenant directory** (org id, org slug, home cell, jurisdiction, status, custom hostnames, placement flags); (b) **billing authority** (provider webhooks, plan/entitlement catalog, subscription state) with entitlement projections pushed to cells; (c) **global webhook ingress/router** (Paddle, BoldSign, WorkOS, payment-processor, CRM, email events) → verify → route to the right cell; (d) **login router** (WorkOS org → cell); (e) cell registry + provisioning automation; (f) feature-flag/config source. It holds **no document content**.
- **Edge routing:** Cloudflare (Workers + KV or equivalent) resolves host/path → cell origin. Primary routing is **lookup-free**: the cell code is embedded in hostnames, API-key prefixes, public document URLs, and collab URLs. Directory lookups are needed only for custom hostnames and login.
- **Phase-0 footprint:** one pooled cell (`gcp-us1`) + minimal control plane. A second cell is created as a throwaway dry-run in the Phase-0a Definition of Done.

### 0.4 Design Envelope (Per Cell)

| Dimension                  | Per pooled cell                                  | Platform                 |
| -------------------------- | ------------------------------------------------ | ------------------------ |
| Organizations              | 5,000                                            | 250,000+ by adding cells |
| Users                      | 100,000                                          | 5,000,000+               |
| Documents / versions       | 50 M / 150 M                                     | linear in cells          |
| Signature events per month | 20 M                                             | linear                   |
| Recipient page peak        | 5,000 req/s                                      | linear                   |
| API sustained              | 1,000 req/s                                      | linear                   |
| Concurrent WebSockets      | 5,000 collaboration + 20,000 notification        | linear                   |
| Background jobs per day    | 5 M                                              | linear                   |
| Analytics events per year  | 5 B                                              | linear                   |
| Jurisdictions              | US and EU from Day 1; extensible by adding cells | —                        |

---

## 1. System Architecture Overview

_(Revised v2.0.0 — modular-monolith codebase, multi-process runtime, cell-based deployment on Google Cloud)_

PactIntel is a **modular-monolith codebase** that runs as **multiple process types** from Day 1, deployed as a **cell-based system** on Google Cloud. There is no single-process phase and no planned extraction migration — modules are separated by process type from the start; code boundaries are enforced by Nx module tags.

### 1.1 High-Level Architecture Diagram

_(Revised v2.0.0 — Google Cloud; cell `gcp-us1` shown; EU cell `gcp-eu1` added in Phase 2)_

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              CLIENTS                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐                │
│  │ Next.js  │  │ Mobile   │  │ Recipient│  │ Public   │                │
│  │ Web App  │  │ Apps     │  │ Viewer   │  │ API      │                │
│  │ (React)  │  │ (RN/Expo)│  │ (SSR)    │  │ Consumers│                │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘                │
└───────┼─────────────┼─────────────┼──────────────┼──────────────────────┘
        │             │             │              │
        ▼             ▼             ▼              ▼
┌──────────────────────────────────────────────────────────────────────────┐
│              EDGE / CDN LAYER (global)                                   │
│  Cloudflare — WAF · Bot/Turnstile · Workers routing · Custom hostnames   │
│  Lookup-free cell routing: cell code embedded in hostname/API-key prefix │
└──────────────────────────────┬───────────────────────────────────────────┘
                               │
                ┌──────────────┴───────────────┐
                │                              │
                ▼                              ▼
  ┌─────────────────────────┐   ┌─────────────────────────────────────┐
  │   CONTROL PLANE (GCP)   │   │     DATA PLANE — Cell gcp-us1       │
  │  ─────────────────────  │   │  ─────────────────────────────────  │
  │  Tenant Directory        │   │  Ext. App Load Balancer + Cloud     │
  │  Billing Authority       │   │  Armor                              │
  │  Webhook Router          │   │                                     │
  │  Login Router            │   │  Cloud Run Services:                │
  │  Cell Registry           │   │  ┌─────────┐ ┌──────────────────┐  │
  │  Feature Flags           │   │  │ web-app │ │  web-viewer      │  │
  │                          │   │  │ (Next.js)│ │  (recipient SSR) │  │
  │  Firestore / Cloud SQL   │   │  └─────────┘ └──────────────────┘  │
  │  (tenant dir, billing)   │   │  ┌─────────┐                       │
  └─────────────────────────┘   │  │   api   │ (NestJS)              │
                                 │  └─────────┘                       │
                                 │  ┌─────────┐ ┌──────┐ ┌────────┐  │
                                 │  │collab   │ │worker│ │worker  │  │
                                 │  │(Hocusp.)│ │-core │ │-ai     │  │
                                 │  └─────────┘ └──────┘ └────────┘  │
                                 │  ┌──────────────┐ ┌────────────┐  │
                                 │  │ worker-bulk  │ │ worker-pdf │  │
                                 │  └──────────────┘ └────────────┘  │
                                 │  Cloud Run Jobs: migrator, one-offs │
                                 │                                     │
                                 │  ┌───────────┐ ┌──────────────┐   │
                                 │  │ Cloud SQL │ │  Memorystore  │   │
                                 │  │ for PG 17 │ │ (Valkey/Redis │   │
                                 │  │ HA + PITR │ │  role-split)  │   │
                                 │  └───────────┘ └──────────────┘   │
                                 │  ┌───────────┐ ┌──────────────┐   │
                                 │  │ ClickHouse│ │Cloud Storage │   │
                                 │  │ Cloud GCP │ │(evidence,    │   │
                                 │  │ region    │ │ uploads, etc)│   │
                                 │  └───────────┘ └──────────────┘   │
                                 │  Cloud KMS · Secret Manager        │
                                 │  Cloud Logging/Monitoring/Trace    │
                                 └─────────────────────────────────────┘

EXTERNAL SERVICES (reached through port/adapter layer):
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────┐ ┌──────────┐
│  Paddle  │ │  WorkOS  │ │ BoldSign │ │ Claude/Gemini  │ │ Resend   │
│ (Billing)│ │ (Auth)   │ │ (E-Sign) │ │ on Vertex AI   │ │ (Email)  │
└──────────┘ └──────────┘ └──────────┘ └────────────────┘ └──────────┘
```

### 1.2 Module Boundaries

Each module is a self-contained NestJS module with its own controllers, services, entities, and DTOs. Modules communicate via:

1. **In-process port calls** (synchronous, same cell) — the default within a process type
2. **Transactional outbox events** (`outbox_events`) for async durable side-effects (e.g., "document.signed" → trigger payment, analytics, notification)
3. **BullMQ job queues** for execution of heavy async work (PDF generation, email delivery, webhook dispatch, AI calls)

> [!IMPORTANT]
> `EventEmitter2` is **not** the cross-module mechanism. It is allowed only for non-critical in-transaction hooks. All business side-effects go through the outbox. See §16 and rule EVT-001.

| Module            | Responsibility                                                                     | Key Dependencies                        |
| ----------------- | ---------------------------------------------------------------------------------- | --------------------------------------- |
| **Auth**          | Authentication, session management, WorkOS integration, API key validation         | WorkOS SDK, Redis                       |
| **Organization**  | Org/Workspace/Team/User CRUD, seat management, role assignment                     | Auth                                    |
| **Document**      | Document lifecycle, editor content storage, version management, status transitions | Template, Organization                  |
| **Template**      | Template CRUD, content library, copy-on-create semantics                           | Organization                            |
| **Signing**       | Signature request orchestration, BoldSign API integration, audit trail             | Document, Notification                  |
| **Payments**      | BYOK payment credential management, payment collection orchestration               | Document, Signing, Secret Manager (GCP) |
| **Billing**       | Paddle subscription management, seat counting, plan enforcement                    | Organization, Paddle SDK                |
| **CPQ**           | Product catalog, pricing tables, discount rules, approval thresholds               | Document, Organization                  |
| **Analytics**     | Event ingestion, ClickHouse writes, report generation                              | ClickHouse client                       |
| **Workflow**      | Automation rules engine, approval chains, post-signature onboarding                | Document, Notification                  |
| **Integration**   | CRM sync, third-party OAuth connections, Zapier webhooks                           | Organization                            |
| **AI**            | LLM-powered drafting, content generation, data extraction                          | LLM API client, pgvector                |
| **Notification**  | Email, push, in-app, real-time (WebSocket) notifications                           | Redis, email provider                   |
| **DealRoom**      | Multi-party workspace aggregating documents and parties                            | Document, Organization                  |
| **Collaboration** | Real-time co-editing via Yjs/Hocuspocus, comments, content locking                 | Document, Hocuspocus                    |

### 1.3 Why Modular Monolith Codebase, Multi-Process Runtime

_(Revised v2.0.0 — "extraction when scale demands" removed; process separation is Day-1 structure)_

- **Team size**: A solo/small team cannot afford the operational overhead of independent deploy pipelines and cross-service transactions for 15+ services on day one.
- **Shared transactional boundaries**: Document creation touches templates, pricing tables, signing setup, and permissions in a single user action. Distributed transactions add fragility with zero user benefit at this scale.
- **Process separation without migration**: Process types (`api`, `worker-core`, `worker-ai`, `worker-pdf`, `collab`, `web-viewer`) run as separate Cloud Run services/worker pools from Day 1. Each scales independently. Separating a module into its own process changes only the deployment unit, not the contracts, events, schemas, or DB ownership. This is not a migration; it is a capacity switch.

### 1.4 Module Extraction Path (No Migration)

When a module becomes a bottleneck, it is extracted by:

1. Moving it to a dedicated Cloud Run service (new IaC variable set, nothing else).
2. Replacing in-process port calls with internal HTTP/gRPC calls (adapter swap behind the existing port).
3. Keeping event contracts, schema ownership, and DB foreign keys unchanged.

What does **not** change: public API contracts, event schemas, table ownership, public URLs, keys.

---

## 2. Tech Stack & Rationale

### 2.1 Decisions Table

| Layer                           | Choice                                                                                                            | Rationale                                                                                                                                                                                                                                                                                                              |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Frontend**                    | Next.js 15 (App Router) + React 19 + TypeScript                                                                   | Server-side rendering for recipient viewing pages (SEO, performance); App Router for the logged-in SPA; single codebase for marketing site + app shell. React 19 for concurrent features and server components.                                                                                                        |
| **Document Editor**             | Tiptap 3 (ProseMirror) + custom block extensions                                                                  | Tiptap provides a production-grade rich-text editor with an extension architecture. Custom extensions for pricing tables, signature blocks, smart content, and interactive blocks. Building from raw `contentEditable` is a multi-year trap; Tiptap compresses that to weeks.                                          |
| **Real-time Collaboration**     | Yjs (CRDT) + Hocuspocus server                                                                                    | CRDTs solve simultaneous-edit conflicts correctly without a central authority. Hocuspocus is the Tiptap team's purpose-built Yjs backend with built-in persistence, authentication, and presence. Self-hosted for data control; avoids Liveblocks vendor lock-in at this stage.                                        |
| **Backend**                     | NestJS 11 + TypeScript                                                                                            | TypeScript end-to-end eliminates a language boundary. NestJS provides dependency injection, module system, guards/interceptors/pipes, and a mature ecosystem. Chosen over raw Express for its opinionated structure (critical for a large codebase) and over Rails because the team's primary language is TypeScript.  |
| **ORM**                         | Prisma 6                                                                                                          | Type-safe database client with schema-as-code, migrations, and excellent TypeScript integration. Prisma Client Extensions enable RLS tenant-context injection. Chosen over TypeORM (less type-safe, more maintenance churn) and Drizzle (less mature migration tooling).                                               |
| **Primary Database**            | **Cloud SQL for PostgreSQL 17** (HA, private connectivity, PITR)                                                  | Relational integrity for accounts, billing, signatures. JSONB for flexible document content blocks. `pgvector` extension for AI embedding search. Row-Level Security for multi-tenant isolation. Enterprise edition at launch; Enterprise Plus as an in-place capacity switch. `[VERIFY]` extension list per ADR-0037. |
| **Analytics Store**             | **ClickHouse Cloud** (GCP region, same jurisdiction as cell)                                                      | Section-level engagement events will be the highest-volume data by 10–100x. Columnar storage for sub-100ms analytical queries over billions of rows. Ingestion via Pub/Sub buffer → batcher → ClickHouse (never per-event inserts).                                                                                    |
| **Cache / Queues**              | **Memorystore** (Valkey/Redis) — role-separated instances + BullMQ                                                | Role-split instances: `queue` (BullMQ, noeviction), `session` (TTL), `cache+ratelimit` (allkeys-lru), `realtime` (pub/sub for collab). BullMQ for reliable job queues (PDF generation, email, webhooks, AI calls). See ADR-0007.                                                                                       |
| **Object Storage**              | **Cloud Storage** (evidence: Object Retention Lock Locked mode; uploads; exports; public-media)                   | Evidence class uses per-object retention locks (permanently prevents shortening — WORM equivalent). Public-media behind Cloudflare CDN; R2 only if egress-cost analysis justifies it (ADR-0010). No S3.                                                                                                                |
| **Search**                      | PostgreSQL FTS (`tsvector`/GIN, `pg_trgm`) + **pgvector** — permanent baseline behind `SearchPort` / `VectorPort` | The external engine (Meilisearch / OpenSearch) decision is made now and indexed from Phase 0 if portfolio intelligence requires it (ADR-0013). "Migrate in Phase 3" is forbidden.                                                                                                                                      |
| **PDF Rendering**               | Playwright (headless Chromium) in **`worker-pdf` Cloud Run worker pool**                                          | Isolated process with no internet access except the viewer origin. Generate-once at completion; stored in the evidence class. No re-rendering of signed documents.                                                                                                                                                     |
| **E-Signature Infrastructure**  | BoldSign API (`SigningProviderPort`)                                                                              | API-first e-signature provider. Port/adapter design means any compliant provider can be added without data migration. Evidence: provider final PDF + audit certificate copied to Cloud Storage evidence class. See ADR-0017.                                                                                           |
| **Platform Billing**            | **Paddle** (merchant of record) — `BillingPort`                                                                   | **Non-negotiable constraint.** Stripe is unavailable in the operating region. Provider-specific columns removed from core tables; internal plan/entitlement catalog drives enforcement. See ADR-0016.                                                                                                                  |
| **End-User Payment Collection** | **Bring Your Own Key (BYOK)**                                                                                     | **Non-negotiable constraint.** Stripe Connect is unavailable. Customers connect their own payment processor credentials. See §6.                                                                                                                                                                                       |
| **Auth / SSO / SAML / SCIM**    | WorkOS AuthKit (`AuthPort`)                                                                                       | Split identity from membership: a global WorkOS identity can belong to multiple organizations in different cells. Token model designed for web (cookie session), mobile/OAuth/MCP (PKCE access+refresh), API keys (SHA-256 hashed), collab tokens (short-lived, audience-bound). See ADR-0015.                         |
| **AI / LLM**                    | `AiGateway` → `LlmPort` → **Claude** (Anthropic) via Vertex AI (primary) / Anthropic direct (second)              | Provider-neutral gateway with task IDs. Gemini, OpenAI sit later in each chain per eval approval. No provider or model name in application code. `EmbeddingPort` → Vertex AI embeddings or Voyage AI (ADR-0031). See §20 and ADR-0028–0035.                                                                            |
| **Email**                       | **Resend** (primary, `EmailPort`) + secondary provider (ADR-0038)                                                 | Two adapters warmed from Phase 0. Dedicated sending subdomain from Day 1. No Amazon SES. Bounce/complaint events → `email_events` (partitioned) + per-org suppression list.                                                                                                                                            |
| **CDN / Edge**                  | **Cloudflare** (WAF, Bot/Turnstile, Workers routing, custom hostnames via Cloudflare for SaaS)                    | Origin lockdown: External ALB accepts traffic only from Cloudflare (IP allowlist + optional mTLS). Recipient documents on a separate registrable domain (not the app domain).                                                                                                                                          |
| **Load Balancer / WAF**         | **External Application Load Balancer** + **Cloud Armor**                                                          | Serverless NEGs for Cloud Run. Cloud Armor for DDoS and WAF rules at origin.                                                                                                                                                                                                                                           |
| **Compute / Orchestrator**      | **Cloud Run** (services for HTTP; worker pools for BullMQ consumers; jobs for migrator/one-offs)                  | Permanent orchestrator. GKE Autopilot only on a verified WebSocket blocker (ADR-0036). No ECS, Fargate, or EKS.                                                                                                                                                                                                        |
| **IaC**                         | **Terraform / OpenTofu** (`google`/`google-beta` + Cloudflare, ClickHouse, Grafana, GitHub providers)             | State in a versioned GCS bucket in the `shared-services` project. Modules: `foundation`, `control-plane`, `cell`, `edge`, `observability`. New cell = new variable set only.                                                                                                                                           |
| **Secrets / KMS**               | **Cloud KMS** (per-cell, per-purpose key rings; multi-region key locations for DR) + **Secret Manager**           | Per-cell, per-purpose CMKs → per-tenant wrapped data key (TK) → per-record DEKs. Crypto-shredding = destroy the wrapped TK. No per-tenant CMK by default. See ADR-0011.                                                                                                                                                |
| **Event Pipeline**              | **Pub/Sub** (analytics event buffer) + transactional outbox (business events)                                     | Pub/Sub for high-volume non-business-critical streams. Postgres outbox is the source of truth for all business events.                                                                                                                                                                                                 |
| **Observability**               | **Cloud Logging / Monitoring / Trace** + **Grafana Cloud** (via Grafana Alloy/OTel) + **Sentry**                  | Telemetry stays in-jurisdiction (EU cells → EU Grafana/Sentry regions). Cloud Audit Logs (Admin Activity + Data Access) → org-level sink to locked-retention bucket in `security` project.                                                                                                                             |
| **CI/CD**                       | **GitHub Actions** → Workload Identity Federation → **Artifact Registry** → Cloud Run deploy                      | No service-account JSON keys. Build per process type (BuildKit cache). Immutable image tags = git SHA. One-off migration job before deploy.                                                                                                                                                                            |
| **Monorepo Tooling**            | Nx + pnpm                                                                                                         | Nx for dependency graph, computation caching, module-boundary enforcement (tags/lint). pnpm for fast, strict dependency management.                                                                                                                                                                                    |
| **Compliance Tooling**          | Vanta (Phase 3, GCP integration) + Security Command Center                                                        | Audit-log architecture designed from Phase 0a. GCP-native security services: Security Command Center, Cloud Asset Inventory, Artifact Analysis.                                                                                                                                                                        |

### 2.2 Deviations from Product Spec Section 8

| Spec Suggestion                                                | Our Choice                                                   | Why                                                                                                                                                                          |
| -------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Stripe, using Connect for the platform model" (Payments row)  | **Paddle** (platform billing) + **BYOK** (end-user payments) | Stripe unavailable in operating region. See non-negotiable constraints.                                                                                                      |
| "Node.js/TypeScript (NestJS), or Rails"                        | NestJS only                                                  | TypeScript end-to-end is the decisive advantage; Rails adds a language boundary and eliminates shared DTO/validation packages with the Next.js frontend.                     |
| "Liveblocks/Hocuspocus" for collab                             | Hocuspocus (self-hosted)                                     | Data sovereignty — customer document content should not flow through a third-party SaaS (Liveblocks) during editing. Hocuspocus is open-source and purpose-built for Tiptap. |
| "Sentry + Grafana/Datadog"                                     | Sentry + Grafana Cloud (no Datadog)                          | Grafana Cloud provides metrics + logs + traces in one platform at significantly lower cost than Datadog.                                                                     |
| "Buy via an API-first e-signature provider" (no specific pick) | **BoldSign** (`SigningProviderPort`)                         | Transparent per-envelope pricing, full white-label, strong API, compliant. Port/adapter design means provider can be changed without data migration.                         |
| Spec §8 suggests "a PaaS before Kubernetes"                    | **Google Cloud Run from Day 1**                              | Cloud Run (services + worker pools + jobs) is the permanent orchestrator. No PaaS interim and no migration to Kubernetes needed. See ADR-0001, ADR-0036.                     |

### 2.3 Deviations from Blueprint v1.1.0 (Eliminated Migrations)

_(Revised v2.0.0 — every item below was a scheduled migration in v1.1.0; all are eliminated)_

| v1.1.0 Migration                                               | How Eliminated                                                                              |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Fly.io → AWS ECS/EKS (Phase 3+)                                | Google Cloud Run from Day 1. No Fly.io ever.                                                |
| "Fly Postgres, backed by Supabase"                             | Cloud SQL for PostgreSQL from Day 1.                                                        |
| PostgreSQL FTS → Meilisearch (Phase 3)                         | SearchPort decided now; external engine indexed from Phase 0 if needed (ADR-0013).          |
| Raw JSONB content → Yjs-compatible format (Phase 2)            | Canonical content model with schema_version from Day 1; read-time upcasting (ADR-0023).     |
| "Extract modules into independent services when scale demands" | Process types separated from Day 1; extraction is a capacity switch, not a migration.       |
| One KMS key per org → re-keying at quota/cost                  | Per-cell, per-purpose CMKs; per-tenant data keys; no per-org CMK by default (ADR-0011).     |
| Provider columns in core tables                                | BillingPort, internal entitlement catalog; provider refs in mapping tables only (ADR-0016). |
| UUIDv4 PKs → UUIDv7 rewrite                                    | UUIDv7 internal PKs from Day 1 (X-14).                                                      |
| Offset pagination → cursor pagination (breaking change)        | Cursor pagination from Day 1 (D-21, X-49).                                                  |
| English-only → i18n retrofit                                   | i18n foundations from Phase 0a (D-21).                                                      |
| Cookie-only auth → OAuth/mobile retrofit                       | Full token model designed and built from Phase 0a (ADR-0015).                               |
| Single Postgres → regional split                               | Cell architecture with jurisdiction-local Cloud SQL from Day 1 (ADR-0002).                  |

### 2.4 Port / Adapter Matrix

See §19 (Vendor & Dependency Strategy) for the full port/adapter matrix with exit paths.

---

## 3. Data Architecture

### 3.1 Design Principles

1. **Tenant isolation at every layer**: Every table with business data has an `organization_id` column. PostgreSQL Row-Level Security policies enforce isolation at the database level, not just the application level.
2. **Immutability of signed documents**: Once a `SignatureEvent` exists for a `DocumentVersion`, that version's `content_snapshot` and `content_hash` are immutable. Database triggers enforce this.
3. **Copy-on-create template links**: When a `Document` is created from a `Template`, content is deep-copied. The `source_template_id` is a historical reference, not a live link. Template updates never retroactively alter existing documents.
4. **Soft deletes everywhere**: No hard deletes on any entity that participates in audit trails, signed documents, or billing history. A `deleted_at` timestamp column plus RLS policies that exclude soft-deleted rows from normal queries.
5. **UTC timestamps**: All `created_at`, `updated_at`, `signed_at`, `expires_at` columns stored as `TIMESTAMPTZ` in UTC. Display-time timezone conversion is a client responsibility.

### 3.2 Core Schema

> [!NOTE]
> Column types use PostgreSQL notation. `uuid` columns use `gen_random_uuid()` as default. All tables include `created_at TIMESTAMPTZ NOT NULL DEFAULT now()` and `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()` unless noted. Indexes are listed where they are performance-critical; standard primary-key and foreign-key indexes are implicit.

#### 3.2.1 Organization & Identity

```sql
-- ═══════════════════════════════════════════════════════════
-- ORGANIZATION (the billing entity)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE organizations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  slug              TEXT NOT NULL UNIQUE,
  logo_url          TEXT,
  paddle_customer_id TEXT UNIQUE,        -- Paddle customer reference
  settings          JSONB NOT NULL DEFAULT '{}',  -- org-wide config
  data_residency    TEXT NOT NULL DEFAULT 'us',    -- 'us' | 'eu'
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);
CREATE INDEX idx_organizations_slug ON organizations (slug) WHERE deleted_at IS NULL;

-- ═══════════════════════════════════════════════════════════
-- WORKSPACE (optional sub-division)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE workspaces (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  name              TEXT NOT NULL,
  slug              TEXT NOT NULL,
  brand_kit_id      UUID,               -- FK to brand_kits
  settings          JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ,
  UNIQUE (organization_id, slug)
);
CREATE INDEX idx_workspaces_org ON workspaces (organization_id) WHERE deleted_at IS NULL;

-- ═══════════════════════════════════════════════════════════
-- TEAM (group within a workspace)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE teams (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL REFERENCES workspaces(id),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  name              TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);
CREATE INDEX idx_teams_workspace ON teams (workspace_id) WHERE deleted_at IS NULL;

-- ═══════════════════════════════════════════════════════════
-- USER
-- ═══════════════════════════════════════════════════════════
CREATE TABLE users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  email             TEXT NOT NULL,
  full_name         TEXT NOT NULL,
  avatar_url        TEXT,
  workos_user_id    TEXT UNIQUE,         -- WorkOS identity reference
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','active','deactivated')),
  seat_type         TEXT NOT NULL DEFAULT 'full'
                      CHECK (seat_type IN ('full','collaborator')),
  is_owner          BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ,
  UNIQUE (organization_id, email)
);
CREATE INDEX idx_users_org ON users (organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_email ON users (email);

-- ═══════════════════════════════════════════════════════════
-- WORKSPACE_MEMBERSHIP (user ↔ workspace, carries the role)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE workspace_memberships (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id),
  workspace_id      UUID NOT NULL REFERENCES workspaces(id),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  role              TEXT NOT NULL DEFAULT 'member'
                      CHECK (role IN ('admin','manager','member','collaborator')),
  has_content_admin  BOOLEAN NOT NULL DEFAULT false,  -- content/legal admin overlay
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, workspace_id)
);
CREATE INDEX idx_wm_workspace ON workspace_memberships (workspace_id);
CREATE INDEX idx_wm_user ON workspace_memberships (user_id);

-- ═══════════════════════════════════════════════════════════
-- TEAM_MEMBERSHIP
-- ═══════════════════════════════════════════════════════════
CREATE TABLE team_memberships (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id),
  team_id           UUID NOT NULL REFERENCES teams(id),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  is_manager        BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, team_id)
);
```

#### 3.2.2 Document & Content

```sql
-- ═══════════════════════════════════════════════════════════
-- DOCUMENT (central entity)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE documents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  workspace_id      UUID NOT NULL REFERENCES workspaces(id),
  owner_id          UUID NOT NULL REFERENCES users(id),
  source_template_id UUID REFERENCES templates(id),  -- copy-on-create, not live
  is_template_linked BOOLEAN NOT NULL DEFAULT false,  -- rare: live link to template
  deal_room_id      UUID REFERENCES deal_rooms(id),
  type              TEXT NOT NULL
                      CHECK (type IN ('proposal','quote','contract','brochure',
                                      'sow','sign_off','job_offer','form')),
  title             TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','sent','viewed','signed',
                                        'declined','expired','archived','voided')),
  custom_domain     TEXT,
  slug              TEXT NOT NULL,       -- for recipient URL
  password_hash     TEXT,                -- optional access protection
  expires_at        TIMESTAMPTZ,
  max_views         INTEGER,
  domain_restriction TEXT[],             -- allowed email domains
  currency          TEXT NOT NULL DEFAULT 'USD',
  total_value       NUMERIC(15,2),       -- cached from pricing table
  metadata          JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ,
  UNIQUE (organization_id, slug)
);
CREATE INDEX idx_documents_workspace ON documents (workspace_id, status)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_owner ON documents (owner_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_status ON documents (organization_id, status)
  WHERE deleted_at IS NULL;

-- ═══════════════════════════════════════════════════════════
-- DOCUMENT_VERSION (immutable content snapshot)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE document_versions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id       UUID NOT NULL REFERENCES documents(id),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  version_number    INTEGER NOT NULL,
  content_snapshot  JSONB NOT NULL,      -- full block tree at this point in time
  content_hash      TEXT NOT NULL,       -- SHA-256 of canonical JSON
  is_signed         BOOLEAN NOT NULL DEFAULT false,  -- locked once true
  is_current        BOOLEAN NOT NULL DEFAULT false,
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, version_number)
);
CREATE INDEX idx_docver_document ON document_versions (document_id, is_current);

-- Trigger: prevent mutation of signed versions
-- (See Section 3.3 for trigger definition)

-- ═══════════════════════════════════════════════════════════
-- TEMPLATE
-- ═══════════════════════════════════════════════════════════
CREATE TABLE templates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  workspace_id      UUID NOT NULL REFERENCES workspaces(id),
  title             TEXT NOT NULL,
  category          TEXT,
  industry_tags     TEXT[],
  content           JSONB NOT NULL,       -- block tree
  default_settings  JSONB NOT NULL DEFAULT '{}',  -- expiry, access rules
  variable_fields   JSONB NOT NULL DEFAULT '[]',  -- merge-tag definitions
  signer_roles      JSONB NOT NULL DEFAULT '[]',  -- predefined signer slots
  is_system         BOOLEAN NOT NULL DEFAULT false, -- platform-provided
  folder_id         UUID REFERENCES folders(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);
CREATE INDEX idx_templates_workspace ON templates (workspace_id) WHERE deleted_at IS NULL;

-- ═══════════════════════════════════════════════════════════
-- CONTENT_BLOCK (reusable snippets in the content library)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE content_blocks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  workspace_id      UUID NOT NULL REFERENCES workspaces(id),
  title             TEXT NOT NULL,
  type              TEXT NOT NULL,        -- 'text','image','case_study','clause','bio'
  content           JSONB NOT NULL,
  tags              TEXT[],
  usage_count       INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);

-- ═══════════════════════════════════════════════════════════
-- FOLDER (hierarchical organization for documents & templates)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE folders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  workspace_id      UUID NOT NULL REFERENCES workspaces(id),
  parent_id         UUID REFERENCES folders(id),
  name              TEXT NOT NULL,
  entity_type       TEXT NOT NULL CHECK (entity_type IN ('document','template')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);

-- ═══════════════════════════════════════════════════════════
-- COMMENT
-- ═══════════════════════════════════════════════════════════
CREATE TABLE comments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id       UUID NOT NULL REFERENCES documents(id),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  user_id           UUID NOT NULL REFERENCES users(id),
  parent_id         UUID REFERENCES comments(id),  -- threading
  block_id          TEXT,                -- specific block within document
  body              TEXT NOT NULL,
  is_suggestion     BOOLEAN NOT NULL DEFAULT false,
  resolved          BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);
CREATE INDEX idx_comments_document ON comments (document_id) WHERE deleted_at IS NULL;
```

#### 3.2.3 Quoting & CPQ

```sql
-- ═══════════════════════════════════════════════════════════
-- PRODUCT_CATALOG_ITEM (org-level SKU/service)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE product_catalog_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  sku               TEXT,
  name              TEXT NOT NULL,
  description       TEXT,
  unit_price        NUMERIC(15,4) NOT NULL,
  currency          TEXT NOT NULL DEFAULT 'USD',
  billing_frequency TEXT DEFAULT 'one_time'
                      CHECK (billing_frequency IN ('one_time','monthly','quarterly',
                                                    'semi_annual','annual')),
  is_active         BOOLEAN NOT NULL DEFAULT true,
  metadata          JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);
CREATE INDEX idx_pci_org ON product_catalog_items (organization_id) WHERE deleted_at IS NULL;

-- ═══════════════════════════════════════════════════════════
-- PRICING_TABLE (belongs to a document)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE pricing_tables (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id       UUID NOT NULL REFERENCES documents(id),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  display_format    TEXT NOT NULL DEFAULT 'line_items'
                      CHECK (display_format IN ('line_items','tier_cards','combined')),
  discount_rules    JSONB NOT NULL DEFAULT '[]',
  tax_config        JSONB NOT NULL DEFAULT '{}',
  settings          JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════
-- LINE_ITEM
-- ═══════════════════════════════════════════════════════════
CREATE TABLE line_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pricing_table_id  UUID NOT NULL REFERENCES pricing_tables(id) ON DELETE CASCADE,
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  product_item_id   UUID REFERENCES product_catalog_items(id),
  name              TEXT NOT NULL,
  description       TEXT,
  quantity          NUMERIC(15,4) NOT NULL DEFAULT 1,
  unit_price        NUMERIC(15,4) NOT NULL,
  discount_percent  NUMERIC(5,2) DEFAULT 0,
  discount_amount   NUMERIC(15,2) DEFAULT 0,
  subtotal          NUMERIC(15,2) NOT NULL,
  billing_frequency TEXT DEFAULT 'one_time',
  is_optional       BOOLEAN NOT NULL DEFAULT false,
  is_selected       BOOLEAN NOT NULL DEFAULT true,  -- buyer can toggle optional items
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_line_items_table ON line_items (pricing_table_id);
```

#### 3.2.4 Signing & Audit

```sql
-- ═══════════════════════════════════════════════════════════
-- SIGNATURE_REQUEST
-- ═══════════════════════════════════════════════════════════
CREATE TABLE signature_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id       UUID NOT NULL REFERENCES documents(id),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  document_version_id UUID NOT NULL REFERENCES document_versions(id),
  external_provider_id TEXT,             -- BoldSign document ID
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','in_progress','completed',
                                        'declined','voided','expired')),
  signing_order     TEXT NOT NULL DEFAULT 'parallel'
                      CHECK (signing_order IN ('parallel','sequential')),
  sent_at           TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sigreq_document ON signature_requests (document_id);

-- ═══════════════════════════════════════════════════════════
-- SIGNER
-- ═══════════════════════════════════════════════════════════
CREATE TABLE signers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signature_request_id UUID NOT NULL REFERENCES signature_requests(id),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  user_id           UUID REFERENCES users(id),     -- NULL for external signers
  email             TEXT NOT NULL,
  name              TEXT,
  role_label        TEXT,                -- e.g. "Client", "Witness"
  signing_order     INTEGER NOT NULL DEFAULT 0,
  verification_method TEXT NOT NULL DEFAULT 'none'
                      CHECK (verification_method IN ('none','email','passcode',
                                                     'sms','kba','id_document','qes')),
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','sent','viewed','signed',
                                        'declined','reassigned')),
  signature_data    JSONB,               -- captured signature (type/draw/image)
  signed_at         TIMESTAMPTZ,
  ip_address        INET,
  user_agent        TEXT,
  external_signer_id TEXT,               -- BoldSign signer ID
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_signers_request ON signers (signature_request_id);
CREATE INDEX idx_signers_email ON signers (email);

-- ═══════════════════════════════════════════════════════════
-- SIGNATURE_EVENT (immutable audit trail)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE signature_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id       UUID NOT NULL REFERENCES documents(id),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  signer_id         UUID REFERENCES signers(id),
  event_type        TEXT NOT NULL,       -- 'sent','viewed','signed','declined',
                                         -- 'voided','reassigned','reminder_sent'
  ip_address        INET,
  user_agent        TEXT,
  metadata          JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
  -- NO updated_at — this table is append-only
);
CREATE INDEX idx_sigevents_document ON signature_events (document_id, created_at);
-- Trigger: prevent UPDATE and DELETE on this table (see Section 3.3)
```

#### 3.2.5 Payments (BYOK)

```sql
-- ═══════════════════════════════════════════════════════════
-- PAYMENT_PROVIDER_CONNECTION (BYOK: customer's own processor)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE payment_provider_connections (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  provider_type     TEXT NOT NULL
                      CHECK (provider_type IN ('stripe','paypal','square',
                                               'razorpay','mollie','payment_link','custom')),
  display_name      TEXT NOT NULL,
  -- For API-key integrations: encrypted at rest (see Security section)
  encrypted_credentials BYTEA,           -- encrypted via envelope encryption
  dek_ciphertext    BYTEA,              -- encrypted DEK for this record
  kms_key_id        TEXT,                -- reference to the KEK in KMS
  -- For payment-link integrations:
  payment_link_url_template TEXT,        -- e.g. "https://pay.example.com/?amount={{amount}}"
  -- Common fields:
  supported_currencies TEXT[] NOT NULL DEFAULT '{USD}',
  is_active         BOOLEAN NOT NULL DEFAULT true,
  is_verified       BOOLEAN NOT NULL DEFAULT false,  -- validated via test transaction
  last_verified_at  TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);
CREATE INDEX idx_ppc_org ON payment_provider_connections (organization_id)
  WHERE deleted_at IS NULL;

-- ═══════════════════════════════════════════════════════════
-- PAYMENT
-- ═══════════════════════════════════════════════════════════
CREATE TABLE payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id       UUID REFERENCES documents(id),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  provider_connection_id UUID NOT NULL REFERENCES payment_provider_connections(id),
  payer_email       TEXT NOT NULL,
  payer_name        TEXT,
  amount            NUMERIC(15,2) NOT NULL,
  currency          TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','processing','completed',
                                        'failed','refunded','disputed')),
  payment_type      TEXT NOT NULL DEFAULT 'full'
                      CHECK (payment_type IN ('full','deposit','installment','recurring')),
  recurring_config  JSONB,               -- frequency, duration, trial
  external_transaction_id TEXT,          -- processor's transaction reference
  external_checkout_url TEXT,            -- for payment-link flow
  paid_at           TIMESTAMPTZ,
  metadata          JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_document ON payments (document_id);
CREATE INDEX idx_payments_org ON payments (organization_id, status);

-- ═══════════════════════════════════════════════════════════
-- PAYMENT_CREDENTIAL_AUDIT_LOG (every access to encrypted keys)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE payment_credential_audit_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  provider_connection_id UUID NOT NULL REFERENCES payment_provider_connections(id),
  actor_id          UUID,                -- user or system identity
  action            TEXT NOT NULL
                      CHECK (action IN ('created','read','updated','deleted',
                                        'used_for_payment','rotated')),
  ip_address        INET,
  metadata          JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
  -- Append-only: no updated_at, no deletes
);
CREATE INDEX idx_pcal_org ON payment_credential_audit_logs (organization_id, created_at);
```

#### 3.2.6 Billing (Paddle)

```sql
-- ═══════════════════════════════════════════════════════════
-- SUBSCRIPTION (org's own plan, synced from Paddle)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE subscriptions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) UNIQUE,
  paddle_subscription_id TEXT UNIQUE,
  paddle_customer_id TEXT,
  plan_tier         TEXT NOT NULL DEFAULT 'free'
                      CHECK (plan_tier IN ('free','starter','professional',
                                           'business','enterprise')),
  status            TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','past_due','paused',
                                        'cancelled','trialing')),
  full_seat_limit   INTEGER NOT NULL DEFAULT 1,
  full_seat_count   INTEGER NOT NULL DEFAULT 1,  -- includes pending invites
  collab_seat_limit INTEGER NOT NULL DEFAULT 0,
  collab_seat_count INTEGER NOT NULL DEFAULT 0,
  document_limit    INTEGER,             -- NULL = unlimited
  documents_used_this_period INTEGER NOT NULL DEFAULT 0,
  billing_cycle     TEXT NOT NULL DEFAULT 'monthly'
                      CHECK (billing_cycle IN ('monthly','annual')),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  add_ons           JSONB NOT NULL DEFAULT '[]',   -- e.g. notary, AI credits
  paddle_plan_id    TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════
-- BILLING_EVENT (Paddle webhook log — append-only)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE billing_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID REFERENCES organizations(id),
  paddle_event_id   TEXT NOT NULL UNIQUE,  -- idempotency key
  event_type        TEXT NOT NULL,
  payload           JSONB NOT NULL,
  processed         BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_billing_events_org ON billing_events (organization_id, created_at);
```

#### 3.2.7 Workflow & Automation

```sql
-- ═══════════════════════════════════════════════════════════
-- AUTOMATION_RULE
-- ═══════════════════════════════════════════════════════════
CREATE TABLE automation_rules (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  workspace_id      UUID NOT NULL REFERENCES workspaces(id),
  name              TEXT NOT NULL,
  trigger_event     TEXT NOT NULL,        -- 'document.signed','document.viewed', etc.
  conditions        JSONB NOT NULL DEFAULT '[]',
  actions           JSONB NOT NULL DEFAULT '[]',
  is_active         BOOLEAN NOT NULL DEFAULT true,
  execution_count   INTEGER NOT NULL DEFAULT 0,
  last_executed_at  TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);

-- ═══════════════════════════════════════════════════════════
-- APPROVAL_CHAIN
-- ═══════════════════════════════════════════════════════════
CREATE TABLE approval_chains (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  workspace_id      UUID NOT NULL REFERENCES workspaces(id),
  name              TEXT NOT NULL,
  conditions        JSONB NOT NULL DEFAULT '{}',  -- when does this chain apply
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);

CREATE TABLE approval_steps (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_chain_id UUID NOT NULL REFERENCES approval_chains(id) ON DELETE CASCADE,
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  step_order        INTEGER NOT NULL,
  approver_id       UUID REFERENCES users(id),
  approver_team_id  UUID REFERENCES teams(id),    -- alternative: any team member
  fallback_approver_id UUID REFERENCES users(id), -- if primary is deactivated
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','approved','rejected','skipped')),
  decided_at        TIMESTAMPTZ,
  comment           TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### 3.2.8 Integrations, Webhooks, API Keys

```sql
-- ═══════════════════════════════════════════════════════════
-- INTEGRATION_CONNECTION
-- ═══════════════════════════════════════════════════════════
CREATE TABLE integration_connections (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  provider          TEXT NOT NULL,        -- 'salesforce','hubspot','slack', etc.
  encrypted_tokens  BYTEA,               -- OAuth tokens, encrypted
  dek_ciphertext    BYTEA,
  kms_key_id        TEXT,
  sync_config       JSONB NOT NULL DEFAULT '{}',
  health_status     TEXT NOT NULL DEFAULT 'healthy'
                      CHECK (health_status IN ('healthy','degraded','disconnected')),
  last_synced_at    TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);

-- ═══════════════════════════════════════════════════════════
-- WEBHOOK (org-configured outbound event subscription)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE webhooks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  url               TEXT NOT NULL,
  secret            TEXT NOT NULL,        -- for HMAC signing
  events            TEXT[] NOT NULL,      -- subscribed event types
  is_active         BOOLEAN NOT NULL DEFAULT true,
  failure_count     INTEGER NOT NULL DEFAULT 0,
  last_triggered_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);

-- ═══════════════════════════════════════════════════════════
-- API_KEY
-- ═══════════════════════════════════════════════════════════
CREATE TABLE api_keys (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  name              TEXT NOT NULL,
  key_hash          TEXT NOT NULL UNIQUE,  -- bcrypt/argon2 hash, never store plaintext
  key_prefix        TEXT NOT NULL,         -- first 8 chars for identification
  scopes            TEXT[] NOT NULL DEFAULT '{}',
  last_used_at      TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ,
  created_by        UUID NOT NULL REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at        TIMESTAMPTZ
);
CREATE INDEX idx_api_keys_org ON api_keys (organization_id) WHERE revoked_at IS NULL;
```

#### 3.2.9 Analytics, Audit, Brand, Deal Rooms

```sql
-- ═══════════════════════════════════════════════════════════
-- ANALYTICS_EVENT (lives in ClickHouse, not PostgreSQL)
-- Schema shown here for reference; actual DDL uses ClickHouse syntax
-- ═══════════════════════════════════════════════════════════
-- CREATE TABLE analytics_events (
--   event_id        UUID,
--   organization_id UUID,
--   workspace_id    UUID,
--   document_id     UUID,
--   session_id      String,
--   viewer_email    Nullable(String),
--   viewer_name     Nullable(String),
--   event_type      Enum8('view','section_view','click','download','forward',
--                         'video_play','form_submit','payment_initiated'),
--   section_id      Nullable(String),
--   duration_ms     Nullable(UInt32),
--   ip_address      Nullable(IPv4),
--   user_agent      Nullable(String),
--   country         Nullable(String),
--   referrer        Nullable(String),
--   metadata        String,  -- JSON string
--   created_at      DateTime64(3, 'UTC')
-- ) ENGINE = MergeTree()
-- PARTITION BY toYYYYMM(created_at)
-- ORDER BY (organization_id, document_id, created_at);

-- ═══════════════════════════════════════════════════════════
-- AUDIT_LOG_ENTRY (org-level admin audit trail — PostgreSQL)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE audit_log_entries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  actor_id          UUID REFERENCES users(id),
  actor_type        TEXT NOT NULL DEFAULT 'user'
                      CHECK (actor_type IN ('user','api_key','system')),
  action            TEXT NOT NULL,        -- 'user.invited','setting.changed', etc.
  resource_type     TEXT NOT NULL,        -- 'user','document','webhook', etc.
  resource_id       UUID,
  changes           JSONB,               -- diff of what changed
  ip_address        INET,
  user_agent        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
  -- Append-only
);
CREATE INDEX idx_audit_org ON audit_log_entries (organization_id, created_at);
CREATE INDEX idx_audit_resource ON audit_log_entries (resource_type, resource_id);

-- ═══════════════════════════════════════════════════════════
-- BRAND_KIT
-- ═══════════════════════════════════════════════════════════
CREATE TABLE brand_kits (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  name              TEXT NOT NULL,
  primary_color     TEXT,
  secondary_color   TEXT,
  accent_color      TEXT,
  logo_url          TEXT,
  favicon_url       TEXT,
  font_heading      TEXT,
  font_body         TEXT,
  custom_css        TEXT,
  email_from_name   TEXT,
  email_from_domain TEXT,
  remove_badge      BOOLEAN NOT NULL DEFAULT false,
  is_default        BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);
CREATE INDEX idx_brand_kits_org ON brand_kits (organization_id) WHERE deleted_at IS NULL;

-- ═══════════════════════════════════════════════════════════
-- DEAL_ROOM
-- ═══════════════════════════════════════════════════════════
CREATE TABLE deal_rooms (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  workspace_id      UUID NOT NULL REFERENCES workspaces(id),
  title             TEXT NOT NULL,
  slug              TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','closed','archived')),
  mutual_action_plan JSONB NOT NULL DEFAULT '[]',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ,
  UNIQUE (organization_id, slug)
);

CREATE TABLE deal_room_members (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_room_id      UUID NOT NULL REFERENCES deal_rooms(id),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  user_id           UUID REFERENCES users(id),
  external_email    TEXT,
  external_name     TEXT,
  role              TEXT NOT NULL DEFAULT 'viewer'
                      CHECK (role IN ('owner','member','viewer')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### 3.2.10 Future Entities (Phase 3–4, schema reserved)

These are documented for forward planning. Tables will be created in their respective phases:

- `form_submissions` — Phase 3 (Standalone Forms)
- `obligation_records` — Phase 3 (Portfolio Agreement Intelligence, Section 5.18)
- `risk_assessments` — Phase 3 (Risk-Adaptive Identity, Section 5.20)
- `security_alerts` — Phase 4 (Account-Level Security Monitoring, Section 5.21)
- `clickwrap_agreements`, `clickwrap_versions`, `clickwrap_acceptances` — Phase 2 (Consent Capture, Section 5.22)
- `notary_sessions`, `notary_journal_entries` — Phase 4 (RON)

### 3.3 Database Triggers for Immutability

```sql
-- Prevent modification of signed document versions
CREATE OR REPLACE FUNCTION prevent_signed_version_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_signed = true THEN
    RAISE EXCEPTION 'Cannot modify a signed document version (id: %)', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_immutable_signed_version
  BEFORE UPDATE ON document_versions
  FOR EACH ROW
  EXECUTE FUNCTION prevent_signed_version_mutation();

-- Prevent any UPDATE or DELETE on signature_events (append-only)
CREATE OR REPLACE FUNCTION prevent_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit trail records are immutable and cannot be modified or deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_immutable_signature_events
  BEFORE UPDATE OR DELETE ON signature_events
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_mutation();

CREATE TRIGGER trg_immutable_payment_audit
  BEFORE UPDATE OR DELETE ON payment_credential_audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_mutation();

CREATE TRIGGER trg_immutable_audit_log
  BEFORE UPDATE OR DELETE ON audit_log_entries
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_mutation();

-- Mark document version as signed when first signature event occurs
CREATE OR REPLACE FUNCTION mark_version_signed()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.event_type = 'signed' THEN
    UPDATE document_versions
    SET is_signed = true
    WHERE id = (
      SELECT document_version_id
      FROM signature_requests
      WHERE document_id = NEW.document_id
      ORDER BY created_at DESC LIMIT 1
    ) AND is_signed = false;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_mark_version_on_sign
  AFTER INSERT ON signature_events
  FOR EACH ROW
  WHEN (NEW.event_type = 'signed')
  EXECUTE FUNCTION mark_version_signed();
```

### 3.4 Row-Level Security Policies

```sql
-- Enable RLS on all tenant-scoped tables
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE signature_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE signers ENABLE ROW LEVEL SECURITY;
ALTER TABLE signature_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_provider_connections ENABLE ROW LEVEL SECURITY;
-- ... (all tenant-scoped tables)

-- Generic policy pattern (applied to each table):
-- (Revised v2.0.0 — X-01: index-friendly predicate; cast removed to allow GIN index use)
CREATE POLICY tenant_isolation ON documents
  USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
  WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));

-- Application sets tenant context per-request (transaction-scoped, same connection as queries):
-- SET LOCAL app.current_tenant = '<org_id>';
-- (Managed via Prisma Client Extension — see Section 7)
-- IMPORTANT: context and query MUST share the same connection under the pooler (X-02, MT-002).
```

---

## 4. API Contracts

### 4.1 REST API Design Principles

- **Versioned**: All API routes prefixed with `/api/v1/`
- **JSON:API-inspired**: Consistent response envelopes, pagination, filtering, sorting
- **Authenticated**: All endpoints require a valid session cookie (web app) or `Authorization: Bearer <api_key>` header (API consumers)
- **Tenant-scoped**: Organization context derived from the authenticated user's session; never passed as a URL parameter
- **Idempotent mutations**: POST endpoints accept an `Idempotency-Key` header for safe retries
- **Rate-limited**: Per-organization, tiered by plan (see Section 7)

### 4.2 Response Envelope

```typescript
// Success
{
  "data": T | T[],
  "meta": {
    "total": number,
    "page": number,
    "per_page": number,
    "has_more": boolean
  }
}

// Error
{
  "error": {
    "code": string,         // machine-readable: "DOCUMENT_NOT_FOUND"
    "message": string,      // human-readable
    "details": object?,     // validation errors, etc.
    "request_id": string    // for support correlation
  }
}
```

### 4.3 Core Endpoint Groups

#### Documents

| Method   | Path                                | Purpose                                    |
| -------- | ----------------------------------- | ------------------------------------------ |
| `POST`   | `/api/v1/documents`                 | Create document (optionally from template) |
| `GET`    | `/api/v1/documents`                 | List documents (filtered, paginated)       |
| `GET`    | `/api/v1/documents/:id`             | Get document detail                        |
| `PATCH`  | `/api/v1/documents/:id`             | Update document metadata / status          |
| `DELETE` | `/api/v1/documents/:id`             | Soft-delete document                       |
| `POST`   | `/api/v1/documents/:id/send`        | Send document to recipients                |
| `POST`   | `/api/v1/documents/:id/versions`    | Create new version snapshot                |
| `GET`    | `/api/v1/documents/:id/versions`    | List versions                              |
| `GET`    | `/api/v1/documents/:id/analytics`   | Document-level analytics summary           |
| `GET`    | `/api/v1/documents/:id/audit-trail` | Full audit trail                           |
| `POST`   | `/api/v1/documents/:id/pdf`         | Generate PDF export                        |

#### Templates

| Method   | Path                              | Purpose              |
| -------- | --------------------------------- | -------------------- |
| `POST`   | `/api/v1/templates`               | Create template      |
| `GET`    | `/api/v1/templates`               | List templates       |
| `GET`    | `/api/v1/templates/:id`           | Get template         |
| `PATCH`  | `/api/v1/templates/:id`           | Update template      |
| `DELETE` | `/api/v1/templates/:id`           | Soft-delete template |
| `POST`   | `/api/v1/templates/:id/duplicate` | Duplicate template   |

#### Signing

| Method | Path                                       | Purpose                          |
| ------ | ------------------------------------------ | -------------------------------- |
| `POST` | `/api/v1/documents/:id/signature-requests` | Create signature request         |
| `GET`  | `/api/v1/signature-requests`               | List all signature requests      |
| `POST` | `/api/v1/signature-requests/:id/void`      | Void a signature request         |
| `POST` | `/api/v1/signature-requests/:id/remind`    | Send reminder to pending signers |

#### Organizations & Users

| Method   | Path                   | Purpose                 |
| -------- | ---------------------- | ----------------------- |
| `GET`    | `/api/v1/organization` | Get current org         |
| `PATCH`  | `/api/v1/organization` | Update org settings     |
| `GET`    | `/api/v1/users`        | List org users          |
| `POST`   | `/api/v1/users/invite` | Invite user             |
| `PATCH`  | `/api/v1/users/:id`    | Update user role/status |
| `DELETE` | `/api/v1/users/:id`    | Deactivate user         |
| `GET`    | `/api/v1/workspaces`   | List workspaces         |
| `POST`   | `/api/v1/workspaces`   | Create workspace        |

#### Webhooks (outbound, from PactIntel to customer systems)

| Method   | Path                   | Purpose                   |
| -------- | ---------------------- | ------------------------- |
| `POST`   | `/api/v1/webhooks`     | Register webhook endpoint |
| `GET`    | `/api/v1/webhooks`     | List webhooks             |
| `DELETE` | `/api/v1/webhooks/:id` | Delete webhook            |

### 4.4 Webhook Event Types (Outbound)

Events are signed with HMAC-SHA256 using the webhook's secret key.

```typescript
type WebhookEvent =
  | 'document.created'
  | 'document.sent'
  | 'document.viewed'
  | 'document.signed'
  | 'document.declined'
  | 'document.expired'
  | 'document.voided'
  | 'signer.viewed'
  | 'signer.signed'
  | 'signer.declined'
  | 'payment.completed'
  | 'payment.failed'
  | 'payment.refunded';
```

Delivery contract: retry with exponential backoff (1s, 5s, 30s, 5m, 30m, 2h), up to 6 attempts. After exhaustion, mark webhook as degraded and notify org admins. Every webhook payload includes an `event_id` for idempotency.

### 4.5 Internal Events (EventEmitter2)

Same event type strings as webhooks, plus internal-only events:

```
document.version.created
template.updated
user.invited
user.deactivated
subscription.updated
approval.requested
approval.decided
automation.triggered
```

### 4.6 Paddle Webhooks (Inbound)

Endpoint: `POST /api/v1/webhooks/paddle`

Events handled:

- `subscription.created` → provision plan
- `subscription.updated` → update plan/seats/status
- `subscription.cancelled` → downgrade to free
- `transaction.completed` → confirm payment
- `customer.updated` → sync customer details

All Paddle webhooks verified via signature verification using the Paddle webhook secret. Idempotency enforced via `event_id` stored in `billing_events`.

### 4.7 BoldSign Webhooks (Inbound)

Endpoint: `POST /api/v1/webhooks/boldsign`

Events handled:

- `Sent` → update signer status
- `Viewed` → record view event
- `Signed` → lock version, update signer, emit `document.signed`
- `Declined` → update status, notify sender
- `Completed` → all signers done, trigger payment collection if configured
- `Revoked` → void request

---

## 5. Security & Compliance Architecture

### 5.1 Compliance Targets

| Standard                     | Implementation Path                                                                                                                                                             | Phase                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| **SOC 2 Type II**            | Audit-log architecture from Phase 0; Vanta for continuous monitoring from Phase 3; formal audit in Phase 3                                                                      | 3                         |
| **GDPR**                     | Data Processing Addendum, data-residency selection, right-to-erasure with legal-hold carve-out, consent management                                                              | 0 (architecture), 2 (DPA) |
| **PCI-DSS**                  | Achieved via Paddle (MoR) and the customer's own processor (BYOK). PactIntel never stores, processes, or transmits cardholder data directly.                                    | 0                         |
| **HIPAA / BAA**              | Enterprise add-on: dedicated cell with Google Cloud BAA, covered-products list verified `[VERIFY]`, Assured Workloads where needed, encryption at rest verified, access logging | 4                         |
| **AES-256**                  | All data encrypted at rest via Cloud KMS CMEK (Cloud SQL, Cloud Storage, Memorystore), all transit via TLS 1.3                                                                  | 0                         |
| **ESIGN Act / UETA / eIDAS** | Achieved via BoldSign's compliance (bought infrastructure)                                                                                                                      | 0                         |

### 5.2 Authentication & Authorization Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Client  │────►│ WorkOS   │────►│ NestJS   │────►│ CASL     │
│  (Login) │     │ AuthKit  │     │ Auth     │     │ Policy   │
│          │◄────│ (SSO/    │◄────│ Guard    │     │ Engine   │
│          │     │  MFA)    │     │          │     │          │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
```

1. **Authentication**: WorkOS AuthKit handles login (email/password, Google OAuth, SAML SSO). Returns a session token.
2. **Session**: Server-side sessions stored in Redis. Session cookie is `HttpOnly`, `Secure`, `SameSite=Lax`.
3. **Tenant context**: Middleware extracts `organization_id` from the session and sets it in `AsyncLocalStorage` (via `nestjs-cls`). Prisma extension sets `SET LOCAL app.current_tenant = '<org_id>'` before every query.
4. **Authorization**: CASL library evaluates permissions based on the user's role and the target resource. See Section 7 for the full policy matrix.
5. **API keys**: Hashed with Argon2, prefix-matched for identification, scoped by permissions array.

### 5.3 BYOK Key Security Subsection

> [!CAUTION]
> This subsection governs how third-party payment processor credentials are stored when customers choose the API-key integration path under the BYOK model. This is the highest-sensitivity data PactIntel handles (excluding Paddle's own MoR credentials, which we never touch).

#### 5.3.1 Encryption Architecture (Envelope Encryption)

```
┌──────────────────────────────────────────────────────────────────────┐
│                     KEY HIERARCHY (v2.0.0 — Cloud KMS)               │
│                                                                      │
│  ┌──────────────────────────┐                                        │
│  │   Cloud KMS              │  Per-cell, per-purpose CMKs:           │
│  │   (per-cell key rings)   │  data-at-rest · cred-vault             │
│  │   Multi-region locations │  integration-tokens · evidence         │
│  │   for DR ciphertext      │  field-encryption                      │
│  └────────────┬─────────────┘  Never leaves Cloud KMS boundary.     │
│               │ Wrap / Unwrap                                        │
│               ▼                                                      │
│  ┌──────────────────────────┐                                        │
│  │   Per-Tenant Data Key    │  TK: random 256-bit, wrapped by CEK   │
│  │   (TK)                   │  Stored in DB with AAD {org_id,purpose}│
│  │                          │  Crypto-shredding = destroy TK         │
│  └────────────┬─────────────┘  (backups hold it until they expire)  │
│               │ Wrap / Unwrap                                        │
│               ▼                                                      │
│  ┌──────────────────────────┐                                        │
│  │   Per-Record DEK         │  AES-256-GCM, generated per record     │
│  │                          │  Plaintext only in volatile memory      │
│  │                          │  Encrypted DEK stored in DB (BYTEA)     │
│  └────────────┬─────────────┘                                        │
│               │ Encrypt / Decrypt                                    │
│               ▼                                                      │
│  ┌──────────────────────────┐                                        │
│  │   Credential / Payload   │  Actual API keys / secrets / PII       │
│  │   Plaintext              │  Stored encrypted (BYTEA) in Cloud SQL  │
│  └──────────────────────────┘                                        │
└──────────────────────────────────────────────────────────────────────┘
```

#### 5.3.2 Implementation Rules

_(Revised v2.0.0 — Cloud KMS replaces AWS KMS; no per-org CMK by default; TK-based crypto-shredding; multi-region keys for DR)_

1. **Cloud KMS CMKs**: Per-cell, per-purpose key rings and keys created in Cloud KMS. Multi-region key locations (e.g., `us`, `europe`) for any key whose ciphertext replicates across regions within a jurisdiction `[VERIFY]`. Software protection by default; HSM for `cred-vault` and `integration-tokens` if cost-justified. Keys never leave the Cloud KMS boundary.
2. **No per-tenant CMK by default**: A shared per-cell CEK wraps per-tenant data keys (TKs). An enterprise customer-managed key is an optional `key_provider` value on the tenant record (ADR-0011).
3. **Per-tenant data key (TK)**: A random 256-bit key, wrapped by the cell CEK with AAD `{org_id, purpose}`, stored in the DB. Crypto-shredding = destroy the wrapped TK. Backups hold the wrapped TK until they expire — this is documented honestly in §17.
4. **Per-record DEKs**: A unique AES-256-GCM Data Encryption Key generated per `payment_provider_connections` record, wrapped by the TK, stored as `dek_ciphertext`. Plaintext exists only in volatile memory; zeroed after use (`Buffer.fill(0)`).
5. **Audit logging**: Every credential operation (create, read, update, delete, use-for-payment, rotate) logged to `payment_credential_audit_logs` (append-only, partitioned) with actor, IP, timestamp, action.
6. **Access control**: Only `CredentialVaultService` (`app_vault` DB role) accesses credential tables. No other module may call Cloud KMS decrypt directly. `app_vault` has `SELECT, INSERT, UPDATE` on credential tables only.
7. **Key rotation**: Cloud KMS scheduled rotation + background rewrap job for TKs. No re-encryption of actual credentials needed — only the wrapped TK is re-wrapped.
8. **Crypto-shredding on offboarding**: When an organization's TK is destroyed, all data encrypted under it becomes permanently unrecoverable after backup expiry. This is documented to customers in the DPA.

#### 5.3.3 Network & Access Controls

_(Revised v2.0.0 — GCP IAM replaces AWS IAM; Cloud KMS IAM conditions replace `kms:ViaService`)_

- The `CredentialVaultService` is architecturally isolated (NestJS module with no exported providers except `PaymentService`).
- Cloud KMS calls are authenticated via service accounts with least-privilege IAM: `cloudkms.cryptoKeyVersions.useToEncrypt` and `cloudkms.cryptoKeyVersions.useToDecrypt` on the specific key resource, with IAM conditions for service account scoping and AAD validation.
- Production Cloud SQL credentials for payment tables are scoped to the `app_vault` PostgreSQL role with `SELECT, INSERT, UPDATE` on `payment_provider_connections` only — separate from the `app_runtime` role.

### 5.4 Additional Security Measures

_(Revised v2.0.0 — Fly.io Secrets replaced with Secret Manager; WAF and SSRF controls added)_

- **Rate limiting**: Per-IP and per-organization, using Memorystore-backed sliding window. Tighter limits on auth endpoints. Edge rate limits via Cloudflare Workers.
- **CORS**: Strict allowlist of frontend origins.
- **CSRF**: CSRF tokens for cookie-authenticated routes.
- **Input validation**: Zod schemas on every endpoint (validated via NestJS pipes). No raw user input reaches the database.
- **Dependency scanning**: `npm audit` in CI; Snyk or Socket for supply-chain monitoring. Artifact Analysis (Container Analysis) on every image in Artifact Registry.
- **Secrets management**: All application secrets (database URLs, API keys, KMS credentials) stored in **Secret Manager** with user-managed replication within the jurisdiction, injected into Cloud Run as environment variables or volumes. Never in code, `.env` files in production, IaC state, or container images.
- **WAF**: Cloudflare WAF at the edge + Cloud Armor at the origin (ALB). Origin lockdown: ALB accepts traffic only from Cloudflare (IP allowlist and/or mTLS authenticated origin pulls and/or secret header). `[VERIFY]` precise Cloud Armor mechanism.
- **SSRF containment**: `worker-pdf` and outbound-webhook paths run with egress restricted to approved destinations. Link-local, metadata server (`169.254.169.254`), VPC, and RFC1918 ranges are blocked. `[VERIFY]` Cloud Run enforcement mechanism.
- **Instance metadata**: No application code accesses the GCP metadata server. Service account permissions granted via IAM only, not via metadata-server shortcuts.
- **Penetration testing**: Annual, per product spec §5.14.
- **Vulnerability disclosure program**: Public `security.txt` at `/.well-known/security.txt`.
- **Supply chain**: SBOM generated per image build; signed container images in Artifact Registry.

### 5.5 GDPR Right-to-Erasure Policy

Per product spec Section 9 (Edge Cases):

- **Signed documents and their audit trails**: Retained per legal obligation, even after an erasure request. These records serve as evidence of the agreement.
- **Non-essential personal data**: Marketing preferences, unused drafts, analytics events not tied to signed documents — purged on erasure request.
- **Implementation**: An `erasure_requests` table tracks requests. A background job processes erasure within 30 days, logging what was purged and what was retained (with legal justification) to the `audit_log_entries` table.

---

## 6. Payments Architecture

### 6.1 Platform Billing (Paddle)

#### 6.1.1 Integration Model

Paddle operates as Merchant of Record (MoR). PactIntel never directly processes subscription payments — Paddle handles:

- Payment collection (credit card, PayPal, Apple Pay)
- Global tax compliance (VAT, sales tax)
- Invoicing
- Dunning and failed-payment recovery (Paddle Retain)
- Refunds and chargebacks

#### 6.1.2 Subscription Lifecycle

```
User clicks "Upgrade" → Frontend opens Paddle Checkout overlay
  → Paddle processes payment → Paddle sends `subscription.created` webhook
  → PactIntel webhook handler:
     1. Verify webhook signature
     2. Check idempotency (billing_events.paddle_event_id)
     3. Upsert subscription record
     4. Update seat limits
     5. Emit 'subscription.updated' internal event
```

**Checkout**: Paddle's client-side JS overlay opens directly from the Billing page. No server-side payment form needed.

**Customer portal**: Redirects to Paddle's hosted portal for payment method updates, invoice downloads, and cancellation.

**Proration**: Handled by Paddle on plan changes. PactIntel receives `subscription.updated` with new plan details.

#### 6.1.3 Seat-Counting Rules

- `full_seat_count` = active users with `seat_type='full'` + pending invites with `seat_type='full'`
- `collab_seat_count` = active users with `seat_type='collaborator'` + pending invites with `seat_type='collaborator'`
- Seat changes trigger a Paddle subscription quantity update via API.
- When removing a seat mid-cycle: immediate access revocation, prorated credit applied at next billing cycle (Paddle handles this).

#### 6.1.4 Document/Send Cap Policy

Decided: **Hard block with clear upgrade CTA**. When `documents_used_this_period >= document_limit`, new document creation returns a `402` with a message directing the user to upgrade. No silent overage billing, no soft warning. This is the honest approach per the product spec's Edge Cases section.

### 6.2 End-User Payment Collection (BYOK)

#### 6.2.1 Design Overview

Under the BYOK model, each PactIntel customer connects their **own** payment processor. PactIntel facilitates the payment at the point of signature but is never the merchant of record for the transaction.

Two integration tiers:

| Tier                | How It Works                                                                                                                                                                                               | Supported Providers                                                                    | Complexity                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------- |
| **Payment Link**    | Customer provides a URL template with `{{amount}}`, `{{currency}}`, `{{reference}}` placeholders. PactIntel generates the link and embeds it in the signing flow. Customer's processor handles everything. | Any provider with hosted checkout (Stripe Payment Links, PayPal.me, Square, custom)    | Low — no API keys stored                     |
| **API Integration** | Customer provides their own API credentials (e.g., their Stripe secret key). PactIntel creates a charge/payment intent on the customer's behalf using their key.                                           | Stripe, PayPal, Square, Razorpay, Mollie (initially Stripe + PayPal, expand by demand) | High — encrypted credential storage required |

#### 6.2.2 Payment Flow (API Integration Tier)

```
1. Signer completes signature on the recipient page
2. Payment block appears (amount from pricing table, payment method form)
3. Frontend calls POST /api/v1/documents/:id/payments/initiate
4. Backend PaymentService:
   a. Loads payment_provider_connection for this org
   b. Calls CredentialVaultService.decrypt(connection.id) → plaintext API key
   c. Creates a PaymentIntent / charge on the CUSTOMER'S processor account
   d. Zeroes plaintext key from memory
   e. Returns client_secret to frontend for Stripe Elements (or equivalent)
5. Signer completes payment on the processor's UI
6. Processor webhook hits the customer's own endpoint (not ours)
   OR: PactIntel polls for completion / receives a callback
7. Payment record updated to 'completed'
8. Emit 'payment.completed' event → trigger post-payment automations
```

#### 6.2.3 Payment Flow (Payment Link Tier)

```
1. Signer completes signature
2. Payment block renders a "Pay Now" button
3. Button opens the payment link URL with substituted variables:
   https://checkout.stripe.com/pay/cs_live_xxx?amount=5000&currency=usd
4. PactIntel cannot confirm payment completion programmatically
5. Sender manually confirms payment in PactIntel
   OR: if the link provider supports webhooks to a custom URL,
       customer configures their webhook to point to PactIntel's
       payment-confirmation callback endpoint
6. Payment record updated
```

#### 6.2.4 Platform Take-Rate Revenue

> [!IMPORTANT]
> **Decision: Platform take-rate (basis-point markup on processed volume) is DROPPED for v1.**

**Rationale**: Under the BYOK model, PactIntel is not in the money flow. We do not control the payment rails, so we cannot automatically extract a basis-point cut. The two realistic alternatives and why they're deferred:

1. **Flat per-transaction fee invoiced separately**: Technically feasible (log completed payments, invoice monthly via Paddle), but creates a second billing relationship, complicates the Paddle integration, and requires accurate payment tracking even for the Payment Link tier where we may not have programmatic confirmation. The operational complexity isn't justified until payment volume is significant.

2. **Higher plan pricing for payment-enabled tiers**: The simpler approach — payment collection capability is a plan feature, not a per-transaction revenue stream. This is how we monetize payments in v1.

The take-rate can be revisited in Phase 3 when the API Integration tier is mature and we have reliable transaction data to invoice against.

### 6.3 Multi-Currency Validation

Per product spec Section 9 (Edge Cases): validate currency support against the connected processor **before send**, not at the moment of a failed charge. The `PaymentService.validateCurrencySupport(documentCurrency, connectionId)` check runs when a user configures a payment block on a document.

---

## 7. Multi-Tenancy & Permissions Implementation

### 7.1 Tenant Isolation Strategy: Defense in Depth

Three layers of tenant isolation, each independently sufficient:

1. **Application layer (CASL)**: Every query includes the user's `organization_id`. CASL abilities are scoped to the tenant.
2. **ORM layer (Prisma extension)**: Prisma Client Extension automatically injects `organization_id` filter into every `where` clause and sets PostgreSQL session variable before every query.
3. **Database layer (RLS)**: Even if both application layers fail, PostgreSQL Row-Level Security policies reject cross-tenant access.

### 7.2 Tenant Context Propagation

```typescript
// middleware/tenant-context.middleware.ts
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(private readonly cls: ClsService) {}

  use(req: Request, _res: Response, next: NextFunction) {
    const organizationId = req.user?.organizationId;
    if (organizationId) {
      this.cls.set('organizationId', organizationId);
      this.cls.set('userId', req.user.id);
      this.cls.set('role', req.user.role);
      this.cls.set('workspaceId', req.user.activeWorkspaceId);
    }
    next();
  }
}

// prisma/prisma-tenant.extension.ts
const prismaWithTenant = prisma.$extends({
  query: {
    async $allOperations({ args, query }) {
      const tenantId = cls.get('organizationId');
      if (tenantId) {
        await prisma.$executeRaw`SELECT set_config('app.current_tenant', ${tenantId}, true)`;
      }
      return query(args);
    },
  },
});
```

### 7.3 CASL Permission Matrix Implementation

The permission matrix from product spec Section 4 is implemented as CASL abilities:

```typescript
// casl/ability.factory.ts
export function defineAbilitiesFor(user: AuthenticatedUser): AppAbility {
  const { can, cannot, build } = new AbilityBuilder<AppAbility>(createMongoAbility);

  // Owner: everything
  if (user.isOwner) {
    can('manage', 'all');
    return build();
  }

  // Role-based rules
  switch (user.role) {
    case 'admin':
      can('manage', 'Document');
      can('manage', 'Template');
      can('manage', 'ContentBlock');
      can('manage', 'User');
      can('read', 'Billing'); // view only
      cannot('delete', 'Organization'); // only owner
      cannot('transfer', 'Ownership'); // only owner
      can('manage', 'Integration');
      can('manage', 'Security');
      can('manage', 'ApiKey');
      can('manage', 'Analytics'); // company-wide
      break;

    case 'manager':
      can('manage', 'Document', { workspaceId: { $in: user.managedWorkspaceIds } });
      can('manage', 'Document', { ownerId: user.id });
      can('read', 'Analytics', { scope: 'team' });
      can('manage', 'Template', { workspaceId: { $in: user.managedWorkspaceIds } });
      can('approve', 'Document'); // if in approval chain
      can('invite', 'User', { teamId: { $in: user.managedTeamIds } });
      if (user.hasContentAdmin) {
        can('lock', 'ContentSection');
      }
      break;

    case 'member':
      can('create', 'Document');
      can('send', 'Document');
      can('manage', 'Document', { ownerId: user.id });
      can('read', 'Template');
      can('use', 'Template');
      can('read', 'Analytics', { scope: 'own' });
      if (user.hasContentAdmin) {
        can('lock', 'ContentSection');
      }
      break;

    case 'collaborator':
      cannot('create', 'Document');
      cannot('send', 'Document');
      can('read', 'Document', { invitedUserIds: { $elemMatch: user.id } });
      can('comment', 'Document', { invitedUserIds: { $elemMatch: user.id } });
      can('edit', 'Document', { unlockedSections: true });
      can('sign', 'Document');
      break;
  }

  // Universal: everyone can sign if they're a requested signer
  can('sign', 'Document');
  can('read', 'Document', { partyIds: { $elemMatch: user.id } });

  return build();
}
```

### 7.4 Permission Enforcement Points

| Layer             | Mechanism                                        | Purpose                                                                        |
| ----------------- | ------------------------------------------------ | ------------------------------------------------------------------------------ |
| **Route guard**   | `@UseGuards(CaslGuard)` decorator on controllers | Block unauthorized requests at the HTTP boundary                               |
| **Service layer** | `ability.throwUnlessCan(action, subject)` calls  | Enforce within business logic (especially for complex conditional permissions) |
| **Database**      | RLS policies                                     | Last line of defense; catches any bypass of application-layer checks           |

### 7.5 Rate Limiting by Plan

```typescript
const RATE_LIMITS: Record<PlanTier, RateLimitConfig> = {
  free: { windowMs: 60_000, max: 30 },
  starter: { windowMs: 60_000, max: 120 },
  professional: { windowMs: 60_000, max: 300 },
  business: { windowMs: 60_000, max: 600 },
  enterprise: { windowMs: 60_000, max: 1200 },
};
```

Applied via a NestJS guard that reads the org's plan tier from the cached subscription and uses a Redis sliding-window counter.

---

## 8. Infrastructure, Deployment & Environments

_(Revised v2.0.0 — Google Cloud only; all Fly.io, AWS, Supabase, MinIO references removed)_

### 8.1 Hosting Platform

**Production, staging, and development run on Google Cloud only.** This is a Day-1 structural decision. No Fly.io, no AWS, no multi-cloud.

**Compute architecture:**

| Process Type  | Cloud Run Resource                                                  | Scaling Signal                          |
| ------------- | ------------------------------------------------------------------- | --------------------------------------- |
| `web-app`     | Service (HTTP)                                                      | Concurrency / request count             |
| `web-viewer`  | Service (HTTP) — separate from `web-app` for blast radius isolation | Concurrency / request count             |
| `api`         | Service (HTTP)                                                      | Concurrency / request count             |
| `collab`      | Service (HTTP/WebSocket)                                            | Active WebSocket connections `[VERIFY]` |
| `worker-core` | Worker Pool (BullMQ pull-based)                                     | Queue depth/age via external metrics    |
| `worker-bulk` | Worker Pool                                                         | Queue depth/age                         |
| `worker-ai`   | Worker Pool                                                         | Queue depth/age                         |
| `worker-pdf`  | Worker Pool — isolated; no metadata/VPC egress                      | Queue depth/age                         |
| `migrator`    | Job (one-off, runs before deploy)                                   | N/A                                     |

**Cell layout (GCP projects):**

```
Organization
├── control-plane/
│   └── pactintel-ctrl-[env]   (tenant dir, billing authority, webhook router)
├── cells-prod-us/
│   └── pactintel-prod-us1     (Cell gcp-us1)
├── cells-prod-eu/
│   └── pactintel-prod-eu1     (Cell gcp-eu1 — Phase 2)
├── non-prod/
│   ├── pactintel-dev
│   └── pactintel-staging
├── shared-services/
│   └── pactintel-shared       (Artifact Registry, IaC state, CI Workload Identity)
└── security/
    └── pactintel-security     (Cloud Audit Logs sink, Security Command Center)
```

> [!IMPORTANT]
> There is no migration trigger to a different platform. The cell architecture scales by adding more cells (a configuration change), not by re-platforming. See §0.1 and ADR-0001.

### 8.2 Environment Strategy

_(Revised v2.0.0 — all Fly.io references removed; GCP-native environments)_

| Environment    | Purpose                            | Infrastructure                                                                                                                                                                                                                          |
| -------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **local**      | Developer workstation              | Docker Compose (PostgreSQL+pgvector, Redis role-split, ClickHouse, Hocuspocus, **SeaweedFS or Garage** for Cloud Storage-compatible local emulation — NOT MinIO `[VERIFY]` replacement), Mailpit for email, local `KeyProvider` adapter |
| **dev**        | Isolated sandbox                   | Separate GCP project `pactintel-dev`; Cloud Run; Cloud SQL (scale-to-zero if available, else smallest Enterprise); Paddle sandbox; BoldSign sandbox                                                                                     |
| **staging**    | Pre-production integration testing | GCP project `pactintel-staging`; full production-like config; Paddle sandbox; BoldSign sandbox                                                                                                                                          |
| **production** | Live customer traffic              | Cell projects (`pactintel-prod-us1`, etc.); Cloudflare CDN; Cloud SQL HA; Memorystore; ClickHouse Cloud; Cloud Storage with Object Retention Lock                                                                                       |

**Local environment caveat:** Object Retention Lock behavior is only proven against real Cloud Storage in a throwaway bucket with the shortest allowed retention period `[VERIFY]`. Local compose proves structural plumbing only, not retention semantics.

**Preview environments:** Policy decision required. Options: (a) TTL-limited ephemeral Cloud Run revisions with a hard per-PR cost cap, or (b) removed in favor of local + staging. See ADR-0021 and `docs/revision/QUESTIONS_FOR_OWNER.md` Q11.

### 8.3 CI/CD Pipeline (GitHub Actions + Workload Identity Federation)

_(Revised v2.0.0 — GitHub OIDC → Workload Identity Federation → Artifact Registry → Cloud Run)_

```yaml
# .github/workflows/ci.yml (illustrative)
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  # Step 1: Nx affected targets
  lint-test-build:
    permissions:
      id-token: write # for Workload Identity Federation
      contents: read
    steps:
      - uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ vars.WIF_PROVIDER }}
          service_account: ${{ vars.CI_SERVICE_ACCOUNT }}
      - run: nx affected:lint && nx affected:test && nx affected:build

  # Step 2: Build and push images per process type (BuildKit cache)
  build-images:
    needs: lint-test-build
    # Build one image per process type, tag with git SHA
    # Push to Artifact Registry (immutable tags)
    # Run Artifact Analysis (Container Analysis / vulnerability scan)

  # Step 3: Run database migration as a Cloud Run Job
  migrate:
    needs: build-images
    # cloud run jobs execute --job migrator-job --wait

  # Step 4: Deploy Cloud Run services with traffic splitting (canary/blue-green)
  deploy-staging:
    needs: migrate
    if: github.ref == 'refs/heads/main'
    # gcloud run services update-traffic ... --to-revisions NEW=10,OLD=90
    # smoke tests → promote to 100%
    # Automated rollback: shift traffic back if smoke fails

  deploy-production:
    needs: deploy-staging
    # Manual approval gate
    # Same traffic-splitting pattern

  # Separate IaC pipeline (Terraform/OpenTofu)
  # plan on PR, apply on merge with approval
  # drift detection on schedule
```

No service-account JSON keys anywhere. No `fly deploy`. No `aws ecr` or `aws ecs`.

### 8.4 Docker Compose (Local Development)

_(Revised v2.0.0 — MinIO removed; Cloud Storage-compatible emulator used for structural tests only; Redis role-split; Mailpit added)_

```yaml
# docker-compose.yml
services:
  postgres:
    image: pgvector/pgvector:pg17
    ports: ['5432:5432']
    environment:
      POSTGRES_PASSWORD: local
    volumes: [pgdata:/var/lib/postgresql/data]

  # Redis — role-split: separate instances for structural accuracy
  redis-queue:
    image: redis:7-alpine
    command: redis-server --save "" --appendonly no # noeviction for BullMQ
    ports: ['6379:6379']

  redis-session:
    image: redis:7-alpine
    ports: ['6380:6379']

  redis-cache:
    image: redis:7-alpine
    ports: ['6381:6379']

  redis-realtime:
    image: redis:7-alpine
    ports: ['6382:6379']

  clickhouse:
    image: clickhouse/clickhouse-server:24
    ports: ['8123:8123', '9000:9000']

  # Cloud Storage-compatible local emulator (NOT minio/minio — discontinued Oct 2025)
  # [VERIFY] SeaweedFS or Garage as replacement; Object Retention Lock NOT proven locally
  # Use a real GCS dev bucket for retention-lock tests
  object-store:
    image: chrislusf/seaweedfs:latest # [VERIFY] — re-verify before committing
    ports: ['8333:8333']
    command: server -s3

  hocuspocus:
    build: ./apps/collab-server
    ports: ['1234:1234']
    depends_on: [redis-realtime, postgres]

  # Mailpit for local email testing (replaces any SES-local mock)
  mailpit:
    image: axllent/mailpit:latest
    ports: ['1025:1025', '8025:8025']
```

**What local compose proves:** application logic, RLS, BullMQ queuing, Hocuspocus collab, event flow.
**What it does not prove:** Object Retention Lock semantics, Cloud KMS envelope encryption, Cloud Armor WAF rules, Cloud Run autoscaling behaviour, actual GCP IAM policies.

### 8.5 Database Backup & Recovery

_(Revised v2.0.0 — WAL/pg_dump removed; Cloud SQL native backup; in-jurisdiction replication only)_

- **Cloud SQL (PostgreSQL)**: Automated backups with Point-in-Time Recovery (PITR). On-demand backups before migrations. Cross-region replica in the same jurisdiction as the DR pilot-light. `[VERIFY]` immutability options for Cloud SQL backups (Backup and DR Service vault lock).
- **Cloud Storage evidence class**: Dual-/multi-region bucket within the jurisdiction. Object Retention Lock (Locked) on every evidence object. A bucket with retained objects cannot be deleted until objects expire.
- **ClickHouse Cloud**: Provider-managed backups. Analytics data is reconstructable from the Pub/Sub event pipeline (relaxed RPO).
- **Automated restore drills**: Monthly restore tests with evidence. See §18 and rule OPS-002.
- **Jurisdiction constraint**: Replication targets never leave the jurisdiction (EU data never replicates outside EU).

### 8.6 IaC Structure

```
infra/
├── modules/
│   ├── foundation/       # GCP org, folders, Organization Policies, Cloud Identity
│   ├── control-plane/    # Control plane project resources
│   ├── cell/             # Instantiated once per cell (variable set only)
│   ├── edge/             # Cloudflare Workers, WAF, custom hostnames
│   └── observability/    # Grafana, Sentry, Cloud Monitoring dashboards
├── environments/
│   ├── dev/
│   ├── staging/
│   └── prod/
│       ├── us1/           # Cell gcp-us1 variable set
│       └── eu1/           # Cell gcp-eu1 variable set (Phase 2)
└── state/                 # GCS bucket backend config (in shared-services project)
```

New cell = add a new directory under `prod/` with the cell variable set. No code changes.

### 8.7 Runbook Index

| Runbook                  | Location                             |
| ------------------------ | ------------------------------------ |
| Deploy (standard)        | `docs/runbooks/deploy.md`            |
| Rollback (traffic shift) | `docs/runbooks/rollback.md`          |
| Database migration       | `docs/runbooks/db-migration.md`      |
| Region failover (DR)     | `docs/runbooks/region-failover.md`   |
| Restore drill            | `docs/runbooks/restore-drill.md`     |
| Add a new cell           | `docs/runbooks/add-cell.md`          |
| Tenant relocation        | `docs/runbooks/tenant-relocation.md` |
| Key rotation             | `docs/runbooks/key-rotation.md`      |
| Quota increase           | `docs/runbooks/quota-increase.md`    |

---

## 9. Testing & Quality Strategy

### 9.1 Testing Pyramid

```
          ┌─────────┐
          │  E2E    │  Playwright: critical user flows
          │  Tests  │  (create doc → sign → payment)
          ├─────────┤
          │  Integ. │  Supertest + TestContainers:
          │  Tests  │  API endpoints, DB, Redis, RLS
          ├─────────┤
          │  Unit   │  Vitest: business logic, CASL
          │  Tests  │  policies, encryption, webhook
          │         │  handlers, event processors
          └─────────┘
```

### 9.2 Test Tooling

| Tool               | Purpose                                                                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Vitest**         | Unit tests. Chosen over Jest for native ESM support and faster execution. Compatible with the Nx + TypeScript stack.               |
| **Supertest**      | HTTP-level integration tests against the NestJS application.                                                                       |
| **TestContainers** | Ephemeral PostgreSQL, Redis, and ClickHouse containers for integration tests. Ensures tests run against real databases, not mocks. |
| **Playwright**     | End-to-end browser tests. Also used for PDF rendering, so it's already a dependency.                                               |
| **Faker.js**       | Test data generation.                                                                                                              |
| **MSW**            | Mock Service Worker for intercepting external API calls (Paddle, BoldSign, WorkOS) in tests without hitting live services.         |

### 9.3 Critical Test Scenarios

- **RLS isolation**: Test that User A in Org A cannot read/write/update records belonging to Org B, even with raw SQL (bypassing Prisma).
- **Signed version immutability**: Attempt to UPDATE a `document_version` after `is_signed = true` → verify trigger rejects it.
- **Audit trail immutability**: Attempt to UPDATE or DELETE `signature_events` → verify trigger rejects it.
- **Seat counting**: Invite a user → verify `full_seat_count` increments immediately (not on acceptance). Deactivate → verify it decrements.
- **Paddle webhook idempotency**: Send the same `subscription.created` event twice → verify only one subscription is created.
- **BYOK credential encryption round-trip**: Store a test API key → decrypt it → verify it matches the original.
- **Permission matrix**: For each role × action combination in Section 4, verify CASL allows/denies correctly.

### 9.4 Coverage Targets

- Unit tests: ≥80% line coverage on business-logic modules (payments, signing, permissions, billing)
- Integration tests: Every API endpoint has at least one happy-path and one authorization-failure test
- E2E tests: The 5 critical flows (signup → create doc → send → sign → payment)
- No coverage enforcement on generated code, configuration, or migration files

---

## 10. Observability

### 10.1 Logging

- **Structured JSON logging** via Pino (NestJS default logger). Every log line includes: `timestamp`, `level`, `message`, `requestId`, `organizationId`, `userId`, `traceId`.
- **Log levels**: `error` (actionable failures), `warn` (degraded but functional), `info` (request lifecycle), `debug` (detailed internal state — disabled in production).
- **Sensitive data masking**: Email addresses, API keys, and any PII are masked in logs. A custom Pino serializer strips sensitive fields.
- **Log shipping**: Pino → stdout → Grafana Loki (via the Grafana agent running as a sidecar).

### 10.2 Error Tracking

- **Sentry** with source maps uploaded during CI build.
- Errors tagged with `organizationId`, `userId`, `requestId` for correlation.
- Alert rules: P0 errors (payment failures, signing failures, auth failures) → PagerDuty/Slack immediately. P1 errors (5xx responses) → Slack channel within 5 minutes.

### 10.3 Metrics

- **Application metrics** (Prometheus format, scraped by Grafana Cloud):
  - `http_request_duration_seconds` (histogram, by route + status)
  - `http_requests_total` (counter, by route + status)
  - `active_websocket_connections` (gauge)
  - `bullmq_job_duration_seconds` (histogram, by queue + job type)
  - `bullmq_jobs_waiting` (gauge, by queue)
  - `paddle_webhook_processing_duration` (histogram)
  - `boldsign_webhook_processing_duration` (histogram)
  - `credential_vault_operations_total` (counter, by operation type — for BYOK audit)

- **Infrastructure metrics**: CPU, memory, disk, network — collected by Grafana agent.

### 10.4 Distributed Tracing

- **OpenTelemetry SDK** integrated into NestJS via `@opentelemetry/nestjs-instrumentation`.
- Traces shipped to Grafana Tempo.
- Trace context propagated through HTTP headers (`traceparent`), BullMQ job metadata, and WebSocket connections.
- Critical traces: document creation → template copy → version snapshot → signing request → BoldSign API call → webhook return.

### 10.5 Health Checks

- `GET /health` — returns 200 with component statuses:
  ```json
  {
    "status": "healthy",
    "components": {
      "database": "healthy",
      "redis": "healthy",
      "clickhouse": "healthy",
      "hocuspocus": "healthy",
      "boldsign": "healthy"
    },
    "version": "1.0.0",
    "uptime_seconds": 86400
  }
  ```
- Used by Fly.io for health-check-based routing and auto-restart.

### 10.6 Public Status Page

- Hosted on a separate domain (status.pactintel.com) via an external service (Instatus or Betterstack).
- Monitors: API availability, signing service, payment processing, collaboration server.

---

## 11. Coding Standards & Repo Conventions

### 11.1 Monorepo Structure

```
pactintel2/
├── docs/
│   ├── MASTER_IMPLEMENTATION_BLUEPRINT.md   ← this document
│   └── PRODUCT_BLUEPRINT.md                 ← product spec
├── apps/
│   ├── web/                                 ← Next.js frontend
│   │   ├── src/
│   │   │   ├── app/                         ← App Router pages
│   │   │   ├── components/                  ← React components
│   │   │   ├── hooks/                       ← Custom React hooks
│   │   │   ├── lib/                         ← Client-side utilities
│   │   │   └── styles/                      ← Global CSS
│   │   ├── public/
│   │   ├── next.config.ts
│   │   └── package.json
│   ├── api/                                 ← NestJS backend
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── auth/
│   │   │   │   ├── organization/
│   │   │   │   ├── document/
│   │   │   │   ├── template/
│   │   │   │   ├── signing/
│   │   │   │   ├── payments/
│   │   │   │   ├── billing/
│   │   │   │   ├── cpq/
│   │   │   │   ├── analytics/
│   │   │   │   ├── workflow/
│   │   │   │   ├── integration/
│   │   │   │   ├── ai/
│   │   │   │   ├── notification/
│   │   │   │   ├── deal-room/
│   │   │   │   └── collaboration/
│   │   │   ├── common/
│   │   │   │   ├── guards/
│   │   │   │   ├── interceptors/
│   │   │   │   ├── pipes/
│   │   │   │   ├── decorators/
│   │   │   │   ├── filters/
│   │   │   │   └── middleware/
│   │   │   ├── prisma/
│   │   │   │   ├── schema.prisma
│   │   │   │   ├── migrations/
│   │   │   │   └── seed.ts
│   │   │   ├── config/
│   │   │   └── main.ts
│   │   ├── test/
│   │   └── package.json
│   └── collab-server/                       ← Hocuspocus server
│       ├── src/
│       └── package.json
├── libs/
│   ├── shared-types/                        ← DTOs, enums, interfaces
│   │   ├── src/
│   │   └── package.json
│   ├── shared-utils/                        ← Common utilities
│   │   ├── src/
│   │   └── package.json
│   └── ui/                                  ← Shared UI components
│       ├── src/
│       └── package.json
├── tools/
│   └── scripts/                             ← Build/deploy scripts
├── .github/
│   └── workflows/
├── nx.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .eslintrc.json
├── .prettierrc
├── docker-compose.yml
├── Dockerfile
├── AGENTS.md
├── GEMINI.md
└── README.md
```

### 11.2 Module Structure (NestJS)

Every module follows this internal structure:

```
modules/document/
├── document.module.ts          ← Module definition
├── document.controller.ts      ← HTTP endpoints
├── document.service.ts         ← Business logic
├── document.repository.ts      ← Prisma queries (thin wrapper)
├── dto/
│   ├── create-document.dto.ts  ← Zod schema + TypeScript type
│   ├── update-document.dto.ts
│   └── document-response.dto.ts
├── events/
│   ├── document-created.event.ts
│   └── document-signed.event.ts
├── listeners/
│   └── document-event.listener.ts
├── guards/
│   └── document-owner.guard.ts  ← Module-specific guards (if any)
└── __tests__/
    ├── document.service.spec.ts
    └── document.controller.spec.ts
```

### 11.3 Naming Conventions

| Item                  | Convention                  | Example                                    |
| --------------------- | --------------------------- | ------------------------------------------ |
| Files                 | `kebab-case`                | `document-version.service.ts`              |
| Classes               | `PascalCase`                | `DocumentVersionService`                   |
| Interfaces            | `PascalCase`, no `I` prefix | `DocumentVersion` (not `IDocumentVersion`) |
| Functions/methods     | `camelCase`                 | `createDocumentVersion()`                  |
| Constants             | `SCREAMING_SNAKE_CASE`      | `MAX_DOCUMENT_SIZE`                        |
| Database tables       | `snake_case`, plural        | `document_versions`                        |
| Database columns      | `snake_case`                | `organization_id`                          |
| API routes            | `kebab-case`, plural        | `/api/v1/document-versions`                |
| Environment variables | `SCREAMING_SNAKE_CASE`      | `DATABASE_URL`                             |
| Event types           | `dot.separated`             | `document.signed`                          |

### 11.4 Code Quality Tools

- **ESLint**: Strict TypeScript rules + NestJS plugin + import-order plugin
- **Prettier**: Enforced formatting, no debates. Config: `{ semi: true, singleQuote: true, trailingComma: 'all', printWidth: 100 }`
- **Husky + lint-staged**: Pre-commit hooks run ESLint + Prettier on staged files
- **Commitlint**: Conventional Commits enforced (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `perf:`)
- **Nx boundary enforcement**: Tags on projects prevent cross-boundary imports (e.g., `libs/ui` cannot import from `apps/api`)

### 11.5 Git Workflow

- **Trunk-based development**: `main` is always deployable. Short-lived feature branches merged via squash.
- **Branch naming**: `feat/document-editor`, `fix/paddle-webhook-retry`, `chore/upgrade-nestjs-11`
- **PR requirements**: CI passes (lint + test + build), at least one review, no direct pushes to `main`.

### 11.6 Quick-Start Guide (for new engineers/agents)

```bash
# 1. Clone and install
git clone <repo> && cd pactintel2
corepack enable && pnpm install

# 2. Start infrastructure
docker compose up -d

# 3. Set up environment
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
# Edit .env files with local values

# 4. Run database migrations
pnpm nx run api:prisma:migrate

# 5. Seed the database
pnpm nx run api:prisma:seed

# 6. Start development servers
pnpm nx run-many --target=dev --projects=api,web,collab-server

# API: http://localhost:3001
# Web: http://localhost:3000
# Collab: ws://localhost:1234
```

---

## 12. Build Sequencing

This section translates the product spec's Phase 0–4 into concrete technical milestones. Each phase lists what gets built, architectural dependencies, and definition of done.

### Phase 0 — Foundation (Estimated: 10–14 weeks)

**Goal**: A minimal but sellable product. One user can create a document, send it, get it signed, and collect payment.

#### What Gets Built

| Component                  | Details                                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Repo scaffold**          | Nx monorepo, pnpm, Docker Compose, CI pipeline, ESLint/Prettier/Husky config                                                   |
| **Data layer**             | PostgreSQL schema (Sections 3.2.1–3.2.6), Prisma setup, migrations, RLS policies, immutability triggers                        |
| **Auth**                   | WorkOS integration (email/password + Google OAuth + MFA), session management, API key infrastructure                           |
| **Organization model**     | Org → Workspace → Team → User CRUD, seat counting, invitation lifecycle                                                        |
| **Billing**                | Paddle checkout integration, webhook handler, subscription lifecycle, seat-quantity sync, plan enforcement middleware          |
| **Basic editor**           | Tiptap setup with text, image, heading, and list blocks. No collaboration yet. Content stored as JSONB in `document_versions`. |
| **Document lifecycle**     | Create → Edit → Version snapshot → Send → Track status (draft/sent/viewed/signed/expired)                                      |
| **PDF export**             | Playwright-based rendering of document pages to PDF                                                                            |
| **E-signature**            | BoldSign integration: create signature request, embed signing UI, webhook handler, audit trail                                 |
| **Payment collection**     | BYOK Payment Link tier only (no API key storage yet). Redirect to customer's checkout URL after signature.                     |
| **Documents Hub**          | Filterable, searchable document list with status badges and bulk actions                                                       |
| **Home Dashboard**         | Recent documents, pending actions, quick-create                                                                                |
| **Recipient viewing page** | Server-rendered document page, responsive, branded                                                                             |
| **Notification**           | Email notifications (sent, viewed, signed, declined) via Resend                                                                |
| **Audit trail**            | `signature_events` table, append-only, downloadable per document                                                               |
| **ClickHouse setup**       | Schema deployed, event ingestion pipeline from the API (basic view events only)                                                |
| **Observability**          | Sentry, Pino structured logging, health check endpoint                                                                         |

#### Architectural Dependencies

- Everything depends on the repo scaffold and data layer
- Auth must be complete before any authenticated feature
- Billing must be complete before plan-gated features

#### Definition of Done

- A new user can: sign up → create an org → invite a teammate → create a document from blank → add text/images → generate PDF → send for signature → signer receives email → signer views and signs → sender sees completion → payment link shown post-signature
- Paddle subscription can be created, upgraded, downgraded, cancelled
- RLS tests pass for cross-tenant isolation
- CI pipeline green, deployed to staging

---

### Phase 1 — A Real Sales Tool (Estimated: 8–12 weeks)

**Goal**: Templates, pricing, tracking, and branding turn PactIntel from a signing tool into a proposal/quoting platform.

#### What Gets Built

| Component                       | Details                                                                                                                     |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Templates + Content Library** | Template CRUD, category/industry tags, copy-on-create, content block library, "save document as template"                   |
| **Interactive pricing tables**  | PricingTable + LineItem entities, buyer-selectable optional items, quantity changes, discount display, totals recalculation |
| **Basic tracking**              | Open tracking (via tracking pixel + ClickHouse events), time-on-page, notification on first view                            |
| **Notifications expansion**     | Real-time in-app notifications (WebSocket), email digest options                                                            |
| **Custom domain**               | Cloudflare for SaaS integration for custom recipient-page domains, SSL provisioning                                         |
| **Brand kits**                  | Multiple brand profiles per org, logo/color/font application to documents and emails                                        |
| **Multi-user roles**            | Full permission matrix enforcement (CASL), Manager/Member/Collaborator distinctions                                         |
| **CRM integration**             | Salesforce or HubSpot (pick one — HubSpot first due to simpler API) — two-way sync of contacts and deal metadata            |
| **Mobile-responsive viewing**   | Ensure all recipient-facing pages render correctly on mobile browsers                                                       |

#### Depends On

- Phase 0 complete (document lifecycle, auth, billing)
- Pricing tables depend on Document module
- CRM integration depends on Integration module scaffold + OAuth token encryption

---

### Phase 2 — Depth That Creates Switching Cost (Estimated: 12–16 weeks)

**Goal**: Collaboration, AI, and analytics depth make PactIntel sticky. This is where switching cost is created.

#### What Gets Built

| Component                       | Details                                                                                                                                   |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Section-level analytics**     | ClickHouse schema for `section_view` events, time-per-section tracking, analytics dashboard                                               |
| **Real-time co-editing**        | Hocuspocus server deployment, Yjs integration with Tiptap, live cursors, presence                                                         |
| **Comments + content locking**  | Threaded comments on blocks, suggest-edits mode, content-locking by Content/Legal Admin                                                   |
| **Simple approval workflows**   | Approval chain creation, conditional triggers (deal value > X), email/in-app approval, escalation on deactivated approver                 |
| **Document expiry + reminders** | Auto-expire after configurable period, automated inactivity reminders, expiry notifications                                               |
| **Nudge-style follow-up**       | Semi-automated follow-up emails surfaced in a daily queue for rep review                                                                  |
| **In-editor AI drafting**       | LLM integration for writing, refining, grammar-fixing, condensing. Gemini API with provider abstraction.                                  |
| **Zapier integration**          | Webhook-based triggers/actions published to Zapier                                                                                        |
| **Basic CPQ**                   | Product catalog CRUD, line-item discounting, fee library                                                                                  |
| **Clickwrap / Consent Capture** | `ClickwrapAgreement`, `ClickwrapVersion`, `ClickwrapAcceptance` tables; embeddable widget; version tracking; dedicated API                |
| **BYOK API Integration tier**   | Encrypted credential storage (envelope encryption via KMS), Stripe + PayPal API integration, payment intent creation on customer's behalf |

#### Depends On

- Phase 1 complete
- Co-editing depends on document content being stored in Yjs-compatible format (migration from Phase 0's raw JSONB)
- AI drafting depends on `pgvector` extension setup
- BYOK API tier depends on KMS provisioning and the security architecture from Section 5.3

---

### Phase 3 — Scale / Enterprise Readiness (Estimated: 16–20 weeks)

**Goal**: Enterprise features, compliance, and platform maturity.

#### What Gets Built

| Component                                      | Details                                                                                                        |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Full CPQ**                                   | Bundles, pricing/discount rules engine, guided-selling playbooks, approval thresholds, native CRM-embedded CPQ |
| **Workflow orchestration (5.19)**              | Visual no-code workflow builder, cross-system integration (CRM/ERP triggers), capped flow count per plan       |
| **Deal Rooms**                                 | Multi-party workspace, document feed, messaging, mutual action plan tracker                                    |
| **Guided AI proposal builder**                 | Form-based document assembly, CRM data pull at build time                                                      |
| **AI data extraction**                         | Document type detection, structured field extraction (dates, value, parties), multi-language OCR               |
| **ID-verification signing**                    | KBA, government ID document verification, QES via BoldSign                                                     |
| **Portfolio Agreement Intelligence (5.18)**    | Cross-document search, counterparty tracking, obligation management, AI-generated reports                      |
| **Risk-adaptive identity verification (5.20)** | Third-party risk-scoring vendor integration, dynamic verification method selection                             |
| **Multi-workspace**                            | Full workspace isolation, cross-workspace asset sharing, parent-account oversight                              |
| **SAML SSO**                                   | WorkOS SAML configuration, organization-level SSO enforcement                                                  |
| **SOC 2 audit**                                | Vanta integration, audit-log completeness verification, formal audit engagement                                |
| **Advanced analytics**                         | Custom report builder, scheduled reports, extended data retention                                              |
| **Standalone Forms**                           | Form builder, submission inbox, routing rules, embed/share                                                     |
| **Full API + webhooks**                        | Complete REST API coverage, SDKs, Postman collection, OpenAPI spec                                             |
| **Mobile apps**                                | React Native / Expo: dashboard, document tracking, signing, push notifications                                 |
| **Meilisearch migration**                      | Replace PostgreSQL full-text search for document/template/portfolio search                                     |

#### Depends On

- Phase 2 complete
- Portfolio intelligence depends on AI extraction pipeline
- Risk-adaptive verification depends on ID-verification methods
- SOC 2 depends on audit-log architecture being complete (it is, from Phase 0)

---

### Phase 4 — The Long Tail (Build on demand)

**Goal**: Only built when there is clear, specific customer demand pulling for it.

| Component                                     | Trigger                                               |
| --------------------------------------------- | ----------------------------------------------------- |
| **Notary / RON**                              | Enterprise customer requests + regulatory research    |
| **HIPAA / FERPA / 21 CFR Part 11 workspaces** | Healthcare/education/pharma customer pipeline         |
| **Account-level security monitoring (5.21)**  | Enterprise security team requests                     |
| **Conversational AI Assistant**               | Usage data shows AI adoption; LLM capabilities mature |
| **MCP / Agent connector**                     | AI-agent ecosystem matures; customer demand           |
| **SCIM provisioning**                         | Enterprise customers with >100 seats                  |
| **Full document-content translation**         | International expansion                               |
| **White-glove professional services**         | Revenue justifies dedicated team                      |

---

## 13. Edge Cases & Mandatory Implementation Rules

> [!CAUTION]
> **THIS SECTION IS NON-NEGOTIABLE.** Every rule below MUST be followed by any engineer or AI agent writing code in this repository. These are not suggestions — they are prescriptive implementation requirements derived from the product spec's edge cases (Section 9) and supplemented with security, multi-tenancy, and infrastructure edge cases discovered during architecture design.
>
> **If you are a lightweight or fast AI model (e.g., Flash, Haiku, mini):** Treat every numbered rule as a hard constraint. Do NOT skip, simplify, or "optimize away" any rule. If a rule seems redundant with something already in the code, verify it is actually implemented before skipping it. If you are uncertain whether a rule applies to your current task, assume it does.

---

### 13.1 Signature Integrity & Document Immutability

> These rules protect the legal validity of every signed document. A single violation can make every signature PactIntel has ever collected legally worthless.

**RULE SIG-001: Signed DocumentVersions are immutable.**

- **Scenario:** A sender tries to edit a document after one or more signatures have been captured.
- **Risk:** If the content changes after signing, the signature no longer proves the signer agreed to the displayed content. Every signature collected by the platform becomes legally indefensible.
- **Implementation:**
  - A PostgreSQL trigger (`trg_immutable_signed_version`) on `document_versions` MUST reject any `UPDATE` where `is_signed = true`. See Section 3.3.
  - The `DocumentService.updateContent()` method MUST check `documentVersion.is_signed` before attempting any write. Return HTTP `409 Conflict` with error code `DOCUMENT_VERSION_SIGNED`.
  - The Tiptap editor frontend MUST switch to read-only mode the instant the document status becomes `signed` or any signature event exists.
  - No admin override, no superuser bypass, no "force" flag. The trigger is the last line of defense even if all application code is buggy.
- **Module:** Document
- **Phase:** 0
- **Test:** Attempt to `UPDATE document_versions SET content_snapshot = '{}' WHERE is_signed = true` via raw SQL → must fail with exception.

**RULE SIG-002: Content hash must be computed and verified.**

- **Scenario:** Content is modified between the time the signer views it and the time the signature is recorded.
- **Risk:** Signature is bound to different content than what the signer saw.
- **Implementation:**
  - When creating a `DocumentVersion`, compute `content_hash = SHA-256(canonical_json(content_snapshot))` and store it.
  - When a signature request is created, the `document_version_id` is locked to the current version. The BoldSign API call includes the content hash.
  - When BoldSign's `Signed` webhook fires, the handler MUST verify that the `content_hash` on the linked `document_version` has not changed (it shouldn't due to SIG-001, but verify anyway — defense in depth).
  - Use `JSON.stringify()` with sorted keys for canonical JSON to ensure deterministic hashing regardless of key order.
- **Module:** Document, Signing
- **Phase:** 0

**RULE SIG-003: Partial signing locks the entire document.**

- **Scenario:** A document has 3 signers. Signer 1 signs. The sender now tries to edit the document before signers 2 and 3 have signed.
- **Risk:** Signer 1's signature is bound to version N, but signers 2 and 3 see version N+1. The signatures are on different documents.
- **Implementation:**
  - The moment the first `signature_events` row with `event_type = 'signed'` is inserted for a document, the trigger `trg_mark_version_on_sign` sets `is_signed = true` on the current version. From that point, SIG-001 prevents any modification.
  - To make changes after partial signing, the sender MUST void the existing signature request (creating a `voided` signature event), create a new version, and start a new signature request. The original signers must re-sign.
  - The API endpoint `PATCH /api/v1/documents/:id` MUST return `409 Conflict` with error code `DOCUMENT_HAS_SIGNATURES` if any signature event of type `signed` exists for the current version.
- **Module:** Document, Signing
- **Phase:** 0

**RULE SIG-004: Terminal states are distinct and irreversible.**

- **Scenario:** A document is declined by a signer. A different code path later sets the status to "expired" because the expiry timer fired.
- **Risk:** Status confusion. Support tickets. Incorrect notifications. Audit trail incoherence.
- **Implementation:**
  - Document statuses `declined`, `expired`, `voided`, and `signed` are terminal. Once set, they MUST NOT transition to any other status except through an explicit amendment flow that creates a new document/version.
  - The `DocumentService.transitionStatus()` method MUST enforce a state machine:
    ```
    draft → sent → viewed → signed (terminal)
    draft → sent → viewed → declined (terminal)
    draft → sent → viewed → expired (terminal)
    draft → sent → expired (terminal)
    any non-terminal → voided (terminal)
    any non-terminal → archived (terminal, but reversible to draft)
    ```
  - Each terminal state triggers a distinct notification template. "Declined" tells the sender why (with the signer's comment). "Expired" tells the sender the deadline passed. "Voided" tells all parties the sender cancelled. These are NOT interchangeable.
  - Store the `terminal_reason` as metadata on the status transition event.
- **Module:** Document
- **Phase:** 0

**RULE SIG-005: Signer substitution preserves the full audit trail.**

- **Scenario:** Signer A is assigned to sign, but the sender needs to replace them with Signer B (the original person left the company, wrong email, etc.).
- **Risk:** If the system simply deletes Signer A and creates Signer B, the audit trail shows no record of Signer A ever being involved.
- **Implementation:**
  - A `reassign_signer` action MUST:
    1. Set Signer A's status to `reassigned` (NOT `deleted`)
    2. Create a `signature_events` row: `{ event_type: 'reassigned', signer_id: signerA.id, metadata: { reassigned_to: signerB.id, reason: '...' } }`
    3. Create Signer B as a new record with a new `id`
    4. Signer A's record persists forever with `status = 'reassigned'`
  - The audit trail download MUST include the reassignment event with both parties' details.
  - Never hard-delete a signer record. Ever.
- **Module:** Signing
- **Phase:** 0

**RULE SIG-006: Template-to-document is copy-on-create, never live.**

- **Scenario:** An admin updates a template. A document was created from that template last week and is currently with a signer.
- **Risk:** If the template change flows through to the live document, the signer now sees different content than what the sender intended.
- **Implementation:**
  - `DocumentService.createFromTemplate(templateId)` MUST deep-copy `template.content` into `document_versions.content_snapshot`. The `documents.source_template_id` is set for historical reference only.
  - If `documents.is_template_linked = false` (the default), template updates NEVER propagate.
  - If `documents.is_template_linked = true` (rare, opt-in), template updates propagate ONLY to documents still in `draft` status with zero signature events. The moment a document is sent, the link is severed automatically (set `is_template_linked = false` and snapshot the current content).
  - The `TemplateService.update()` method MUST NOT modify any `document_versions` records.
- **Module:** Template, Document
- **Phase:** 0 (templates Phase 1, but the copy-on-create architecture is Phase 0)

---

### 13.2 Authentication & Session Security

**RULE AUTH-001: Session tokens are server-side only.**

- **Scenario:** An attacker obtains a user's session cookie via XSS.
- **Risk:** Full account takeover.
- **Implementation:**
  - Session cookies MUST be `HttpOnly` (no JavaScript access), `Secure` (HTTPS only), `SameSite=Lax` (CSRF protection).
  - Session data (user ID, org ID, role, workspace ID) is stored in Redis, not in the cookie. The cookie contains only an opaque session ID.
  - Session TTL: 24 hours of inactivity, absolute maximum 7 days. Sliding window resets on activity.
  - On logout, the session MUST be deleted from Redis immediately (not just expired).
  - On password change or security event, ALL of the user's sessions MUST be invalidated (iterate Redis keys by user ID pattern).
- **Module:** Auth
- **Phase:** 0

**RULE AUTH-002: API keys are never stored in plaintext.**

- **Scenario:** Database is compromised. Attacker obtains API key table.
- **Risk:** Attacker can impersonate any API integration.
- **Implementation:**
  - API keys are generated as `pk_live_` + 40 random characters.
  - Only the SHA-256 hash is stored in `api_keys.key_hash`.
  - The first 8 characters are stored in `api_keys.key_prefix` for identification in the UI ("pk_live_a1b2c3d4...").
  - The full plaintext key is returned to the user ONCE at creation time. It is never retrievable again. The UI shows a "copy key now, you won't see it again" modal.
  - API key authentication: hash the incoming `Authorization: Bearer <key>` value with SHA-256, look up in `api_keys.key_hash`.
- **Module:** Auth
- **Phase:** 0

**RULE AUTH-003: Rate limiting on auth endpoints is aggressive.**

- **Scenario:** Brute-force login attempts or API key enumeration.
- **Risk:** Account compromise.
- **Implementation:**
  - Login endpoint: 5 attempts per email per 15-minute window. After 5 failures, lock the account for 15 minutes and email the account owner.
  - API key validation: 60 requests per key per minute. After exhaustion, return `429 Too Many Requests`.
  - Password reset: 3 requests per email per hour.
  - All rate limits MUST use Redis sliding-window counters keyed by `ip:endpoint` and `email:endpoint` (dual keying prevents both IP-distributed attacks and single-IP multi-account attacks).
  - NEVER reveal whether an email exists in the system via timing differences. Login and password-reset endpoints MUST return the same response time regardless of whether the email is registered.
- **Module:** Auth
- **Phase:** 0

**RULE AUTH-004: WorkOS webhook verification is mandatory.**

- **Scenario:** An attacker sends a forged WorkOS webhook to create a fake user session.
- **Risk:** Authentication bypass.
- **Implementation:**
  - Every WorkOS webhook MUST be verified using the WorkOS webhook secret and their signature verification SDK method.
  - If verification fails, return `401` and log the attempt with IP address to `audit_log_entries`.
  - The WorkOS webhook endpoint MUST NOT be guessable — use a long random path segment: `/api/v1/webhooks/workos/{random_secret_path_segment}`.
- **Module:** Auth
- **Phase:** 0

**RULE AUTH-005: External signer identity is established per-document.**

- **Scenario:** An external signer (not a PactIntel user) receives a signing link. They click it from a different email than the one it was sent to.
- **Risk:** Wrong person signs the document.
- **Implementation:**
  - The signing link contains a cryptographically random token (UUID v4, NOT sequential).
  - The signing page MUST verify the signer's identity per the configured `verification_method` on the `signers` record BEFORE allowing them to view the full document content.
  - For `verification_method = 'email'`: send a one-time code to the registered email. For `passcode`: prompt for the passcode the sender set. For `sms`: send an OTP to the registered phone.
  - The signer's email, IP address, and user agent are captured in the `signers` record AND in every `signature_events` row.
  - External signers NEVER have access to the main PactIntel application, other documents, or any data beyond the specific document they are a party to.
  - The signing token expires after 90 days or after the signature request expires (whichever is first).
- **Module:** Signing
- **Phase:** 0

---

### 13.3 Multi-Tenancy & Data Isolation

> A single multi-tenancy leak — one customer seeing another's data — is an extinction-level event for a SaaS company handling legal documents. These rules are non-negotiable.

**RULE MT-001: Every tenant-scoped table has `organization_id` and RLS.**

- **Scenario:** A new table is added to the schema without `organization_id` or without an RLS policy.
- **Risk:** Cross-tenant data leak.
- **Implementation:**
  - Every table that stores business data (not system/infrastructure tables like `billing_events`) MUST have:
    1. An `organization_id UUID NOT NULL REFERENCES organizations(id)` column
    2. An index on `organization_id`
    3. `ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;`
    4. A policy: `CREATE POLICY tenant_isolation ON <table> USING (organization_id::text = current_setting('app.current_tenant', true)) WITH CHECK (organization_id::text = current_setting('app.current_tenant', true));`
  - A Prisma migration that adds a tenant-scoped table WITHOUT these four items MUST be rejected in code review.
  - An integration test MUST verify RLS isolation for every new tenant-scoped table (attempt to read Org B's data while `app.current_tenant` is set to Org A).
- **Module:** All
- **Phase:** 0

**RULE MT-002: Tenant context MUST be set before every database query.**

- **Scenario:** A background job (BullMQ) runs a query without setting the tenant context.
- **Risk:** The query either sees ALL tenants' data (if RLS bypasses for the default role) or sees NO data (if RLS correctly blocks), causing silent data loss.
- **Implementation:**
  - For HTTP requests: `TenantContextMiddleware` extracts `organizationId` from the session and stores it in `AsyncLocalStorage` via `nestjs-cls`. The Prisma extension reads it and runs `SET LOCAL app.current_tenant`.
  - For BullMQ jobs: The `organizationId` MUST be passed in the job payload. The job processor MUST set the tenant context BEFORE any database access:
    ```typescript
    @Processor('documents')
    export class DocumentProcessor {
      async process(job: Job<{ organizationId: string; ... }>) {
        this.cls.set('organizationId', job.data.organizationId);
        // ... now safe to use Prisma
      }
    }
    ```
  - For WebSocket connections (Hocuspocus): The tenant context MUST be extracted from the authentication handshake and maintained for the duration of the connection.
  - For cron jobs / scheduled tasks: If a job iterates over all orgs (e.g., subscription renewal checks), it MUST set the tenant context PER ITERATION, never run unscoped.
  - **The Prisma extension MUST throw an error if `organizationId` is not set**, not silently proceed without a tenant filter.
- **Module:** Common (middleware, Prisma extension, BullMQ base processor)
- **Phase:** 0

**RULE MT-003: Never expose database IDs across tenant boundaries.**

- **Scenario:** A user crafts a request with another org's document ID: `GET /api/v1/documents/<other_org_document_id>`.
- **Risk:** Information disclosure or unauthorized access.
- **Implementation:**
  - RLS is the primary defense (the query returns 0 rows for the wrong tenant).
  - The API MUST return `404 Not Found` (not `403 Forbidden`) when a resource is not found within the tenant scope. Returning `403` confirms the resource exists, which is itself an information leak.
  - Never use sequential integer IDs for any tenant-scoped resource. All primary keys are UUIDs (v4, random).
  - Enumeration attacks are mitigated by UUIDs (2^122 possible values) + rate limiting.
- **Module:** All controllers
- **Phase:** 0

**RULE MT-004: Soft deletes never expose data across tenants.**

- **Scenario:** A document is soft-deleted in Org A. An admin in Org B somehow references the same ID.
- **Risk:** Deleted data from Org A becomes visible in Org B's context.
- **Implementation:**
  - RLS policies apply to soft-deleted records too. The `organization_id` filter is always enforced, regardless of `deleted_at` state.
  - Default queries in repositories MUST include `WHERE deleted_at IS NULL`. A separate `includeDeleted()` scope is available for admin/audit queries but STILL enforces tenant isolation.
  - Hard delete is prohibited on any table that participates in audit trails, signatures, or billing history. The `prevent_audit_mutation` trigger enforces this on audit tables.
- **Module:** All repositories
- **Phase:** 0

**RULE MT-005: Background jobs never leak data between tenants.**

- **Scenario:** A BullMQ worker processes Job A (Org X), then processes Job B (Org Y). The tenant context from Job A leaks into Job B.
- **Risk:** Job B reads or writes data belonging to Org X.
- **Implementation:**
  - The `nestjs-cls` module uses `AsyncLocalStorage`, which is per-async-context. Each BullMQ job runs in its own async context, so leakage between sequential jobs in the same worker should not occur.
  - HOWEVER, as defense in depth: every job processor's `process()` method MUST explicitly set the tenant context at the start (as per MT-002), never relying on it being "already set."
  - Every job processor's `process()` method MUST clear the tenant context at the end (or in a `finally` block): `this.cls.set('organizationId', null);`
  - Integration tests for job processors MUST process two jobs for different orgs in sequence and verify no cross-tenant data access occurs.
- **Module:** Common (BullMQ base processor)
- **Phase:** 0

---

### 13.4 Billing & Seat Management

**RULE BILL-001: Pending invites reserve seats immediately.**

- **Scenario:** An org has 5/5 seats used. Admin invites a 6th user. The invite sits "pending" for days.
- **Risk:** If pending invites don't count against the seat cap, users can game the system by keeping invites unaccepted.
- **Implementation:**
  - When a user invitation is created (`users.status = 'pending'`), the `subscriptions.full_seat_count` (or `collab_seat_count`) MUST be incremented immediately.
  - If `full_seat_count >= full_seat_limit`, the invite MUST be rejected with HTTP `402 Payment Required` and error code `SEAT_LIMIT_REACHED`.
  - When a pending invite is cancelled or expires, the seat count MUST be decremented.
  - When a user is deactivated, the seat count MUST be decremented and their `status` set to `deactivated`.
  - Seat count changes MUST trigger a Paddle API call to update the subscription quantity.
  - The `subscriptions.full_seat_count` column MUST be recalculated from `COUNT(users WHERE status IN ('pending', 'active') AND seat_type = 'full')` periodically (daily cron) as a consistency check. If the cached count diverges from the calculated count, log a warning and auto-correct.
- **Module:** Organization, Billing
- **Phase:** 0

**RULE BILL-002: Document/send cap is a hard block.**

- **Scenario:** A user on the Starter plan has sent 50/50 documents this billing period. They try to send document #51.
- **Risk:** If we silently allow it or charge overage without consent, it creates a trust violation per the product spec's Edge Cases section.
- **Implementation:**
  - When `documents_used_this_period >= document_limit`, `DocumentService.send()` MUST return `402 Payment Required` with error code `DOCUMENT_LIMIT_REACHED` and include the current plan tier and the next tier's limit in the response body.
  - The frontend shows an upgrade modal, not a generic error.
  - `document_limit = NULL` means unlimited (Business and Enterprise tiers).
  - The counter increments when a document transitions to `sent` status (not on creation).
  - The counter resets when `current_period_end` passes (triggered by the Paddle `subscription.updated` webhook that starts a new period).
- **Module:** Document, Billing
- **Phase:** 0

**RULE BILL-003: Proration is handled by Paddle, not by us.**

- **Scenario:** A user upgrades mid-cycle from Starter to Professional.
- **Risk:** If we try to calculate proration ourselves, we'll get it wrong (different billing dates, tax jurisdictions, currencies).
- **Implementation:**
  - Plan changes are submitted to Paddle via their API. Paddle calculates proration and charges/credits accordingly.
  - PactIntel MUST NOT attempt to calculate or display prorated amounts. Show a "Contact Paddle's portal for billing details" link or use Paddle's proration preview API to show the customer what they'll be charged.
  - On `subscription.updated` webhook, update the local `subscriptions` record with the new plan tier, seat limits, and period dates.
- **Module:** Billing
- **Phase:** 0

**RULE BILL-004: Collaborator temporary upgrade is NOT supported in v1.**

- **Scenario:** A collaborator needs to send a single document. The admin wants to temporarily upgrade them.
- **Risk:** Undefined billing behavior, edge cases around reverting the upgrade.
- **Implementation:**
  - Collaborators CANNOT send documents. Period. The CASL ability `cannot('send', 'Document')` for collaborators is non-negotiable.
  - To send a document, the admin must change the user's `seat_type` from `collaborator` to `full`, which increments the full seat count and may trigger a seat-limit check.
  - There is NO "temporary upgrade" or "one-time send" feature. This is explicitly deferred until a customer asks for it and the billing model is designed.
  - If a customer asks, support directs them to upgrade the seat type permanently or have a full-seat user send the document on the collaborator's behalf.
- **Module:** Organization
- **Phase:** 0

**RULE BILL-005: Account-wide seat counting, not per-workspace.**

- **Scenario:** User X is a member of Workspace A and Workspace B.
- **Risk:** If counted per-workspace, the same person uses 2 seats, which is confusing and expensive for customers.
- **Implementation:**
  - A user counts as ONE seat, regardless of how many workspaces they belong to.
  - `subscriptions.full_seat_count` is computed from `COUNT(DISTINCT users.id WHERE status IN ('pending', 'active') AND seat_type = 'full')` — not from workspace memberships.
  - The `workspace_memberships` table is for ROLE assignment, not seat counting.
  - Exception: Enterprise customers with "Workspaces as separate sub-accounts" (Phase 4) may have per-workspace seat counting, but this requires a separate `subscription` record per workspace.
- **Module:** Organization, Billing
- **Phase:** 0

---

### 13.5 BYOK Payment Security

> These rules govern the highest-sensitivity data PactIntel handles. A breach of stored payment credentials is a catastrophic, company-ending event.

**RULE PAY-001: Never log plaintext credentials.**

- **Scenario:** A debug log statement accidentally includes the decrypted API key.
- **Risk:** Credentials appear in log files, error tracking (Sentry), or monitoring dashboards.
- **Implementation:**
  - The `CredentialVaultService` MUST NOT accept a logger instance or use `console.log`.
  - The Pino logger's custom serializer MUST have a blocklist of field names that are always redacted: `['apiKey', 'secretKey', 'api_key', 'secret_key', 'credentials', 'encrypted_credentials', 'plaintext', 'decrypted', 'password', 'token', 'access_token', 'refresh_token']`. Any value under these keys is replaced with `[REDACTED]`.
  - Sentry's `beforeSend` hook MUST scrub the same fields from error payloads.
  - Integration tests MUST verify that processing a payment does NOT produce any log line containing the test API key.
- **Module:** Payments, Common (logger config)
- **Phase:** 2 (BYOK API tier)

**RULE PAY-002: Plaintext credentials exist only in volatile memory.**

- **Scenario:** A server crash occurs while a credential is decrypted.
- **Risk:** Credential appears in a core dump or swap file.
- **Implementation:**
  - After using a decrypted credential (e.g., to make a Stripe API call), the Buffer holding the plaintext MUST be zeroed: `plaintextBuffer.fill(0);`
  - Credentials MUST NOT be stored in JavaScript strings (strings are immutable and cannot be zeroed). Use `Buffer` exclusively.
  - The `CredentialVaultService.decrypt()` method returns a `Buffer`, not a `string`. The caller converts to string only at the point of use and only within a `try/finally` block that zeroes the buffer in `finally`.
  - Never cache decrypted credentials. Every use triggers a fresh decrypt from KMS.
- **Module:** Payments
- **Phase:** 2

**RULE PAY-003: Every credential access is audit-logged.**

- **Scenario:** An insider or compromised service reads a customer's payment credentials.
- **Risk:** Without an audit log, the breach is undetectable and unattributable.
- **Implementation:**
  - Every call to `CredentialVaultService.decrypt()` MUST write to `payment_credential_audit_logs` with:
    - `action = 'read'` or `'used_for_payment'`
    - `actor_id` = the user or system identity that initiated the operation
    - `ip_address` = the originating request's IP
    - `metadata` = `{ purpose: 'payment_intent_creation', document_id: '...', payment_id: '...' }`
  - The audit log insert happens BEFORE the decrypt operation (so that even a crash mid-decrypt still produces a log entry).
  - The `payment_credential_audit_logs` table has the `prevent_audit_mutation` trigger — no updates, no deletes.
  - Monthly automated report: alert the org admin if credential access count exceeds 2x the average (anomaly detection).
- **Module:** Payments
- **Phase:** 2

**RULE PAY-004: Validate currency before send, not at payment time.**

- **Scenario:** A sender creates a document priced in JPY. Their connected Stripe account only supports USD.
- **Risk:** The signer signs the document, then the payment fails. The document is now signed but unpaid, creating a messy manual resolution.
- **Implementation:**
  - When a user adds a payment block to a document, the `PaymentService.validateCurrencySupport(currency, connectionId)` MUST be called.
  - If the currency is not in `payment_provider_connections.supported_currencies`, return a validation error immediately in the editor.
  - When the document status transitions to `sent`, perform the validation again (in case the provider's currencies changed).
  - The `supported_currencies` array is populated during connection setup and refreshed weekly via a background job that queries the processor's API.
- **Module:** Payments, Document
- **Phase:** 0 (Payment Link), 2 (API tier)

**RULE PAY-005: Deauthorized payment accounts trigger dunning.**

- **Scenario:** A customer's connected Stripe account is deauthorized (OAuth revoked), but they have active recurring charges tied to signed documents.
- **Risk:** Silent payment failures. The sender thinks they're getting paid; the payer's subscription quietly stops.
- **Implementation:**
  - A daily health-check job (`PaymentHealthCheckJob`) MUST verify each active `payment_provider_connection`:
    - For API tier: attempt a test API call (e.g., `GET /v1/account` for Stripe). If it returns 401/403, mark the connection as `is_active = false`.
    - For Payment Link tier: HTTP HEAD request to the payment link URL. If it returns non-2xx, mark as degraded.
  - When a connection becomes `is_active = false`:
    1. Notify the org admin via email and in-app notification: "Your payment connection has been deauthorized. Active recurring charges will fail."
    2. For each `payments` record with `status = 'pending'` or `payment_type = 'recurring'` linked to this connection, set `status = 'failed'` and create a notification for the document sender.
    3. Do NOT automatically retry — the connection is dead until the customer re-authorizes.
  - The Payments Dashboard MUST show a prominent warning banner for deauthorized connections.
- **Module:** Payments
- **Phase:** 2

**RULE PAY-006: Chargeback/dispute handling is between parties, not platform-mediated.**

- **Scenario:** A payer disputes a charge made via the sender's Stripe account.
- **Risk:** If PactIntel mediates, we take on financial and legal liability we can't afford under BYOK.
- **Implementation:**
  - Under BYOK, PactIntel is NOT the merchant of record for end-user payments. We do not hold funds, route funds, or have any financial relationship with the payer.
  - If a chargeback occurs, it's between the payer and the sender's payment processor. PactIntel's role is limited to:
    1. Updating the `payments.status` to `disputed` if we receive a webhook notification from the processor.
    2. Providing the signed document and audit trail as evidence that the sender can use in the dispute process.
  - The Terms of Service MUST explicitly state that PactIntel is not responsible for chargebacks, refunds, or payment disputes.
  - Support team response template: "Payment disputes are handled directly by your payment processor. We can provide the signed document and audit trail for your dispute evidence."
- **Module:** Payments (documentation), Legal
- **Phase:** 2

---

### 13.6 Data Retention & Compliance

**RULE GDPR-001: Right-to-erasure respects legal-hold carve-outs.**

- **Scenario:** A user requests GDPR erasure. They are a party to 5 signed contracts.
- **Risk:** If we delete the signed contracts, we destroy legal evidence. If we refuse to delete anything, we violate GDPR.
- **Implementation:**
  - On erasure request:
    1. Delete/anonymize: marketing preferences, unused draft documents (not sent, not signed), analytics events not tied to signed documents, avatar images, notification preferences.
    2. Anonymize but retain: the user's name and email on `signers` records for signed documents are replaced with "Anonymized User [request ID]" — the signature, audit trail, and document content are retained because they constitute legal evidence under legitimate interest.
    3. Retain fully: `signature_events`, signed `document_versions`, `audit_log_entries` — these are legally required records.
  - The `erasure_requests` table tracks each request with status, what was deleted, what was retained and why, and the legal basis for retention.
  - Processing deadline: 30 days from request, per GDPR.
  - The response to the user MUST list what was deleted and what was retained with the legal basis.
- **Module:** Organization, GDPR compliance module
- **Phase:** 2

**RULE GDPR-002: Data residency is enforced across ALL services.**

- **Scenario:** An EU customer selects "EU" data residency. Their document content is stored in an EU database. But the AI drafting feature sends their content to a US-based LLM API.
- **Risk:** One US-region third-party call breaks the entire "EU data stays in the EU" promise.
- **Implementation:**
  - The `organizations.data_residency` field (`'us'` or `'eu'`) MUST be checked before ANY external API call that includes customer content:
    - **LLM API calls**: Use the EU endpoint if available (Google Cloud has EU regions). If no EU endpoint exists, the feature is unavailable for EU-resident orgs until it does. Block the call, don't silently route to US.
    - **Email delivery**: Use Resend's EU-based infrastructure for EU-resident orgs.
    - **BoldSign API calls**: Verify BoldSign's data processing region. If US-only, evaluate whether the signed document content sent via API constitutes a data transfer requiring Standard Contractual Clauses.
    - **ClickHouse**: Ensure the ClickHouse cluster for EU-resident orgs is in an EU region.
    - **Object storage (S3/R2)**: EU-resident orgs' files MUST be in an EU-region bucket.
  - A middleware checks `data_residency` and injects the correct endpoint URLs into the service configuration for the request's async context.
  - Quarterly audit: verify all third-party sub-processors have DPAs and appropriate data residency configurations.
- **Module:** Common (middleware), AI, Signing, Analytics, Storage
- **Phase:** 0 (architecture), 2 (enforcement)

---

### 13.7 Access Control & Recipient Experience

**RULE ACC-001: View counting is session-based, not per-page-load.**

- **Scenario:** A recipient opens a document, refreshes the page 3 times. The document has a 5-view limit.
- **Risk:** If counting raw page loads, the recipient burns through their view limit by refreshing.
- **Implementation:**
  - A "view" is one session. A session is defined as: same `session_id` cookie (set on first visit), within a 30-minute window of continuous activity.
  - The `analytics_events` table in ClickHouse tracks raw `view` events. The `documents.view_count` (if implementing view limits) is derived from `COUNT(DISTINCT session_id)`, NOT `COUNT(*)`.
  - View-limit enforcement: on each page load, query `SELECT COUNT(DISTINCT session_id) FROM analytics_events WHERE document_id = :id AND event_type = 'view'`. If `>= max_views`, render an "access expired" page (see ACC-002).
  - The session ID is a cryptographically random token stored in a `HttpOnly` cookie on the recipient's browser. It is NOT the analytics `event_id`.
- **Module:** Analytics, Document (recipient page)
- **Phase:** 0 (basic), 1 (view limits)

**RULE ACC-002: Access denied shows a "request access" flow, not a raw error.**

- **Scenario:** A recipient forwards the document link to a colleague. The colleague's email domain doesn't match the `domain_restriction` on the document.
- **Risk:** A raw 403 page confuses the colleague and generates a support ticket.
- **Implementation:**
  - If access is denied due to domain restriction, password requirement, view-count exhaustion, or link expiry, the recipient page MUST render a branded "Request Access" page that:
    1. Explains why access is restricted (without revealing the document title or content): "This document requires authorization to view."
    2. Provides a "Request Access" button that sends an email to the document owner with the requester's name and email.
    3. Shows the sender's organization name and logo (from brand kit) for trust.
  - NEVER return a raw HTTP 403 or 404 page to a recipient. Always render a branded response.
  - The "Request Access" button creates an access request record and sends an in-app notification to the document owner, who can grant access via a one-click action.
- **Module:** Document (recipient page), Notification
- **Phase:** 1

**RULE ACC-003: Custom domain fallback on SSL/DNS misconfiguration.**

- **Scenario:** A customer configures `docs.theircompany.com` as their custom domain. Their DNS CNAME expires or their SSL certificate is misconfigured.
- **Risk:** Recipients clicking document links see a browser SSL error and cannot access their documents.
- **Implementation:**
  - Cloudflare for SaaS handles SSL provisioning. If a custom domain's SSL certificate fails to provision or renew:
    1. Cloudflare automatically falls back to serving the page from the default PactIntel domain.
    2. A background health-check job (hourly) checks all custom domains' SSL status.
    3. If a domain is unhealthy for >1 hour, send an email notification to the org admin: "Your custom domain docs.theircompany.com has an SSL issue. Documents are being served from the default domain until this is fixed."
    4. The fallback URL structure: `https://app.pactintel.com/d/<document_slug>` (always works, regardless of custom domain status).
  - Document links sent via email MUST include both the custom domain URL and a fallback link (e.g., in small text: "Having trouble? Try this link instead: ...").
- **Module:** Infrastructure, Notification
- **Phase:** 1

**RULE ACC-004: Password + domain restriction + view limits interact correctly.**

- **Scenario:** A document has all three: password protection, domain restriction (`@client.com` only), and a 10-view limit.
- **Risk:** The order of checks matters. If you check the password first, a wrong-domain user gets a "wrong password" error instead of a "wrong domain" error. If you check views first, a valid user sees "access expired" before they can even enter their password.
- **Implementation:**
  - Check order (enforced in `RecipientAccessGuard`):
    1. **Link validity**: Is the link expired (`expires_at`)? → If yes, render "This document has expired."
    2. **Domain restriction**: Does the viewer's identified email match `domain_restriction`? → If no email identified yet, prompt for email first, THEN check domain. If wrong domain, render "Request Access" (ACC-002).
    3. **View limit**: `COUNT(DISTINCT session_id) < max_views`? → If exceeded, render "This document has reached its maximum number of views."
    4. **Password**: Is `password_hash` set? → If yes, prompt for password. If wrong, allow 5 attempts per session, then soft-lock for 15 minutes.
  - This order ensures the most restrictive check (link validity) is first, and the least disruptive check (password) is last.
- **Module:** Document (recipient access guard)
- **Phase:** 1

---

### 13.8 Approval Workflows & Automation

**RULE WF-001: Deactivated approvers trigger automatic escalation.**

- **Scenario:** An approval chain has 3 steps. The approver at step 2 is deactivated (left the company). A document hits step 2 and stalls forever.
- **Risk:** Indefinitely stalled documents with no notification to anyone.
- **Implementation:**
  - When a user is deactivated (`users.status = 'deactivated'`), the `OrganizationService.deactivateUser()` method MUST:
    1. Query all `approval_steps` where `approver_id = deactivatedUserId` and `status = 'pending'`.
    2. For each pending step:
       a. If `fallback_approver_id` is set and the fallback is active, reassign to the fallback.
       b. If no fallback, escalate to the workspace admin (or org admin if no workspace admin).
       c. Create an `audit_log_entries` record: "Approval step auto-reassigned due to approver deactivation."
       d. Send notifications to both the new approver and the document owner.
    3. Update all `approval_chains` that reference this user as a default approver — set `fallback_approver_id` to the chain's workspace admin.
  - Approval steps MUST have a configurable timeout (default: 7 days). If not decided within the timeout, auto-escalate to the fallback.
  - The approval dashboard MUST show a "Stalled Approvals" section for admins.
- **Module:** Workflow, Organization
- **Phase:** 2

**RULE WF-002: Automation rules have loop detection.**

- **Scenario:** Rule A: "When document status = signed → create a new document from template." Rule B: "When document is created → set status to signed." Loop.
- **Risk:** Infinite loop crashes the worker, fills the database, or exhausts API rate limits.
- **Implementation:**
  - Every automation execution carries a `chain_depth` counter (starts at 0, increments each time an automation triggers another automation).
  - Maximum `chain_depth`: 5. If an automation would push the depth above 5, it is SKIPPED and a warning is logged: "Automation rule [name] skipped: maximum chain depth exceeded (possible loop)."
  - A `chain_id` (UUID) is generated at the first trigger and propagated through all downstream automations in the chain. This enables tracing the full chain in logs.
  - The automation admin UI shows a "Chain Depth Limit" warning when saving a rule that references events triggered by other rules.
  - Additionally: automation execution rate is capped at 100 executions per organization per minute. Exceeding this triggers a circuit breaker that pauses all automation rules for the org for 5 minutes and notifies the admin.
- **Module:** Workflow
- **Phase:** 2

**RULE WF-003: Approval decisions are immutable once made.**

- **Scenario:** An approver approves a document at step 2. The admin later wants to "undo" the approval.
- **Risk:** If approvals can be retroactively changed, the audit trail is unreliable.
- **Implementation:**
  - Once `approval_steps.status` is set to `'approved'` or `'rejected'`, it MUST NOT be changed. The `decided_at` timestamp is final.
  - To "redo" an approval: the admin must void the current approval chain and create a new one. The original chain's decisions persist in the audit trail.
  - Each approval decision creates an `audit_log_entries` record with the approver, decision, comment, and timestamp.
- **Module:** Workflow
- **Phase:** 2

---

### 13.9 Webhooks & Integration Reliability

**RULE WH-001: Every outbound webhook has an idempotency key.**

- **Scenario:** PactIntel sends a `document.signed` webhook. The recipient's server processes it (creates a deal in their CRM). PactIntel retries the webhook (because it didn't receive a 200 in time). The recipient creates a DUPLICATE deal.
- **Risk:** Duplicate records in customer CRM, double invoices, duplicate notifications.
- **Implementation:**
  - Every webhook payload MUST include an `event_id` field (UUID v4, generated once per event, stored in the outbound webhook log).
  - Webhook consumers are instructed (in API docs) to check `event_id` for idempotency.
  - PactIntel's own idempotency: the webhook delivery system checks the outbound log before sending. If the same `event_id` has already been delivered successfully (received a 2xx response), it is not sent again.
  - Retry schedule: 1s, 5s, 30s, 5m, 30m, 2h (6 attempts). After exhaustion, the webhook is marked as `failed`, `webhooks.failure_count` is incremented, and the admin is notified.
  - If `webhooks.failure_count >= 10` over 24 hours, the webhook is auto-disabled and the admin is emailed: "Your webhook endpoint is consistently failing. We've disabled it to prevent further failures."
- **Module:** Notification (webhook delivery)
- **Phase:** 0 (basic), 3 (full)

**RULE WH-002: Inbound webhook verification is mandatory.**

- **Scenario:** An attacker sends a forged Paddle webhook claiming a subscription was created.
- **Risk:** Free access to a paid plan.
- **Implementation:**
  - **Paddle webhooks**: Verify the `Paddle-Signature` header using Paddle's SDK. If verification fails, return `401` and log the attempt.
  - **BoldSign webhooks**: Verify the `X-BoldSign-Signature` header. If verification fails, return `401` and log.
  - **WorkOS webhooks**: Verify using WorkOS's `constructEvent()` method. If verification fails, return `401` and log.
  - ALL inbound webhook endpoints MUST:
    1. Verify the signature FIRST, before any processing.
    2. Check the `event_id` / `notification_id` for idempotency against the relevant event log table.
    3. Return `200 OK` quickly, then process asynchronously via BullMQ job.
    4. Log the raw payload (with sensitive fields redacted) to the event log table for debugging.
  - Webhook endpoints MUST NOT be listed in the OpenAPI spec or publicly documented. Use long random path segments.
- **Module:** Billing, Signing, Auth
- **Phase:** 0

**RULE WH-003: CRM sync has per-field conflict resolution.**

- **Scenario:** A rep updates a deal value to $50,000 in PactIntel. The same rep's colleague updates it to $55,000 in HubSpot. Both systems sync.
- **Risk:** If it's last-write-wins globally, one update is silently lost. If it's flag-for-review globally, every sync produces noise.
- **Implementation:**
  - Conflict resolution is per-field, configured by the admin:
    - **CRM-authoritative fields** (e.g., contact email, company name, deal stage): CRM value always wins. PactIntel's value is overwritten.
    - **PactIntel-authoritative fields** (e.g., document status, signature status, payment status): PactIntel value always wins.
    - **Flag-for-review fields** (e.g., deal value, close date): conflicts create a notification for the document owner to resolve manually.
  - Default config is set per integration type (HubSpot defaults, Salesforce defaults). Admins can customize.
  - Every sync conflict is logged in `audit_log_entries` with both the old and new values.
  - Sync conflicts for the same field on the same record within 5 minutes are batched into one notification (not spammed).
- **Module:** Integration
- **Phase:** 1 (basic sync), 3 (full conflict resolution)

---

### 13.10 Real-Time Collaboration

**RULE COLLAB-001: Hocuspocus authenticates at the WebSocket handshake.**

- **Scenario:** An unauthenticated user connects to the Hocuspocus WebSocket server and joins a document room.
- **Risk:** Unauthorized users can read and edit documents in real time.
- **Implementation:**
  - The Hocuspocus server MUST authenticate users during the WebSocket upgrade handshake using the `onAuthenticate` hook:
    ```typescript
    onAuthenticate: async ({ token, documentName }) => {
      const session = await validateSessionToken(token);
      if (!session) throw new Error('Unauthorized');
      const documentId = parseDocumentId(documentName);
      const canAccess = await checkDocumentAccess(session.userId, documentId);
      if (!canAccess) throw new Error('Forbidden');
      return { userId: session.userId, organizationId: session.organizationId };
    };
    ```
  - The `token` is the same session cookie used for HTTP requests, passed as a query parameter on the WebSocket URL.
  - Document access is verified against CASL abilities at connection time AND on each update (using Hocuspocus's `onUpdate` hook for content-lock enforcement).
  - If a user's session expires while they're connected, the Hocuspocus server MUST disconnect them (periodic session validation every 5 minutes).
- **Module:** Collaboration
- **Phase:** 2

**RULE COLLAB-002: Content locking prevents locked-section edits via CRDT.**

- **Scenario:** A Content/Legal Admin locks section 3 of a document. A collaborator uses a modified client that ignores the lock and edits section 3 via the Yjs CRDT.
- **Risk:** Content locks are only enforced client-side, so a modified client bypasses them.
- **Implementation:**
  - Content locks are stored server-side in the `document_versions.content_snapshot` metadata (per-block `is_locked` flag and `locked_by` user ID).
  - The Hocuspocus `onUpdate` hook MUST validate every Yjs update:
    1. Deserialize the update to identify which blocks were modified.
    2. For each modified block, check if it has `is_locked = true`.
    3. If a locked block was modified by a user who is NOT the locker or a Content/Legal Admin, REJECT the update (revert it from the Y.Doc).
  - This is server-side enforcement. The client-side lock UI is a convenience, not the security boundary.
- **Module:** Collaboration, Document
- **Phase:** 2

**RULE COLLAB-003: Collaboration server garbage collects idle documents.**

- **Scenario:** A document was being co-edited 3 days ago. No one is connected to it now. The Yjs document is still in memory on the Hocuspocus server.
- **Risk:** Memory leak. With thousands of documents, the server runs out of memory.
- **Implementation:**
  - Hocuspocus's `onDisconnect` hook tracks active connections per document.
  - When the last user disconnects from a document, start a 5-minute timer.
  - If no one reconnects within 5 minutes, persist the Y.Doc state to PostgreSQL and unload it from memory.
  - The persisted state is loaded back into memory when the next user connects to that document.
  - Maximum in-memory documents: configurable, default 500. If exceeded, evict least-recently-used documents (persist and unload).
  - Monitor memory usage per Hocuspocus instance. Alert if memory exceeds 70% of the container limit.
- **Module:** Collaboration
- **Phase:** 2

---

### 13.11 Internationalization & Time Zones

**RULE I18N-001: All timestamps are stored as UTC, displayed in the viewer's local zone.**

- **Scenario:** A document expires at "midnight" — but midnight in which timezone? The sender is in New York, the signer is in Tokyo.
- **Risk:** A signer thinks they have until midnight Tokyo time, but the document expired at midnight New York time (13 hours earlier).
- **Implementation:**
  - ALL `TIMESTAMPTZ` columns store UTC. No exceptions.
  - The `expires_at` value is set as a UTC timestamp by the sender. The UI converts the sender's local time to UTC before storing.
  - Recipient-facing pages display times in the VIEWER'S timezone (detected via browser's `Intl.DateTimeFormat().resolvedOptions().timeZone` or IP geolocation as fallback).
  - Expiry notifications include the explicit timezone: "This document expires on September 30, 2026 at 11:59 PM EDT (September 30, 2026 at 3:59 AM UTC)."
  - NEVER display a bare time without a timezone indicator on any recipient-facing page.
  - The audit trail stores and displays UTC exclusively (legal precision).
- **Module:** All (frontend date rendering, backend storage)
- **Phase:** 0

**RULE I18N-002: Translation scope is explicitly defined per feature.**

- **Scenario:** A customer asks "does PactIntel support Japanese?" — but do they mean the app UI, or the document content, or the outbound emails?
- **Risk:** Promising "internationalization" without defining scope creates support chaos.
- **Implementation:**
  - **Phase 0–2 scope:**
    - App UI chrome: English only.
    - Document content: Any language (user-generated, no constraints).
    - Outbound emails (notifications): English only.
    - Audit trail: English only (legal standard).
  - **Phase 3 scope:**
    - App UI: i18n framework (react-intl) with initial support for 5 languages.
    - Outbound emails: Templated in the org's configured language.
    - Document content: Still user-generated, no auto-translation.
  - **Phase 4 scope:**
    - Full document content translation via LLM.
  - Every public-facing page (pricing, marketing) states the current supported languages explicitly.
- **Module:** Frontend (i18n), Notification
- **Phase:** 0 (English only), 3 (multi-language)

---

### 13.12 PDF Generation & Document Rendering

**RULE PDF-001: PDFs must exactly match the live web version.**

- **Scenario:** The live web version of a document uses custom fonts, interactive pricing tables, and embedded videos. The PDF doesn't render any of them.
- **Risk:** The PDF and web version show different content. Signers argue they signed a different document.
- **Implementation:**
  - PDF generation uses Playwright to load the document's recipient page in headless Chromium and print to PDF.
  - Custom fonts MUST be loaded (Playwright waits for `document.fonts.ready` before printing).
  - Interactive elements (pricing tables with selectable options) MUST render in their CURRENT STATE (selected options, quantities) at the time of PDF generation.
  - Videos render as a thumbnail with a "Video: [title]" caption (videos can't play in PDFs, obviously).
  - Embedded scheduling/survey widgets render as a screenshot of their current state.
  - The PDF generation endpoint MUST accept a `version_id` parameter. If generating a PDF for a signed version, it renders THAT version's `content_snapshot`, not the current draft.
  - PDF file size limit: 50MB. If exceeded, warn the user and suggest removing high-resolution images.
- **Module:** Document (PDF generation)
- **Phase:** 0

**RULE PDF-002: Signed PDFs include the audit trail.**

- **Scenario:** A signer downloads the signed PDF. It doesn't include the audit trail.
- **Risk:** The PDF alone doesn't prove who signed, when, or from where.
- **Implementation:**
  - Signed PDFs MUST include an appended "Certificate of Completion" page with:
    - Document ID and title
    - Content hash (SHA-256) of the signed version
    - For each signer: name, email, IP address, timestamp (UTC), device/user-agent, verification method used, signature image (if draw/type)
    - BoldSign's X.509 digital certificate reference
  - This page is generated server-side as HTML and appended to the Playwright-rendered PDF.
  - The audit trail page is NOT editable by the sender.
- **Module:** Document, Signing
- **Phase:** 0

---

### 13.13 AI Feature Safety

**RULE AI-001: Customer content is never used for model training.**

- **Scenario:** A customer's confidential contract is sent to a Gemini API call. Google uses it to train a future model version.
- **Risk:** Confidential customer data appears in another customer's AI-generated output.
- **Implementation:**
  - All LLM API calls MUST use the provider's "no training" API option (Gemini: `safetySettings` + enterprise API agreement; OpenAI: enterprise API with data usage opt-out).
  - The AI module's HTTP client MUST set the `x-no-training: true` header (or equivalent) on every request.
  - The Terms of Service and privacy policy MUST explicitly state: "Customer content submitted to AI features is processed by third-party AI providers under data processing agreements that prohibit use of customer data for model training."
  - An integration test MUST verify that the AI module's HTTP client includes the no-training header on every outgoing request.
- **Module:** AI
- **Phase:** 2

**RULE AI-002: AI-generated content is clearly marked.**

- **Scenario:** A rep uses AI to draft a proposal section. The recipient assumes the rep personally wrote every word.
- **Risk:** Not a technical risk, but a trust/transparency issue.
- **Implementation:**
  - AI-generated content blocks in the editor MUST have a visual indicator (small AI icon in the block toolbar) that is visible to the EDITOR (not the recipient).
  - The editor's version history MUST log AI-generated content with `created_by: 'ai'` attribution.
  - The recipient-facing page does NOT show AI indicators (the content is the sender's responsibility once they accept it).
  - AI-generated content is always placed in the editor as a draft — it requires explicit user action (click "Accept" or "Insert") before it becomes part of the document. Auto-insertion without review is prohibited.
- **Module:** AI, Document (editor)
- **Phase:** 2

**RULE AI-003: AI admin guardrails are enforced server-side.**

- **Scenario:** An admin configures "AI cannot access documents in the Legal workspace." A rep uses a browser extension that directly calls the AI API with a Legal workspace document's content.
- **Risk:** Admin-configured guardrails are bypassed.
- **Implementation:**
  - AI guardrails (which workspaces AI can access, which data sources are allowed, which content can vary) are stored in `organizations.settings.ai_guardrails`.
  - The `AIService.generate()` method MUST check guardrails BEFORE constructing the LLM prompt. If the request violates a guardrail, return `403 Forbidden` with error code `AI_GUARDRAIL_VIOLATION`.
  - The guardrail check is server-side. Client-side guardrail enforcement (hiding the AI button) is a UX convenience, not a security boundary.
  - Guardrails apply to ALL AI entry points: editor panel, chat assistant, extraction, and guided proposal builder.
- **Module:** AI
- **Phase:** 2 (basic), 3 (full)

---

### 13.14 Analytics & Tracking

**RULE AN-001: Tracking pixel and section tracking respect privacy settings.**

- **Scenario:** A recipient's email client blocks tracking pixels. PactIntel records no "view" event. The sender thinks the recipient never opened the document.
- **Risk:** Inaccurate analytics, false "not viewed" status.
- **Implementation:**
  - The tracking pixel is a 1x1 transparent GIF loaded from the recipient page. If the pixel loads, record a `view` event in ClickHouse.
  - If the pixel doesn't load (email client blocks it), the `view` event is recorded when the recipient actually CLICKS the link and loads the full page (a more reliable signal anyway).
  - NEVER mark a document as "viewed" solely based on the tracking pixel. The primary view signal is the full page load with JavaScript execution.
  - Section-level tracking uses the Intersection Observer API on the recipient page. It records which sections are in the viewport and for how long.
  - If the recipient's browser blocks JavaScript (rare), section-level tracking is unavailable. The system still records the page load via the server-side request.
  - Tracking data is anonymous until the viewer identifies themselves (prompted on first visit or via email match).
- **Module:** Analytics
- **Phase:** 0 (basic view), 1 (open tracking), 2 (section-level)

**RULE AN-002: Stakeholder/forwarding tracking identifies new viewers.**

- **Scenario:** The sender sends a document to alice@company.com. Alice forwards the link to bob@company.com and carol@company.com. Bob and Carol open the document.
- **Risk:** If tracking only logs the original recipient, the sender doesn't know Bob and Carol (potential decision-makers) are reviewing.
- **Implementation:**
  - Each viewer gets a unique `session_id` cookie.
  - If a viewer's session doesn't match any known signer's email, they are tracked as an "Unknown Viewer" with a session-based profile.
  - The recipient page MUST display a non-intrusive "Identify yourself" prompt (e.g., floating bar: "Want to save your progress? Enter your name and email.") for unknown viewers. This prompt appears after 10 seconds of viewing.
  - Once identified, the viewer's session is associated with their email, and they appear in the document's analytics as a named stakeholder.
  - The sender receives a real-time notification: "A new viewer (bob@company.com) opened [Document Name]."
  - An "Anonymous viewer" is still tracked (session, time, sections viewed) even if they decline to identify themselves.
- **Module:** Analytics, Document (recipient page)
- **Phase:** 2

---

### 13.15 Email & Notification Reliability

**RULE NOTIF-001: Email delivery failures don't break signing flows.**

- **Scenario:** Resend's API is down. A sender clicks "Send for Signature." The signing invitation email fails to send.
- **Risk:** The document status transitions to "sent" but the signer never receives the email. The sender thinks the signer is ignoring them.
- **Implementation:**
  - Email sending is a BullMQ job with retry (3 attempts, exponential backoff).
  - If ALL retries fail:
    1. The document status remains `sent` (it's still a valid send — the shareable link works even without the email).
    2. The sender receives an in-app notification: "Email delivery to alice@company.com failed. You can resend the invitation or share the signing link directly."
    3. The signing link remains valid and accessible via the Documents Hub (the sender can copy and share it manually).
    4. A `signature_events` row is created: `{ event_type: 'email_delivery_failed', metadata: { reason: '...' } }`.
  - NEVER make document status transitions dependent on email delivery success. Email is a delivery mechanism, not the source of truth for document status.
- **Module:** Notification, Signing
- **Phase:** 0

**RULE NOTIF-002: Notification preferences are respected.**

- **Scenario:** A user disables email notifications for "document viewed." They still receive 50 "viewed" emails per day.
- **Risk:** User frustration, potential CAN-SPAM/GDPR issues.
- **Implementation:**
  - Notification preferences are stored in `users.settings.notifications` as a JSON map:
    ```json
    {
      "email": { "document.viewed": false, "document.signed": true, ... },
      "in_app": { "document.viewed": true, "document.signed": true, ... },
      "push": { "document.viewed": false, "document.signed": true, ... }
    }
    ```
  - The `NotificationService.send()` method MUST check preferences BEFORE queuing the notification. If the channel is disabled for this event type, skip it silently.
  - System-critical notifications (security alerts, billing failures, deauthorized payment accounts) are EXEMPT from user preferences — they always send. These are clearly marked in the notification template system.
  - Unsubscribe links in emails MUST work immediately and update the user's preferences in the database.
- **Module:** Notification
- **Phase:** 0

---

### 13.16 Infrastructure & Operational Safety

**RULE INFRA-001: Database migrations are backward-compatible.**

- **Scenario:** A migration adds a NOT NULL column without a default. The old application code (still running during a rolling deploy) crashes because it doesn't populate the new column.
- **Risk:** Downtime during deployments.
- **Implementation:**
  - All Prisma migrations MUST follow the "expand and contract" pattern:
    1. **Expand**: Add the new column as NULLABLE or with a DEFAULT value. Deploy the migration.
    2. **Backfill**: Run a data migration to populate existing rows.
    3. **Contract**: In a SUBSEQUENT migration, add the NOT NULL constraint. This migration is deployed AFTER the new application code is running.
  - Column renames: create new column, backfill, update app code to use new column, drop old column in a subsequent migration.
  - Column deletions: remove all references in app code first, then drop the column in a subsequent migration.
  - NEVER drop a column and update app code in the same deployment.
- **Module:** All (database)
- **Phase:** 0

**RULE INFRA-002: Health checks distinguish liveness from readiness.**

- **Scenario:** The application process is alive but the database connection pool is exhausted. Fly.io health checks pass, so traffic keeps flowing. All requests fail.
- **Risk:** Silent outage — the system appears up but is non-functional.
- **Implementation:**
  - `GET /health/live` — Returns `200` if the process is alive. Only checks that the HTTP server is responding.
  - `GET /health/ready` — Returns `200` only if ALL dependencies are healthy:
    - PostgreSQL: `SELECT 1` succeeds within 2 seconds
    - Redis: `PING` succeeds within 1 second
    - ClickHouse: `SELECT 1` succeeds within 2 seconds
  - Fly.io is configured to use `/health/ready` for routing (don't send traffic to unready instances) and `/health/live` for restart decisions (only restart truly dead processes).
  - If any dependency check in `/health/ready` fails, return `503 Service Unavailable` with the specific failing component in the response body.
- **Module:** Common (health check controller)
- **Phase:** 0

**RULE INFRA-003: Secrets are never in code, config files, or environment variable definitions committed to git.**

- **Scenario:** A developer commits a `.env` file with production database credentials.
- **Risk:** Credential exposure in git history.
- **Implementation:**
  - `.gitignore` MUST include: `.env`, `.env.*`, `*.pem`, `*.key`, and any file matching `*secret*` or `*credential*`.
  - Production secrets are managed via the hosting platform's secret manager (Fly.io Secrets). They are injected as environment variables at runtime, not stored in any file.
  - CI/CD secrets (API keys for Paddle sandbox, BoldSign sandbox, etc.) are stored as GitHub Actions Secrets, never in workflow YAML files.
  - A pre-commit hook (Husky) runs a script that scans staged files for patterns matching API keys, passwords, and connection strings. If found, the commit is blocked.
  - `.env.example` files in the repo contain placeholder values (e.g., `DATABASE_URL=postgresql://user:password@localhost:5432/pactintel`) with comments explaining each variable.
- **Module:** All (DevOps)
- **Phase:** 0

**RULE INFRA-004: Redis eviction policy handles memory pressure gracefully.**

- **Scenario:** Redis runs out of memory. Session data, rate-limit counters, and BullMQ job data compete for space.
- **Risk:** Sessions are evicted, logging users out. Or BullMQ jobs are lost. Or rate limits stop working.
- **Implementation:**
  - Use separate Redis databases (or separate Redis instances for production) for:
    - **DB 0**: Sessions (eviction: `volatile-lru` with appropriate TTLs)
    - **DB 1**: BullMQ jobs (eviction: `noeviction` — jobs must not be silently dropped)
    - **DB 2**: Rate limiting / caching (eviction: `allkeys-lru` — cache entries can be safely evicted)
  - Monitor Redis memory usage. Alert at 70% capacity. Auto-scale or archive at 85%.
  - BullMQ MUST be configured with `removeOnComplete: { age: 86400 }` (remove completed jobs after 24 hours) and `removeOnFail: { age: 604800 }` (retain failed jobs for 7 days for debugging).
- **Module:** Infrastructure
- **Phase:** 0

---

### 13.17 Clickwrap & Consent Capture

**RULE CW-001: ClickwrapAcceptance is never reattributed to a newer version.**

- **Scenario:** A customer publishes Terms of Service v1. 10,000 users accept v1. The customer publishes v2. The system silently updates all existing acceptances to point to v2.
- **Risk:** The entire legal value of the acceptance record is destroyed — it no longer proves what a specific person agreed to.
- **Implementation:**
  - `clickwrap_acceptances.clickwrap_version_id` is set once at creation and MUST NEVER be updated.
  - A database trigger (same pattern as `prevent_audit_mutation`) MUST prevent `UPDATE` on `clickwrap_acceptances`.
  - When a new `clickwrap_version` is created, existing acceptances remain linked to the OLD version. New visitors see the NEW version and create new acceptance records.
  - The clickwrap admin UI shows: "Version 1: 10,000 acceptances. Version 2: 500 acceptances (since [date])."
  - Deleting a `clickwrap_version` is a SOFT DELETE. The version record persists with `deleted_at` set. Acceptance records still reference it. The clickwrap widget stops showing it to new visitors, but existing acceptances are unaffected.
- **Module:** Clickwrap (Phase 2)
- **Phase:** 2

---

### 13.18 Risk Scoring & Identity Verification

**RULE RISK-001: Third-party risk-scoring service outage fails to conservative, not open.**

- **Scenario:** The risk-scoring vendor (Section 5.20) is unreachable. PactIntel needs to decide what verification method to apply.
- **Risk:** If the system "fails open" (skips verification), fraudulent signatures are accepted. If it "fails closed" (blocks all signing), legitimate business stops.
- **Implementation:**
  - If the risk-scoring API returns an error or times out (>5 seconds):
    1. Apply the MOST CONSERVATIVE verification method configured for this org (typically `id_document` or `kba`).
    2. Log the fallback in `signature_events`: `{ event_type: 'risk_scoring_fallback', metadata: { reason: 'vendor_unreachable' } }`.
    3. If the org has no identity verification methods configured (free/starter tier), proceed with standard signing (no verification). The fallback ONLY applies when risk-adaptive verification is enabled.
  - NEVER: skip verification entirely when the vendor is unreachable. NEVER: hard-block all signing for the entire org.
  - Circuit breaker: if the risk-scoring vendor fails 5 times in 10 minutes, open the circuit breaker for 30 minutes. During this time, all requests use the conservative fallback without even attempting the vendor call.
- **Module:** Signing (Phase 3)
- **Phase:** 3

---

### 13.19 Portfolio Intelligence & Obligation Management

**RULE PORT-001: Obligation record updates from amendments require manual review.**

- **Scenario:** A contract is amended. The AI re-extracts the renewal date and automatically updates the `ObligationRecord`. The new extraction is wrong — it misread a clause.
- **Risk:** A customer misses a renewal deadline because the AI auto-updated the date incorrectly.
- **Implementation:**
  - When a document is amended (new version created):
    1. AI extraction runs on the new version.
    2. If the extracted fields differ from the existing `ObligationRecords`, the system creates PENDING obligation updates — NOT auto-applied changes.
    3. The document owner receives a notification: "AI detected changes to obligation dates in [Document Name]. Please review and confirm."
    4. The obligation management UI shows a side-by-side diff: "Current: Renewal date Jan 15, 2027. AI Detected: Renewal date Feb 15, 2027. [Confirm] [Dismiss]"
  - Auto-update is NEVER applied to obligation records. Every change requires explicit human confirmation.
  - The AI extraction confidence score is displayed alongside each detected change to help the reviewer prioritize.
- **Module:** AI, Portfolio Intelligence (Phase 3)
- **Phase:** 3

---

### 13.20 Security Monitoring & Alerts

**RULE SEC-001: Security alerts have defined severity levels and escalation.**

- **Scenario:** The account-level security monitoring (Section 5.21) detects a suspicious login pattern. It fires an alert. The admin receives 50 low-signal alerts per day and starts ignoring them.
- **Risk:** A real attack is buried in noise and goes unnoticed.
- **Implementation:**
  - Alert severity levels:
    - **Critical**: Confirmed credential compromise, multiple failed auth attempts followed by a success from a new IP, unauthorized API key usage. → Immediately notify admin via email + SMS + in-app. Auto-lock the affected session/API key. Require MFA re-verification.
    - **High**: Login from a new country, bulk document export, unusual sending volume (>10x normal). → Email + in-app notification within 5 minutes. Suggest (don't force) session review.
    - **Medium**: Login from a new device, API key used from a new IP. → In-app notification only. Show in security dashboard.
    - **Low**: Minor anomalies (slightly elevated request rate, unusual browsing pattern). → Log only. Show in security dashboard, no notification.
  - Alert deduplication: same alert type + same actor within 1 hour = 1 notification (with count).
  - Admin can configure per-severity notification preferences (except Critical, which always notifies).
  - Weekly security summary email for admins: "This week: 2 High alerts, 5 Medium alerts, 12 Low alerts. [View details]"
- **Module:** Security Monitoring (Phase 4)
- **Phase:** 4

---

### 13.21 Error Handling & User-Facing Errors

**RULE ERR-001: Never expose stack traces, database errors, or internal IDs to end users.**

- **Scenario:** A database query fails. The 500 error response includes the SQL query and table names.
- **Risk:** Information disclosure — attacker learns the database schema.
- **Implementation:**
  - The NestJS global exception filter MUST catch ALL unhandled exceptions and return a generic error response:
    ```json
    {
      "error": {
        "code": "INTERNAL_ERROR",
        "message": "An unexpected error occurred. Please try again or contact support.",
        "request_id": "req_abc123"
      }
    }
    ```
  - The actual exception (with stack trace, SQL, etc.) is logged to Sentry and Grafana Loki with the `request_id` for correlation.
  - In development mode (`NODE_ENV=development`), the full error details are included in the response for debugging.
  - In production mode (`NODE_ENV=production`), ONLY the generic message and `request_id` are returned.
  - Prisma errors (e.g., unique constraint violations) are caught and translated to user-friendly messages by the exception filter: "A record with this email already exists" (not "Unique constraint failed on the fields: (`email`)").
- **Module:** Common (global exception filter)
- **Phase:** 0

**RULE ERR-002: All external API calls have timeouts and circuit breakers.**

- **Scenario:** BoldSign's API becomes unresponsive. Every signing request hangs for 30 seconds, backing up the request queue.
- **Risk:** Cascading failure — the entire application becomes unresponsive because all request handler threads are blocked waiting for BoldSign.
- **Implementation:**
  - Every external HTTP client (BoldSign, Paddle, WorkOS, LLM APIs, CRM APIs) MUST have:
    - **Request timeout**: 10 seconds (configurable per service).
    - **Connection timeout**: 5 seconds.
    - **Circuit breaker**: After 5 consecutive failures in 60 seconds, open the circuit for 30 seconds. During this time, calls to that service immediately return a fallback error without attempting the call.
    - **Retry**: 2 retries with exponential backoff (1s, 3s) for idempotent operations only (GET requests, webhook verification). NON-idempotent operations (POST to create a charge) MUST NOT be retried automatically.
  - The circuit breaker state is tracked in Redis and shared across all application instances.
  - When a circuit breaker opens, an alert is sent to the ops channel: "BoldSign API circuit breaker opened. Signing requests are failing."
- **Module:** Common (HTTP client wrapper)
- **Phase:** 0

---

### 13.22 Object Storage & File Upload Safety

**RULE STORE-001: File uploads are validated and sanitized.**

- **Scenario:** A user uploads a "PDF" that is actually an executable file, a zip bomb, or a file with a double extension (.pdf.exe).
- **Risk:** Malware distribution via document attachments, server resource exhaustion.
- **Implementation:**
  - File upload validation:
    1. **Extension whitelist**: `.pdf`, `.docx`, `.doc`, `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`, `.mp4`, `.webm`. Reject all others.
    2. **MIME type verification**: Check the file's magic bytes (not just the `Content-Type` header, which can be spoofed). Use a library like `file-type`.
    3. **Size limits**: Images: 10MB. Videos: 100MB. Documents: 50MB. Total per document: 500MB.
    4. **SVG sanitization**: SVGs can contain embedded JavaScript. All uploaded SVGs MUST be sanitized using `DOMPurify` or equivalent to strip `<script>` tags, event handlers (`onload`, `onclick`), and external resource references.
    5. **Filename sanitization**: Strip path separators (`/`, `\`), null bytes, and double extensions. Rename to `{uuid}.{original_extension}`.
  - Files are uploaded directly to S3 via presigned URLs (never through the application server). The presigned URL has a 15-minute expiry and a `Content-Length` condition matching the declared file size.
  - A post-upload background job verifies the file meets all validation criteria. If it fails validation, the file is quarantined (moved to a separate bucket) and the user is notified.
- **Module:** Document (file upload service)
- **Phase:** 0

**RULE STORE-002: Signed document PDFs are stored immutably.**

- **Scenario:** An admin accidentally (or maliciously) deletes the signed PDF from S3.
- **Risk:** The legal evidence of the signed agreement is destroyed.
- **Implementation:**
  - Signed PDFs are stored in a dedicated S3 bucket with:
    - **Object Lock** (WORM — Write Once Read Many): enabled in `COMPLIANCE` mode. Objects cannot be deleted or overwritten until the retention period expires.
    - **Retention period**: 7 years (default for legal documents; configurable per org for regulatory requirements).
    - **Versioning**: enabled as an additional safeguard.
  - The bucket policy denies `s3:DeleteObject` and `s3:PutObject` (overwrite) for all IAM principals except a dedicated "archive management" role that requires MFA.
  - Cross-region replication to a backup region for disaster recovery.
- **Module:** Document, Infrastructure
- **Phase:** 0

---

### 13.23 Paddle-Specific Edge Cases

**RULE PAD-001: Handle Paddle webhook event ordering correctly.**

- **Scenario:** Paddle sends `subscription.updated` before `subscription.created` (out of order).
- **Risk:** The `subscription.updated` handler tries to update a record that doesn't exist yet.
- **Implementation:**
  - Use the `occurred_at` timestamp in the Paddle event metadata (not arrival time) to determine event order.
  - If a `subscription.updated` event arrives and no matching `subscriptions` record exists, the handler MUST:
    1. Store the event in `billing_events` with `processed = false`.
    2. Queue a delayed job (30 seconds) to re-process the event.
    3. On re-processing, if the subscription still doesn't exist, create it from the event payload (treat it as a combined create+update).
  - The idempotency check (`billing_events.paddle_event_id UNIQUE`) prevents double-processing even if events arrive multiple times.
- **Module:** Billing
- **Phase:** 0

**RULE PAD-002: Subscription cancellation downgrades gracefully.**

- **Scenario:** A customer cancels their Professional plan. They have 50 documents in draft, 20 templates, and 8 team members.
- **Risk:** If we immediately enforce Free tier limits (1 seat, 5 docs/month), 7 users are locked out and the customer can't access their own documents.
- **Implementation:**
  - On `subscription.cancelled` webhook:
    1. Set `subscriptions.plan_tier = 'free'` and `subscriptions.status = 'cancelled'`.
    2. Set `full_seat_limit = 1` and `collab_seat_limit = 0`.
    3. DO NOT deactivate any users immediately. Instead, set a 30-day grace period: `subscription.grace_period_end = NOW() + 30 days`.
    4. During the grace period: all existing data is accessible (read-only for features above Free tier), but no new documents can be sent (Free tier limit applies).
    5. After the grace period: additional users are deactivated (starting with the most recently added), preserving only the Owner. Deactivated users' documents remain in the system, attributed to them, but accessible only to the remaining active users.
    6. Email the Owner 7 days before the grace period ends: "Your PactIntel account will be downgraded in 7 days. [Reactivate your plan]."
  - NEVER hard-delete any user data on cancellation. Soft-delete only, with full data retained for potential reactivation.
- **Module:** Billing, Organization
- **Phase:** 0

---

### 13.24 BoldSign-Specific Edge Cases

**RULE BOLD-001: BoldSign outage doesn't prevent document viewing.**

- **Scenario:** BoldSign's API is down. A signer clicks the signing link in their email.
- **Risk:** If the recipient page requires a BoldSign API call to render, the signer sees an error page instead of the document.
- **Implementation:**
  - The document viewing page renders ENTIRELY from PactIntel's database (`document_versions.content_snapshot`). BoldSign is only needed for the actual signing action.
  - If BoldSign is unreachable when the signer clicks "Sign":
    1. Show a user-friendly message: "The signing service is temporarily unavailable. Your document is safe. Please try again in a few minutes."
    2. Queue a retry in 2 minutes and send the signer a notification when signing is available again.
    3. Do NOT change the document status or signer status.
  - The circuit breaker pattern (ERR-002) applies to BoldSign API calls.
- **Module:** Signing
- **Phase:** 0

**RULE BOLD-002: BoldSign webhook failures don't lose signing events.**

- **Scenario:** BoldSign sends a `Signed` webhook. PactIntel's server is restarting and doesn't respond. BoldSign retries, but PactIntel's handler has a bug and crashes on the specific payload.
- **Risk:** The signer's signature is recorded in BoldSign but not in PactIntel. The document status never updates.
- **Implementation:**
  - A reconciliation cron job runs every 15 minutes:
    1. Query all `signature_requests` with `status = 'in_progress'` older than 1 hour.
    2. For each, call BoldSign's API to get the current status.
    3. If BoldSign reports it as completed but PactIntel doesn't, process the completion:
       a. Create the missing `signature_events` rows.
       b. Update the signer status.
       c. Lock the document version.
       d. Log the reconciliation in `audit_log_entries`: "Signature completion detected via reconciliation, not webhook."
  - This is defense in depth against webhook delivery failures. The webhook is the primary path; the reconciliation job is the backup.
- **Module:** Signing
- **Phase:** 0

---

## 14. Change Log

| Version | Date       | Author           | Changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------- | ---------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.0.0   | 2026-09-16 | System Architect | Initial blueprint                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 1.1.0   | 2026-09-16 | System Architect | Added Section 13: Comprehensive edge cases & mandatory implementation rules (100+ rules across 24 domains)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2.0.0   | 2026-10-08 | System Architect | **Google Cloud migration and "Build Once, Scale Forever" revision.** Authoritative changes: (1) Cloud platform changed from AWS/Fly.io to **Google Cloud (GCP) only** throughout all sections. All AWS service references replaced with GCP equivalents per the translation table in Addendum A. (2) Added §0 Architecture Invariants & Scale Model with cell architecture, invariants I-01–I-15, design envelope, and the No-Migration Principle. (3) §1 rewritten: modular-monolith codebase, multi-process runtime, cell-based deployment — "single Node.js process" and "extraction when scale demands" language removed. (4) §2.1 tech stack table fully rewritten for GCP (Cloud Run, Cloud SQL, Memorystore, Cloud Storage, Cloud KMS, Secret Manager, Pub/Sub, Artifact Registry, Cloud Armor, External ALB, Workload Identity Federation). §2.3 added: every migration scheduled in v1.1.0 is documented as eliminated. (5) §3.4 RLS predicate fixed (X-01: index-friendly, no cast). (6) §5.1 HIPAA compliance updated for Google Cloud BAA. §5.3 key hierarchy rewritten for Cloud KMS, multi-region keys, TK-based crypto-shredding, no per-org CMK by default. §5.4 secrets management updated to Secret Manager; WAF/SSRF/supply-chain controls added. (7) §8 Infrastructure completely rewritten: Fly.io and AWS removed; GCP project/folder layout; Cloud Run process-type catalog; GCP-native CI/CD (Workload Identity Federation, Artifact Registry); updated docker-compose (MinIO replaced; Redis role-split; Mailpit added); Cloud SQL native backup; IaC structure; runbook index. (8) ToC expanded with §15–§20 and appendices (content to be authored in subsequent passes per the revision brief). (9) `AGENTS.md` and `GEMINI.md` fully rewritten for GCP with invariants, forbidden patterns, and required workflow. Defect register: X-01 (RLS cast), X-24 (PostgreSQL TDE), X-46 (Fly.io artifacts), X-55 (minio/minio) addressed in this version. |

---

## Appendix A: Ambiguities & Flags in the Product Spec

> [!WARNING]
> The following items in the product blueprint are genuinely ambiguous or conflict with the payment constraints. They are documented here rather than silently resolved.

### A.1 Payment-Related Ambiguities

1. **Section 5.6 "Support for additional gateways beyond the primary rail for buyers who need a specific processor"**: Under BYOK, the "primary rail" concept changes. Each customer IS their own primary rail. The "additional gateways" feature translates to: a single organization can configure multiple `payment_provider_connections` (e.g., Stripe for US clients, Razorpay for India). This is supported by the schema.

2. **Section 5.6 "Recurring/subscription billing with configurable frequency, duration, and optional trial period"**: Under BYOK API Integration, this requires PactIntel to create recurring charges on the customer's processor. This is supported for Stripe (Subscription API) and PayPal (Billing Plans). The `recurring_config` JSONB on the `payments` table stores frequency/duration/trial configuration. However, under Payment Link tier, recurring payments are the customer's responsibility to configure in their own processor dashboard.

3. **Section 6 `ConnectedAccount` entity**: This entity assumed Stripe Connect. Replaced with `payment_provider_connections` (BYOK model). The entity name and schema are different, but the functional purpose is preserved.

### A.2 Non-Payment Ambiguities

4. **Section 5.16 Mobile Apps — "Create, edit, send, track, and e-sign from iOS/Android"**: Full document editing on mobile is extremely complex with a Tiptap/ProseMirror editor. Phase 3 mobile apps will support create-from-template (fill in variables), track, sign, and push notifications. Full editing is deferred to Phase 4 or later, pending a mobile-optimized editor component.

5. **Section 5.10 "A free, no-login URL-to-draft tool"**: This is a marketing tool (paste a company URL → get a draft). It's not gated by authentication or billing. It will be built as a standalone Next.js page that calls the AI module. Deferred to Phase 3 when the AI pipeline is mature.

6. **Section 3 "A person can be a Manager in Workspace A and a plain Member in Workspace B; only Owner is account-wide"**: Confirmed and implemented via `workspace_memberships.role` being per-workspace, while `users.is_owner` is account-wide. The `user.role` in session context refers to the role in the **active workspace**.

7. **Section 9 "Decide whether a user in multiple Workspaces consumes one seat per Workspace or one account-wide"**: Decision: **account-wide**. A user counts as one seat regardless of how many workspaces they belong to, unless workspaces are sold as fully separate sub-accounts (Enterprise tier only, Phase 4).
