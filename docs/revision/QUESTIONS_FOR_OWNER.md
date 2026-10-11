# Questions for Owner — Architecture v2.0.0

**Document:** `docs/revision/QUESTIONS_FOR_OWNER.md`  
**Created:** 2026-10-08  
**Owner:** System Architect  
**Purpose:** Policy and product decisions that cannot be resolved by engineering alone. Each question must be answered by the owner before the associated Phase begins.

---

## Priority Legend

- 🔴 **P0 — Blocks Phase-0a** — must be answered before any IaC or code is written
- 🟡 **P1 — Blocks Phase-0b** — must be answered before product code begins
- 🟢 **P2 — Blocks Phase 1 or later** — can be deferred but must not be left unanswered past the stated phase gate

---

## Open Questions

### Q1 — GCP Organization & Billing Structure 🔴
**Question:** What is the GCP organization structure? Do we create a new GCP Organization under a domain we own, or are we working under an existing one?  
**Impact:** Defines the `foundation` IaC module's starting point. The folder/project layout in Blueprint §8.1 assumes we own the organization.  
**Decision needed by:** Phase-0a start  
**Answer:** _______

---

### Q2 — Initial GCP Region Pair 🔴
**Question:** Confirm the initial cell region and DR pilot-light region: `us-central1` (Iowa) as primary, `us-east4` (Northern Virginia) as DR pilot-light? Or different?  
**Impact:** Network CIDR plan, Cloud SQL replica region, ClickHouse Cloud region selection, Cloud KMS multi-region key location.  
**Decision needed by:** Phase-0a start  
**Answer:** _______

---

### Q3 — EU Cell Jurisdiction Scope 🟡
**Question:** When the EU cell (`gcp-eu1`) launches in Phase 2, which specific GCP EU region is the primary? (`europe-west1` Belgium, `europe-west3` Frankfurt, or other?) What is the associated DR pilot-light?  
**Impact:** GDPR data residency: data processed in the EU cell must not leave the EU. DR pilot-light must also be in the EU.  
**Decision needed by:** Phase-0b  
**Answer:** _______

---

### Q4 — Dedicated Sending Subdomain for Email 🟡
**Question:** What subdomain should be used for transactional email? (e.g., `mail.pactintel.com`, `notify.pactintel.com`, or `transact.pactintel.com`?)  
**Impact:** Resend configuration, DNS records (DKIM, SPF, DMARC), and warm-up plan. This must be decided in Phase-0a and cannot be changed without re-warming deliverability reputation.  
**Decision needed by:** Phase-0b  
**Answer:** _______

---

### Q5 — Recipient-Facing Document Domain 🟡
**Question:** Recipient-facing document URLs (signing pages, viewer pages) should be on a separate registrable domain from the app (Blueprint §2.1, CDN/Edge row). What domain? (e.g., `pact.link`, `docs.pactintel.com`, or a dedicated short domain?)  
**Impact:** This domain is embedded in sent document URLs and **cannot be changed** after documents are sent. It must be permanent from Phase-0b.  
**Decision needed by:** Phase-0b  
**Answer:** _______

---

### Q6 — Cloudflare for SaaS Custom Hostnames 🟡
**Question:** Confirm we will use Cloudflare for SaaS (the custom hostname/SSL product) for white-labeled recipient domains. This requires a Cloudflare Enterprise or Cloudflare for SaaS subscription. Is this approved?  
**Impact:** Custom domain architecture for white-labeled senders. The alternative (bring-your-own CNAME to our ALB) has significant TLS management complexity.  
**Decision needed by:** Phase 1  
**Answer:** _______

---

### Q7 — Per-Tenant Customer-Managed Keys (CMEK) 🟡
**Question:** Blueprint §5.3 establishes no per-tenant CMK by default. Is there an Enterprise tier requirement for customer-managed keys (where the customer's own Cloud KMS key wraps their data keys)? If yes, this must be designed now.  
**Impact:** Key management, IAM, operational runbooks, and pricing (Enterprise tier feature). An undesigned CMEK tier cannot be added later without re-wrapping data.  
**Decision needed by:** Phase-0b  
**Answer:** _______

---

### Q8 — AI Model Approval Chain 🟡
**Question:** Blueprint §20 (placeholder) requires an eval gate before any new model goes to production (AI-006). Who is the approver for model changes — the owner only, or can the tech lead approve?  
**Impact:** Defines the governance process for AI model updates and prompt changes.  
**Decision needed by:** Phase-0b (before AI module is built)  
**Answer:** _______

---

### Q9 — ClickHouse Cloud Tier 🟡
**Question:** ClickHouse Cloud charges per cluster. For Phase-0 (dev + staging), should we use a single shared ClickHouse Cloud service (with separate databases per environment), or separate services?  
**Impact:** Cost and isolation between dev/staging analytics data.  
**Decision needed by:** Phase-0a (before IaC for analytics is written)  
**Answer:** _______

---

### Q10 — Paddle Billing Currency 🟡
**Question:** Confirm: PactIntel platform subscription pricing will be denominated in USD (with Paddle handling local tax)? Or do we need multi-currency Paddle pricing from Phase-0b?  
**Impact:** Paddle price object structure and Billing module implementation.  
**Decision needed by:** Phase-0b  
**Answer:** _______

---

### Q11 — PR Preview Environments 🟢
**Question:** Blueprint §8.2 notes that per-PR preview environments are a policy decision: (a) TTL-limited ephemeral Cloud Run revisions with a hard per-PR cost cap, or (b) removed in favor of local + staging. Which approach?  
**Impact:** CI/CD complexity and monthly GCP cost.  
**Decision needed by:** Phase-0a (CI/CD pipeline design)  
**Answer:** _______

---

### Q12 — SOC 2 Timeline 🟢
**Question:** Blueprint §5.1 places the SOC 2 Type II audit at Phase 3. Is there a customer expectation that requires an earlier SOC 2 report (e.g., a large pilot customer requiring it before signing)?  
**Impact:** May require accelerating Vanta setup and control implementation into Phase 1/2.  
**Decision needed by:** Phase 1 start  
**Answer:** _______

---

## Answered Questions

_(Move questions here as they are answered, with the answer and date.)_

| Q | Summary | Answer | Date |
|---|---|---|---|
| — | — | — | — |
