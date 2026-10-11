# ADDENDUM A — Google Cloud Target + AI Model Gateway

| | |
|---|---|
| **Applies to** | `docs/ARCHITECTURE_REVISION_BRIEF.md` (the "Brief") and its output, `docs/MASTER_IMPLEMENTATION_BLUEPRINT.md` v2.0.0 |
| **Executor** | Google Antigravity (agent) in the `pactintel2` repository |
| **Addendum date** | 2026-10-04 |
| **Precedence** | **Where this addendum and the Brief conflict, this addendum wins.** |
| **Launch message** | Save as `docs/ARCHITECTURE_REVISION_BRIEF_ADDENDUM_A.md`, then tell the agent: *"Read docs/ARCHITECTURE_REVISION_BRIEF.md and docs/ARCHITECTURE_REVISION_BRIEF_ADDENDUM_A.md completely. Treat them as one revision; the addendum overrides the brief. Execute all phases. Do not skip or summarize any item. Report after each phase."* |

---

## A0. Scope and precedence

**This addendum makes two changes.**
1. **The single cloud becomes Google Cloud (GCP), not AWS.** Every AWS-specific statement in the Brief is replaced by its GCP equivalent (A2–A5).
2. **The AI architecture is replaced** by a provider-neutral AI platform with **Claude as the primary model family today**, and the ability to add or swap Gemini, OpenAI or any other model per task without touching application code (A6). Brief decision **D-17 is replaced**; the embedding portion of **D-11** is amended; **D-23** gains AI sub-processors.

**Unchanged and still binding:** the mission and definitions (A1–A3 of the Brief); working rules W-01…W-12; invariants I-01…I-15 (read "AWS account/org" as "GCP organization/project"); the cell + control-plane architecture (D-02); every schema, security and rule fix in the defect register X-01…X-62 (except where the text is AWS-specific); build sequencing; acceptance checks (extended in A5 and A6.20).

**Wording rule:** wherever the Brief says "AWS", an AWS service, or an AWS term, apply the translation table in A2. The final blueprint must contain **no AWS terms** except inside ADR history/rationale and the Change Log.

**Process additions:** new ADRs (A6.18 and A1), new §20 "AI Platform Architecture", extra verification items V-21…V-39 (A4), extra acceptance checks C-25…C-52 (A5, A6.20), extra owner questions (A8).

---

## A1. Decision — Google Cloud replaces AWS (rewrite ADR-0001)

**Decision.** Production, staging and development run on **Google Cloud only**. No AWS account is required. No multi-cloud. If any non-GCP infrastructure service is retained, it needs its own ADR.

**Why now.** The product is at design stage: no resources, no data. Choosing the cloud now costs a document revision. Changing clouds after data exists is exactly the migration this program forbids, so the cloud is a **Day-1 structural decision**, made once.

**Why it is a good fit for this product (state in ADR-0001, with sources):**
- **Claude and Gemini under one roof.** Claude is available on Vertex AI (generally available; Anthropic's SDKs support Vertex; global and regional endpoints; multi-region endpoints in preview). Gemini and embedding models are native to Vertex AI. One IAM model, one bill, in-region traffic, regional endpoints for data residency.
- **Cloud Run worker pools** are a purpose-built resource for continuously running, non-HTTP, pull-based consumers — a direct fit for BullMQ workers.
- **Cloud Storage Object Retention Lock** gives per-object WORM retention with a mode that permanently prevents shortening or removal (the Compliance-mode equivalent for signed evidence), plus Bucket Lock.
- **Cloud KMS** is cheaper per key version than the AWS equivalent (software key version about US$0.06/month; verified) — still **no per-tenant CMK by default** (D-09 unchanged).

**Honest trade-offs to record in the ADR and carry into the cost report:**
1. **Postgres cost floor is higher.** There is no Aurora-Serverless-v2-style low floor or scale-to-zero. Cloud SQL HA and AlloyDB cost materially more at the low end (AlloyDB has no free tier). Expect the Phase-0 database line to exceed the AWS plan. See A3-D05.
2. **Cloud Run is request-oriented.** WebSockets work on Cloud Run services but are bounded by the request timeout, so collaboration clients must reconnect cleanly (A3-D01). **[VERIFY]** limits.
3. **No native transactional-email service** (SES-equivalent). The secondary email adapter is a third-party provider.
4. **Billing eligibility and credits are unverified** for the owner's country/card, and whether credits apply to Claude-on-Vertex usage. → V-32 and `QUESTIONS_FOR_OWNER.md`.
5. **Claude on Vertex has regional nuances:** the global endpoint does not guarantee residency; regional endpoints are required for residency; partner-model **data at rest** stays in the chosen region/multi-region but **processing regionalization may vary**; not every Claude model is available in every region; models must be enabled in Model Garden. EU cells must be designed around this (A6.9).

**Portability posture.** Ports/adapters, IaC, cells and the outbox keep vendor coupling shallow. This is **not** a promise of a cheap future cloud switch once data exists.

---

## A2. Translation table — apply throughout the Brief and the blueprint

| Brief wording (AWS) | Replace with (Google Cloud) | Notes / `[VERIFY]` |
|---|---|---|
| AWS Organizations, accounts, management account | **Organization** (Cloud Identity), **folders**, **projects**; billing account held at organization level | One project per cell per environment; separate projects for security/log-archive, shared-services, control plane, networking if Shared VPC is used |
| IAM Identity Center | Cloud Identity + groups; Workforce Identity Federation if an external IdP is used | No long-lived user keys |
| SCPs | **Organization Policies** (+ IAM deny policies; VPC Service Controls where useful) | Resource-location allowlist, no service-account key creation, public-access prevention, CMEK enforcement, restrict external IPs |
| GitHub OIDC roles | **Workload Identity Federation** for GitHub Actions | No service-account JSON keys anywhere |
| IAM task roles | One least-privilege **service account per service** | |
| ECS on Fargate | **Cloud Run services** (HTTP), **Cloud Run worker pools** (BullMQ consumers), **Cloud Run jobs** (migrator, one-offs) | GKE Autopilot only on a verified blocker (ADR-0036) |
| ECS Managed Instances / EC2 capacity providers | Cloud Run CPU-allocation/min-instance tuning and committed-use discounts | Cost levers only; no orchestrator change |
| ALB | **External Application Load Balancer** with serverless NEGs | |
| AWS WAF | **Cloud Armor** (plus Cloudflare WAF at the edge) | |
| NAT gateway + Elastic IPs | **Cloud NAT** with **reserved static external IPs** | Publish as platform egress IPs (D-04) |
| VPC endpoints | Private Google Access / **Private Service Connect** | |
| IPAM / CIDR plan | Custom-mode VPC with an explicit non-overlapping CIDR plan | GCP VPCs are global, subnets regional |
| ECR | **Artifact Registry** (+ Artifact Analysis scanning) | |
| Aurora PostgreSQL / RDS | **Cloud SQL for PostgreSQL** (default) · AlloyDB (ADR alternative) | A3-D05 |
| RDS Proxy / PgBouncer | Cloud SQL managed connection pooling if available, else PgBouncer | **[VERIFY]**; must be validated with Prisma + transaction-scoped RLS |
| ElastiCache / MemoryDB | **Memorystore** (Valkey/Redis) | Persistence and failover loss window per ADR |
| S3 / S3 Object Lock Compliance | **Cloud Storage** + **Object Retention Lock (Locked mode)** + Bucket Lock | A3-D08 |
| S3 cross-region replication | **Dual-region / multi-region buckets in-jurisdiction** (or Storage Transfer Service) | Never leave the jurisdiction |
| S3 SSE-KMS bucket keys | CMEK per bucket/class | Check KMS request cost at volume |
| S3 presigned POST | V4 signed URLs / signed POST policy with `content-length-range` | **[VERIFY]** |
| KMS CMK, multi-Region keys, encryption context | **Cloud KMS** keys, **multi-region key locations**, **additional authenticated data** | A3-D09 |
| Secrets Manager / Parameter Store | **Secret Manager** (user-managed replication within jurisdiction) | |
| CloudWatch Logs/alarms, FireLens | **Cloud Logging / Monitoring / Trace**; OpenTelemetry or Grafana Alloy shipping | |
| Kinesis / SQS | **Pub/Sub** | Analytics event buffer |
| EventBridge Scheduler | **Cloud Scheduler** (or BullMQ job schedulers — preferred, per D-07) | |
| Lambda (glue) | **Cloud Run functions / Eventarc** | Peripheral glue only |
| AWS Backup (vault lock) | **Backup and DR Service** + Cloud SQL automated/on-demand backups | **[VERIFY]** immutability options |
| CloudTrail org trail | **Cloud Audit Logs** (Admin Activity + Data Access) with an org-level **log sink** to a locked-retention bucket in the log-archive project | |
| AWS Config, GuardDuty, Security Hub, Inspector | **Security Command Center**, **Cloud Asset Inventory**, Artifact Analysis | |
| GuardDuty Malware Protection for S3 | **[VERIFY]** malware-scanning option for Cloud Storage uploads | Decision remains required (X-37) |
| AWS Budgets / Cost Anomaly Detection | **Cloud Billing budgets/alerts** and anomaly detection | |
| Aurora Global Database / cross-region DR | Cloud SQL cross-region replicas + cross-region backups (or AlloyDB cross-region replication) | **[VERIFY]** |
| AWS Shield | Cloud Armor / Google edge (behind Cloudflare) | |
| Amazon SES (secondary email) | **Secondary provider chosen in ADR-0038** (e.g., Postmark, SendGrid, Mailgun) | Verify sending-domain limits (D-16) |
| AWS BAA / HIPAA-eligible services | **Google Cloud BAA / covered-products list** | **[VERIFY]**; include Vertex AI partner models |
| DynamoDB global tables (control-plane datastore option) | Firestore (multi-region) / Spanner / Cloud SQL — decide in ADR-0039 | Criteria in Brief §2.1 |
| AWS Encryption SDK | Cloud KMS client libraries / Tink envelope pattern | **[VERIFY]** |
| `kms:ViaService`, encryption-context IAM conditions | IAM conditions on Cloud KMS + service-account scoping + AAD | |
| "AWS account" in invariants and I-04 | "GCP project" | |

---

## A3. Changed decisions — Google Cloud versions (these replace the AWS text of the same D-numbers)

Decisions not listed here (D-11 except embeddings, D-13, D-14, D-15, D-21, D-22) are unchanged. Everything marked **[VERIFY]** must be confirmed against official Google Cloud documentation and logged in Appendix C.

### A3-D01 Compute — Cloud Run (services, worker pools, jobs)
- **Services** (HTTP): `web-app`, `web-viewer`, `api`, `collab`. **Worker pools** (continuously running, non-HTTP, pull-based; verified as a Cloud Run resource type): BullMQ consumers `worker-core`, `worker-bulk`, `worker-ai`, `worker-pdf`. **Jobs**: `migrator` and scheduled one-offs. Cloud Run is the permanent orchestrator; everything is defined in IaC.
- Settings per service, recorded in §16: second-generation execution environment where required, CPU **always allocated** for WebSocket/background work, minimum instances for `api` and `web-viewer`, concurrency, Direct VPC egress, ingress restricted to the load balancer, **default `run.app` URLs disabled** (**[VERIFY]**).
- **WebSockets (collab, notifications).** A connection cannot outlive the service request timeout. Set the maximum permitted (**[VERIFY]** limit); clients reconnect with jitter and resync (Yjs resyncs by design); no server-side state beyond the Redis extension; deploys drain via the SIGTERM grace period (**[VERIFY]** length). If verification shows these limits cannot support the envelope (5,000 concurrent collaboration sockets per cell), **ADR-0036 selects GKE Autopilot now**, and the Brief's "no Kubernetes" statement is amended in that same ADR. No later switch.
- **Deploy:** revisions with traffic splitting for canary/blue-green; automatic rollback by shifting traffic.
- **Autoscaling signals:** services — concurrency/CPU/request count; worker pools — external metrics (BullMQ queue depth/age exposed as Prometheus metrics, or Pub/Sub backlog) (**[VERIFY]** supported mechanisms).
- **Chromium (`worker-pdf`):** memory sizing, shared-memory and sandbox flags **[VERIFY]**. Runs under a dedicated service account with **no permissions** and with egress limited to the viewer origin and approved CDNs; link-local, metadata and VPC ranges blocked (**[VERIFY]** enforcement mechanism).

### A3-D02 Cells on GCP
A cell is a **project** (or small set of projects) named `<product>-<env>-<cell>`; the control plane has its own project(s); dedicated cells live in their own folder with tailored Organization Policies. Region = the cell's region. Everything else in D-02 is unchanged (lookup-free routing, no cross-cell DB access, placement/fullness, tenant relocation only).

### A3-D03 Organization, folders, projects
- Organization with folders: `control-plane`, `cells-prod-us`, `cells-prod-eu`, `non-prod`, `shared-services`, `security`. Projects: per cell per environment; `security` hosts the log archive (locked-retention buckets) and Security Command Center; `shared-services` hosts Artifact Registry, Terraform state, CI identities.
- **Organization Policies** (**[VERIFY]** exact constraint names): resource locations allowlist per folder (enforces jurisdiction), disable service-account key creation, public-access prevention for storage, require CMEK for supported services, restrict external IPs, restrict public Cloud SQL IPs, restrict allowed ingress for Cloud Run, restrict workload identity pools.
- Human access via Cloud Identity groups; CI via Workload Identity Federation; break-glass role with alerting. **[VERIFY]** Assured Workloads for EU data sovereignty and (later) HIPAA; Access Transparency/Approval.
- Credit strategy per V-32. Structural: moving projects across folders is possible but resource-level moves are not free — fix the layout now.

### A3-D04 Network, egress and edge protection
- Custom-mode VPC per cell project (or a Shared VPC host per jurisdiction — ADR-0004). Explicit non-overlapping CIDR plan reserving ranges for future cells and peering. Private services access / **Private Service Connect** for Cloud SQL, Memorystore and ClickHouse Cloud (**[VERIFY]** connectivity options).
- **Cloud NAT with reserved static external IPs**, published as the platform egress IPs.
- External Application Load Balancer + **Cloud Armor**. **Origin lockdown:** accept only Cloudflare (Cloud Armor allowlist of Cloudflare ranges and/or mTLS authenticated origin pulls and/or secret header) (**[VERIFY]**).
- Customer-supplied URL egress (outbound webhooks) through an SSRF-safe path with fixed egress IPs.

### A3-D05 PostgreSQL — Cloud SQL for PostgreSQL (default)
- **Cloud SQL for PostgreSQL**, regional HA, private connectivity, PITR. **Enterprise edition at launch; Enterprise Plus as an in-place capacity switch** (**[VERIFY]** in-place edition upgrade, limits, SLA). At least one read replica before the first paying customer; separate writer/reader URLs from Day 1; cross-region replica in-jurisdiction as the DR pilot-light.
- **Why not AlloyDB by default:** per-cell sizing caps database size (Brief B1), so Cloud SQL's ceiling (**[VERIFY]**: Enterprise up to ~96 vCPU / 624 GB, Enterprise Plus up to ~128 vCPU / 864 GB) suffices per cell, and scale beyond that comes from **more cells**, not a bigger engine. AlloyDB has no free tier, a 2-vCPU minimum and a higher price per vCPU, which breaks the W-10 budget at Phase 0. **Choose AlloyDB only if** (a) a verified Cloud SQL blocker exists (required extension, partition management, replica count, failover/maintenance behavior), or (b) the Phase-0 cost comparison puts AlloyDB inside the W-10 budget. Record Cloud SQL → AlloyDB (Database Migration Service) in ADR-0037 as an **unplanned escape hatch, not part of the roadmap**.
- **[VERIFY]** PostgreSQL 17/18 availability; pgvector (HNSW); `pg_trgm`, `pgaudit`, `pg_cron`, and **`pg_partman`** (if absent, partition maintenance runs from migration-managed partitions + `pg_cron`/scheduler jobs); managed connection pooling; IAM database authentication; blue/green or in-place major-version upgrade.
- Unchanged: roles, RLS predicate, transaction-scoped tenant context, UUIDv7, partition list, append-only + hash chain, content tiering, migration-tool requirements, upgrade runbook.

### A3-D06 Redis — Memorystore
Memorystore (Valkey or Redis; **[VERIFY]** BullMQ support, `noeviction`, standalone vs hash-tagged cluster, persistence mode, failover data-loss window). Roles→instances, role-based config and "no business-critical event relies on Redis durability" are unchanged. Private connectivity via PSC.

### A3-D07 Async additions
Pub/Sub is the durable buffer for **high-volume, non-business-critical streams** (analytics events). BullMQ stays the job-execution mechanism; the Postgres outbox stays the source of truth for business events. Worker pools consume BullMQ queues. BullMQ job schedulers are preferred over Cloud Scheduler.

### A3-D08 Storage — Cloud Storage and evidence
- Classes unchanged (`evidence`, `uploads`+quarantine, `public-media`, `exports`/`pdf-cache`, `collab-snapshots`, `analytics-archive`).
- **`evidence`:** **Object Retention Lock in Locked mode** (verified: permanently prevents the retention date from being reduced or removed; the XML API calls it COMPLIANCE) with per-object retention set at upload per org policy; **Bucket Lock** where a uniform minimum retention is wanted; dual-/multi-region location **in-jurisdiction**; CMEK; no `objects.delete` for any identity except an approved break-glass path; Data Access audit logs on; versioning/soft-delete configured so retention can never be bypassed. Retention locks and "a bucket containing retained objects cannot be deleted until the objects expire" (verified) belong in the retention matrix and the offboarding/cost model; a project deletion lien is applied on a best-effort basis.
- `public-media`: Cloud Storage behind Cloudflare by default; R2 only if the egress-cost analysis justifies it (ADR-0010).
- Uploads: V4 signed POST policy or signed URL with a content-length limit (**[VERIFY]**); malware-scanning decision (**[VERIFY]**).

### A3-D09 Keys and secrets — Cloud KMS, Secret Manager
- Hierarchy unchanged: per-cell, per-purpose key rings/keys → per-tenant wrapped data key (TK) → per-record DEKs; crypto-shredding by destroying the wrapped TK (backup caveat stated honestly); no per-tenant CMK by default (an enterprise customer-managed key remains an optional `key_provider` value).
- **Multi-region key locations** (e.g., `us`, `europe`) for any key whose ciphertext crosses regions within a jurisdiction (**[VERIFY]** semantics and that a regional key cannot later be made multi-region). **AAD** carries `{org_id, purpose}` (**[VERIFY]**). Software protection by default; HSM for `cred-vault` and `integration-tokens` if cost-justified (verified: software about US$0.06 per key version per month; HSM US$1.00–2.50; US$0.03 per 10,000 operations; admin/rotation operations free). Scheduled rotation + rewrap job; scheduled destruction with the platform's minimum wait (**[VERIFY]**).
- **Secret Manager** with user-managed replication inside the jurisdiction; secrets injected into Cloud Run as environment variables or volumes; rotation plan.

### A3-D10 Analytics — ClickHouse Cloud on GCP
Pub/Sub buffer → batcher on a worker pool → ClickHouse Cloud in a GCP region of the same jurisdiction (or ClickPipes if it supports the chosen source — **[VERIFY]**). Pseudonymous viewer IDs, erasure design and "enforcement counters never in ClickHouse" are unchanged.

### A3-D12 Edge
Cloudflare unchanged. The origin is the External Application Load Balancer; Cloud Run default URLs disabled; custom-hostname quotas/pricing verified (V-07).

### A3-D16 Email
Resend primary; **secondary provider chosen in ADR-0038** (candidates: Postmark, SendGrid, Mailgun) with verified sending-domain limits, EU regions, rate limits, BAA and webhook events. All SES text is removed. Dedicated sending subdomain and suppression/bounce handling unchanged.

### A3-D18 Observability
Cloud Run logs/metrics/traces flow to Cloud Logging/Monitoring/Trace automatically; ship to Grafana Cloud through Grafana Alloy or an OpenTelemetry collector (decide: sidecar vs agent). Cloud Audit Logs (Admin Activity + Data Access for sensitive services) go to an org-level sink in the `security` project (locked retention). Telemetry stays in-jurisdiction. Metrics-label and SLO rules unchanged.

### A3-D19 IaC and CI/CD
Terraform/OpenTofu with the `google` and `google-beta` providers (plus Cloudflare, ClickHouse, Grafana, Sentry, GitHub). State in a versioned GCS bucket with state locking in the `shared-services` project (**[VERIFY]**). GitHub Actions → **Workload Identity Federation** → build per process type → **Artifact Registry** (immutable tags = git SHA, scanning) → Cloud Run job for migrations → Cloud Run deploy with traffic splitting → smoke tests → promote. Preview-environment policy unchanged.

### A3-D20 Resilience and DR
Cloud SQL HA + cross-region replica (pilot-light) in-jurisdiction; Cloud Storage dual-/multi-region; multi-region KMS keys; Cloud Run redeployed from IaC in the DR region; Cloudflare failover; automated restore drills (Cloud SQL restore, Backup and DR). RTO/RPO defaults unchanged.

### A3-D23 Compliance and sub-processors
Google Cloud BAA and covered-products list (**[VERIFY]**, including Vertex AI partner models); Assured Workloads and Access Transparency where needed; Security Command Center; Vanta GCP integration (**[VERIFY]**). The per-cell sub-processor allowlist now also covers every AI provider path with its data class (A6.9).

### A3-D24 Cost guardrails
Use resource **labels** (`env`, `cell`, `service`, `tier`), Cloud Billing budgets and alerts, anomaly detection, and a billing export for per-cell cost reporting. The Phase-0 cost report lists: Cloud Run (services/workers/jobs), load-balancer forwarding rule, Cloud Armor, Cloud NAT + static IPs, Cloud SQL (edition, HA, storage, replica), Memorystore, Cloud Storage (incl. retention/dual-region), KMS, Secret Manager, Logging/Monitoring, Pub/Sub, Artifact Registry, **Vertex AI usage**, plus the delta of every capacity switch. State clearly where GCP costs more than the AWS plan (expected: the Postgres line) and where it costs less (Cloud Run scale-to-zero for non-prod).

### A3-S Section-level application of the translation
- **Brief B4 §15 is retitled "Cloud Foundation (Google Cloud)"** and its content becomes: organization/folder/project layout, Organization Policies, Cloud Identity and Workload Identity Federation, CIDR plan, Private Service Connect/NAT/egress IPs, origin lockdown, security services (Audit Logs, Security Command Center, Asset Inventory, Artifact Analysis), labeling standard, budgets, and a **service-quota registry** for GCP and third parties (Cloud Run instances/CPU/memory per region, Cloud SQL connections, Vertex AI quotas for each Claude/Gemini model and endpoint type, KMS, Pub/Sub, Cloudflare custom hostnames, ClickHouse inserts, Paddle/BoldSign/email/LLM rate limits) with the proactive increase plan.
- Apply the translation to Brief B5 items §1.1 diagram labels, §2.1 rows, §3 (content tiering → Cloud Storage), §5.3 key hierarchy, §5.4 secrets, §8.1–§8.10, §10, §11 (repo tree keeps `infra/` modules `foundation`, `control-plane`, `cell`, `edge`, `observability`), §12 Phase 0a (GCP organization/folders/projects instead of AWS organization/accounts), and every §13 rule that names S3, KMS, ECS, Redis eviction, health checks or Fly/AWS mechanics (STORE-001/002, PAY-002/003, INFRA-001…004, GDPR-002, BOLD-002, PDF-003).
- §8.4 local development: replace the MinIO compose entry as the Brief already requires; use a local S3-compatible or GCS-compatible emulator **only** for plumbing tests, and state that Object Retention Lock behavior is proven only against real Cloud Storage in a throwaway bucket with the shortest allowed retention (**[VERIFY]** minimum). Add a local `KeyProvider` adapter; Memorystore-equivalent Redis roles; Mailpit.

---

## A4. Additional verification list (V-21 … V-39)

Same rules as Brief B7: official documentation only; log in Appendix C; unverifiable → `[VERIFY]` + `OPEN_VERIFICATIONS.md`.

- **V-21 Cloud Run:** WebSocket behavior and limits (request timeout, session affinity, instance shutdown/SIGTERM grace), CPU-always-allocated, concurrency, minimum instances, Direct VPC egress, static egress through Cloud NAT, maximum memory/CPU for Chromium, second-generation execution environment, disabling default URLs, ingress controls.
- **V-22 Cloud Run worker pools:** GA status, regions, scaling with external metrics (Pub/Sub, Prometheus/BullMQ metrics), pricing, Terraform support, private networking.
- **V-23 Cloud SQL for PostgreSQL (and AlloyDB):** PostgreSQL 17/18; extensions (`pgvector`, `pg_trgm`, `pg_partman`, `pg_cron`, `pgaudit`); Enterprise vs Enterprise Plus (in-place upgrade, limits, SLA); read-replica count; cross-region replicas/backups; managed connection pooling; failover time; private connectivity; IAM database authentication; major-version upgrade options. AlloyDB: price floor, features, HA model.
- **V-24 Memorystore:** Valkey/Redis versions; persistence; HA failover loss window; `noeviction`; standalone vs cluster for BullMQ; private connectivity; Terraform.
- **V-25 Cloud Storage:** Object Retention Lock (Locked) and Bucket Lock semantics; per-object retention at upload; interaction with versioning/soft-delete; dual-/multi-region locations for US/EU; CMEK; signed POST content-length limits; project-deletion lien behavior; minimum retention for tests; costs.
- **V-26 Cloud KMS:** locations (multi-region), AAD support, quotas, key-version pricing, destruction waiting period, organization-policy constraints, envelope-encryption libraries (Tink).
- **V-27 Pub/Sub → ClickHouse:** ClickPipes sources vs custom batcher, ordering/dedupe, costs.
- **V-28 ClickHouse Cloud on GCP:** US and EU regions, private connectivity, tier upgrade path, HIPAA availability, Terraform provider.
- **V-29 Networking/edge:** External ALB + Cloud Armor + Cloudflare origin lockdown options (IP allowlist, mTLS, header), Private Service Connect, Cloud NAT static IPs, VPC Service Controls applicability, PDF-worker egress enforcement.
- **V-30 Organization/IAM:** Organization Policy constraint names, Workload Identity Federation for GitHub, Assured Workloads (EU sovereignty), Access Transparency, Cloud Audit Logs sinks with locked retention.
- **V-31 Compliance:** Google Cloud BAA covered-products list (Cloud Run, Cloud SQL, Cloud Storage, KMS, Memorystore, Pub/Sub, Vertex AI incl. partner models); Security Command Center tiers; Vanta GCP integration.
- **V-32 Billing/credits:** current new-customer credit terms; Google for Startups Cloud Program eligibility; billing-account support for the owner's country and card; whether credits apply to Claude-on-Vertex usage; interaction between credits and committed spend.
- **V-33 Claude on Vertex AI:** models available per endpoint type (global, regional, multi-region) and region; per-model quotas (RPM/TPM) and the increase process; provisioned throughput; supported features (tool use, structured output, prompt caching, batch, PDF/vision, long context); data-processing and residency commitments for partner models; retention/zero-data-retention terms; pricing vs the direct API; model-ID format; deprecation schedule; need to enable models in Model Garden.
- **V-34 Anthropic direct API:** rate-limit tiers; data-residency controls (workspace geo, inference geo); retention/ZDR terms; Batch API; prompt caching; usage/cost reporting; feature parity with Vertex; model deprecation policy; DPA/BAA.
- **V-35 Gemini on Vertex AI and OpenAI:** model catalog, embedding models/dimensions/regions, data terms, batch, structured output, regional endpoints; OpenAI data controls and regions; optional Azure OpenAI path.
- **V-36 Embeddings:** Anthropic offers no embedding model (verified); compare Vertex AI embeddings vs Voyage AI (data location, DPA, regions, models, dimensions, pricing, multilingual and legal-text quality).
- **V-37 GenAI observability and evals:** OpenTelemetry GenAI semantic-convention status; evaluation tooling options (open-source vs managed) and their data handling.
- **V-38 Secondary email provider:** Postmark/SendGrid/Mailgun sending-domain limits, EU regions, rate limits, BAA, bounce/complaint events, dedicated-IP/warm-up.
- **V-39 IaC:** Terraform/OpenTofu `google` provider coverage for every service used; GCS state locking; module patterns for instantiating cells as projects.

## A5. Additional acceptance checks (GCP)

**Greps — zero matches in §0–§20 outside ADRs and the Change Log:** `AWS|Amazon|\bECS\b|Fargate|\bALB\b|Aurora|\bRDS\b|ElastiCache|MemoryDB|\bS3\b|Object Lock|Secrets Manager|\bECR\b|CloudWatch|CloudTrail|GuardDuty|Security Hub|\bSES\b|Kinesis|\bSQS\b|EventBridge|IAM Identity Center|\bSCPs?\b|NAT [Gg]ateway|Parameter Store|FireLens|DynamoDB|Lambda|Express Mode`.

- **C-25** ADR-0001 states Google Cloud-only hosting with the verified rationale and the five trade-offs (A1).
- **C-26** Every row of the A2 translation table is applied; no untranslated AWS construct remains.
- **C-27** §15 is retitled "Cloud Foundation (Google Cloud)" and contains the folder/project layout, Organization Policy list, CIDR plan and GCP/third-party quota registry.
- **C-28** ADR-0037 compares Cloud SQL and AlloyDB with a Phase-0 cost comparison and records the decision rule in A3-D05.
- **C-29** ADR-0036 records the Cloud Run WebSocket verification and either confirms Cloud Run or selects GKE Autopilot now.
- **C-30** Evidence storage uses Object Retention Lock (Locked) with the retention matrix, including locked-bucket deletion constraints.
- **C-31** The key hierarchy uses Cloud KMS multi-region locations where ciphertext replicates; no per-tenant CMK by default.
- **C-32** ADR-0038 selects the secondary email provider; no SES reference remains.
- **C-33** The cost report is rewritten for GCP (including Vertex AI usage) and states the Postgres-floor difference.
- **C-34** IaC section names the `google`/`google-beta` providers, GCS state with locking, Workload Identity Federation, and Artifact Registry.

---

## A6. AI Platform Architecture — replaces Brief D-17; amends D-11 (embeddings) and D-23

**Goal.** Claude is the primary model family today. Gemini, OpenAI or any other model can be added, swapped or used for specific tasks later **by configuration and a new adapter only — no change to application code, schemas or contracts.** Build the AI layer the way a mature software company builds an internal AI platform: a gateway, a model registry, a prompt registry, an evaluation harness, guardrails, cost controls and observability.

### A6.1 Principles (state in new §20)
- **P1 Contract-first.** Application code calls the `AiGateway` with a **task ID**. It never names a provider, model or SDK (extends ADP-001).
- **P2 Config over code.** Model registry, routing policy and prompt versions are versioned, schema-validated configuration. Changing a model is a configuration release.
- **P3 Eval-gated.** No prompt, model or routing change reaches production without passing that task's evaluation and red-team suites.
- **P4 Pin and track.** Production routes use pinned model IDs, never floating "latest". A deprecation calendar is maintained.
- **P5 Data-class and jurisdiction routing.** Every call carries a required data class and jurisdiction; routing can only choose compliant paths, including during failover.
- **P6 Untrusted content.** Customer documents are data, never instructions.
- **P7 Budgeted and metered.** Token caps, per-tenant budgets and cost attribution on every call.
- **P8 Resilient.** Timeouts, retries, circuit breakers, bulkheads; same-model multi-path failover before cross-vendor failover.
- **P9 Observable.** Standard GenAI telemetry; no tenant labels on metrics; content logging off by default.
- **P10 Additive extensibility.** New providers, models and modalities arrive as adapters, registry entries or new ports — never by editing callers.
- **P11 AI never gates core flows** (I-12). Sending, signing, paying and viewing work when AI is down.
- **P12 Human in the loop** for anything that reaches a recipient (AI-002).

### A6.2 Ports and adapters
- **`AiGateway`** (application-facing, task-level): `run`, `stream`, `batch`. Orchestrates routing, budgets, guardrails, context building, caching, fallback, validation and logging.
- **`LlmPort`** (provider-level): `generate`, `stream`, token counting, capability discovery, **normalized errors**.
- **`EmbeddingPort`**: `embed(texts, kind)` returning vectors plus `embedding_model_id` and `dimensions`.
- **`DocumentParsePort`**: OCR/layout/field extraction (adapters: multimodal LLMs; Google Document AI as an option — **[VERIFY]**).
- **Optional ports, added later without touching callers:** `ModerationPort`, `RerankPort`, `SpeechPort`, `ImagePort`.
- **Adapters:** `AnthropicVertexAdapter`, `AnthropicDirectAdapter`, `GeminiVertexAdapter`, `OpenAiAdapter` (optional Azure path), `VertexEmbeddingAdapter`, optional `VoyageEmbeddingAdapter`, optional `DocumentAiAdapter`. **Provider SDK imports are allowed only inside adapter packages** (lint-enforced).
- **Placement.** `libs/ports` + `libs/ai`. The gateway runs inside `api` (interactive/streaming) and `worker-ai` (async/batch). The contract is transport-agnostic so the gateway can later run as its own internal service per cell (a capacity switch) without changing callers.

Illustrative contract (put in §20; adapt, do not copy blindly):

```typescript
interface AiRequest<TIn> {
  task: TaskId;                         // 'editor.draft' — never a model name
  tenant: { organizationId: string; cell: string; jurisdiction: string };
  actor: { userId?: string; apiKeyId?: string; system?: boolean };
  input: TIn;                           // provider-neutral parts: text, document refs, images
  responseSchema?: JsonSchema;          // structured-output contract (generated from Zod)
  latencyClass: 'interactive' | 'async' | 'batch';
  requiredDataClass: 'DC1' | 'DC2' | 'DC3';
  idempotencyKey?: string;
  traceId: string;
}
interface AiResult<TOut> {
  output: TOut;
  usage: { inputTokens: number; outputTokens: number; cachedInputTokens?: number; costUsd: number };
  route: { modelAlias: string; accessPath: string; promptVersion: string; fallbackDepth: number };
  finish: 'complete' | 'length' | 'refusal' | 'filtered' | 'error';
}
```

### A6.3 Model registry
- **Authoritative copy in the control plane** (versioned, signed, schema-validated); cells keep a boot-time snapshot plus TTL cache. Never fetched synchronously on the request path. Per-model/path/task/tenant **kill switches**.
- **Fields per entry:** `alias`; `provider`; `adapter`; `access_path` (e.g., `anthropic-vertex`, `anthropic-direct`, `gemini-vertex`, `openai-direct`); `provider_model_id` (pinned; the format differs by path — Vertex IDs use their own format, for example a name with an `@<date>` suffix); region/endpoint type (global, regional, multi-region); `capabilities` (tools, structured output, vision, PDF, streaming, prompt cache, batch, max context, max output); `pricing` (input/output/cache read/write per million tokens, effective date); `quotas` (RPM/TPM per project/region); **data-class ceiling** (DC1–DC3) and **processing jurisdictions**; `status` (candidate → shadow → canary → active → deprecated → sunset, with sunset date); eval scorecard per task; known limitations; owner.
- **Aliases are semantic tiers** (`fast`, `balanced`, `max`, `long-context-multimodal`, …) mapped to concrete models per path. Tasks reference tiers; upgrading a tier is a registry change.

### A6.4 Task catalog and routing policy
**Task catalog** (new §20 table; one row per task; owner module, latency class, quality tier, required capabilities, data-class floor, input/output schemas, token caps, cache policy, route chain, eval-suite ID, budget class, human-in-the-loop requirement). Seed from product spec §5.10 and Phases 2–4:

| Task ID | Purpose | Latency | Default tier | Notes |
|---|---|---|---|---|
| `editor.draft` | Write from a prompt | interactive (stream) | balanced | AI-002 draft/accept |
| `editor.refine` / `editor.grammar` / `editor.condense` | Rewrite, fix, shorten a selection | interactive | fast / balanced | |
| `content.from_notes` | Call notes/transcripts → content | async or interactive | balanced | |
| `section.generate` | Executive summary, cover letter, SOW sections | interactive/async | balanced | |
| `proposal.assemble` | Guided proposal builder with CRM data | async | balanced → max | Phase 3 |
| `extract.fields` | AI data extraction (100+ fields, multi-language) | async/batch | balanced → max | structured output; confidence |
| `classify.doctype` | Document-type detection | async | fast | structured output |
| `ocr.parse` | Scanned-document parsing | async | `DocumentParsePort` | Phase 3 |
| `obligation.extract` | Renewal/deadline extraction | async | max | PORT-001 human confirm |
| `search.nl_to_filter` | Natural language → structured query | interactive | fast | |
| `assistant.chat` | Conversational assistant with tools | interactive (stream) | balanced → max | Phase 4; tool rules A6.7 |
| `url_to_draft` | Public no-login tool | interactive | fast/balanced | **DC0 only**; strict abuse limits |
| `translate.document` | Content translation | async | balanced | Phase 4 |
| `embed.document` / `embed.query` | Embeddings | async / interactive | pinned index | A6.6 |

**Routing policy.** Versioned YAML/JSON validated by schema: per-task default chains; per-plan, per-jurisdiction/cell and per-tenant overrides; canary/shadow rules; `allow_cross_vendor` per task. **Algorithm:** filter registry entries by capability ⊇ task requirements ∧ data class ≥ required ∧ jurisdiction allowed ∧ status active ∧ circuit closed ∧ budget available → order by policy preference → apply canary/shadow → choose first → keep the rest as the failover chain. Every decision stores an `explain` record (why this route). A dry-run tool shows routing for any request without calling a provider.

**Default policy today:** all generation tasks prefer **Claude** (Haiku/Sonnet/Opus-class by tier), **accessed through Vertex AI** on GCP cells, with the direct Anthropic API as the second path; Gemini and OpenAI sit later in each chain only where that task's evals approve them. Strict-schema tasks keep `allow_cross_vendor: false` until their eval suite passes on the candidate.

### A6.5 Access paths and failover ladder
Order of fallback (each step must satisfy data class, jurisdiction, capability and budget):
1. **Same model, other access path** (Vertex ↔ direct Anthropic) — identical behavior, no eval risk.
2. **Same vendor, other tier** — only if the task allows downgrade/upgrade.
3. **Approved cross-vendor model** — only if its eval score for the task meets the threshold and its schema is compatible.
4. **Graceful degradation** — feature shows "unavailable"; async work re-queues with backoff.

**Error taxonomy → action:** `rate_limited`, `overloaded/capacity`, `timeout`, `provider_5xx` → retry then fail over; `auth/config` → alert, no failover; `context_too_long` → route to a larger-context model; `refusal/filtered` → log and surface; fail over only if policy allows; `schema_invalid` → one bounded repair retry, then fail over. **Streaming:** failure before the first token → fail over; mid-stream → surface the error and offer retry (no silent splice of two models' output). **Jurisdiction:** an EU-required call may fail over only to a path with verified EU processing.

### A6.6 Embeddings
- **Anthropic offers no embedding model** (verified in Anthropic's documentation, which points to Voyage AI as its recommended partner). Embeddings therefore always come from a different provider than Claude.
- ADR-0031 chooses between **Vertex AI embeddings** (default: same project, IAM, region and DPA — **[VERIFY]** models/dimensions/regions) and **Voyage AI** (evaluate on legal-text and multilingual retrieval; adds a sub-processor).
- **Rules:** one pinned model per vector index; `embedding_indexes` registry (model ID, dimensions, metric, normalization, chunking version, status building/active/retiring); every vector row references its index; **no cross-provider fallback**; model upgrades = new index built in the background (dual-write) → cutover by config → retire the old one; queries use the same index model; tenant filters + RLS on every retrieval.

### A6.7 Prompts, structured output, tools, caching, batch
- **Prompt registry:** `libs/ai/prompts/<task>/<semver>/` with system prompt, user template, output schema and metadata. **No inline prompts in application code.** Typed variables; locale handling; per-provider variants only when an eval justifies them. Every production call records the prompt version and hash.
- **Structured output:** schemas generated from Zod. Adapters use native structured-output/forced-tool mechanisms where the capability flag allows, otherwise prompt + strict parse. **Never trust unvalidated output:** validate → one bounded repair retry → fail over.
- **Tool use:** provider-neutral tool definitions; tools execute server-side under the user's CASL permissions, tenant scoping and per-run step/time/cost limits; **side-effecting tools require explicit user confirmation**; tool results are untrusted content; every tool call is audit-logged.
- **Determinism:** temperature and similar parameters belong to the task policy, not callers.
- **Prompt caching:** put the static prefix first; use provider cache controls through capability flags (supported on Vertex via cache control — verified); track hit rate. **Batch:** non-interactive bulk work (bulk extraction, backfills, re-embedding) uses provider batch APIs where supported (**[VERIFY]**).

### A6.8 Context assembly, retrieval and prompt-injection defense
- The context builder separates **trusted** system policy and task instructions from **untrusted** retrieved/user content, which is delimited and labeled. Untrusted content never enters the system prompt.
- Indirect prompt-injection defenses: separate "reader" tasks (no tools) from "actor" tasks (tools); no tool call triggered solely by content-embedded instructions; action allowlists; output scanning; rate limits; a red-team suite run on every model/prompt change.
- **Retrieval is tenant- and permission-scoped:** RLS + organization filter + CASL grant filters applied *before* retrieval; AI-003 guardrails (excluded workspaces/data sources) enforced pre-retrieval; citations carry source IDs; never include a document the requesting user cannot read; **no cross-tenant retrieval or cache sharing, ever.**
- PII minimization: configurable redaction/pseudonymization and field exclusions before sending, driven by data class. Output is a draft (AI-002); sanitize rendered Markdown/HTML; never auto-fetch links or auto-execute.

### A6.9 Data governance, jurisdictions, logging
- **Data classes:** **DC0** no customer content · **DC1** customer content, provider contractually barred from training on it, standard provider retention for abuse monitoring allowed · **DC2** customer content with zero/minimal retention terms and jurisdiction-pinned processing · **DC3** regulated/PHI, BAA-covered path only. Each registry path declares its ceiling; each task declares a floor; each tenant/cell declares a required class; the highest applies.
- **Jurisdiction:** each path declares verified processing jurisdictions. **Verified nuance for Claude on Vertex AI:** the *global* endpoint routes dynamically and gives no residency guarantee; *regional* endpoints guarantee routing through specific regions and are required for residency; multi-region endpoints are in preview; partner-model data at rest stays in the selected region/multi-region, but **processing regionalization may vary** — record Google's partner-model data-processing commitments per model in the registry. **EU cells use regional/multi-region endpoints only.** On third-party platforms the inference region is set by the endpoint, so Anthropic's own inference-geo parameter does not apply there.
- **Contracts:** DPAs and the sub-processor list updated for Anthropic, Google, OpenAI and the embeddings provider; written confirmation that customer content is not used for training (this replaces AI-001's fictional header); **[VERIFY]** zero-data-retention availability per path.
- **Logging:** `ai_task_runs` stores metadata only (task, route, prompt version/hash, tokens, latency, cost, status, hashes). **Prompt/response content logging is off by default**, enabled per tenant (opt-in) or per debug session with TTL and redaction. No content in Sentry or Grafana. All AI tables are in the data manifest and covered by erasure/export.
- **Caches:** tenant-scoped keys, TTL, invalidated on prompt/model change, erased with the tenant.
- **Transparency:** publish the list of AI features, providers and data handling; admin settings (AI-003) expose it.

### A6.10 Cost, quotas and budgets
- **Per-call caps:** maximum input/output tokens per task. **Per-tenant monthly AI credits** in an `ai_credit_ledger`, linked to plan entitlements (D-14): soft-threshold notifications, then a hard stop with an upgrade CTA (BILL-002 style) or, if the policy says so, automatic downgrade to the `fast` tier. Per-task budget classes. Provider-level spend alarms.
- **Cost attribution** per call (registry pricing × usage), reconciled monthly against provider invoices.
- **Savings levers:** dedupe in-flight identical requests; response cache for deterministic, idempotent tasks (tenant-scoped); prompt caching; batch APIs for bulk work; right-size tiers by eval results.
- **Provider rate limits:** global buckets per path/project/region (RPM/TPM) with priority classes (interactive > async > batch) plus per-tenant token buckets (QUOTA-001 fairness); queueing with backpressure. Each cell is a separate GCP project, so quotas are independent per cell — request increases proactively (§15 quota registry, V-33).

### A6.11 Reliability and fairness
- Timeouts per latency class; retries with exponential backoff + jitter, only for retryable errors and idempotent calls.
- **Circuit breaker per (path, model, region)** with half-open probes; state in the Redis `cache` role so every instance agrees.
- **Bulkheads:** a dedicated concurrency pool per provider path in `worker-ai`; one provider's incident never starves another.
- Async jobs are idempotent (idempotency keys), with DLQ and replay; poison-message handling.
- **Synthetic canary prompts** per path every few minutes feed routing health.
- Kill switches per model, path, task and tenant (A6.3). AI features degrade independently of the product (P11).
- SLIs/SLOs: AI-feature availability, time-to-first-token p95, completion p95, schema-validity rate, fallback rate.

### A6.12 Observability and evaluation
- **Telemetry:** OpenTelemetry GenAI semantic conventions where stable (**[VERIFY]** status). One span per gateway call and per provider attempt with: task, alias, access path, region, prompt version, tokens (in/out/cached), cost, finish reason, fallback depth, validation result. **Metrics carry no tenant labels**: calls, latency (TTFT, total), tokens, cost, errors by class, fallback rate, refusal rate, schema-failure rate, cache-hit rate — per (task, alias, path). Per-tenant analytics come from `ai_task_runs`. Alerts: error-budget burn, cost anomaly per task/path, quota saturation, fallback spike, eval regression.
- **Evaluation harness:** per-task golden datasets (synthetic + anonymized/consented, versioned, held in a restricted bucket and registered in the manifest). Metrics per task: schema validity, field-level accuracy for extraction, rubric scores via LLM-as-judge calibrated against human labels (the judge runs on a different model/path than the candidate where feasible), latency and cost. Pass thresholds per task.
- **Gates:** CI gate on every prompt/model/routing change; nightly regression run on production routes; online signals from AI-002 (accept/insert/reject, edit distance after insertion, thumbs) feed dashboards; drift alarms; **red-team suites** (prompt injection, cross-tenant leakage, PII leakage, jailbreaks, harmful content) run on every model or prompt change.
- **Shadow and canary:** shadow-run a candidate route on a sampled fraction (no user impact) and compare; canary by percentage per cohort; automatic rollback on SLO or eval regression.

### A6.13 Tenant controls and bring-your-own credentials
- **Entitlements:** AI on/off, allowed tasks, monthly credits, allowed data classes/jurisdictions, and a **provider allow/deny list per organization** (extends AI-003's workspace/data-source exclusions) for customers who forbid specific vendors.
- **Enterprise BYO credentials/endpoint** (designed now, shipped later): `tenant_ai_credentials` stored through the `CredentialVault` (D-09) with PAY-001…003 audit rules; per-call credential injection; a `tenant_managed_path` routing flag; usage metered but outside the credits ledger.
- AI authorship is recorded (AI-002) with the model alias; recipients never see it.

### A6.14 Change management for models and prompts
- **Lifecycle:** candidate → shadow → canary → active → deprecated → sunset. A deprecation watch (provider announcements) opens tickets. **At least one tested alternative route exists for every task at all times** — no single-path dependency.
- **Release checklist:** registry entry (capabilities, pricing, quotas) · data class and jurisdiction verified · eval pass · red-team pass · cost projection · shadow run · canary plan · rollback plan · sub-processor/DPA documentation updated.
- **Adding a provider** = adapter package + registry entries + the shared adapter-conformance contract tests + legal review + eval onboarding. **No change to callers.**
- A **model card** for each production route: purpose, data class, jurisdictions, eval scores, limitations, owner, next review date.

### A6.15 Operating model (lightweight for a solo owner, still professional)
Maintain an AI change log; a quarterly vendor review checklist (security, DPA/BAA, retention terms, regional commitments, price, deprecations); an incident playbook for AI failures (harmful/wrong output, suspected leakage, provider outage, runaway cost) built on the kill switches; documented human review for obligation extraction (PORT-001); periodic red-teaming; evidence retained for SOC 2.

### A6.16 Data-model additions (register all in the data manifest, Appendix E)
- **Cell:** `ai_task_runs` (partitioned; metadata only; includes `route_explain`), `ai_credit_ledger` (partitioned), `ai_feedback`, `ai_tenant_settings` (or schema-validated org settings), `tenant_ai_credentials` (vault-backed), `embedding_indexes`, response-cache entries (Redis, or a table if needed).
- **Control plane:** `ai_model_registry`, `ai_routing_policy_versions`, `ai_kill_switches`.
- **Internal/evaluation:** `ai_eval_runs`, `ai_eval_results` (separate from tenant data; datasets classified and access-restricted).
- Classification: `ai_task_runs` is operational and pseudonymous; **content is never stored by default**.

### A6.17 Rules (write each in full rule format: Scenario / Risk / Implementation / Module / Phase / Test)
- **AI-004** Task-based invocation only — no provider/model names or SDKs outside adapters and the registry (lint + grep test).
- **AI-005** Pinned model versions; deprecation handling and tested alternatives.
- **AI-006** Eval-gated prompt/model/routing changes.
- **AI-007** Data-class and jurisdiction routing, including failover.
- **AI-008** Budgets, quotas, credits and fair scheduling.
- **AI-009** Untrusted-content and prompt-injection controls.
- **AI-010** AI logging, retention and erasure (content off by default).
- **AI-011** Resilience and the fallback taxonomy (no silent mid-stream splice).
- **AI-012** Embeddings pinned and versioned (no cross-provider fallback).
- **AI-013** Structured-output validation with bounded repair.
- **AI-014** Tenant isolation in retrieval and caches.
- **Amend:** AI-001 (verified provider terms and DPAs; no header mechanism), AI-002 (authorship type; all tasks via the gateway), AI-003 (provider allow/deny; all entry points via the gateway), ADP-001 (AI SDKs), QUOTA-001 (AI quotas), GDPR-002 (regional endpoints; partner-model processing commitments).

### A6.18 New §20 and ADRs
- **§20 "AI Platform Architecture"** contains A6.1–A6.15 as sections, the task catalog and policy format, and three diagrams: (1) request flow — caller → `AiGateway` → [routing → budget → guardrails/context builder → cache → adapter/path → provider] → validation → logging; (2) failover ladder; (3) model lifecycle.
- **§19 vendor matrix** adds Anthropic (direct API), Google Vertex AI (Claude, Gemini, embeddings; Document AI as an option), OpenAI, Voyage AI (option) and the secondary email provider — each with port, adapter, lock-in level, **exit path without data migration**, binding limits, regions, DPA/BAA, verification date.
- **Update D-23's sub-processor matrix** with every AI provider path and its data class.
- **ADRs:** 0028 AI gateway and ports · 0029 model registry and routing policy · 0030 Claude access paths (Vertex vs direct) and failover · 0031 embedding provider · 0032 prompt registry, structured output and tool use · 0033 AI data classes and governance · 0034 AI cost and quota controls · 0035 AI observability and evals · (from A1/A3) 0036 Cloud Run vs GKE Autopilot · 0037 Cloud SQL vs AlloyDB · 0038 secondary email provider · 0039 control-plane datastore on GCP.

### A6.19 Phase placement (nothing later may require restructuring Phase-0a contracts)
- **Phase 0a:** AI ports in `libs/ports`; `AiGateway` skeleton; registry and routing-policy schemas; prompt-registry layout; `ai_task_runs` and manifest registration; Claude adapters (Vertex + direct) with contract tests; `EmbeddingPort` + `embedding_indexes`; credits-ledger tables; telemetry hooks; eval-harness skeleton; data-class model; kill switches. **No AI feature ships in 0a.**
- **Phase 2:** in-editor AI (`editor.*` tasks) through the gateway; pgvector retrieval; evals for those tasks; credits enforcement.
- **Phase 3:** guided proposal builder, AI data extraction, OCR (`DocumentParsePort`), portfolio-intelligence tasks, batch paths.
- **Phase 4:** conversational assistant (tools), MCP connector, translation, BYO credentials generally available.

### A6.20 AI acceptance checks (Phase 5 audit)
- **C-35** §20 exists with A6.1–A6.15 content, the three diagrams, the task catalog and the policy format.
- **C-36** Provider/model names (`claude|gemini|gpt|openai|anthropic|vertex|voyage`) appear only in §19, the §20 registry seed, adapter descriptions and ADRs — never in feature/rule text.
- **C-37** `AiGateway`, `LlmPort`, `EmbeddingPort`, `DocumentParsePort` contracts documented with the illustrative interface.
- **C-38** Registry schema complete (all A6.3 fields), control-plane storage, cell cache, kill switches.
- **C-39** The task catalog covers every AI feature in product spec §5.10 and Phases 2–4.
- **C-40** Failover ladder, error taxonomy and streaming behavior documented; data-class/jurisdiction constraints apply to failover.
- **C-41** Embeddings: provider decision, pinned/versioned index registry, re-embedding procedure, and the statement that Anthropic has no embedding model.
- **C-42** Prompt registry layout and versioning; structured-output validation; tool-use rules.
- **C-43** Untrusted-content/prompt-injection section with the red-team requirement.
- **C-44** Data classes DC0–DC3, per-path jurisdiction declarations, the EU rule (regional/multi-region endpoints only), logging/retention/erasure rules.
- **C-45** Cost controls: ledger, caps, provider rate-limit buckets, fairness.
- **C-46** Observability and evaluation harness with CI gates, shadow/canary and red-team.
- **C-47** Tenant controls, provider allow/deny, BYO-credentials design.
- **C-48** AI-004…AI-014 written in full rule format; AI-001/002/003, ADP-001, QUOTA-001, GDPR-002 amended.
- **C-49** AI tables' DDL added and registered in the manifest with classifications.
- **C-50** Phase placement is in §12 and no later phase restructures Phase-0a contracts.
- **C-51** The §19 vendor matrix covers every AI provider and the embeddings provider(s).
- **C-52** The registry seed is present, labeled illustrative, with `[VERIFY]` on model IDs, availability and quotas.

### A6.21 Illustrative registry seed (becomes production routing only after evals pass)

| Alias | Primary path | Second path | Later in chain (only if eval-approved) | Typical tasks |
|---|---|---|---|---|
| `fast` | Claude Haiku-class via Vertex AI | same model via direct Anthropic API | Gemini Flash-class (Vertex AI) | classify, grammar, `nl_to_filter` |
| `balanced` | Claude Sonnet-class via Vertex AI | same model via direct API | Gemini Pro-class (Vertex AI) → OpenAI general model | draft, refine, extract, proposal |
| `max` | Claude Opus-class via Vertex AI | same model via direct API | Sonnet-class | `obligation.extract`, assistant |
| `long-context-multimodal` | evaluate Gemini (Vertex AI) vs Claude PDF/vision | — | — | `ocr.parse`, scanned documents |
| `embed.v1` | Vertex AI embedding model (pinned) or Voyage AI per ADR-0031 | none | none | embeddings |

Current Claude model IDs on the direct API at the time of this brief: `claude-haiku-4-5-20251001`, `claude-sonnet-5-5`, `claude-opus-5-5` (a higher-capability tier also exists). Vertex AI uses a different ID format. **[VERIFY]** availability, regions, quotas and IDs per path; Gemini and OpenAI IDs also **[VERIFY]**. Model IDs live only in this seed and the registry.

---

## A7. Facts verified by the addendum author (replace the AWS facts in the Brief's appendix; re-verify before relying)

As of 2026-10-04, from vendor documentation found during research:
- **Claude on Vertex AI:** generally available; Anthropic's SDKs support Vertex; global endpoint (dynamic routing), regional endpoints (routing guaranteed through specific regions) and multi-region endpoints (preview) for partner models; partner-model data at rest stays in the selected region/multi-region while processing regionalization may vary; Vertex AI certifications continue to apply to partner models; prompt caching is supported through cache control; models must be enabled in Model Garden and are not available in every region.
- **Anthropic:** no first-party embedding model; Voyage AI is its recommended embeddings partner. On third-party platforms the inference region is determined by the endpoint.
- **Cloud Run:** services, jobs and **worker pools** exist; worker pools target non-HTTP, continuously running, pull-based workloads and have documented autoscaling with external metrics; WebSocket streaming is documented for services.
- **AlloyDB:** PostgreSQL-compatible with pgvector (HNSW); no free tier; read pools; 2-vCPU minimum node; priced above Cloud SQL (third-party comparisons — re-verify). **Cloud SQL:** Enterprise and Enterprise Plus editions with different ceilings (about 96 vCPU / 624 GB and 128 vCPU / 864 GB per a third-party source — re-verify).
- **Cloud Storage:** Bucket Lock is permanent; **Object Retention Lock** (Locked mode) permanently prevents shortening or removing an object's retention; a bucket with retained objects cannot be deleted until they expire; a project-deletion lien is applied on a best-effort basis.
- **Cloud KMS:** software key version about US$0.06/month; HSM US$1.00–2.50; about US$0.03 per 10,000 operations; admin and rotation operations free.
- **Carried over from the Brief (cloud-independent):** MinIO prebuilt Docker images discontinued October 2025 and repository archived 2026-04-25; Cloudflare R2 bucket locks are removable retention rules, not Compliance-mode WORM.
- **No longer applicable:** all AWS price/limit facts in the Brief's appendix — delete them.

## A8. Additional questions for `QUESTIONS_FOR_OWNER.md` (state a default; do not block)

14. GCP regions for the US and EU cells; does the owner's country and card work for Google Cloud billing; which credits or startup program apply (and do they cover Claude-on-Vertex usage)?
15. Claude access: Vertex AI as the default path with direct Anthropic API as second path (default), or the reverse? Any customer-contract reason to prefer one?
16. Which AI data class (DC1/DC2) the first customers need, and any customers who forbid specific AI vendors.
17. Monthly AI budget ceiling and the credits model per plan.
18. Evaluation datasets: sourcing, consent and anonymization policy; who reviews labels.
19. Enterprise BYO-credentials for AI: yes/no and timing.
20. Embeddings: keep everything inside Google (Vertex embeddings, default) or add Voyage AI as a sub-processor?
21. Secondary email provider preference (Postmark, SendGrid or Mailgun).
22. Phase-0 database budget ceiling (decides Cloud SQL vs AlloyDB per A3-D05).

---

**End of Addendum A.** When all phases are complete, extend the Brief's final report with: (5) the AI routing defaults and their eval status, (6) the Cloud SQL vs AlloyDB cost comparison, (7) the Cloud Run vs GKE decision with the WebSocket verification evidence.
