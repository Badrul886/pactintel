# PactIntel — Antigravity-Specific Overrides

## Document Priority

When working in this repository, always check these documents in order:

1. **[AGENTS.md](AGENTS.md)** — Universal agent instructions (constraints, architecture invariants, coding standards, forbidden patterns)
2. **[docs/MASTER_IMPLEMENTATION_BLUEPRINT.md](docs/MASTER_IMPLEMENTATION_BLUEPRINT.md)** — Full engineering blueprint (v2.0.0, Google Cloud)
3. **[docs/PRODUCT_BLUEPRINT.md](docs/PRODUCT_BLUEPRINT.md)** — Product specification (do not edit)
4. **[docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md)** — Visual identity and UI specification

> [!IMPORTANT]
> The platform runs on **Google Cloud (GCP) only**. AWS was the original design target; it was replaced by GCP in Blueprint v2.0.0. Any AWS service name in existing code or docs is an error to be corrected, not a feature to be used. See `AGENTS.md` and ADR-0001.

---

## Antigravity-Specific Rules

### Planning Mode
- Any feature work that touches more than 3 files should use planning mode.
- Cross-module changes (e.g., a document feature that affects signing + payments) always require a plan.
- Any change to infrastructure, schema, or a public contract always requires a plan and an ADR.
- Blueprint updates require explicit user approval before implementation.

### Blueprint Updates
If your implementation requires deviating from the blueprint:
1. Update `docs/MASTER_IMPLEMENTATION_BLUEPRINT.md` §14 (Change Log) with the version bump and one-line rationale.
2. Update the relevant section with the new decision and rationale, marking the changed text `(Revised vX.Y.Z — <reason>)`.
3. If an ADR is required (any structural, vendor, schema, or public-contract change), create it in `docs/adr/ADR-00NN-*.md` before proceeding.
4. Request user review before proceeding with implementation.

### Build Phase Enforcement
- Check Blueprint §12 before starting any feature work.
- If a requested feature belongs to a later phase, flag this to the user rather than silently building it.
- Phase dependencies must be respected: Phase 2 features cannot be built until Phase 1 is complete.
- Phase 0a (platform foundation) must be complete before Phase 0b (product foundation) begins.

### Database Changes
- All schema changes go through Prisma migrations (`pnpm nx run api:prisma:migrate`).
- Never modify `schema.prisma` without checking the blueprint schema first.
- Every migration must also update `libs/data-manifest` — CI blocks otherwise.
- Immutability triggers and RLS policies must be included in any migration that adds tenant-scoped or audit tables.
- All new tables use **UUIDv7** primary keys, not `gen_random_uuid()`.
- All new high-growth tables must be **partitioned from Day 1**. See Blueprint §3.6.

### IaC Changes
- All GCP resources are managed by Terraform/OpenTofu in `infra/`.
- No console-created resources, ever.
- Every new resource must carry the mandatory labels: `env`, `cell`, `service`, `tier`.
- State lives in a versioned GCS bucket in the `shared-services` project.

### Testing Requirements
- Every new API endpoint must have at least one integration test.
- Every new CASL permission rule must have a corresponding test.
- RLS isolation tests required for any new tenant-scoped table.
- RLS-under-pooler test required: proves context and query share a connection (Blueprint §3.4).
- Every new port adapter must have a contract test suite.

### AI Changes
- All AI features go through `AiGateway` only — never direct SDK calls from feature code.
- Any new AI task must be registered in the task catalog (Blueprint §20) and have an eval suite before production.
- Any new model or prompt change requires an eval gate before production (AI-006).
- Provider SDK imports are only allowed inside `libs/ai/adapters/` packages (lint-enforced: ADP-001).

### UI Changes
- Read `docs/DESIGN_SYSTEM.md` before writing any CSS, choosing any color, or building any component.
- Self-review all UI work against the Design System's anti-pattern list (Section 15) before presenting to the user.
- If a new screen type doesn't cleanly fit the existing design system patterns, flag it to the user rather than silently improvising a one-off pattern.
- Design System updates require explicit user approval, just like blueprint updates.

### When You're Unsure
If a decision isn't covered by the blueprint, **ask** rather than guess. Never invent vendor facts, API headers, quotas, SLAs, or region availability — mark them `[VERIFY]` and add to `docs/revision/OPEN_VERIFICATIONS.md`.
