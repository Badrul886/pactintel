# Architecture Revision Progress Log

**Document:** `docs/revision/REVISION_PROGRESS.md`  
**Created:** 2026-10-08  
**Purpose:** Tracks the progress of the Blueprint v2.0.0 revision against the Architecture Revision Brief §A5 edit sequence and Addendum A §A5 section-by-section pass.

---

## Source Documents

| Document | Location |
|---|---|
| Architecture Revision Brief | [docs/ARCHITECTURE_REVISION_BRIEF.md](../ARCHITECTURE_REVISION_BRIEF.md) |
| Addendum A — Google Cloud + AI Platform | [docs/ARCHITECTURE_REVISION_BRIEF_ADDENDUM_A.md](../ARCHITECTURE_REVISION_BRIEF_ADDENDUM_A.md) |
| Master Implementation Blueprint | [docs/MASTER_IMPLEMENTATION_BLUEPRINT.md](../MASTER_IMPLEMENTATION_BLUEPRINT.md) |

---

## Revision Phases

### Phase 1: Document Analysis & Mapping ✅ Complete

- [x] Read Architecture Revision Brief
- [x] Read Addendum A (GCP + AI Platform overrides)
- [x] Read all current docs in `docs/` (Blueprint v1.1.0, Product Blueprint, Design System)
- [x] Read `AGENTS.md` and `GEMINI.md`
- [x] Identify all AWS/Fly.io references in the blueprint
- [x] Map AWS → GCP translation table from Addendum A §A1
- [x] Identify all `[DEFECT]` items from the Brief §B4 that apply to current blueprint
- [x] Identify required new sections (§0, §15–§20, new appendices)

### Phase 2: Structural Edits ✅ Complete (v2.0.0)

- [x] Update `AGENTS.md` — GCP invariants, forbidden patterns, required workflow, architecture quick reference
- [x] Update `GEMINI.md` — GCP-specific overrides, ADR rules, IaC rules, AI rules
- [x] Blueprint header: version 2.0.0, status ACTIVE, GCP warning callout
- [x] Blueprint ToC: add §0, §15–§20, appendices B–E
- [x] Blueprint §0: Architecture Invariants & Scale Model, No-Migration Principle, I-01–I-15, cell architecture, design envelope
- [x] Blueprint §1: rewrite system overview, architecture diagram (GCP cell-based), module comm (outbox), §1.3–§1.4 rewrite
- [x] Blueprint §2.1: full tech stack rewrite (all AWS/Fly.io → GCP); add §2.3 eliminated migrations; add §2.4 port/adapter matrix reference
- [x] Blueprint §3.4: fix RLS predicate (X-01 — remove cast, use subquery)
- [x] Blueprint §5.1: update HIPAA to GCP BAA + Assured Workloads
- [x] Blueprint §5.3: rewrite key hierarchy diagram (Cloud KMS, TK-based); update implementation rules and network controls
- [x] Blueprint §5.4: update secrets to Secret Manager; add WAF/SSRF/supply-chain controls
- [x] Blueprint §8: full infrastructure rewrite (Fly.io → GCP projects/cells, Cloud Run process catalog, GCP CI/CD, updated docker-compose, Cloud SQL backup, IaC structure, runbook index)
- [x] Blueprint §14 Change Log: add v2.0.0 entry with full rationale
- [x] Create `docs/adr/ADR-0001-cloud-platform-gcp-only.md`
- [x] Create `docs/revision/OPEN_VERIFICATIONS.md`
- [x] Create `docs/revision/QUESTIONS_FOR_OWNER.md`
- [x] Create `docs/revision/REVISION_PROGRESS.md` (this file)
- [x] Create `docs/revision/CHANGE_REPORT.md`

### Phase 3: New Sections (§0 content complete; §15–§20 placeholders needed) 🔄 In Progress

The following new sections are registered in the ToC but their full content has not yet been authored. Each is a significant standalone document:

| Section | Status | Priority | Phase Gate |
|---|---|---|---|
| §15 Cloud Foundation (GCP) | ⬜ Not started | P0 | Phase-0a |
| §16 Async, Eventing & Scheduling | ⬜ Not started | P1 | Phase-0b |
| §17 Data Governance & Tenant Lifecycle | ⬜ Not started | P1 | Phase-0b |
| §18 Resilience, Capacity & Scale Levers | ⬜ Not started | P2 | Phase 1 |
| §19 Vendor & Dependency Strategy | ⬜ Not started | P1 | Phase-0b |
| §20 AI Platform Architecture | ⬜ Not started | P1 | Phase-0b |
| Appendix B — ADR Index | 🔄 Stub (ADR-0001 created) | P0 | Phase-0a |
| Appendix C — Verification Log | ⬜ Not started | P1 | Phase-0b |
| Appendix D — Defect Register Resolution Map | ⬜ Not started | P1 | Phase-0b |
| Appendix E — Data Manifest Seed | ⬜ Not started | P1 | Phase-0b |

### Phase 4: Full Section Pass (§3–§13 GCP spot-check) 🔄 Pending

The remaining sections (§3 Data Architecture, §4 API Contracts, §5.2–§6, §7, §9–§13) contain additional spot-check items from the Brief §B4 defect register. These do not contain AWS infrastructure references but need verification and cleanup:

| Section | Item | Priority |
|---|---|---|
| §3.2 schema | UUIDv7 PKs (X-14) — `gen_random_uuid()` calls must be replaced | P1 |
| §3.2 schema | Partition declarations for high-growth tables (X-15) | P1 |
| §4 API | Cursor pagination pattern (D-21, X-49) — offset pagination must be removed | P1 |
| §5.2 | `bcrypt`/`Argon2` API key hashing → SHA-256 HMAC (D-13, X-21) | P1 |
| §10 Observability | Grafana Alloy / OTel collector config (replaces Grafana Agent) | P2 |
| §11 Standards | IaC naming convention and required GCP labels | P1 |
| §12 Build Sequencing | Split Phase 0 into 0a (platform) + 0b (product) | P1 |
| §13 Edge Cases | EVT-001 through EVT-010 (outbox rules), JOB-001 (Cloud Scheduler / BullMQ) | P2 |

---

## Next Session Instructions

The next agent session should:

1. Confirm all items in Phase 2 are correct by reading the updated blueprint sections.
2. Begin Phase 3: author §15 Cloud Foundation (GCP) — highest priority section.
3. Then author §20 AI Platform Architecture (Claude via Vertex AI).
4. Then update Appendix B with the full ADR index (ADR-0001 through ADR-0039 placeholders with titles and statuses).
5. Then continue Phase 4 spot-checks starting with §3.2 schema (UUIDv7, partitions).
6. Resolve `[VERIFY]` items in OPEN_VERIFICATIONS.md as documentation is found.
7. Answer questions in QUESTIONS_FOR_OWNER.md as the owner provides input.
