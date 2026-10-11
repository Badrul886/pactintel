# ARCHITECTURE REVISION BRIEF — "Build Once, Scale Forever"

| | |
|---|---|
| **Target document** | `docs/MASTER_IMPLEMENTATION_BLUEPRINT.md` — revise v1.1.0 → **v2.0.0** |
| **Executor** | Google Antigravity (agent) working in the `pactintel2` repository |
| **Brief date** | 2026-10-04 |
| **Launch message** | Save this file as `docs/ARCHITECTURE_REVISION_BRIEF.md`, then tell the agent: *"Read docs/ARCHITECTURE_REVISION_BRIEF.md completely and execute it phase by phase. Do not skip or summarize any item. Report after each phase."* |

---

# PART A — MISSION, CONSTRAINTS, RULES, PROCESS

## A1. Mission

You are a principal cloud/SaaS architect and technical writer. Revise the PactIntel Master Implementation Blueprint so the product is built **once**, on its permanent architecture, and **never needs a migration, re-platforming, re-keying, or public-contract change** as it grows from its first customer to a very large global customer base. Small and very large customers run on the same architecture.

Blueprint v1.1.0 was written as "start small, migrate later". It explicitly schedules, or implicitly requires, the migrations below. Find and eliminate every one of them, plus any others you discover.

**Explicit migrations in v1.1.0**
- Fly.io (Phases 0–2) → AWS ECS/EKS (Phase 3+) [§8.1]; "Fly Postgres, backed by Supabase" [§8.1] (also factually wrong).
- PostgreSQL full-text search → Meilisearch [§2.1, §12 Phase 3].
- Raw JSONB document content → Yjs-compatible format [§12 Phase 2].
- "Extract modules into independent services when scale demands" [§1, §1.3].
- Fly-specific deploy, secrets, health-check and preview-environment mechanics [§5.4, §8.2, §8.3, §10.5, INFRA-002, INFRA-003].

**Implicit migrations hidden in v1.1.0**
- One Postgres + one ClickHouse + one bucket set vs. promised US/EU data residency [§3, GDPR-002] → later splitting one database into regional databases.
- One KMS key per organization [§5.3] → key-count quota/cost → re-keying.
- Paddle columns baked into core tables, BoldSign-only signing, Resend-only email, WorkOS-shaped user table → vendor-exit migrations.
- Mutable "current/signed" flags on supposedly immutable versions; unhashed pricing/form state → forced data fixes on legally sealed records.
- UUIDv4 primary keys, unpartitioned append-only tables, offset pagination, in-process event bus, in-process cron → table rewrites and breaking API changes at scale.
- Recipient links on the app's own domain/path with only per-org-unique slugs → permanent links that cannot be re-pointed once emailed.
- English-only UI then i18n retrofit; cookie-only auth then mobile/OAuth/MCP retrofit; Phase-3 mobile and Phase-4 HIPAA each forcing new infrastructure.

## A2. Owner constraints (apply to every decision)

- **Solo developer.** Low operational overhead is a hard requirement. Prefer fully managed AWS services. No component that needs manual patching. Everything automated, alarmed and runbooked.
- **Cost-aware, pre-revenue.** The AWS account is new (free-tier credits expire). Build structure first, capacity later (see A3). State the cost impact of each structural decision.
- **No Stripe.** Paddle (merchant of record) for platform billing + BYOK for end-user payments. Unchanged.
- **Local-first development.** AWS is used only when needed, but the local environment must mirror production *structure* through ports/adapters.
- **Product scope unchanged** (`docs/PRODUCT_BLUEPRINT.md`).
- **Hosting is AWS only.** No Fly.io. No Supabase. No Upstash. No Kubernetes/EKS.

## A3. Definitions — migration vs. scaling

**Migration (forbidden by design)** — any future change that requires one or more of:
- moving data between data stores, engines, accounts or regions (other than the controlled tenant-relocation tool in §17);
- re-platforming compute, networking or the orchestrator;
- re-keying or re-encrypting existing data;
- rewriting application code that other modules or consumers depend on;
- changing an identifier, token format, URL scheme, hostname, API/webhook/event contract that customers, recipients or integrations already hold.

**Scaling (allowed)** — raising a capacity setting inside the same service (instance class, task count, replicas, partitions, ACU limits, node types); switching on a pre-designed capacity switch; adding a read replica; adding a new cell from the same IaC modules; adding an adapter behind an existing port.

> **Golden rule: defer capacity, never defer structure.**
>
> **Structure — must be final on Day 1:** AWS organization/account layout; network and CIDR plan; cell + control-plane topology and routing; ID formats; public URL/domain contract; schema shape (partitioning, tenancy columns, sealed-content model, content versioning); key hierarchy; ports/adapters; outbox/event contracts; process-type separation; IaC; data manifest; API/webhook/OAuth contracts; i18n/a11y foundations.
>
> **Capacity — may be switched on later by configuration:** extra AZs of compute, reader replicas, larger instance classes, more tasks/workers, a second and later cells, a standing DR region, dedicated cells, larger ClickHouse tier, extra Redis instances for split roles.

## A4. Working rules (W-01 … W-12)

- **W-01 Edit in place, by targeted patches.** Never regenerate the whole file. Never condense or drop valid content, rules, tables or rule IDs. Existing section numbers 1–14 and all rule IDs stay stable. Add new material as new sections/subsections (§0, §15–§19, Appendices B–E) so cross-references stay valid. Update the ToC and every cross-reference.
- **W-02 Mark every changed or superseded rule** `(Revised v2.0.0 — <one-line why>)`. Never delete a rule ID; a superseded rule points to its replacement.
- **W-03 No invention.** Verify every vendor fact (API names, headers, quotas, prices, regions, versions, limits, compliance claims) against official documentation. Record source URL + date in Appendix C. If you cannot verify, write `[VERIFY: what, where]` and list it in `docs/revision/OPEN_VERIFICATIONS.md`. Never fabricate headers, flags, parameters, quotas or SLAs.
- **W-04 Documentation task only.** Edit docs, ADRs, `AGENTS.md`, `GEMINI.md`. Do not write application code or IaC. Illustrative DDL/config/pseudocode inside the blueprint is expected.
- **W-05 Product scope is unchanged.** Do not edit `docs/PRODUCT_BLUEPRINT.md`; record deviations in §2.2.
- **W-06 Resolve every conflict explicitly.** Pick one answer, apply it everywhere, log it in the Defect Register (Appendix D).
- **W-07 Every decision states:** decision · rationale · consequences · scale lever (how it grows by configuration) · exit path (how a vendor/component could be replaced without data migration). Long reasoning goes in an ADR under `docs/adr/`; a summary goes in the blueprint.
- **W-08 Implementer test.** After your edits, an engineer or AI agent must be able to implement every phase without making an architecture decision. If they would still have to decide, you are not finished.
- **W-09 Owner-dependent items** (business, legal, budget): do not stall. State a default, proceed, and add the item to `docs/revision/QUESTIONS_FOR_OWNER.md`.
- **W-10 Lean Phase-0 footprint.** Structure now, capacity later. Report the projected monthly AWS cost of the Phase-0 launch configuration and of each capacity switch. If the Phase-0 AWS bill exceeds ~US$350/month, propose reductions that violate no invariant.
- **W-11 Small passes.** After each pass, re-read the edited region; check numbering, anchors, table rendering; append to `docs/revision/PROGRESS_LOG.md`. If the repo uses git, commit per pass (`docs(blueprint): <pass>`).
- **W-12 Keep the existing style:** GitHub-flavored Markdown, `> [!IMPORTANT]` / `> [!CAUTION]` callouts, SQL in fenced blocks, tables for matrices, and the rule format *Scenario / Risk / Implementation / Module / Phase / Test*.

## A5. Process and deliverables

| Phase | Work | Output |
|---|---|---|
| **1 Inventory** | Read both docs completely. List every blueprint statement touching hosting, scale, region, vendor, keys, schema permanence, public contracts, or "later / Phase N+" deferral. Map each to a brief item (D-xx, X-xx, S-xx). | `docs/revision/INVENTORY.md` |
| **2 Verify & decide** | Complete the verification list (B7). Write one ADR per decision D-01…D-24 plus any extra (status *Accepted*, sources, verified-on date). | `docs/adr/ADR-00NN-*.md`, `docs/revision/OPEN_VERIFICATIONS.md` |
| **3 Edit** | Apply B3–B5. Order: §0 → new §15–§19 → §1 → §2 → §3 → §4 → §5 → §6 → §7 → §8 → §9 → §10 → §11 → §12 → §13 → §14 → appendices. | `docs/MASTER_IMPLEMENTATION_BLUEPRINT.md` v2.0.0 |
| **4 Consistency sweep** | Global greps (B8), cross-reference check, ToC, rule-ID uniqueness, phase tags, DDL-vs-table consistency, glossary. | `docs/revision/PROGRESS_LOG.md` |
| **5 Audit** | Run the B8 checklist. Fix failures. Re-audit until all pass. | `docs/revision/AUDIT_REPORT.md` (pass/fail per item with section references) |
| **6 Companion docs** | Part C. | updated cost analysis, `AGENTS.md`, `GEMINI.md` |

Also produce `docs/revision/CHANGE_REPORT.md` (every section changed, every rule revised/added, every migration eliminated) and `docs/revision/QUESTIONS_FOR_OWNER.md`.

---

# PART B — REQUIREMENTS

## B1. Design envelope

Assumptions to validate by Phase-0 load test. Change a number only with written justification in §0.

| Dimension | Per pooled cell | Platform |
|---|---|---|
| Organizations | 5,000 | 250,000+ by adding cells |
| Users | 100,000 | 5,000,000+ |
| Documents / versions | 50 M / 150 M | linear in cells |
| Signature events per month | 20 M | linear |
| Recipient page peak | 5,000 req/s | linear |
| API sustained | 1,000 req/s | linear |
| Concurrent WebSockets | 5,000 collaboration + 20,000 notification | linear |
| Background jobs per day | 5 M | linear |
| Analytics events per year | 5 B | linear |
| Jurisdictions | US and EU designed in from Day 1; extensible (UK, CA, AU, IN, ME…) by adding cells only | — |

A **dedicated cell** (enterprise / regulated / HIPAA) uses the identical architecture, sized per contract.

## B2. Architecture invariants (put in new §0 and in `AGENTS.md` / `GEMINI.md`)

- **I-01 Defer capacity, never structure** (A3).
- **I-02 One cell = one failure and data domain.** No cross-cell database access, joins or foreign keys. Cells exchange only signed events via the control plane.
- **I-03 Every tenant-owned datum lives in exactly one cell** (its home cell, in its jurisdiction). The tenant directory is the only global tenant metadata.
- **I-04 Everything is infrastructure-as-code.** No console-created resources. Any cell can be recreated from code plus data.
- **I-05 Every external dependency sits behind a port** with at least one tested adapter. Provider-specific IDs live in mapping tables. Legal evidence and artifacts are duplicated into our own storage.
- **I-06 Every side-effect goes through the transactional outbox**; consumers are idempotent.
- **I-07 Process types are separated from Day 1.** No in-process cron. No in-memory-only state.
- **I-08 Identifiers, public URLs, token formats, hostnames, API/webhook/event contracts are permanent and versioned.**
- **I-09 Sealed (signed) content is never migrated.** Only read-time upcasting. Canonical bytes are stored.
- **I-10 Every datastore, table, bucket prefix, ClickHouse table, Redis keyspace, index and vector collection is registered in the data manifest;** CI enforces RLS, retention, erasure, export and residency.
- **I-11 Key hierarchy is fixed.** Multi-Region keys wherever ciphertext replicates across regions. No per-tenant CMK by default.
- **I-12 Non-critical dependencies degrade gracefully.** Readiness reflects only critical dependencies.
- **I-13 Noisy-neighbor controls** (per-tenant quotas, fair queues) exist from Day 1.
- **I-14 Everything is region-aware:** telemetry, email, AI, analytics, backups, replication all stay in-jurisdiction.
- **I-15 Every scale trigger maps to a documented lever, and every lever is a configuration change.**

## B3. Locked decisions (D-01 … D-24)

These are decisions, not options. Implement them. Each needs an ADR with verified sources. Where a decision says **[VERIFY]**, confirm against official docs first; if a verified blocker exists, record it in the ADR, choose the nearest alternative that still satisfies every invariant, and log it in `OPEN_VERIFICATIONS.md`.

### D-01 Compute — ECS on Fargate, defined in IaC
- All services run on **Amazon ECS with Fargate**. Prefer ARM64 (Graviton) where every image is verified to run (**[VERIFY]** Playwright/Chromium on linux-arm64).
- Every ECS resource is defined in IaC from the first deploy. **Do not use console wizards or ECS Express Mode as a permanent mechanism.** If Express Mode is used to bootstrap, the resources must be imported into IaC before Phase 0a exits.
- Later cost levers stay in-family: EC2 capacity providers / ECS Managed Instances (**[VERIFY]**) without changing service definitions or the orchestrator.
- **Explicitly out of scope:** EKS, Kubernetes, Fly.io, App Runner (closed to new customers 2026-04-30). Lambda only for peripheral glue (e.g., S3 event shims), never on the core request path.
- Autoscaling policy per service with defined signals (table in §16).

### D-02 Cell architecture — control plane + data plane
- **Cell** = an independent regional deployment of the data plane: own VPC, ECS services, Aurora cluster, Redis instances, S3 buckets, KMS keys, search/vector, ClickHouse service/database, telemetry routing. Short code: `us1`, `eu1`, `ded-<customer>`.
- **Control plane** = a small global stack: (a) **tenant directory** (org id, org slug, home cell, jurisdiction, status, custom hostnames, placement flags); (b) **billing authority** (provider webhooks, plan/entitlement catalog, subscription state) with entitlement projections pushed to cells; (c) **global webhook ingress/router** (Paddle, BoldSign, WorkOS, payment-processor, CRM, email events) → verify → route to the right cell; (d) **login router** (WorkOS org → cell); (e) cell registry + provisioning automation; (f) feature-flag/config source. It holds **no document content** and only minimal personal data. Which routing metadata may live outside the EU is a legal question → `QUESTIONS_FOR_OWNER.md`.
- **Edge routing:** Cloudflare (Workers + KV or equivalent) resolves host/path → cell origin. Primary routing is **lookup-free**: the cell code is embedded in hostnames (`<cell>.app…`, `<cell>.api…`), API-key prefixes (`pk_live_<cell>_…`), public document URLs and collab URLs. Directory lookups are needed only for custom hostnames and login.
- **Rules:** no cross-cell DB queries; every cell runs identical code and IaC modules; cells differ only by configuration (sizing, jurisdiction, subprocessor allowlist, feature flags).
- **Placement:** new orgs go to the open pooled cell of the chosen jurisdiction. When any envelope dimension or SLO burn reaches 70% (B1), the cell closes to new tenants and IaC provisions the next. Large or regulated customers are placed in dedicated cells.
- **Phase-0 footprint:** one pooled cell (`us1`) + minimal control plane. Directory, routing and cell-code conventions exist from Day 1. A second cell is created as a throwaway dry-run in the Phase-0 Definition of Done (apply → smoke test → destroy), and permanently for the EU in Phase 2.
- **Tenant relocation** between cells is the only data-moving operation. Specify it as a runbook/tool (§17), never as a scaling mechanism. All primary keys are globally unique so relocation never re-keys.
- **Control-plane resilience:** the directory read path must survive a control-plane regional outage for already-routed tenants (edge replica/cache). Document RTO/RPO.

### D-03 AWS organization and accounts
- AWS Organizations with: a **management account** (billing only, root MFA, no workloads); **security/log-archive** account (CloudTrail/Config/audit exports in Object-Lock buckets); **shared-services** account (IaC state, ECR or cross-account ECR policy, CI roles); `dev`, `staging`; one **prod account per jurisdiction** at minimum; the control plane in its own account; dedicated cells in their own accounts when a contract/regulation requires.
- Human access through **IAM Identity Center** only (no IAM users). CI via **GitHub OIDC** roles per account. Break-glass role with alerting.
- **SCPs:** deny regions outside the allowlist; deny disabling CloudTrail/GuardDuty/Config; deny public S3; require encryption; deny leaving the organization.
- **[VERIFY]** how free-tier credits apply across member accounts; state the credit strategy.
- This is structural: moving resources across accounts later is a migration.

### D-04 Network, egress and edge protection
- Per-cell VPC, non-overlapping CIDRs from an **IPAM plan** that reserves ranges for future cells, peering/Transit Gateway and on-prem. `/16` per cell.
- 3 AZs × (public, private-app, private-data, isolated) subnets, sized for Fargate ENI growth (IP exhaustion cannot be fixed cheaply later). Compute may start in 2 AZs; subnets exist in 3.
- **NAT per AZ with static Elastic IPs; publish these as the platform's egress IPs** (customers allowlist them for webhooks and CRM callbacks; changing them later breaks customers).
- VPC endpoints decision (S3 gateway, ECR, Logs, Secrets Manager, KMS, STS) with cost analysis.
- **Origin lockdown:** the ALB accepts traffic only from Cloudflare (managed prefix list and/or authenticated origin pulls and/or secret header). AWS WAF on the ALB: decide and document.
- **Isolated PDF-worker subnet:** egress allowlist only; block link-local, metadata, VPC and RFC1918 ranges; no instance-metadata access (SSRF containment).
- **Dedicated egress path for customer-supplied URLs** (outbound webhooks): SSRF-safe resolver/proxy, blocks internal ranges, fixed egress IPs.
- Public DNS authoritative at Cloudflare; private hosted zones inside VPCs.

### D-05 PostgreSQL — Aurora PostgreSQL-Compatible
- Engine: **Aurora PostgreSQL 17.x** (verified 2026-10: PG 17 supported, 17.9 minor, pgvector 0.8.0 in 17.x; Serverless v2 scale-to-zero available). **[VERIFY]** extensions: pgvector HNSW/iterative scan, pg_trgm, pg_partman, pg_cron, pgaudit, pg_stat_statements; and Serverless v2 scale-to-zero ↔ RDS Proxy compatibility. Fall back to RDS PostgreSQL Multi-AZ **only** on a verified blocker, with a documented ceiling and ADR.
- **Topology per cell:** writer + at least one reader in another AZ before the first paying customer. Separate `DATABASE_WRITER_URL` / `DATABASE_READER_URL` config from Day 1 (both may point at one endpoint in staging). Read-your-writes rules for signing/payment flows; replication-lag-aware routing. Serverless v2 for non-prod (scale-to-zero) and early prod; provisioned for large cells.
- **Pooling layer is mandatory** (RDS Proxy or PgBouncer), validated with Prisma + transaction-scoped RLS context; connection-storm test at maximum task count.
- **Roles:** `app_runtime` (not owner, no BYPASSRLS), `app_migrator`, `app_vault` (credential tables only), `app_readonly`, `break_glass`. `FORCE ROW LEVEL SECURITY` on tenant tables.
- **Tenant context** is transaction-scoped: `set_config('app.current_tenant', …, true)` in the **same transaction/connection** as the queries. RLS predicate: `organization_id = (SELECT current_setting('app.current_tenant', true)::uuid)` (index-friendly, evaluated once). A test must prove context and query share a connection under the pooler.
- **IDs:** UUIDv7 for all internal primary keys (app-generated or DB function; **[VERIFY]** Prisma `uuid(7)`). Public/unguessable identifiers are **separate** CSPRNG tokens ≥128 bits, stored hashed wherever they grant access.
- **Partitioning from Day 1** (range by time; hash sub-partition where write-hot; PK includes the partition key; automated creation and retention): `signature_events`, `audit_log_entries`, `payment_credential_audit_logs`, `webhook_deliveries`, `inbound_webhook_events`, `outbox_events`, `document_status_events`, `usage_ledger`, `email_events`, `clickwrap_acceptances`, and any table the capacity model says will exceed ~100 M rows per cell per year. Old partitions archive to S3 (Parquet). Immutability triggers must work on partitions.
- **Large content tiering:** sealed version bodies are stored as canonical bytes in the S3 evidence class with hash + pointer in Postgres; a queryable JSONB copy only if small. Draft/collab state per ADR. No multi-MB JSONB in hot tables. Set the threshold from a size model.
- **Append-only and tamper evidence:** `document_versions` strictly INSERT-only; `documents.current_version_id` pointer; per-document hash chain on `signature_events` (`prev_hash`, `row_hash`); periodic anchoring of chain heads to S3 Object Lock; `REVOKE UPDATE, DELETE, TRUNCATE` from runtime roles; pgaudit/event trigger alerts on trigger disable.
- **Migrations:** the tool must support non-transactional DDL (`CREATE INDEX CONCURRENTLY`, partition attach), batched backfills, `lock_timeout`/`statement_timeout`, expand/contract automation, and run as a one-off ECS task before deploy. **[VERIFY]** Prisma Migrate limits; ADR chooses (Prisma Migrate + raw SQL runner, Atlas, Flyway, …). Prisma stays behind repositories; a SQL/Kysely escape hatch exists for hot paths.
- **Major upgrades** via blue/green + expand/contract; runbook; extension pinning.

### D-06 Redis topology by role
- Roles → instances: **`queue`** (BullMQ; `noeviction`; cluster mode disabled or hash-tagged; durability tier per ADR: ElastiCache Multi-AZ vs MemoryDB — **[VERIFY]** BullMQ compatibility), **`session`** (TTL; `noeviction`), **`cache+ratelimit`** (`allkeys-lru`), **`realtime`** (pub/sub for collab and notifications; non-durable).
- Eviction policy is **per instance**, not per logical DB — rewrite INFRA-004. Minimum two instances in prod; no instance hosts roles with conflicting eviction needs.
- Role-based config (`REDIS_QUEUE_URL`, `REDIS_SESSION_URL`, …) from Day 1 so roles split without code changes.
- No business-critical event may rely solely on Redis durability (the Postgres outbox is the source of truth).
- Hocuspocus uses its Redis extension for multi-instance operation.

### D-07 Async and event architecture
- **Transactional outbox** (`outbox_events`) written in the same DB transaction as the state change. A relay publishes to BullMQ now; adding SNS/SQS/EventBridge/Kinesis later changes only the publish step. Consumers are idempotent (inbox/dedupe key). Event envelope: `id` (UUIDv7), `type`, `schema_version`, `cell`, `organization_id`, `occurred_at`, `trace_id`, `payload`. Schemas live in `libs/shared-types` with compatibility tests.
- `EventEmitter2` is no longer the cross-module mechanism (allowed only for non-critical in-transaction hooks).
- **Process types from Day 1** (same repo; image per type or one image with entrypoints): `web-app`, **`web-viewer`** (public recipient pages; separate scaling, WAF rules, blast radius), `api`, `worker-core` (email/webhooks/notifications), `worker-bulk`, `worker-ai`, `worker-pdf` (Chromium), `collab`, one-off `migrator`.
- **No in-process `@Cron`.** Schedules run as BullMQ job schedulers (single execution fleet-wide) or EventBridge Scheduler → one-off tasks. Per-tenant work: the scheduler enqueues shards; each shard job sets tenant context per org (MT-002).
- **Fairness (I-13):** per-tenant concurrency/rate limits for PDF, AI, webhooks, bulk send and email; bulk send is rate-limited fan-out; large tenants can be isolated on dedicated queues or cells.

### D-08 Object storage classes and evidence
- **Classes** (one bucket per cell × class; naming convention): `evidence` (signed PDFs, provider certificates, anchored hashes; **S3 Object Lock Compliance + versioning**; retention set per object at PUT per org policy; delete-deny except an MFA archive role; SSE-KMS with **bucket keys**; replication in-jurisdiction only), `uploads` (customer files via **presigned POST with content-length-range**; quarantine class), `public-media` (R2 or S3+CDN — decide in ADR; permanent boundary), `exports` and `pdf-cache` (lifecycle expiry), `collab-snapshots` (if used), `analytics-archive` (Parquet).
- Cloudflare R2 bucket locks are retention rules an admin can remove; they are **not** equivalent to S3 Compliance mode (verified). Signed evidence stays on S3.
- **Evidence rule:** the legal PDF is produced **once** at completion (or retrieved from the signing provider), hashed, archived, and never regenerated for legal use. Provider artifacts (final PDF, audit certificate) are copied into the evidence class. Table `evidence_artifacts`.
- Reconcile STORE-002 (7-year Compliance lock) with GDPR erasure, post-cancellation deletion (product spec §5.14) and crypto-shredding: define a **retention matrix per storage class**, including cost of locked data for churned tenants.
- Replication targets never leave the jurisdiction.

### D-09 Keys and secrets
- **Hierarchy:** per-cell, per-purpose KMS CMKs (`data-at-rest`, `cred-vault`, `integration-tokens`, `evidence`, `field-encryption`) → **per-tenant data key (TK)**, random 256-bit, wrapped by the cell KEK and stored in the DB (encryption context `{org_id, purpose}`) → per-record DEKs wrapped by TK. **Crypto-shredding = destroy the wrapped TK** (backups hold it until they expire — document this honestly). **No per-organization CMK by default** (cost $1/key/month verified; per-region key quota **[VERIFY]**). Enterprise customer-managed key is an optional `key_provider` value on the tenant record.
- **Multi-Region keys (MRK)** for any key whose ciphertext replicates across regions (Aurora replicas/backups, S3 CRR, DR). A single-Region key cannot be converted to MRK later. Replicas stay in-jurisdiction.
- Rotation: KMS automatic rotation + background rewrap job. Local development uses a `KeyProvider` port with a local-key adapter.
- **Secrets:** AWS Secrets Manager (and SSM Parameter Store where cheaper), injected as ECS `secrets`; rotation plan; no plaintext in task definitions or IaC state where avoidable.

### D-10 Analytics — ClickHouse Cloud
- Production tier from Day 1 in every cell/jurisdiction (**[VERIFY]** dev→prod upgrade path; if it is not in-place, dev tier is non-prod only). **[VERIFY]** regions for US and EU.
- **Ingestion:** API/viewer → durable event buffer (Kinesis/SQS or equivalent) → batcher/ClickPipes → ClickHouse. At-least-once with dedupe key (`event_id`). ClickHouse needs batched inserts; never per-event inserts from the API.
- **Privacy by design:** pseudonymous `viewer_id`; `viewer_email`/name/IP are not in the ordering key; the identity mapping lives in Postgres (or is crypto-shreddable). Erasure = delete the mapping + TTL.
- **Enforcement counters** (view limits, password attempts, session counting for ACC-001/004) live in Redis/Postgres (atomic), **never** in ClickHouse. An analytics outage must never affect viewing or signing.

### D-11 Search and vectors — final choice now, behind ports
- `SearchPort` and `VectorPort` with outbox-fed indexers from Day 1. **Default:** Postgres FTS (`tsvector`/GIN, `pg_trgm`) + pgvector on the cell's reader tier as the *permanent* baseline. An ADR with an options matrix (Postgres, Meilisearch Cloud, OpenSearch) must prove whether portfolio intelligence (§5.18) needs an external engine; if yes, choose it **now** and index from Phase 0. Adding an engine behind the port is additive; "migrate in Phase 3" is forbidden.
- **Embeddings:** pin one embedding model/provider per index (no cross-provider fallback for embeddings; different models are different vector spaces). Store `embedding_model_id` and `dimensions` per row; model upgrades = dual-write + background re-embed + config cutover, no schema change. Plan HNSW memory and per-tenant filtered search.

### D-12 Edge and the permanent public URL contract
- Cloudflare in front of everything: WAF, bot management/Turnstile on public forms, edge rate limits, Workers routing. WebSocket path for collab/notifications **[VERIFY]**.
- **Custom domains** via Cloudflare for SaaS: **[VERIFY]** custom-hostname quotas, pricing, rate limits, and the *actual* fallback behavior (ACC-003's claim that Cloudflare "falls back to the default domain" is unverified — rewrite from facts). Add a `custom_domains` table and health job.
- **Public URL contract (permanent, ADR required):** recipient-facing documents are served from a **dedicated registrable domain separate from the app domain** (isolates user-generated content from app cookies/XSS and protects the app domain's reputation). Path scheme embeds the cell code and an opaque ≥128-bit token; custom domains map host → org with the same path scheme. Tokens, paths and domains never change; only redirects may be added. Replace the per-org-unique `slug` as a public identifier.
- App/API hostnames per cell plus a global login router.

### D-13 Identity and authentication
- `AuthPort` with a WorkOS adapter. **Split identity from membership:** a person (global identity, WorkOS ID) can belong to several organizations, possibly in different cells; the per-org `users` row is a membership (`workos_user_id` is unique per org, not globally). **[VERIFY]** WorkOS multi-organization membership model.
- **Token model designed now for every client:** web = opaque cookie session in the cell's Redis; mobile/OAuth/MCP = access + refresh tokens (PKCE, scopes) — **[VERIFY]** whether WorkOS (Connect) or another component acts as the OAuth authorization server; API keys (SHA-256 or peppered HMAC for indexed lookup — never Argon2/bcrypt per request; cell code in the prefix; scopes; expiry; rotation); short-lived audience-bound **collab tokens** (never the session cookie, never in a query string logged by the load balancer); signer tokens (≥128-bit CSPRNG, stored hashed, expiring).
- Revoke-all and step-up/MFA semantics; per-cell session stores; dual-keyed rate limits (AUTH-003 retained).

### D-14 Billing abstraction
- `BillingPort` with a Paddle adapter. An **internal plan/entitlement catalog** (stable string keys, versioned) drives enforcement; provider price/product IDs live in mapping tables. Provider-specific columns leave core tables (`organizations.paddle_customer_id`, `subscriptions.paddle_*`) → `billing_accounts` / `billing_provider_refs`. A `manual` provider supports enterprise invoicing outside Paddle. List alternative merchants-of-record in the ADR as the exit path.
- Provider webhooks land in the **control plane** (verify → idempotency by event id and `occurred_at` ordering → state) and publish signed entitlement events to the cell. Cells cache entitlements.
- Seat and usage metering inside the cell via the outbox + a `usage_ledger` (partitioned); atomic conditional updates, not read-modify-write; provider quantity sync is asynchronous with a reconciliation job. No hot-row counters at scale.
- **[VERIFY]** Paddle seat-quantity API limits, webhook retry/ordering semantics, and seller-eligibility for the owner's country (business risk → `QUESTIONS_FOR_OWNER.md`).

### D-15 E-signature provider independence and evidence
- `SigningProviderPort` with a BoldSign adapter. `signature_requests.provider` column; provider IDs in mapping columns; multiple providers can coexist per org/document (coexistence ≠ migration).
- **Decide and document the full sequence** (sequence diagram): interactive buyer state (pricing selections, form answers, variable merges, Smart Content branch) → **seal** (canonical content + pricing/form snapshot + hash) → final PDF generation → provider envelope creation → verification → signing → completion webhook → **evidence archival** (provider final PDF + audit certificate → S3 evidence class, hashed, recorded) → customer download. The envelope must be created from the sealed state.
- **Resolve ownership of identity verification:** which steps (email OTP, passcode, SMS, KBA, ID document, QES) PactIntel performs and which the provider performs; name the SMS provider if PactIntel sends OTPs or SMS links (product spec §5.7 requires SMS delivery).
- **[VERIFY]** BoldSign API rate limits, EU data residency/region, webhook signature header names, BAA availability, retrieval of completed documents and audit certificates, pricing at volume.

### D-16 Email (and SMS) at scale
- `EmailPort` with **two adapters configured and warmed from Phase 0** (primary Resend, secondary Amazon SES). Failover is configuration. Dedicated sending subdomain from Day 1 (reputation cannot move later). Bounce/complaint/delivery events → `email_events` (partitioned) + per-org suppression list. Per-tenant sender-domain (brand kit) onboarding flow with DKIM/SPF/DMARC checks.
- **[VERIFY]** the number of verified sending domains each provider allows (a per-tenant-domain scaling cliff), EU regions, rate limits, BAA, webhook events.
- `SmsPort` (provider chosen in ADR) for SMS delivery and any PactIntel-side OTPs.

### D-17 AI
- `LlmPort` (Gemini primary, OpenAI fallback for **generation only**) and a separate `EmbeddingPort` (D-11). Region-aware endpoints (GDPR-002). Per-tenant quotas and an AI-credits ledger. Server-side guardrails (AI-003 retained). HIPAA cells route only to BAA-covered endpoints or disable AI (**[VERIFY]** Vertex AI vs AI Studio terms).
- **Remove AI-001's `x-no-training: true` header and the `safetySettings` claim** unless official docs prove they exist. Replace with verified provider data-use terms, paid/enterprise endpoints, DPAs and a configuration test.

### D-18 Observability
- Per-cell dashboards, alerts and SLOs. Prometheus labels limited to `cell`, `region`, `service`, templated `route`, `status_class` — **never** organization/user IDs (cardinality). Per-tenant visibility via logs/traces with sampling.
- Shipping from Fargate through FireLens (Fluent Bit) or an OTel collector sidecar; define retention tiers and cost.
- **Telemetry stays in-jurisdiction** (EU cells → EU Grafana/Sentry regions; **[VERIFY]** availability). Security/audit logs go to the log-archive account (Object Lock).
- SLO defaults (validate): recipient viewer and signing 99.95%; API 99.9%; burn-rate alerts. Outside-in synthetic monitoring feeds the public status page. On-call tooling suited to one person (escalation to phone, runbook links).

### D-19 IaC and CI/CD
- One IaC tool for *all* providers (AWS, Cloudflare, ClickHouse Cloud, Grafana, GitHub): **default Terraform/OpenTofu** (OpenTofu preferred) **[VERIFY]** provider coverage; ADR may choose another only on proof. Modules: `foundation`, `control-plane`, `cell`, `edge`, `observability`. Instantiating a new cell = new variable set, nothing else. State in S3 (encrypted, versioned, locked) in the shared-services account. Policy-as-code in CI; drift detection.
- GitHub Actions → OIDC → build per process type (BuildKit cache) → ECR (immutable tags = git SHA; image scanning) → one-off migration task → ECS deploy (rolling with circuit breaker, or blue/green **[VERIFY]**) → smoke tests → promote. Automated rollback. Separate IaC pipeline (plan on PR, apply on merge with approval).
- Preview environments: either TTL-limited ephemeral stacks with a hard cost cap, or removed in favor of local + staging. ADR decides; no always-on previews.

### D-20 Resilience and disaster recovery
- Multi-AZ for everything stateful from the first paying customer. Per-cell DR region **in the same jurisdiction**, provisioned from IaC as pilot-light (no standing compute): Aurora cross-region (Global Database or snapshot copy + restore), S3 replication, MRK, Cloudflare failover. Defaults to validate: AZ loss → automatic, RTO minutes; region loss → RTO ≤ 4 h, RPO ≤ 15 min.
- AWS Backup with vault lock and cross-region in-jurisdiction copies; **automated restore drills** (monthly) with evidence; quarterly game days (AZ failure, Redis failover, queue loss, bad deploy, region evacuation).

### D-21 Product-surface items that cannot be retrofitted
- **i18n from Day 1:** externalized strings (ICU message format), locale on user/org/document, locale-aware formatting, RTL-safe CSS, localizable emails. Only English content ships initially. **Accessibility** WCAG 2.2 AA for recipient/signing pages from Day 1.
- **API contract:** cursor (keyset) pagination with opaque cursors (totals optional/approximate), `Idempotency-Key` with storage, `ETag`/`If-Match`, rate-limit headers, `202` + operation resource for long jobs, versioning + deprecation policy, error-code registry, OpenAPI generated from the Zod DTOs.
- **Webhooks:** versioned payloads (`api_version` per endpoint), timestamped signature with replay window, multiple active secrets for rotation, delivery logs, ordering disclaimer.
- **Content:** every snapshot carries `schema_version`; the renderer supports all historical versions forever (read-time upcasting, golden-file tests); sealed content is never rewritten (I-09).
- **Money:** decide one representation (integer minor units + ISO-4217 code + exponent table, or NUMERIC with a stated rounding policy) and apply everywhere (pricing tables, payments, usage).
- **Plan/entitlement keys, event types, error codes, permission names** are stable strings.

### D-22 Data governance and tenant lifecycle
- A machine-readable **data manifest** (`libs/data-manifest`) lists every table, bucket prefix, ClickHouse table, Redis keyspace, search index and vector collection with: owner module, store, scope (tenant / global / control-plane), classification, retention rule, legal-hold eligibility, erasure behavior (delete / anonymize / retain / crypto-shred), export inclusion, residency constraint, backup class, RLS required. **CI fails** if a migration adds an unregistered store or a tenant table lacks RLS/policy. Erasure, export, offboarding and relocation jobs are generated from the manifest.
- Tooling specified (Phase 2; prerequisites in Phase 0): export (GDPR Art. 20), erasure across all stores, offboarding with the post-cancellation timeline, legal hold, **tenant relocation** (export → import → verify → cut over).

### D-23 Compliance and subprocessors
- Subprocessor matrix per cell (data categories, jurisdiction, DPA, BAA). Per-cell **subprocessor allowlist** in configuration so a HIPAA cell can disable non-BAA services (AI, analytics, email provider) without code forks. **[VERIFY]** AWS BAA process and HIPAA-eligible service list for the chosen services; BAA availability for BoldSign, WorkOS, ClickHouse, Cloudflare, Sentry, Grafana, Resend/SES.
- SOC 2 controls mapping: org CloudTrail → log archive, AWS Config, GuardDuty, Security Hub, vault-locked backups, Vanta integration.

### D-24 Cost guardrails
- Mandatory tags: `env`, `cell`, `service`, `tier`. AWS Budgets + Cost Anomaly Detection from the first day. Per-cell cost reporting. Scale triggers mapped to levers with cost deltas (§18). Credit-expiry plan. The cost analysis document is rewritten for this architecture (Part C).

## B4. New sections to add (do not renumber existing §1–§14)

Each new section must be complete enough to implement from, with tables, diagrams (ASCII), and rule-format requirements where relevant.

**§0 Architecture Invariants & Scale Model** (placed before §1). Contents: the No-Migration Principle and definitions (A3); the golden rule and the Structure-vs-Capacity table; invariants I-01…I-15; design envelope (B1); cell model with control-plane/data-plane diagram; routing model; placement and "cell full" policy; tenant-relocation scope; **scale-levers table** (signal → threshold → lever → configuration change → downtime) — at minimum rows for: DB CPU, DB connections, replica lag, DB storage/IOPS, partition growth, Redis memory, queue backlog per class, WebSocket count, recipient RPS, ClickHouse insert lag, PDF queue age, cell fullness (70%), single-tenant outlier (→ dedicated cell), cost anomaly; glossary (cell, control plane, pooled/dedicated cell, port/adapter, outbox, sealed content, evidence artifact, data manifest, capacity switch, jurisdiction).

**§15 AWS Foundation.** Organization/account layout and rationale (D-03); IAM Identity Center and role model; SCPs; CIDR/IPAM plan (table of ranges per cell/env, reserved ranges); subnet tiers and sizing math for Fargate ENIs; NAT/egress IP policy and published egress-IP list; VPC endpoint decision table with costs; security groups matrix; origin lockdown (D-04); security services (CloudTrail org trail, Config, GuardDuty, Security Hub, Inspector/ECR scanning); tagging standard; budgets and anomaly detection; **service-quota registry** (every AWS/third-party quota that can bind within the design envelope — KMS keys, ENIs/IPs per subnet, ALB limits, Fargate vCPU quotas, S3 request rates, Aurora connections, Secrets Manager rates, Cloudflare custom hostnames, ClickHouse inserts, Paddle/BoldSign/Resend rate limits — with the proactive increase plan).

**§16 Async, Eventing & Scheduling Architecture.** Outbox/inbox design with DDL; event envelope and schema-compatibility rules; relay behavior and failure modes; process-type catalog (name, responsibility, scaling signal, min/max, memory, failure blast radius); queue topology (queue names per class, concurrency, rate limits, retry/backoff, DLQ, retention — extends NOTIF-001, WH-001, INFRA-004); scheduler design and the full inventory of scheduled jobs from the blueprint (BOLD-002 reconciliation, BILL-001 seat check, PAY-005 health check, ACC-003 domain check, PAY-004 currency refresh, PAY-003 anomaly report, PAD-002 grace period, document expiry/reminders, nudge queue, partition maintenance, restore drills) each with cadence, sharding strategy and idempotency; per-tenant fairness/quota design; backpressure and load-shedding rules; autoscaling-signal table per service (ALB request count, CPU, queue age/backlog via custom metric, WebSocket count, memory for Chromium).

**§17 Data Governance & Tenant Lifecycle.** The data manifest format and CI enforcement (D-22); manifest seed for every existing table/store (Appendix E); retention matrix per storage class and data class; erasure orchestration across Postgres, ClickHouse, S3, Redis, search, vectors, logs, backups (with honest backup-expiry semantics); export (Art. 20); offboarding timeline; legal hold; tenant relocation runbook (preconditions, steps, verification, cut-over, rollback); backup/restore drill procedure and evidence format.

**§18 Resilience, Capacity & Scale Levers.** SLOs/SLIs and error budgets; failure-mode table (AZ, node, Redis failover, queue loss, bad deploy, poison message, third-party outage, cell loss, region loss, control-plane loss, certificate expiry, quota exhaustion) with detection, automated response, manual runbook; DR topology and RTO/RPO per tier; capacity model (row-size and growth calculations behind B1); load-test plan with pass criteria; chaos/game-day schedule; cell lifecycle (create, fill, freeze, retire).

**§19 Vendor & Dependency Strategy.** Port/adapter matrix. For every vendor (AWS, Cloudflare, ClickHouse Cloud, WorkOS, Paddle, BoldSign, Resend, SES, Gemini, OpenAI, Sentry, Grafana, Better Stack/Instatus, GitHub, Vanta, CRM providers, SMS provider, R2 if retained): purpose, port, adapter(s), lock-in level, **exit path without data migration**, limits that bind within the envelope, regions/jurisdictions, DPA/BAA status, cost drivers, verification date.

**Appendices:** **B** ADR index (list below); **C** verification log (fact, source URL, date, result); **D** defect-register resolution map (every X-xx → where fixed); **E** data-manifest seed.

**Required ADRs:** 0001 AWS-only hosting · 0002 cells + control plane · 0003 accounts/organization · 0004 network/CIDR/egress · 0005 Aurora vs RDS · 0006 migration tooling · 0007 Redis roles/durability · 0008 outbox/events · 0009 process types/autoscaling · 0010 storage classes/evidence · 0011 key hierarchy · 0012 analytics ingestion · 0013 search/vector · 0014 public URL/domain contract · 0015 identity/token model · 0016 billing abstraction · 0017 e-sign sequence/verification ownership · 0018 email/SMS · 0019 AI/embeddings · 0020 observability · 0021 IaC/CI-CD/previews · 0022 DR/resilience · 0023 content tiering/schema versioning · 0024 money/ID formats · 0025 data manifest/lifecycle · 0026 compliance/subprocessors · 0027 cost guardrails.

## B5. Section-by-section edit instructions

### Header, ToC, Change Log (§14)
Version 2.0.0; status; ToC with §0 and §15–§19 and appendices; change-log entry summarizing: AWS-only, cell architecture, eliminated migrations, schema/rule corrections. Keep v1.x entries. Reconcile the existing "100+ rules across 24 domains" claim with the actual count after edits.

### §1 System Architecture Overview
- Rewrite the opening: modular-monolith **codebase**, multi-process **runtime**, cell-based **deployment**. Remove "single Node.js process for Phases 0–2" and "extraction when scale demands".
- §1.1 redraw the diagram: Cloudflare → ALB → ECS services (`web-app`, `web-viewer`, `api`, workers, `collab`) → Aurora / Redis roles / ClickHouse Cloud / S3 classes; control-plane box; cells; external services. Hocuspocus is an **internal** service, not "external".
- §1.2 replace the three communication mechanisms with: in-process port calls (synchronous, same cell), outbox events (asynchronous, durable), BullMQ (execution). Add module-boundary enforcement (Nx tags/lint) and the rule that modules interact only through exported interfaces. Add control-plane modules (Directory, Billing authority, Webhook router, Login router) distinct from cell modules; add `Platform` (outbox/scheduler/quotas), `Evidence` (archival), `Lifecycle` (export/erasure/relocation), `Search`, `Storage` modules where needed. Update the Key Dependencies column (e.g., Payments → "Secrets Manager" becomes KeyProvider + CredentialVault).
- §1.3 revise: keep "why modular monolith", add §1.4 **Module extraction path (no migration):** what changes (deployment unit) and what does not (contracts, events, schemas, DB ownership).

### §2 Tech Stack & Rationale
- Update every row of §2.1 per D-01…D-24: Backend (process types), ORM (repository-isolated; limits), Primary Database (Aurora), Analytics (ingestion), Cache/Queues (roles), Object Storage (S3 classes; R2 decision), Search (no migration), PDF Rendering (isolated worker; generate-once), E-Signature (port, evidence), Platform Billing (port), Auth (port; identity/membership), AI (ports; embeddings pinned), Email (two adapters), CDN (Cloudflare; origin lockdown), Observability (per-cell; residency), CI/CD (OIDC→ECR→ECS), Compliance tooling.
- Add rows: Compute/orchestrator, IaC, Network/edge routing, Secrets/KMS, Event pipeline, Scheduler, Feature flags/config, SMS, WAF, Control-plane datastore (decide: DynamoDB global tables vs Aurora vs edge KV replica — criteria: small, multi-region read availability, low ops).
- §2.2 Deviations: add rows for infrastructure (product spec §8 suggests "a PaaS before Kubernetes" → AWS-from-Day-1 cells), payments, collaboration, search. Add §2.3 **"Deviations from Blueprint v1.1.0"** listing every eliminated migration. Add §2.4 pointer to the port/adapter matrix (§19).

### §3 Data Architecture
- §3.1 add principles: cell-locality, UUIDv7, partition-first, append-only versions, sealed state (pricing/forms/variants included in the hash), schema versioning, manifest registration, money, UTC.
- §3.2 DDL: apply fixes X-01…X-20 to every table; add every missing table/column (X-10); mark each table **cell** or **control-plane**; rewrite with partial unique indexes for soft-deleted rows; partitioned definitions with composite PKs; remove provider-specific columns from core tables; add `schema_version`, `content_ref`, `public_token_hash`, `sent_at/signed_at/completed_at`, `folder_id`, `current_version_id`, evidence/outbox/idempotency/custom-domain/usage tables. Keep column comments.
- §3.3 triggers: rewrite per X-05, X-07, X-08 (append-only versions, signer→request→version linkage, TRUNCATE protection, hash chain, privileges, pgaudit).
- §3.4 RLS: rewrite per X-01, X-02 and D-05 (index-friendly predicate, FORCE RLS, role split, CI test).
- Add §3.5 control-plane schema (directory, cells, custom hostname index, billing authority, entitlement catalog, webhook routing tables); §3.6 partitioning/retention plan; §3.7 content tiering and schema-version/upcasting rules; §3.8 reference to the data manifest (§17).

### §4 API Contracts
- Conventions per D-21 (cursor pagination, idempotency storage, ETag, async operations, rate-limit headers, versioning/deprecation, error registry, OpenAPI from Zod, cell hostnames).
- Complete the endpoint catalog for Phases 0–3 (brand kits, folders, content blocks, comments, approvals, automations, integrations, API keys, OAuth/token endpoints, billing, payments initiate/confirm, uploads presign, exports, evidence download, audit-trail export, public recipient/signing endpoints, admin). Mark internal vs public.
- §4.4 webhooks per D-21 + WH-004 (SSRF, egress IPs, versioning, replay window, secret rotation, per-endpoint circuit breaker, delivery logs endpoints).
- §4.6/§4.7 and AUTH-004/WH-002: unify inbound ingress through the control-plane router; resolve the fixed-path vs random-path conflict (X-26); list the full inbound set (Paddle, BoldSign, WorkOS, processor webhooks, CRM webhooks, Resend/SES events).

### §5 Security & Compliance Architecture
- §5.1: fix "PostgreSQL TDE or disk-level" (X-24); HIPAA via dedicated cells; reference the subprocessor matrix.
- §5.2: one API-key hashing method (X-21); token model per D-13; cell-scoped sessions; membership model.
- §5.3: rewrite the key hierarchy per D-09, update the diagram, keep rules 1–7 numbered but revised (add MRK, encryption context, TK-based shredding, rotation, quotas); update §5.3.3 network/IAM controls (`kms:ViaService`, encryption-context conditions, `app_vault` DB role).
- §5.4: replace "Fly.io Secrets" with Secrets Manager/SSM; add WAF, SSRF/egress controls, IMDS blocking, supply-chain controls (image scanning, SBOM), pen-test and disclosure program.
- §5.5: erasure across all stores per manifest; backups, logs, search, vectors, ClickHouse design (D-10); S3 evidence retention interplay (D-08).

### §6 Payments Architecture
- §6.1 per D-14 (BillingPort, control-plane ingestion, entitlement projection, atomic counters, reconciliation, manual provider). Fix seat/document counter races (X-48).
- §6.2: define how API-tier payment completion is learned at scale (per-connection processor webhooks with encrypted secrets routed to the cell, or polling) — no more "OR"; add idempotency keys on every processor call; reconciliation job; amounts sourced from the sealed pricing snapshot only; payments table references the sealed version.
- §6.3 keep currency validation; add money representation (D-21).

### §7 Multi-Tenancy & Permissions
- §7.1 add cell isolation as the outermost layer. §7.2 rewrite the tenant-context code (transaction-scoped; throws if unset; works in HTTP, BullMQ, WebSocket, scheduler). §7.3 define the authorization data model (grants/collaborators/parties tables) so CASL conditions map to SQL-translatable filters with indexes (X-19). §7.5 rate limits at edge + Redis; add §7.6 **Quotas & Fairness** (per-tenant quotas for PDF, AI, webhooks, bulk, email, storage; fair scheduling).

### §8 Infrastructure, Deployment & Environments (rewrite)
- §8.1 AWS-only hosting: accounts, cells, compute, data, edge, network. **Delete** Fly rationale, "Fly Postgres backed by Supabase", and the "Migration trigger to AWS" paragraph; replace with "Scale triggers → levers" referencing §0/§18.
- §8.2 environments: local, dev (sandbox account), staging, prod cells; preview policy (D-19); parity matrix (local vs AWS) showing what each environment proves; Paddle/BoldSign sandbox mapping.
- §8.3 CI/CD per D-19 (replace `fly deploy`; migration task; image per process type; rollback; IaC pipeline).
- §8.4 docker-compose: replace `minio/minio` (prebuilt images discontinued Oct 2025; repo archived Apr 2026 — re-verify; use SeaweedFS/Garage or a verified alternative with Object Lock support, or real S3 in a dev account); add Mailpit, local `KeyProvider` adapter, Redis roles, Hocuspocus Redis extension; state which behaviors local cannot prove.
- §8.5 backups/DR: remove WAL/pg_dump text (X-40); Aurora PITR + AWS Backup vault lock, in-jurisdiction cross-region copies, S3 versioning/replication, ClickHouse backups, automated restore drills.
- Add §8.6 IaC structure and module map; §8.7 deployment topology per phase (same topology, different capacity); §8.8 autoscaling and capacity; §8.9 cost guardrails; §8.10 runbook index (deploy, rollback, migration, failover, restore, region evacuation, add a cell, relocate a tenant, rotate keys, quota increase).

### §9 Testing & Quality
Add: load/performance tests against the envelope (k6); chaos/failover and AZ-loss tests; restore tests; migration tests on large synthetic data (expand/contract, concurrent index, partition attach); multi-cell routing tests; **RLS-under-pooler** tests; adapter contract tests per port (sandbox); IaC policy tests; SSRF tests (PDF worker, webhooks); tenant-isolation fuzzing; content-compatibility golden files; i18n pseudo-locale and a11y tests; manifest-enforcement tests. Update coverage targets accordingly.

### §10 Observability
Per D-18. Reconcile §10.5 `/health` with INFRA-002 (X-34): `/health/live` and `/health/ready`; readiness = critical dependencies only (Postgres, Redis); ClickHouse, BoldSign, Resend etc. degrade gracefully and appear in a non-gating `/health/deps`; cache results to avoid health-check load. Remove Fly references. Add cell/region labels and cardinality rules.

### §11 Coding Standards & Repo Conventions
Update the monorepo tree: `infra/` (IaC modules), `apps/web-app`, `apps/web-viewer` (or route-group + separate service), `apps/api`, `apps/worker`, `apps/worker-pdf`, `apps/collab-server`, `apps/control-plane`, `apps/edge` (Workers), `libs/ports`, `libs/events`, `libs/data-manifest`, `docs/adr/`. Remove Fly artifacts. One Dockerfile per process type. Add naming conventions for IaC resources, tags, ports/adapters, events. Add standards: no `@Cron`; no vendor SDK imports outside adapters (lint rule); all side-effects via outbox; every migration updates the manifest; i18n keys not literals; a11y lint. Update the quick-start for the new local stack.

### §12 Build Sequencing
- **Split Phase 0** into **0a Platform Foundation** (AWS org/accounts, IaC, network/CIDR, cell `us1`, minimal control plane + directory + routing, CI/CD to ECS, migration runner, observability baseline, outbox + process types + scheduler, key hierarchy + `KeyProvider`, data manifest + CI enforcement, ports/adapters skeletons, i18n/a11y baseline, token model, public-URL/domain contract) and **0b Product Foundation** (the existing Phase-0 product list). Provide effort estimates for solo execution and a minimal-viable 0a scope (structure only, no standing capacity).
- Remove every migration statement (Yjs migration, Meilisearch migration, Fly→AWS). Phase 2 co-editing uses the Day-1 canonical content model with deterministic, tested conversion (`prosemirrorJSONToYDoc` / `yXmlFragmentToProsemirrorJSON`) — or Yjs from Phase 0; ADR 0023 decides. KMS key hierarchy and encrypted-token storage move to Phase 0a (needed in Phase 1 for CRM tokens).
- Add a **Structure-vs-Capacity table** per phase (what is built vs which capacity switches are on).
- **Phase-0 Definition of Done additions:** IaC applies from an empty account; second-cell dry-run (apply → smoke → destroy) passes; load test at the B1 envelope fraction agreed in ADR; RLS-under-pooler test green; AZ-failure and restore drills executed with evidence; manifest CI green; cost report delivered.
- Review Phases 1–4 so no later phase requires re-architecture; re-tag phases for any rule that moved.

### §13 Edge Cases & Mandatory Implementation Rules
- Review **every** rule against the new architecture. Update Scenario/Implementation/Module/Phase and add `(Revised v2.0.0 …)` where changed. Rules requiring specific changes: SIG-001/002/003 (append-only versions, canonical bytes via RFC 8785 JCS, sealed pricing/form state, trigger linkage), SIG-004, AUTH-001/002/003/004/005 (token model, hashing, hashed signer tokens, cross-cell), MT-001 (index-friendly policy, FORCE RLS, manifest check), MT-002 (fan-out scheduler, WebSocket, pooler), MT-005, BILL-001/002 (atomic counters, outbox sync), PAY-001…006 (processor webhooks, vault role, partitioned audit table), PAD-001/002 (control plane, `grace_period_end`), GDPR-001/002 (all stores, in-jurisdiction replication, telemetry), ACC-001 (counters off ClickHouse), ACC-002 (access_requests, Turnstile), ACC-003 (verified Cloudflare behavior), ACC-004, WF-001/002/003, WH-001/002/003, COLLAB-001/002/003 (collab tokens, Redis extension, scale-out), I18N-001/002 (i18n Day 1), PDF-001/002 (generate-once, isolation), AI-001/002/003 (remove fictional header; embeddings), AN-001/002, NOTIF-001/002, INFRA-001/002/003/004, CW-001 (high-volume write path, partitioning), RISK-001, PORT-001, SEC-001, ERR-001/002, STORE-001/002 (presigned POST, retention matrix, in-jurisdiction replication), PAD-*, BOLD-001/002 (evidence archival, port).
- **Add new rule families** in the same format: **CELL-001** no cross-cell access · **CELL-002** routing/lookup-free hostnames · **CELL-003** placement and fullness · **EVT-001** outbox · **EVT-002** idempotent consumers · **EVT-003** event schema versioning · **JOB-001** no in-process cron, shard fan-out · **DATA-001** manifest registration · **DATA-002** partitioning · **DATA-003** sealed content and upcasting · **DATA-004** money/ID formats · **KEY-001** hierarchy · **KEY-002** MRK · **ADP-001** vendor SDKs only inside adapters · **QUOTA-001** per-tenant quotas · **EDGE-001** origin lockdown · **EDGE-002** permanent public URLs · **WS-001** WebSocket scaling/draining · **OPS-001** tags/budgets · **OPS-002** restore drills · **I18N-003** externalized strings · **A11Y-001** · **API-001** pagination/versioning · **WH-004** webhook versioning/SSRF · **PDF-003** PDF SSRF isolation.

### Appendix A
Add resolved ambiguities: identity-verification ownership (PactIntel vs provider), interactive-pricing + e-sign sequencing, which artifact is the legal PDF, SMS provider, mobile editing scope, control-plane metadata residency. Keep existing entries.

## B6. Defect and contradiction register (X-01 … X-62)

Each item below is a verified defect or contradiction in blueprint v1.1.0 that would force rework, a migration, or a security/legal failure later. Fix every one. Record where each is fixed in Appendix D. Also fix any additional defects you find and add them as X-63+.

### Schema, data and tenancy
- **X-01** (§3.4, MT-001) RLS predicate `organization_id::text = current_setting(...)` casts the column, so the `organization_id` index cannot be used (full scans at scale). **Fix:** `organization_id = (SELECT current_setting('app.current_tenant', true)::uuid)`; unset context returns no rows; CI test with `EXPLAIN` proving index use.
- **X-02** (§7.2, §5.2) The Prisma extension runs `set_config(…, true)` on the base client in a separate call, then `query(args)`. The setting is transaction-local and may land on a different pooled connection, so it is lost. The snippet also silently skips when `tenantId` is unset, contradicting MT-002 ("MUST throw"). **Fix:** set context and run the query in the same interactive transaction/connection; throw if unset; test under the pooler.
- **X-03** (§3.2.1, §3.2.2, §3.2.9) `UNIQUE` constraints on `organizations.slug`, `workspaces(org, slug)`, `users(org, email)`, `documents(org, slug)`, `deal_rooms(org, slug)` ignore `deleted_at`, so soft-deleted rows block reuse (a re-invited email fails). **Fix:** partial unique indexes `WHERE deleted_at IS NULL`.
- **X-04** (§3.2.1) `users.workos_user_id UNIQUE` plus one `users` row per org prevents one person belonging to two organizations. **Fix:** identity vs membership (D-13).
- **X-05** (§3.2.2, §3.3, SIG-001/003) `document_versions` is called immutable yet carries mutable `is_signed` and `is_current`; the trigger blocks `is_current` changes after signing, so amendments cannot demote the signed version. **Fix:** INSERT-only versions; `documents.current_version_id`; sealing recorded append-only.
- **X-06** (§3.2.3, PDF-001, SIG rules) Signer-visible state is **not sealed**: `line_items.is_selected/quantity` are mutable rows; buyer selections, client-input form answers, merge variables and Smart Content branch outcomes are not in the hashed `content_snapshot`. After signing, the displayed/paid amount could change. **Fix:** include a sealed pricing/form/variant snapshot in the hashed canonical content; freeze `line_items` after the first signature event; payment amounts derive only from the sealed snapshot.
- **X-07** (§3.3) `mark_version_signed()` selects the latest `signature_requests` row for the document, not the signer's own request. **Fix:** signer → request → version linkage.
- **X-08** (SIG-001, §3.3) "No superuser bypass" is false: row triggers do not fire on `TRUNCATE`; owners/superusers can disable triggers. **Fix:** privileges, `REVOKE TRUNCATE`, event triggers/pgaudit, hash chain + anchoring (D-05); reword the rule honestly.
- **X-09** (SIG-002) `JSON.stringify()` with sorted keys is not canonical JSON, and JSONB normalizes content. **Fix:** RFC 8785 (JCS); store canonical bytes (evidence class or `bytea`) as the legally authoritative copy; recompute the hash from bytes.
- **X-10** Missing tables/columns that rules and features require. Add DDL for all:
  (a) `subscriptions.grace_period_end` (PAD-002); (b) `users.settings` / notification preferences (NOTIF-002); (c) `signers` token hash, token expiry, phone, passcode hash, verification attempts (AUTH-005); (d) `documents`: `sent_at`, `signed_at`, `completed_at`, `folder_id`, public token hash/id, view counters, `current_version_id`, `locale`; (e) `erasure_requests` (§5.5, GDPR-001); (f) `access_requests` (ACC-002); (g) `webhook_deliveries` (outbound log, WH-001) and `inbound_webhook_events` (BoldSign/WorkOS/processors — only Paddle's `billing_events` exists); (h) `document_status_events` (SIG-004 `terminal_reason`); (i) document collaborators/grants/parties (CASL conditions `invitedUserIds`, `partyIds`, `unlockedSections` reference fields that do not exist); (j) approval instances (X-12); (k) `automation_executions` (WF-002 `chain_id`, `chain_depth`, rate cap); (l) `notifications` and push tokens; (m) `idempotency_keys` (§4.1); (n) `custom_domains` (ACC-003); (o) `usage_ledger`; (p) `outbox_events` / inbox; (q) `evidence_artifacts`; (r) `email_events` + suppression list; (s) control-plane tenant directory and cell registry; (t) `content_locks` (COLLAB-002 stores locks inside the hashed snapshot — changing a lock would change content); (u) `legal_holds`; (v) per-connection processor-webhook endpoints/secrets (Phase 2).
- **X-11** (AI-002) `document_versions.created_by UUID REFERENCES users(id)` cannot hold `'ai'`. **Fix:** `created_by_type` + nullable FK, or an authorship structure.
- **X-12** (§3.2.7, WF-001/003) `approval_chains` (definitions) + `approval_steps` (with `status`, `decided_at`) cannot represent many documents passing through one chain. **Fix:** definition tables + immutable per-document `approval_requests` / `approval_decisions`.
- **X-13** Unpartitioned append-only/high-growth tables (D-05 list). Converting later is a full table rewrite.
- **X-14** (§3.2, MT-003) UUIDv4 primary keys (`gen_random_uuid()`): poor index locality and bloat on large tables. **Fix:** UUIDv7 internal IDs (D-05); public tokens separate.
- **X-15** (§3.2.3, §3.2.5) Money as `NUMERIC(15,2)` / `(15,4)` with multi-currency and no rounding or exponent policy (JPY 0 decimals, KWD 3). **Fix:** D-21 money decision, applied everywhere.
- **X-16** (MT-001, §3.2.6) "System tables like `billing_events`" are exempt from RLS and untracked; Paddle ingestion belongs in the control plane; table needs partitioning/retention. **Fix:** manifest classification; control-plane schema.
- **X-17** (§3.2.1, GDPR-002) `organizations.data_residency` is free text, and a single Postgres contradicts the residency promise. **Fix:** jurisdiction + home cell in the directory; no residency promise without an in-jurisdiction cell.
- **X-18** (§3.2.2, ACC-003 item 4) `documents.slug` is unique only per org, but the fallback URL `https://app.pactintel.com/d/<document_slug>` carries no org. **Fix:** D-12 public token/URL contract.
- **X-19** (§7.3) CASL rules use Mongo-style, in-memory conditions on fields absent from the schema; list endpoints need SQL-level filtering. **Fix:** authorization data model (grants/collaborators/parties) with SQL-translatable filters and supporting indexes.
- **X-20** (§2.1 AI row) pgvector dimension/model unspecified; a Gemini→OpenAI fallback would mix incompatible vector spaces. **Fix:** D-11/D-17.

### Security and integrity
- **X-21** (§3.2.8, §5.2, AUTH-002) API keys: "bcrypt/argon2" vs "Argon2" vs "SHA-256". **Fix:** one method (D-13); per-request Argon2/bcrypt would also prevent indexed lookup and invite DoS.
- **X-22** (COLLAB-001) The session cookie is passed as a WebSocket **query parameter** (appears in proxy/ALB logs). **Fix:** short-lived audience-bound collab token.
- **X-23** (AI-001) `x-no-training: true` header and `safetySettings` as a training opt-out are unverified or wrong. **Fix:** D-17.
- **X-24** (§5.1) "PostgreSQL TDE" is not a community-Postgres feature. **Fix:** Aurora storage encryption with KMS CMK.
- **X-25** (§5.3.2 rules 1, 7; cost doc "~$1–5/mo") One KMS CMK per organization costs $1/month each (verified) and runs into per-region key quotas; no multi-Region keys for DR. **Fix:** D-09.
- **X-26** (§4.6, §4.7 vs AUTH-004, WH-002) Fixed inbound webhook paths vs "long random path segments"; an obscure path is not a substitute for signature verification. **Fix:** unified control-plane ingress; signature verification mandatory.
- **X-27** (WH-001) Outbound webhooks to customer URLs have no SSRF protection, no static egress IPs, no payload versioning, replay window or secret rotation. **Fix:** D-04, D-21, WH-004.
- **X-28** (PDF-001/002) Chromium renders customer-controlled content with network access (SSRF, metadata endpoint), and re-rendering a signed version years later can drift (fonts/Chromium). **Fix:** isolated worker; generate-once evidence (D-04, D-08, PDF-003).
- **X-29** (ACC-003, §2.1 CDN) Recipient pages share the app's registrable domain (`app.pactintel.com/d/…`): user-generated content shares an origin with authenticated sessions. **Fix:** D-12 separate registrable domain.
- **X-30** (ACC-003) "Cloudflare automatically falls back to serving the default PactIntel domain" is unverified; custom-hostname quotas and cost at scale unknown. **Fix:** verify and rewrite (D-12).
- **X-31** (AUTH-005 vs BoldSign) Identity-verification ownership is ambiguous (PactIntel sends OTP vs BoldSign handles SMS/KBA) and no SMS provider exists for SMS delivery (product spec §5.7). **Fix:** D-15, D-16.
- **X-32** (AUTH-005) Signer tokens are "UUID v4" with no storage column. **Fix:** ≥128-bit CSPRNG, hashed, expiring, revocable.
- **X-33** (AUTH-001) Cookie-only sessions: no mobile (Phase 3), OAuth (Zapier/MCP), service principals; cross-cell sessions undefined. **Fix:** D-13.
- **X-34** (PDF-002, STORE-002) The legal artifact is undefined: Playwright PDF + certificate page vs the provider's X.509-signed PDF; dependence on provider retention. **Fix:** D-08, D-15.
- **X-35** (SIG-002, §5.5/§6) Interactive pricing/forms vs envelope timing undefined: the version is locked at request creation, but buyers change state afterward. **Fix:** D-15 sealed-state sequence.
- **X-36** (§7.3) `can('sign', 'Document')` is **unconditional** (repeated for collaborators), letting any authenticated user sign any document in CASL terms. **Fix:** condition on being a requested signer of that signature request.
- **X-37** (STORE-001) Add a decision on malware scanning for uploads (e.g., GuardDuty Malware Protection for S3 — **[VERIFY]**) alongside type/size validation; specify the quarantine flow and use presigned **POST** with `content-length-range`.

### Operations and infrastructure
- **X-38** (§10.5 vs INFRA-002) Two health-check designs; readiness includes ClickHouse, so an analytics outage removes every API task from the load balancer. **Fix:** §10 per D-18.
- **X-39** (INFRA-004) Per-logical-DB eviction policies are impossible; the policy is per instance. **Fix:** D-06.
- **X-40** (§1.2, §1.3) In-process `EventEmitter2` bus and `@nestjs/schedule`-style crons: not durable, duplicated on every task. **Fix:** D-07.
- **X-41** (§1) "Single Node.js process" containing API, BullMQ workers and Chromium: memory contention, no independent scaling. **Fix:** D-07.
- **X-42** (MT-002) Iterating all orgs inside one cron job does not scale. **Fix:** shard fan-out (D-07, JOB-001).
- **X-43** (§12 Phase 0, ACC-001, §3.2.9) ClickHouse ingestion unbuffered; PII (`viewer_email`, `ip_address`) in event rows; erasure by mutation is heavy; view limits enforced by querying ClickHouse on each page load. **Fix:** D-10.
- **X-44** (§8.5) Backup text assumes self-managed Postgres (WAL archiving, `pg_dump`). **Fix:** D-20.
- **X-45** (§8.2) Preview environments on Fly with "schema-isolated test data" conflict with RLS tenancy and AWS cost. **Fix:** D-19.
- **X-46** Fly artifacts: §5.4 ("Fly.io Secrets"), §8.1–§8.3, §10.5, INFRA-002, INFRA-003, cost document. **Fix:** remove all.
- **X-47** (COLLAB-003, §8.4) Hocuspocus has no scale-out design (Redis extension), no ALB idle-timeout/draining plan for deploys, and unspecified persistence location. **Fix:** D-06, D-07, WS-001.
- **X-48** (Phase 1 "real-time notifications") In-app WebSocket gateway undefined at scale. **Fix:** per-cell gateway + `realtime` Redis role + drain behavior.
- **X-49** (§4.2) Offset pagination with `total/page/per_page`: slow at scale, and changing it later is a breaking API change. **Fix:** D-21.
- **X-50** (BILL-001/002, §6.1) Seat/document counters use read-modify-write with a hot row and synchronous Paddle calls in the request path. **Fix:** D-14.
- **X-51** (§7.5) Rate limits by plan only; no per-tenant quotas for PDF/AI/webhooks/bulk/email; no edge limits. **Fix:** I-13, §7.6.
- **X-52** (I18N-002) i18n deferred to Phase 3 (retrofit cost); accessibility unspecified. **Fix:** D-21.
- **X-53** (STORE-002, GDPR-001, product spec §5.14) 7-year Compliance-mode retention vs erasure, post-cancellation deletion and crypto-shredding is unreconciled. **Fix:** D-08 retention matrix.
- **X-54** (STORE-002, §8.5) Cross-region replication target unspecified; EU data must not replicate outside the EU. **Fix:** D-08, D-20.
- **X-55** (§8.4) Compose uses `minio/minio` (prebuilt images discontinued Oct 2025; repo archived Apr 2026 — re-verify). **Fix:** replacement per §8.4.
- **X-56** Phase/timing inconsistencies: KMS "Phase 2" in the cost document vs CRM OAuth-token encryption in Phase 1; BYOK Payment Link in Phase 0 while PAY-001…003 are Phase 2; PAY-004 tag. **Fix:** re-tag after restructure.
- **X-57** Cost analysis document outdated (Fly, Upstash, Fly Postgres; KMS "~$1–5/mo"; ClickHouse dev tier). **Fix:** Part C.
- **X-58** Provider-specific columns in core tables (`organizations.paddle_customer_id`, `subscriptions.paddle_*`, `signature_requests.external_provider_id` without a provider column). **Fix:** D-14, D-15.
- **X-59** The §3.2.10 "future entities" and the §13 intro's "100+ rules across 24 domains" claim need reconciliation with actual content after edits (rule count, which tables exist).
- **X-60** Document-conversion/bulk operations (CSV bulk send, exports, document bundling) have no async/fan-out design. **Fix:** §16 queue classes + `202` operations (D-21).
- **X-61** Email/open-tracking and view analytics have no stated consent/legal basis (GDPR/ePrivacy). **Fix:** flag in `QUESTIONS_FOR_OWNER.md`; add configuration hooks (per-cell/per-tenant tracking policy).
- **X-62** `GET /health` exposes component details (§10.5) publicly. **Fix:** authenticated/internal-only detail; public endpoints return only status.

## B7. Verification list (V-01 … V-20)

Verify each item against **official vendor documentation** before relying on it. Record fact, source URL, date and result in Appendix C. Anything unverifiable becomes `[VERIFY]` in the blueprint and a line in `docs/revision/OPEN_VERIFICATIONS.md`. If a verification overturns a locked decision, document the blocker in the ADR and pick the nearest option that still satisfies every invariant.

- **V-01 Aurora PostgreSQL:** PG 17 availability in the chosen regions and current minor; pgvector version (HNSW, iterative scan); `pg_partman`, `pg_cron`, `pgaudit`, `pg_trgm`, `pg_stat_statements`; Serverless v2 scale-to-zero and its RDS Proxy compatibility (including connection pinning with transaction-local settings); I/O-Optimized thresholds; blue/green major upgrades; Global Database + multi-Region key interaction.
- **V-02 Prisma 6:** partitioned tables; RLS with transaction-scoped context; read-replica extension; `uuid(7)`; non-transactional migrations (`CREATE INDEX CONCURRENTLY`); interactive transactions through RDS Proxy/PgBouncer.
- **V-03 Redis for BullMQ:** ElastiCache (Redis OSS / Valkey) vs MemoryDB — `noeviction`, cluster-mode constraints (hash tags), failover data-loss window, persistence; BullMQ version support; Hocuspocus Redis extension.
- **V-04 S3:** Object Lock Compliance + versioning + cross-region replication + SSE-KMS bucket keys; presigned POST `content-length-range`; retention semantics; cost of 7-year locked data for churned tenants; upload malware scanning options.
- **V-05 KMS:** pricing; per-region key quota; request quotas; multi-Region key semantics (single-Region cannot be converted); encryption-context conditions; deletion waiting period; envelope-encryption library guidance.
- **V-06 ECS/Fargate:** ARM64 + Playwright/Chromium; ALB WebSocket idle timeout and deregistration delay; built-in blue/green; ECS Managed Instances; autoscaling on custom CloudWatch metrics; ENI/IP consumption per task; Fargate vCPU quotas; Fargate Spot suitability for workers.
- **V-07 Cloudflare:** Cloudflare for SaaS custom-hostname quotas, pricing, rate limits and real fallback behavior; origin-lockdown options; Workers/KV routing (consistency, limits); WebSocket limits/idle timeouts; Turnstile; Terraform provider coverage.
- **V-08 ClickHouse Cloud:** US and EU regions on AWS; development→production tier upgrade path; ClickPipes sources (Kinesis/SQS/S3); HIPAA availability; mutation/TTL costs; async inserts; Terraform provider.
- **V-09 WorkOS:** multi-organization membership model; data residency; SSO/SCIM pricing at scale; OAuth/Connect for API/mobile/MCP; webhook verification method.
- **V-10 Paddle:** webhook retry/ordering semantics; API rate limits; subscription quantity updates; seller eligibility by country; alternative merchants of record (exit path).
- **V-11 BoldSign:** API rate limits; EU region/data residency; webhook signature header names; BAA; embedded signing; retrieval of completed documents and audit certificates; pricing at volume.
- **V-12 Email:** Resend vs Amazon SES — verified-domain limits, EU regions, rate limits, BAA, bounce/complaint events, dedicated-IP/warm-up.
- **V-13 LLM providers:** Gemini API / Vertex AI / OpenAI data-use terms, regional endpoints, embedding models and dimensions, BAA coverage; confirm that no `x-no-training` request header exists.
- **V-14 Observability vendors:** Grafana Cloud and Sentry EU regions, pricing/cardinality model, BAA; FireLens / OTel on Fargate.
- **V-15 HIPAA:** AWS BAA process; HIPAA-eligible service list for every chosen AWS service; BAA availability for each sub-processor.
- **V-16 CI/CD supply chain:** GitHub OIDC to AWS; ECR scanning/immutability; SBOM/signing options.
- **V-17 IaC:** Terraform/OpenTofu providers for AWS, Cloudflare, ClickHouse Cloud, Grafana, Sentry, GitHub; S3-native state locking; module patterns for instantiating cells.
- **V-18 Local development:** MinIO status (re-verify the discontinuation of prebuilt images and the archived repository) and the replacement (SeaweedFS, Garage or other) including Object Lock support; Mailpit; local `KeyProvider`.
- **V-19 AWS credits and plans:** how promotional credits apply across Organizations member accounts; Free-plan vs Paid-plan service restrictions relevant to this architecture (Free plan closes at 6 months or when credits run out).
- **V-20 Legal/standards (flag for counsel, not legal advice):** ESIGN/UETA/eIDAS evidence-retention expectations; GDPR/ePrivacy for open/view tracking; data-localization rules for added jurisdictions.

## B8. Acceptance checklist (Phase 5 audit)

### B8.1 Global greps — each must return **zero** matches in §0–§19 outside the Change Log, Appendix D, ADRs and quoted historical text
- `Fly\.io|flyctl|fly deploy|Fly Postgres|Supabase|Upstash|minio/minio` — and `MinIO` except in the §8.4 explanation of why it is replaced.
- `EKS|Kubernetes` — allowed only inside the explicit "out of scope" statement.
- `migrat(e|ion) (to|from) (AWS|Fly|Meilisearch|Yjs)|Migration trigger|when scale (justifies|demands)|Phase 3\+|Meilisearch migration|→ Meilisearch`
- `organization_id::text`
- `x-no-training|safetySettings`
- `TDE`
- `/d/<document_slug>`
- `DB 0|DB 1|DB 2` (INFRA-004 rewritten)
- `JSON\.stringify\(\) with sorted keys`
- `@Cron|@nestjs/schedule` — allowed only in the prohibition.
- `EventEmitter2` — allowed only in the non-critical-hook statement.
- `bcrypt|Argon2` in API-key contexts.
- `is_current|is_signed` as mutable columns on `document_versions`.
- `UNIQUE \((organization_id, )?(slug|email)\)` without a partial-index form.
- `paddle_` inside core tables (allowed only in provider-mapping tables).
- `gen_random_uuid\(\)` as a primary-key default.
- Any `Phase 3`/`Phase 2` statement that implies replacing, migrating or re-platforming a component.

### B8.2 Content checks (write evidence = section references in `AUDIT_REPORT.md`)
- **C-01** §0 exists with I-01…I-15, envelope, cell/control-plane diagram, scale-levers table (≥14 rows), Structure-vs-Capacity table, glossary.
- **C-02** §15–§19 exist and contain every item listed in B4.
- **C-03** Each of D-01…D-24 has an ADR with sources and verified date; Appendix B indexes all ADRs.
- **C-04** Each X-01…X-62 (and any additions) is resolved with a pointer in Appendix D.
- **C-05** Every table in §3 is labeled cell or control-plane; every cell tenant table has `organization_id`, index, RLS, `FORCE`, policy; partitioned tables listed with keys; no table or column named in a §13 rule is missing from §3 (cross-check systematically, rule by rule).
- **C-06** No migration statements remain anywhere in §1–§14 (B8.1).
- **C-07** §8 has no Fly references; CI/CD uses OIDC → ECR → ECS with a migration task; compose updated; backups per D-20.
- **C-08** Every external vendor appears in §19 with port/adapter, exit path, binding limits, region/BAA status and verification date.
- **C-09** §12 has Phase 0a/0b, the Structure-vs-Capacity table, and the Definition-of-Done additions including the second-cell dry-run.
- **C-10** Every pre-existing rule ID still exists; changed rules are marked `(Revised v2.0.0 …)`; the new rule families exist; the rule count is updated.
- **C-11** §4 uses cursor pagination, a complete endpoint catalog and unified inbound ingress.
- **C-12** The public URL/domain contract is documented; `slug` is not a public identifier.
- **C-13** The key hierarchy is documented; no per-org CMK by default; MRK stated.
- **C-14** Liveness/readiness reconciled; readiness lists only critical dependencies.
- **C-15** Redis roles table present; INFRA-004 rewritten.
- **C-16** The cost report gives the Phase-0 AWS monthly estimate and the cost of each capacity switch; the cost analysis document is updated.
- **C-17** `AGENTS.md` and `GEMINI.md` are updated (Part C).
- **C-18** ToC, anchors and cross-references are valid; phase tags are consistent.
- **C-19** Every `[VERIFY]` appears in `OPEN_VERIFICATIONS.md`; nothing unverified is asserted as fact.
- **C-20** `QUESTIONS_FOR_OWNER.md` exists and covers B9.
- **C-21** Implementer test (W-08): pick 10 random rules/sections; confirm no architecture decision remains for the implementer; record the 10 picks.
- **C-22** The data-manifest seed (Appendix E) covers every table and store in the blueprint.
- **C-23** The sealed-state model (X-06) is reflected in DDL, triggers, PDF rules, payment rules and the e-sign sequence.
- **C-24** The e-sign sequence diagram exists and names the legal artifact and the evidence-archival step.

## B9. Questions to surface in `QUESTIONS_FOR_OWNER.md` (state a default; do not block)

1. Launch jurisdictions and the EU launch date (default: US at launch; EU cell in Phase 2).
2. Will "dedicated infrastructure" be sold in the Enterprise tier, and at what price floor? (default: yes, as a dedicated cell)
3. HIPAA ambition and timeline (default: Phase 4, on demand, via dedicated cells).
4. Acceptable Phase-0 AWS monthly cost (default ceiling ~US$350).
5. Which routing metadata may live in a global control plane (legal/DPO review).
6. Consent stance for open/view tracking under GDPR/ePrivacy (default: configurable per tenant).
7. Paddle seller eligibility for the owner's country and the fallback merchant of record.
8. Registrable domain to buy for public document pages and for the sending subdomain.
9. Default evidence retention (7 years) and the post-cancellation deletion promise.
10. Email provider preference and sending domain names.
11. Preview environments: keep (TTL + cost cap) or drop.
12. SLO/uptime commitments per plan tier.
13. Any statements in `PRODUCT_BLUEPRINT.md` that contradict the new infrastructure (list them; do not edit that file).

---

# PART C — COMPANION DOCUMENTS TO UPDATE

1. **Infrastructure & Launch Cost Analysis** (the existing cost document). Rewrite for this architecture: Phase 0/1/2/3 monthly costs by line item (Fargate, ALB, NAT/endpoints/IPv4, Aurora, ElastiCache/MemoryDB, S3 incl. Object Lock/replication, KMS, Secrets Manager, CloudWatch/FireLens, ClickHouse, Cloudflare incl. custom hostnames, Resend/SES, WorkOS, BoldSign, Paddle, LLM, Sentry, Grafana, Vanta) with formulas and sources; each capacity switch with its cost delta; free-tier credit treatment (credits cannot cover the build; clock starts at account creation); remove all Fly/Upstash/Fly Postgres content; correct the known errors (KMS per-org cost, ClickHouse dev tier, "backed by Supabase").
2. **`AGENTS.md` and `GEMINI.md`.** Add: invariants I-01…I-15; forbidden patterns (Fly/EKS/Kubernetes; `@Cron` in app code; vendor SDK imports outside adapters; direct cross-module DB access; console-created cloud resources; per-event ClickHouse inserts; per-org KMS keys; mutable version rows; unregistered tables); required workflow (ADR for any structural change; manifest update with every migration; outbox for side-effects; IaC for all infrastructure; verify vendor facts before writing them); pointers to the blueprint, ADR index and revision reports.
3. **`PRODUCT_BLUEPRINT.md`.** Do **not** edit. List any infrastructure statements that now contradict the Master Blueprint in `QUESTIONS_FOR_OWNER.md`.

---

# APPENDIX — Facts verified by the brief author (re-verify; do not copy blindly)

As of 2026-10-04, from vendor documentation/announcements found during research:
- Aurora PostgreSQL supports major version 17 (minor 17.9 observed); pgvector 0.8.0 ships with Aurora PostgreSQL 17.x; Aurora Serverless v2 supports scale-to-zero on supported versions; Serverless v2 is priced per ACU-hour (about US$0.12/ACU-hr in us-east, i.e. about US$44/month at a 0.5 ACU floor).
- AWS App Runner stopped accepting new customers on 2026-04-30; Amazon ECS Express Mode exists as the recommended simplified path (provisions cluster, ALB, HTTPS, security groups, autoscaling; no scale-to-zero).
- MinIO community edition: prebuilt Docker images discontinued October 2025; repository archived 2026-04-25. Blueprint §8.4 still uses `minio/minio`.
- Cloudflare R2 bucket locks are retention rules that an administrator can remove; S3 Object Lock Compliance mode cannot be removed or shortened by any user, including the root account.
- AWS KMS customer-managed key: US$1/month (prorated hourly) plus about US$0.03 per 10,000 requests after the free tier.
- Fargate (x86, us-east-1): US$0.04048 per vCPU-hour and US$0.004445 per GB-hour; ARM is about 20% cheaper. ALB base about US$16.43/month; public IPv4 about US$3.65/month each; NAT gateway US$0.045/hour plus data processing.
- AWS Free plan: up to US$200 in credits (US$100 at signup + US$100 via activities); the Free plan closes at 6 months or when credits run out; on the Paid plan, credits remain valid for 12 months from signup.

**End of brief.** When all phases are complete, reply with: (1) the audit report summary (pass/fail counts), (2) the list of owner questions, (3) the list of `[VERIFY]` items still open, (4) the projected Phase-0 monthly AWS cost.
