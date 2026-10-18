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

## 4. Verification & Testing

```bash
# Type check all apps and libs
pnpm nx run-many --target=typecheck --all

# Run linter across all projects
pnpm nx run-many --target=lint --all

# Run all test suites
pnpm nx run-many --target=test --all

# Run E2E smoke tests
pnpm nx run web-e2e:e2e
```
