# PactIntel — Contract Lifecycle & E-Signature Platform

> **Master Implementation Blueprint**: [docs/MASTER_IMPLEMENTATION_BLUEPRINT.md](docs/MASTER_IMPLEMENTATION_BLUEPRINT.md)  
> **Product Specification**: [docs/PRODUCT_BLUEPRINT.md](docs/PRODUCT_BLUEPRINT.md)  
> **Design System**: [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md)  
> **Cloud Platform**: Google Cloud (GCP) only — strictly no AWS/Fly.io/Supabase

---

## 1. Quickstart (< 10 Minutes)

### Prerequisites

- **Node.js**: >= 20.0.0 (Recommended: v22 LTS)
- **pnpm**: >= 9.0.0 (Installed: v10.11.0)
- **Docker & Docker Compose**: For local datastores

### Setup Steps

1. **Clone and Configure Environment**:

   ```bash
   cp .env.example .env
   ```

2. **Start Local Infrastructure Containers**:

   ```bash
   docker compose up -d
   ```

   _Spins up PostgreSQL 17 + pgvector (5432), 4 Redis role-split instances (6379-6382), ClickHouse (8123), SeaweedFS GCS emulator (8333), and Mailpit (1025/8025)._

3. **Install Dependencies**:

   ```bash
   pnpm install
   ```

4. **Initialize Database & Run Migrations**:

   ```bash
   pnpm nx run api:prisma:migrate
   ```

5. **Start Applications**:
   ```bash
   # Run NestJS API on http://localhost:4000
   pnpm nx run api:start:dev

   # In a separate terminal, run Next.js Web on http://localhost:3000
   pnpm nx run web:dev
   ```

---

## 2. Monorepo Structure

```
pactintel/
├── apps/
│   ├── api/             # NestJS 11 backend service (Cloud Run API)
│   ├── web/             # Next.js 15 + React 19 app shell & recipient viewer
│   ├── collab-server/   # Hocuspocus CRDT real-time collaboration server
│   └── web-e2e/         # Playwright end-to-end integration tests
├── libs/
│   ├── shared-types/    # DTOs, Zod schemas, status enums, event types
│   ├── shared-utils/    # UUIDv7 generation, cryptographic hashing, keyset pagination
│   ├── data-manifest/   # Machine-readable registry of all datastores (CI enforced)
│   ├── ui/              # Design System tokens & layout constants
│   └── ai/              # AiGateway & abstract LlmPort (scaffold)
├── infra/               # Terraform / OpenTofu IaC modules (GCP)
├── docs/                # Architecture specifications, blueprints, ADRs
└── docker-compose.yml   # Multi-service local developer environment
```

---

## 3. Architecture Invariants & Rules

- **I-03 & MT-002**: Every tenant-owned datum lives in its home cell. Tenant context is set per-request via `AsyncLocalStorage` and injected into PostgreSQL via `SET LOCAL app.current_tenant`.
- **I-06**: All business side-effects go through the transactional outbox (`outbox_events` table).
- **I-08 & D-05**: All internal primary keys use application-layer **UUIDv7** (`generateId()`). Never use database `gen_random_uuid()`.
- **D-21 & X-49**: Keyset (cursor) pagination ONLY. Offset pagination is strictly prohibited.
- **ADP-001**: Third-party vendor SDKs (WorkOS, BoldSign, Paddle) are only importable inside dedicated adapter modules.
- **SIG-001 & SIG-002**: Signed `document_versions` are immutable. Enforced via database triggers (`trg_immutable_signed_version`).
- **BILL-001**: Invited users immediately increment `full_seat_count`. Over-limit invites return `402 SEAT_LIMIT_REACHED`.
- **UI Constraints**: Design System (`docs/DESIGN_SYSTEM.md`) is authoritative. Single primary blue (`#2563EB`), Inter font only, real `<table>` elements for tabular data (no card grids), borders for structure, shadows only for floating popovers/modals.

---

## 4. Verification & Testing Guide

This project includes a comprehensive automated test suite (50 test suites, 250+ unit and integration tests) and an automated architectural inspection team.

### 4.1 Run All Tests Across the Monorepo

```bash
# Run all tests (uses Nx computation caching for fast re-runs)
pnpm test

# Force-run all tests live without using Nx cache
pnpm test -- --skip-nx-cache
```

> **Why did `pnpm test` finish in ~100ms?**  
> Nx caches task outputs. If files haven't changed since the last test run, Nx instantly returns cached passing results. Use `--skip-nx-cache` to force re-execution.

---

### 4.2 Run Tests by Application / Service

```bash
# 1. Backend API Service (47 test suites covering auth, RLS, documents, CPQ, signing, billing, analytics)
pnpm --filter @pactintel/api test

# 2. Real-Time Collab Server (Hocuspocus auth, server-side content locking, GC & LRU eviction)
pnpm --filter @pactintel/collab-server test

# 3. End-to-End Tests (Playwright browser flows)
pnpm run test:e2e
```

---

### 4.3 Run Specific Test Suites

You can target any individual test file by passing its path:

```bash
# Section Analytics & Edge Cases (EC-ANALYTICS-01..05)
pnpm --filter @pactintel/api test test/analytics/section-analytics.spec.ts

# Real-Time Collaborative Content Lock Enforcement (EC-COLLAB-01..09)
pnpm --filter @pactintel/collab-server test src/__tests__/content-lock.spec.ts

# Hocuspocus WebSocket Authentication & Permissions
pnpm --filter @pactintel/collab-server test src/__tests__/hocuspocus-auth.spec.ts

# Multi-Tenant PostgreSQL RLS Isolation & Connection Pooler Safety
pnpm --filter @pactintel/api test test/rls/cross-tenant-isolation.spec.ts
pnpm --filter @pactintel/api test test/rls/rls-under-pooler.spec.ts

# E-Signature Audit Trail & Version Immutability
pnpm --filter @pactintel/api test test/signing/audit-trail-immutability.spec.ts
pnpm --filter @pactintel/api test test/document/version-immutability.spec.ts

# Paddle Webhook Idempotency & Billing Grace Period
pnpm --filter @pactintel/api test test/billing/paddle-webhook-idempotency.spec.ts
```

---

### 4.4 Helpful Test Execution Flags

```bash
# Print every individual test case name with status
pnpm --filter @pactintel/api test -- --verbose
pnpm --filter @pactintel/collab-server test -- --verbose

# Watch mode (re-runs tests on file changes during development)
pnpm --filter @pactintel/api test -- --watch

# Generate code coverage report
pnpm --filter @pactintel/api run test:cov

# Detect hanging asynchronous handles or active timers
pnpm --filter @pactintel/api test -- --detectOpenHandles
```

---

### 4.5 Architectural Inspection Team & Automated Quality Gate

Before submitting code, run the automated quality gate:

```bash
# 1. Verify Data Manifest (Invariant I-10: every table/bucket must be registered)
pnpm run check:manifest

# 2. Check forbidden architectural patterns (no AWS SDKs, no direct ClickHouse INSERTs, no gen_random_uuid())
pnpm run check:forbidden-patterns

# 3. Lint all workspace projects
pnpm run lint

# 4. Typecheck all workspace packages
pnpm run typecheck

# 5. Run all tests
pnpm test -- --skip-nx-cache

# 6. Verify production build
pnpm run build
```
