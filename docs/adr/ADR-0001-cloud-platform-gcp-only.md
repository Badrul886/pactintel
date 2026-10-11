# ADR-0001: Cloud Platform Selection — Google Cloud (GCP) Only

**Status:** Accepted  
**Date:** 2026-10-08  
**Supersedes:** N/A (initial decision; replaces Fly.io → AWS migration plan from Blueprint v1.1.0)  
**Authors:** System Architect  
**Related:** [Architecture Revision Brief](../ARCHITECTURE_REVISION_BRIEF.md), [Addendum A](../ARCHITECTURE_REVISION_BRIEF_ADDENDUM_A.md), Blueprint §0, §8, §15

---

## Context

Blueprint v1.0.0/v1.1.0 specified Fly.io for Phases 0–2 and planned a migration to AWS ECS/EKS at Phase 3 (>50k MAU trigger). This created a mandatory infrastructure migration that would have required:

- Migrating PostgreSQL data from Fly Postgres (Supabase-backed) to RDS/Aurora
- Re-keying or re-wrapping all KMS-encrypted credentials
- Changing all deployment tooling and CI/CD pipelines
- Updating IaC from scratch (Fly.io config → AWS Terraform)
- Updating all service discovery, secrets injection, and networking

The owner decided to select a permanent cloud platform from Day 1, eliminating this migration. Google Cloud Platform (GCP) was selected over AWS and Fly.io.

## Decision

**PactIntel runs on Google Cloud Platform only, permanently, from Day 1.**

No AWS. No Fly.io. No Supabase. No multi-cloud. No Kubernetes except as a fallback for a specific verified Cloud Run blocker (see ADR-0036).

## Rationale

| Factor | GCP Advantage |
|---|---|
| Vertex AI | Claude via Vertex AI provides a single GCP billing/IAM relationship for AI calls; avoids a separate Anthropic billing account for the primary path |
| Cloud Run | Serverless, scales to zero, no cluster management, WebSocket support via HTTP/2, worker pools for BullMQ — covers all process types without Kubernetes |
| Cloud SQL | Managed PostgreSQL with PITR, IAM auth, private connectivity, and automatic edition upgrades — no migration from Fly Postgres |
| Cloud KMS | Per-key-ring, per-purpose CMKs; multi-region; Cloud HSM available; IAM conditions for scoped access |
| Cloud Storage | Object Retention Lock (Locked mode) provides WORM compliance for evidence artifacts — no S3 |
| Workload Identity Federation | No service-account JSON keys in CI; GitHub OIDC → WIF → GCP IAM |
| Cloud Armor + External ALB | WAF and DDoS protection at the origin, behind Cloudflare |
| Organization/Folder/Project layout | Native GCP resource hierarchy maps directly to the `foundation → control-plane → cell` IaC module structure |
| Single-vendor relationship | One support contract, one IAM model, one billing account per environment set |

## Consequences

### Positive
- No infrastructure migration ever needed. Cloud Run scales by configuration (min/max instances, concurrency). New cells = new IaC variable set.
- Vertex AI provides access to Claude (Anthropic), Gemini, and future models under one API/billing surface.
- Cloud Storage Object Retention Lock eliminates the need for a separate WORM storage vendor for evidence.
- Workload Identity Federation eliminates long-lived credentials in CI.

### Negative / Risks
- Some GCP services are less mature than AWS equivalents in specific niches (e.g., Cloud Run WebSocket limits — see ADR-0036).
- GCP has a smaller talent pool than AWS in some markets.
- ClickHouse Cloud on GCP regions must be confirmed available in target jurisdictions `[VERIFY]`.

### Constraints Imposed
- All new IaC uses `google`/`google-beta` Terraform providers.
- `AGENTS.md` forbidden-patterns table lists all prohibited services/platforms.
- CI must use Workload Identity Federation — no `gcloud auth activate-service-account` with a JSON key.

## Rejected Alternatives

| Alternative | Why Rejected |
|---|---|
| AWS | Owner elected GCP. Vertex AI integration for Claude is cleaner. No AWS. |
| Fly.io (permanent) | Insufficient managed services for production security requirements (no Cloud KMS equivalent, no Workload Identity Federation, no Cloud Armor). |
| Multi-cloud (GCP + AWS) | Introduces cross-cloud complexity, dual billing, split IAM/security posture. The No-Migration Principle forbids this. |
| GKE from Day 1 | Cloud Run covers all required process types. GKE adds cluster management overhead with no current benefit. |

## Verification Required

- `[VERIFY]` ClickHouse Cloud availability in GCP `us-central1` and `europe-west1` regions (required before Phase 0a starts).
- `[VERIFY]` Cloud Run WebSocket session affinity and connection limit behavior under production collab load (ADR-0036 may be needed).
- `[VERIFY]` Cloud SQL PostgreSQL 17 Enterprise edition: confirm `pgvector` extension is available without manual installation.
