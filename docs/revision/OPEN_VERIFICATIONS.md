# Open Verifications — PactIntel Architecture v2.0.0

**Document:** `docs/revision/OPEN_VERIFICATIONS.md`  
**Created:** 2026-10-08  
**Owner:** System Architect  
**Purpose:** Tracks all `[VERIFY]` tags from the Master Implementation Blueprint v2.0.0. Each item must be resolved (confirmed or updated) before the Phase-0a Definition of Done is signed off.

---

## Format

| ID | Section | Claim | Verification Method | Status | Resolved By |
|---|---|---|---|---|---|
| V-001 | §2.1 | Cloud SQL for PostgreSQL 17 Enterprise: `pgvector` available without manual install | Check Cloud SQL extensions list in GCP docs | ⬜ Open | — |
| V-002 | §2.1 | ClickHouse Cloud available in GCP `us-central1` and `europe-west1` | ClickHouse Cloud region selector or docs | ⬜ Open | — |
| V-003 | §5.1 | Google Cloud HIPAA covered products list includes Cloud Run, Cloud SQL, Memorystore, Cloud Storage, Cloud KMS | [cloud.google.com/security/compliance/hipaa-compliance](https://cloud.google.com/security/compliance/hipaa-compliance) | ⬜ Open | — |
| V-004 | §5.3 | Cloud KMS HSM protection level available in multi-region key locations (e.g., `us`, `europe`) | Cloud KMS docs | ⬜ Open | — |
| V-005 | §5.4 | Cloud Armor precise enforcement mechanism for Cloudflare IP allowlist (IP range vs. secret header vs. mTLS authenticated origin pulls) | Cloud Armor docs + Cloudflare for SaaS docs | ⬜ Open | — |
| V-006 | §5.4 | Cloud Run egress restriction mechanism for `worker-pdf` (VPC-SC vs. direct VPC egress vs. Cloud Run network controls) | Cloud Run networking docs | ⬜ Open | — |
| V-007 | §8.2 | SeaweedFS (or Garage) is a suitable Cloud Storage-compatible local emulator; confirm S3/GCS API compatibility level | SeaweedFS docs | ⬜ Open | — |
| V-008 | §8.5 | Cloud SQL backup immutability via Backup and DR Service vault lock: behavior and cost | GCP Backup and DR docs | ⬜ Open | — |
| V-009 | ADR-0001 | Cloud Run WebSocket session affinity and connection limit under production collab load (may trigger ADR-0036) | Cloud Run docs + load testing plan | ⬜ Open | — |
| V-010 | ADR-0001 | Cloud Run worker pools (pull-based BullMQ consumers): confirm mechanism — Cloud Run jobs with `--wait` in a loop, or Cloud Run services polling Redis | Cloud Run docs | ⬜ Open | — |
| V-011 | §20 (placeholder) | Vertex AI: Claude API via Vertex AI available in target GCP regions (`us-central1`, `europe-west1`) | Vertex AI model garden docs | ⬜ Open | — |
| V-012 | §8.2 | Object Retention Lock (Locked mode) minimum retention period that can be set to allow testing in a throwaway bucket | Cloud Storage docs | ⬜ Open | — |
| V-013 | §2.1 | Cloud SQL for PostgreSQL 17 Enterprise Plus: confirm PostgreSQL 17 is available (not just 16 or 15) | Cloud SQL docs | ⬜ Open | — |

---

## Statuses

- ⬜ Open — not yet investigated
- 🔄 In Progress — being investigated
- ✅ Confirmed — claim verified; doc updated with source URL
- ❌ Refuted — claim is wrong; `[VERIFY]` tag converted to correction in blueprint
- ⚠️ Partial — partially confirmed; outstanding sub-item noted

---

## Verification Protocol

1. Find the GCP official documentation for the claim.
2. Record the source URL and date accessed in the row.
3. If confirmed: remove the `[VERIFY]` tag from the blueprint and replace with the confirmed fact + `(Verified YYYY-MM-DD: [source])`.
4. If refuted: update the blueprint with the correct information; create an ADR if the correction changes a structural decision.
5. Mark the row status accordingly.
6. Open verifications that block Phase-0a DoD must be resolved before the Phase-0a milestone is signed.
