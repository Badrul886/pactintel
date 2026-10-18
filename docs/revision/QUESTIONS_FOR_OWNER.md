# Questions for Owner — Architecture v2.0.0

**Document:** `docs/revision/QUESTIONS_FOR_OWNER.md`  
**Created:** 2026-10-08  
**Answered:** 2026-10-17  
**Owner:** System Architect  
**Purpose:** Policy and product decisions that cannot be resolved by engineering alone. Each question must be answered by the owner before the associated Phase begins.

---

## Priority Legend

- 🔴 **P0 — Blocks Phase-0a** — must be answered before any IaC or code is written
- 🟡 **P1 — Blocks Phase-0b** — must be answered before product code begins
- 🟢 **P2 — Blocks Phase 1 or later** — can be deferred but must not be left unanswered past the stated phase gate

---

## Open Questions

_(All questions answered. See "Answered Questions" table and full answers below.)_

---

## Answered Questions

| Q   | Summary                              | Answer                                                                                                                                                                                                          | Date       |
| --- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Q1  | GCP Organization & Billing Structure | New GCP Org under `pactintel.com`. Structured folder hierarchy: shared-services, security, control-plane, cells. Single billing account with per-folder budget alerts.                                          | 2026-10-17 |
| Q2  | Initial GCP Region Pair              | `us-central1` primary, `us-east4` DR pilot-light. Confirmed. Cloud KMS multi-region key: `us`. VPC: `10.10.0.0/16`.                                                                                             | 2026-10-17 |
| Q3  | EU Cell Jurisdiction Scope           | `europe-west3` (Frankfurt) primary, `europe-west4` (Netherlands) DR pilot-light. All layers stay in EU. Cloud KMS multi-region key: `europe`.                                                                   | 2026-10-17 |
| Q4  | Dedicated Sending Subdomain          | `mail.pactintel.com` — permanent from Phase-0a. DMARC ramp: quarantine → reject at 30 days. Both Resend and secondary provider pre-verified against this subdomain.                                             | 2026-10-17 |
| Q5  | Recipient-Facing Document Domain     | `pact.link` — dedicated short domain, separate from `pactintel.com`. Lookup-free cell routing embedded in URL path. Permanent and immutable per I-08.                                                           | 2026-10-17 |
| Q6  | Cloudflare for SaaS Custom Hostnames | **Approved.** Cloudflare for SaaS subscription authorized for Phase 1. Graceful fallback to `pact.link` on misconfiguration — never a broken recipient page.                                                    | 2026-10-17 |
| Q7  | Per-Tenant CMEK                      | **No per-tenant CMK** until a confirmed Enterprise pipeline requires it as a contractual condition. Existing TK-based key hierarchy is sufficient through Phase 3. Re-evaluate trigger defined.                 | 2026-10-17 |
| Q8  | AI Model Approval Chain              | Tech lead approves prompt and task changes + model variants within an approved family. **Owner approval required** for new model families and provider adapter changes.                                         | 2026-10-17 |
| Q9  | ClickHouse Cloud Tier                | Single ClickHouse Cloud service per jurisdiction, separate databases per environment (`dev`, `staging`, `prod`). Separate US and EU services required by I-02 (not a cost decision).                            | 2026-10-17 |
| Q10 | Paddle Billing Currency              | **USD primary.** Paddle handles local tax and display-currency conversion natively. No multi-currency price objects in Phase-0b. Hard send-cap block policy (no silent overages).                               | 2026-10-17 |
| Q11 | PR Preview Environments              | **TTL-limited ephemeral Cloud Run revisions** with $3/day hard cost cap. Auto-destroy 24 h after last push or on PR close. Shared staging datastore — no per-PR database.                                       | 2026-10-17 |
| Q12 | SOC 2 Timeline                       | **Phase 3 as planned.** No current customer contract requires it earlier. Audit-log evidence accumulates from Phase-0a. Acceleration trigger: Enterprise deal with SOC 2 pre-condition → move Vanta to Phase 2. | 2026-10-17 |

---

## Full Answers (Detailed)

---

### Q1 — GCP Organization & Billing Structure 🔴

**Question:** What is the GCP organization structure? Do we create a new GCP Organization under a domain we own, or are we working under an existing one?  
**Impact:** Defines the `foundation` IaC module's starting point. The folder/project layout in Blueprint §8.1 assumes we own the organization.  
**Decision needed by:** Phase-0a start

**Answer (2026-10-17):**

We create a **new GCP Organization** rooted at the domain `pactintel.com`. We do not operate under an existing GCP organization. The folder/project layout is:

```
pactintel.com  (GCP Organization)
├── shared-services/      ← Terraform state GCS bucket, Artifact Registry, shared CI/CD SA
├── security/             ← Cloud Audit Log sink bucket (locked retention), Security Command Center
├── control-plane/        ← Tenant directory, billing authority, webhook router, login router
└── cells/
    ├── gcp-us1/          ← Phase-0 data plane (us-central1)
    └── gcp-eu1/          ← Phase-2 EU data plane (europe-west3)
```

**Billing account:** A single GCP billing account is attached to the organization. All projects are linked to it. GCP billing budget alerts are configured at 50 %, 80 %, and 100 % of the monthly budget per folder. The `control-plane` and each cell project have their own dedicated budgets so cost growth is attributable per layer.

**IAM strategy:** Organization-level policy bindings enforce mandatory constraints:

- `constraints/compute.requireShieldedVm` — all VMs (if any) must be Shielded
- `constraints/iam.disableServiceAccountKeyCreation` — no SA JSON keys (I-04, ADR-0001)
- `constraints/storage.uniformBucketLevelAccess` — no ACL-based bucket policies

Project-level IAM governs service-level roles. No human user accounts at the organization level — all human access uses Google Workspace identities in the `pactintel.com` domain.

**IaC starting point:** The `foundation` Terraform module is the first module run. It provisions: GCP org-level IAM bindings, folder structure, billing account linkage, organization policies, and the Terraform remote state GCS bucket (`pactintel-tf-state`) in the `shared-services` project. All subsequent modules (`control-plane`, `cell`, `edge`, `observability`) depend on `foundation` outputs.

**Decision basis:** Blueprint §8.1, §0.4, I-04, ADR-0001.

---

### Q2 — Initial GCP Region Pair 🔴

**Question:** Confirm the initial cell region and DR pilot-light region: `us-central1` (Iowa) as primary, `us-east4` (Northern Virginia) as DR pilot-light? Or different?  
**Impact:** Network CIDR plan, Cloud SQL replica region, ClickHouse Cloud region selection, Cloud KMS multi-region key location.  
**Decision needed by:** Phase-0a start

**Answer (2026-10-17):**

- **Primary cell region (`gcp-us1`):** `us-central1` (Iowa)
- **DR pilot-light region:** `us-east4` (Northern Virginia)

**Rationale:**

- `us-central1` has the broadest GCP service availability relevant to PactIntel: Cloud SQL Enterprise Plus, ClickHouse Cloud via GCP Marketplace, Vertex AI (Claude on Vertex), and Memorystore for Valkey. It is the default region for the majority of GCP-native AI services including the Anthropic model endpoint on Vertex AI.
- `us-east4` is the standard low-latency DR complement for `us-central1` — well-connected for US east-coast traffic and confirmed as a valid replication target for Cloud SQL.
- Cloud SQL read replica and PITR backups replicate to `us-east4`.
- Cloud KMS multi-region key location: **`us`** — covers both `us-central1` and `us-east4`, satisfying I-11 (no ciphertext crossing outside the multi-region boundary).
- Cloud Storage evidence buckets use the **`US`** multi-region location — WORM-locked evidence objects are durable across both regions from Day 1 without any capacity switch.
- ClickHouse Cloud service: provisioned in `us-central1` (the GCP region closest to the Iowa cluster). This is the in-jurisdiction analytics store for `gcp-us1`.
- The DR pilot-light is **not** a live running environment. It is a pre-provisioned IaC stub activatable by a configuration change (I-15): Cloud Run min-instances raised from 0, Cloud SQL replica promoted, Memorystore replica promoted. No data migration required for DR activation.

**Network CIDR plan (`gcp-us1` cell VPC):**

| Subnet                     | Range          |
| -------------------------- | -------------- |
| VPC primary                | `10.10.0.0/16` |
| Cloud Run serverless       | `10.10.1.0/24` |
| Cloud SQL private services | `10.10.2.0/24` |
| Memorystore                | `10.10.3.0/24` |
| Reserved expansion         | `10.10.4.0/22` |

**Decision basis:** Blueprint §0.3, §8, ADR-0001, ADR-0002, I-11, I-14, I-15.

---

### Q3 — EU Cell Jurisdiction Scope 🟡

**Question:** When the EU cell (`gcp-eu1`) launches in Phase 2, which specific GCP EU region is the primary? (`europe-west1` Belgium, `europe-west3` Frankfurt, or other?) What is the associated DR pilot-light?  
**Impact:** GDPR data residency: data processed in the EU cell must not leave the EU. DR pilot-light must also be in the EU.  
**Decision needed by:** Phase-0b

**Answer (2026-10-17):**

- **EU cell primary region (`gcp-eu1`):** `europe-west3` (Frankfurt, Germany)
- **EU cell DR pilot-light region:** `europe-west4` (Netherlands)

**Rationale:**

- `europe-west3` (Frankfurt) is the strongest GCP region for GDPR-compliant European workloads: mature Assured Workloads program support, broadest service availability in the EU, and shortest latency to Central and Western Europe.
- `europe-west4` (Netherlands) is the geographic and network-adjacent DR complement. Both regions are within the EU — GDPR data-residency is satisfied at every layer.
- **Hard constraint (I-14):** No EU-tenant data crosses EU jurisdiction at any layer — this includes database, PITR backups, Cloud Storage evidence, ClickHouse analytics, telemetry, AI inference, and transactional email.
- Cloud KMS multi-region key location for `gcp-eu1`: **`europe`** — covers both `europe-west3` and `europe-west4`, satisfying I-11 and I-14.
- **Email:** Resend must operate with a Resend EU data region for EU-cell emails. If Resend cannot confirm EU data residency at Phase-2 launch, the secondary email provider (ADR-0038) is used exclusively for EU-cell transactional email. This is non-negotiable.
- **AI (Vertex AI):** The `AiGateway` region selector in `worker-ai` must be jurisdiction-aware. EU-cell `worker-ai` must route to the `europe-west4` Vertex AI endpoint (or whichever EU Anthropic-on-Vertex endpoint is available at Phase-2 launch). If no EU Vertex AI endpoint exists at that time, ADR-0035 must be reviewed for an EU-compliant fallback.
- **ClickHouse Cloud EU:** `europe-west4`. This is a **separate** ClickHouse Cloud service from `pactintel-us1` — I-02 prohibits cross-cell data access under any circumstances.
- **Grafana Cloud EU:** The EU-cell observability stack routes to a Grafana Cloud EU stack. EU telemetry must never flow to a US Grafana endpoint.

**Network CIDR plan (`gcp-eu1` cell VPC):**

| Subnet                     | Range          |
| -------------------------- | -------------- |
| VPC primary                | `10.20.0.0/16` |
| Cloud Run serverless       | `10.20.1.0/24` |
| Cloud SQL private services | `10.20.2.0/24` |
| Memorystore                | `10.20.3.0/24` |

`10.20.0.0/16` is non-overlapping with `gcp-us1` (`10.10.0.0/16`) to allow future VPC peering for control-plane internal connectivity if required.

**Decision basis:** Blueprint §0.3, §0.4, I-02, I-03, I-14, GDPR Article 44.

---

### Q4 — Dedicated Sending Subdomain for Email 🟡

**Question:** What subdomain should be used for transactional email? (e.g., `mail.pactintel.com`, `notify.pactintel.com`, or `transact.pactintel.com`?)  
**Impact:** Resend configuration, DNS records (DKIM, SPF, DMARC), and warm-up plan. This must be decided in Phase-0a and cannot be changed without re-warming deliverability reputation.  
**Decision needed by:** Phase-0b

**Answer (2026-10-17):**

**Subdomain: `mail.pactintel.com`**

**Rationale:**

- `mail.pactintel.com` is the professional standard for SaaS transactional email. It is immediately recognizable to recipients as being from PactIntel, avoids visual confusion with the app domain (`app.pactintel.com`) and the recipient-document domain (`pact.link`), and is easy to explain to customers who inspect email headers.
- **This subdomain is permanent (I-08).** Changing it post-warm-up destroys IP/domain reputation accumulated through early sends and requires a full re-warm period — a concrete risk of deliverability failure during the period when we have real customers depending on signature request emails being delivered.

**Required DNS records (provisioned in Phase-0a, before any production email is sent):**

| Record                                     | Value                                                             |
| ------------------------------------------ | ----------------------------------------------------------------- |
| SPF `TXT` on `mail.pactintel.com`          | `v=spf1 include:_spf.resend.com ~all`                             |
| DKIM `CNAME` records                       | As provided by Resend at domain verification                      |
| DMARC `TXT` on `_dmarc.mail.pactintel.com` | `v=DMARC1; p=quarantine; rua=mailto:dmarc@pactintel.com; pct=100` |
| MX record on `mail.pactintel.com`          | Resend bounce-handling endpoint                                   |

DMARC policy advances from `p=quarantine` → `p=reject` after 30 days of production monitoring with bounce rate < 2 % and spam complaint rate < 0.1 %.

**Email warm-up schedule:**

| Period             | Daily volume target                            |
| ------------------ | ---------------------------------------------- |
| Phase-0a           | 0 (DNS provisioned, not yet sending)           |
| Phase-0b, week 1–2 | ≤ 100 emails/day                               |
| Phase-0b, week 3–4 | ≤ 500 emails/day                               |
| Phase-0b, month 2+ | ≤ 2,000 emails/day                             |
| Phase 1 (growth)   | Graduated per Resend's warm-up recommendations |

**Secondary provider (ADR-0038):** Must be pre-configured and domain-verified against `mail.pactintel.com` in Phase-0a. Failover to the secondary provider is a Secret Manager credential swap — no DNS changes, no re-warm required.

**Bounce/complaint monitoring:** Resend webhook events route to `email_events` (partitioned table). The Notification module enforces per-org suppression lists. Any bounce or complaint causes the address to be immediately suppressed from future sends. CI integration tests must verify the suppression list is checked before every outbound email send.

**Decision basis:** Blueprint §2.1 (Email row), ADR-0038, I-08.

---

### Q5 — Recipient-Facing Document Domain 🟡

**Question:** Recipient-facing document URLs (signing pages, viewer pages) should be on a separate registrable domain from the app (Blueprint §2.1, CDN/Edge row). What domain? (e.g., `pact.link`, `docs.pactintel.com`, or a dedicated short domain?)  
**Impact:** This domain is embedded in sent document URLs and **cannot be changed** after documents are sent. It must be permanent from Phase-0b.  
**Decision needed by:** Phase-0b

**Answer (2026-10-17):**

**Domain: `pact.link`**

**Rationale:**

- A dedicated short domain for recipient-facing pages (signing page, viewer page, payment collection, post-signature onboarding flow) serves two structural goals:
  1. **Security isolation:** `pact.link` and `app.pactintel.com` are different origins. Recipient sessions never share cookies, localStorage, or `document.domain` trust with authenticated internal sessions. Cross-origin resource policy (CORP) and Content Security Policy (CSP) can be configured independently per origin.
  2. **Brand clarity:** A short, meaningful domain gives recipients a professional URL in the browser bar that signals legal intent. Buyers share proposal links — `pact.link/d/us1-abc123` is shareable and memorable.
- `pact.link` is short (9 characters), clearly related to the product name, and unmistakably purpose-built for document/contract links.
- **This domain is permanent and cannot be changed after the first document is sent (I-08).** It is embedded in every outbound document URL. The domain must be registered and its Cloudflare DNS verified before Phase-0b product code begins.

**URL structure on `pact.link`:**

```
https://pact.link/d/{cell-code}-{document-public-token}

Example:
  https://pact.link/d/us1-3x7k9m2p4q8r6s1t
```

- **`{cell-code}`** (`us1`, `eu1`, etc.) — allows Cloudflare Workers to route to the correct cell origin using lookup-free routing (Blueprint §0.3). No directory lookup required for 99 % of requests.
- **`{document-public-token}`** — 128-bit CSPRNG token generated at document send time. Not the internal UUIDv7 PK. Never guessable (D-05, I-08).

**Custom domain white-labeling (Phase 1, Starter+ tier):**  
When a tenant enables a custom recipient domain (e.g., `proposals.acme.com`), that hostname is a Cloudflare for SaaS custom hostname pointing to `pact.link` origin. The URL structure on the origin does not change — only the hostname displayed to the recipient changes. SSL is managed by Cloudflare for SaaS (Q6).

**Signing page origin isolation:** The signing page JavaScript context must not load any third-party scripts from `app.pactintel.com` or any analytics provider that sets cookies on `pact.link`. CSP on `pact.link` is restrictive by default.

**Decision basis:** Blueprint §0.3, §2.1 (CDN/Edge row), I-08, D-05.

---

### Q6 — Cloudflare for SaaS Custom Hostnames 🟡

**Question:** Confirm we will use Cloudflare for SaaS (the custom hostname/SSL product) for white-labeled recipient domains. This requires a Cloudflare Enterprise or Cloudflare for SaaS subscription. Is this approved?  
**Impact:** Custom domain architecture for white-labeled senders. The alternative (bring-your-own CNAME to our ALB) has significant TLS management complexity.  
**Decision needed by:** Phase 1

**Answer (2026-10-17):**

**Approved. Cloudflare for SaaS is the authorized solution for tenant custom hostname and SSL management.**

**Why Cloudflare for SaaS, not bring-your-own CNAME to our ALB:**

- Cloudflare for SaaS handles TLS certificate provisioning, renewal, and revocation per custom hostname automatically. No ACME automation to maintain, no certificate expiry risk, no per-hostname Certificate Manager complexity.
- Our External ALB + GCP Certificate Manager could provision per-domain certificates, but the provisioning pipeline adds latency (minutes to hours per domain) and creates a blast radius: if Certificate Manager's ACME pipeline degrades, new custom domains are broken — a recipient cannot sign a legally binding document because their sender's custom SSL certificate failed to provision. This risk is unacceptable for a product where signing is the core action.
- Cloudflare for SaaS is priced per active custom hostname per month (approximately $0.10/hostname/month at time of writing [VERIFY pricing before Phase 1 procurement]). This cost is entirely justified by the operational risk it eliminates and is recoverable through the white-label feature gate (Starter+ tier).

**Implementation requirements:**

- Cloudflare for SaaS subscription must be activated on the Cloudflare account managing `pact.link` and `pactintel.com` **before Phase 1 custom-domain feature work begins**.
- A `CustomHostnameService` in the `Integration` module manages the Cloudflare API: provisions hostname, polls SSL status, deprovisions on tenant offboarding.
- The Cloudflare API token for custom hostname management is stored in Secret Manager and injected into `worker-core` (not `api`) — custom hostname lifecycle changes are async, not request-scoped.
- **Misconfiguration fallback (mandatory):** A tenant whose custom domain fails DNS validation or SSL provisioning must fall back gracefully to the default `pact.link` URL with an admin alert email. Recipients must never see a TLS error or `ERR_CERT_COMMON_NAME_INVALID`. This is a required empty-state/error-state per Design System and Product Blueprint §9.
- Cloudflare for SaaS custom hostname status is polled every 5 minutes via a BullMQ recurring job until `ssl_status = active`.

**Decision basis:** Blueprint §2.1 (CDN/Edge row), §2.4, Product Blueprint §9 (access control edge case).

---

### Q7 — Per-Tenant Customer-Managed Keys (CMEK) 🟡

**Question:** Blueprint §5.3 establishes no per-tenant CMK by default. Is there an Enterprise tier requirement for customer-managed keys (where the customer's own Cloud KMS key wraps their data keys)? If yes, this must be designed now.  
**Impact:** Key management, IAM, operational runbooks, and pricing (Enterprise tier feature). An undesigned CMEK tier cannot be added later without re-wrapping data.  
**Decision needed by:** Phase-0b

**Answer (2026-10-17):**

**No per-tenant CMK (CMEK) tier. The existing key hierarchy is sufficient for all phases through Phase 3.**

**Current key hierarchy (implemented from Phase-0a):**

```
Cloud KMS per-cell, per-purpose CMK
  └── per-tenant wrapped data key (TK)
      stored in: tenant_data_keys table (organization_id, wrapped_key, kms_key_version)
      └── per-record DEK (derived or randomly generated, encrypted with TK)
```

**Why this is already strong enough:**

- The TK is per-tenant. Destroying the TK is crypto-shredding: all tenant data becomes permanently unreadable without physically deleting any rows. This satisfies GDPR Article 17 (right to erasure) for tenant offboarding — a capability most SaaS platforms do not offer.
- The TK model already provides tenant-level key isolation. CMEK only adds the additional property that the customer's own KMS, not ours, holds the CMK. This is relevant for customers with a specific regulatory requirement or a contractual need to be able to independently revoke our access to their data.

**CMEK re-evaluation trigger:**  
CMEK becomes a justified investment when: a signed Enterprise contract or a written LOI from a customer in a regulated industry (financial services, healthcare, defense contractor) explicitly requires it as a condition of signing. At that point:

1. An ADR is written covering: KMS IAM topology (customer grants our `worker-core` service account `cloudkms.cryptoKeyVersions.useToDecrypt` on their key), key availability SLA obligations, operational runbook for key rotation, and pricing (CMEK is an Enterprise add-on, not included in the standard Enterprise tier).
2. Re-wrapping existing TKs with the customer's CMK is a key-management operation, not a data migration per Blueprint §0.1. The `tenant_data_keys` table is designed to support this: `kms_key_version` can be updated per-tenant without schema changes.

**Decision basis:** Blueprint §5.3, §2.1 (KMS/Secrets row), I-09, I-11, ADR-0011.

---

### Q8 — AI Model Approval Chain 🟡

**Question:** Blueprint §20 (placeholder) requires an eval gate before any new model goes to production (AI-006). Who is the approver for model changes — the owner only, or can the tech lead approve?  
**Impact:** Defines the governance process for AI model updates and prompt changes.  
**Decision needed by:** Phase-0b (before AI module is built)

**Answer (2026-10-17):**

**Two-tier approval model:**

| Change Type                                                              | Approver  | Required Gates                                                             |
| ------------------------------------------------------------------------ | --------- | -------------------------------------------------------------------------- |
| Prompt edit (file in `libs/ai/prompts/`)                                 | Tech lead | PR review + eval suite passes (AI-006)                                     |
| New task ID registration                                                 | Tech lead | PR review + eval suite created before merge                                |
| New model variant within approved family (e.g., Claude 3.5 → Claude 3.7) | Tech lead | Eval gate pass (AI-006) + update existing ADR (new entry in version table) |
| New model family added to any task chain (e.g., adding Gemini, OpenAI)   | **Owner** | New ADR (ADR-0028 series) + eval gate pass + Owner sign-off on `main`      |
| New provider adapter (`libs/ai/adapters/`)                               | **Owner** | New ADR + Owner sign-off before any code merges                            |

**Rationale for split:**

- Prompt changes are the highest-frequency AI change type — daily during active development. Requiring owner approval for every prompt iteration creates an asymmetric bottleneck. The eval gate (AI-006) is the technical regression control that applies regardless of approver.
- New model families and provider adapters are vendor relationship decisions with procurement, data-processing agreement (DPA), cost, and contractual implications. These require Owner visibility and sign-off.
- New model variants within an approved family (e.g., a Claude point release) are lower-risk — the provider, DPA, and cost structure are unchanged; only the model version differs. Tech lead approval + eval gate is sufficient.

**Governance enforcement mechanisms:**

- `AiGateway` enforces task ID registration at runtime — dispatching an unregistered task ID throws and is caught by CI integration tests. No prompt can be called from feature code without a registered task ID.
- `ADP-001` lint rule enforces that provider SDK imports exist only in `libs/ai/adapters/`. Any violation fails CI.
- Eval suites run in CI on every PR that touches `libs/ai/`. A failing eval gate requires an explicit override commit signed by the required approver.
- Model names never appear in feature or rule code — they appear only in adapters, the task registry, and ADRs. This is lint-enforced.

**Decision basis:** Blueprint §2.1 (AI row), §20, AGENTS.md (AI-004, AI-006, ADP-001).

---

### Q9 — ClickHouse Cloud Tier 🟡

**Question:** ClickHouse Cloud charges per cluster. For Phase-0 (dev + staging), should we use a single shared ClickHouse Cloud service (with separate databases per environment), or separate services?  
**Impact:** Cost and isolation between dev/staging analytics data.  
**Decision needed by:** Phase-0a (before IaC for analytics is written)

**Answer (2026-10-17):**

**Single ClickHouse Cloud service per jurisdiction, with separate databases per environment.**

**Service topology:**

```
ClickHouse Cloud service: pactintel-us1   (GCP region: us-central1)
  ├── database: pactintel_dev             ← CI integration tests, developer local
  ├── database: pactintel_staging         ← staging environment (CI/CD deploys here)
  └── database: pactintel_prod            ← production (gcp-us1 cell)

ClickHouse Cloud service: pactintel-eu1   (GCP region: europe-west4)  [Phase 2]
  ├── database: pactintel_eu_staging
  └── database: pactintel_eu_prod
```

**Why one service per jurisdiction, not one per environment:**

- A single ClickHouse Cloud service at launch-level volume (Phase-0b through Phase-1) carries near-zero risk of environment cross-contamination when databases are separate — each database has its own schema and service-account credentials.
- A second service for staging/dev would add approximately $200–400/month in minimum cluster charges for a database that receives close to zero event volume during development. This is unjustified and violates the principle of deferring capacity, not structure.

**Why separate services per jurisdiction (US vs. EU) — not optional:**

- This is required by I-02 and I-03. Cross-cell ClickHouse access is an architecture invariant violation, not a cost tradeoff. EU-cell analytics data must never reach the `pactintel-us1` ClickHouse service under any circumstances.

**Access control:**

- Each database has a dedicated ClickHouse service account with a scoped password stored in Secret Manager, injected into `worker-core` (write path for Pub/Sub → batcher → ClickHouse) and `api` (read path for report generation). Dev and staging service accounts are accessible only from CI/CD service accounts and developer VPN — never reachable from production Cloud Run services.
- `pactintel_prod` database credentials are never stored in any dev or staging configuration.

**Decision basis:** Blueprint §2.1 (Analytics Store row), I-02, I-03, I-14.

---

### Q10 — Paddle Billing Currency 🟡

**Question:** Confirm: PactIntel platform subscription pricing will be denominated in USD (with Paddle handling local tax)? Or do we need multi-currency Paddle pricing from Phase-0b?  
**Impact:** Paddle price object structure and Billing module implementation.  
**Decision needed by:** Phase-0b

**Answer (2026-10-17):**

**USD is the primary pricing currency. Paddle handles all local tax, currency display conversion, and checkout localization. No multi-currency Paddle price objects are created in Phase-0b.**

**Why USD-primary is correct:**

- Paddle is the merchant of record — Paddle collects, remits, and is liable for all sales tax, VAT, GST, and other consumption taxes globally. We never touch tax logic or calculations.
- Paddle's checkout natively displays prices in the buyer's local currency (EUR, GBP, CAD, AUD, etc.) using its own exchange-rate conversion from the USD list price. This requires no additional Paddle price objects on our side.
- Multi-currency Paddle price objects (where we set a specific EUR price separately from the USD price) are only justified when we need precise local-currency price control (e.g., "€49, not €52.17"). This is a Phase-2+ decision driven by market feedback, not a Phase-0b requirement.

**Indicative plan pricing (USD/month/seat — for billing module implementation purposes only; subject to competitive validation):**

| Plan         | Monthly | Annual (per seat/month)     |
| ------------ | ------- | --------------------------- |
| Free         | $0      | —                           |
| Starter      | $29     | $23 (20 % discount)         |
| Professional | $59     | $47 (20 % discount)         |
| Business     | $99     | $79 (20 % discount)         |
| Enterprise   | Custom  | Annual only — contact sales |

> [!IMPORTANT]
> These prices are implementation placeholders. They must be validated against current competitive benchmarks (Proposify, PandaDoc, Better Proposals) before Paddle price objects are created in Phase-0b. Changing prices after launch requires Paddle price object updates and customer notification — validate before creating.

**Key billing policy decisions (written policy, prevents ad hoc support responses):**

| Decision                         | Policy                                                                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Proration on seat addition       | Paddle handles automatically — charged for remaining days in billing cycle                                                                             |
| Credit on mid-cycle seat removal | **No credit.** Credit applies at renewal (not on removal).                                                                                             |
| Collaborator seat pricing        | 50 % of the full-seat price on the same plan tier                                                                                                      |
| Document/send cap overage        | **Hard block.** `send_document` returns `402 Payment Required` with upgrade CTA. No silent overages. No "unlimited" marketing while charging overages. |
| Pending invite seat reservation  | Pending invites reserve a seat immediately — cannot game the seat cap by leaving invites unaccepted                                                    |
| Multi-currency trigger           | First significant Enterprise pipeline segment from non-USD markets requiring local-currency invoices                                                   |

**Internal entitlement catalog:** Paddle price IDs never appear in business logic. The internal entitlement catalog (plan → feature flags + limits) drives enforcement. Paddle price IDs live only in `billing_provider_mappings`. Changing the Paddle price is a mapping update, not a feature-code change (ADR-0016).

**Decision basis:** Blueprint §2.1 (Platform Billing row), §6, ADR-0016, Product Blueprint §7 and §9.

---

### Q11 — PR Preview Environments 🟢

**Question:** Blueprint §8.2 notes that per-PR preview environments are a policy decision: (a) TTL-limited ephemeral Cloud Run revisions with a hard per-PR cost cap, or (b) removed in favor of local + staging. Which approach?  
**Impact:** CI/CD complexity and monthly GCP cost.  
**Decision needed by:** Phase-0a (CI/CD pipeline design)

**Answer (2026-10-17):**

**Approach (a): TTL-limited ephemeral Cloud Run revisions with a hard per-PR cost cap of $3/day.**

**Implementation specification:**

On every PR targeting `main`, the CI/CD GitHub Actions pipeline:

1. Builds `api` and `web-app` Docker images tagged `pr-{number}-{git-sha}`.
2. Deploys preview Cloud Run revisions:
   - Tag: `preview-pr-{number}`
   - `--max-instances=2`, `--cpu=1`, `--memory=512Mi` (cost-capped configuration)
   - Traffic: 100 % to the new revision, no traffic split with production
3. Previews use the **shared staging Cloud SQL database** (a dedicated `pr_previews` schema is created and torn down with the PR — not the staging schema used by the staging deployment). No dedicated Cloud SQL instance per PR.
4. Previews use the **shared staging Memorystore** instance.
5. ClickHouse analytics ingestion is **stubbed** in preview (events are accepted but discarded) — no preview database needed.
6. KMS: the staging key ring is used. No preview-specific keys.

**TTL and cleanup:**

- Preview revisions auto-destroy **24 hours after the last commit push** to the PR, or **immediately on PR close or merge** — whichever comes first.
- A Cloud Scheduler job runs hourly, invoking a Cloud Run Job (`pactintel-staging-us1-preview-cleanup`) that lists Cloud Run revisions tagged `preview-*` and deletes those past their TTL or whose PR is closed. This is IaC-managed (I-04).

**Cost cap enforcement:**

- GCP billing budget alert on the staging project at `$3/day` per preview revision. If the alert fires, the CI pipeline (via a Cloud Monitoring webhook → Cloud Run Job) terminates the preview revision and sends a Slack alert.
- Estimated actual cost: `~$0.10–0.50/day` at `--max-instances=2` with realistic PR traffic levels.

**Why not local + staging only:**

- PR preview URLs are the standard review mechanism for recipient-facing UI (signing flow, viewer page, payment page). Reviewing these on localhost misses production infrastructure behavior (CDN headers, Cloud Armor rules, Cloudflare WAF, HTTPS certificate behavior). Async stakeholder review of a PR before merge is materially valuable for a product where recipient experience is a competitive differentiator.
- The cost is negligible compared to the review velocity benefit.

**Decision basis:** Blueprint §8.2, I-04, I-15.

---

### Q12 — SOC 2 Timeline 🟢

**Question:** Blueprint §5.1 places the SOC 2 Type II audit at Phase 3. Is there a customer expectation that requires an earlier SOC 2 report (e.g., a large pilot customer requiring it before signing)?  
**Impact:** May require accelerating Vanta setup and control implementation into Phase 1/2.  
**Decision needed by:** Phase 1 start

**Answer (2026-10-17):**

**SOC 2 Type II audit remains at Phase 3. No current customer contract or letter of intent requires an earlier audit report.**

**Why Phase 3 is the correct placement:**

- SOC 2 Type II audits require a 6–12 month observation period during which controls must be consistently operating. Starting the audit engagement in Phase 3 means we have 12–18 months of evidence accumulated from Phase-0a (where the foundational controls go live). This is the ideal audit posture.
- Vanta (GCP integration) does not require early setup — it reads GCP resource configuration via a service account and can be provisioned at any time. Provisioning it in Phase-0a adds maintenance overhead for controls that are not yet meaningful (most controls require the product to be running with real users).

**What Phase-0a delivers regardless (audit evidence accumulates from Day 1):**

| Control                  | Implementation                                                           | Evidence                          |
| ------------------------ | ------------------------------------------------------------------------ | --------------------------------- |
| Encryption at rest       | Cloud KMS (per-cell, per-purpose CMK)                                    | Cloud KMS key usage logs          |
| Encryption in transit    | TLS 1.2+ enforced by Cloudflare + Cloud Armor                            | Cloudflare SSL analytics          |
| Access control           | IAM principle of least privilege + RLS                                   | Cloud Audit Logs (Admin Activity) |
| Audit logging            | `audit_log_entries` (append-only) + Cloud Audit Logs → locked GCS bucket | Continuous since Phase-0a         |
| Incident response        | Sentry error alerting + PagerDuty equivalent                             | Sentry event logs                 |
| Vulnerability management | Artifact Analysis in CI (container scanning)                             | CI scan reports                   |
| Change management        | GitHub PRs + CI green-gate required for merge                            | GitHub audit log                  |

**Acceleration trigger:**  
If a specific Enterprise prospect provides a written LOI or contract draft conditional on SOC 2 (Type I or Type II) before Phase 3, the following action is taken:

- **SOC 2 Type I** (point-in-time, faster): Vanta provisioned in Phase 2 end. Type I engagement begins. This requires approximately 1 week of engineering effort (Vanta GCP integration, control mapping review) — feasible without derailing Phase 2 delivery.
- **SOC 2 Type II** (requires observation period): Not achievable before Phase 3 regardless of when Vanta is provisioned — Type II requires a minimum 6-month observation period by definition. If a customer requires Type II before Phase 3, this must be surfaced immediately so a realistic commitment timeline can be negotiated.

The owner must be informed immediately of any sales deal that raises a SOC 2 requirement, so the Phase 2 timeline impact can be assessed before a commitment is made to the customer.

**Decision basis:** Blueprint §5.1, §12 (Phase 3), Product Blueprint §7 (Enterprise tier).
