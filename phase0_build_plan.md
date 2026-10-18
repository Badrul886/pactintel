# Phase 0 — Foundation Build Plan

## PactIntel · Blueprint v2.0.0 · Google Cloud

> **Goal**: A minimal but sellable product. One user can create a document, send it for signature, and collect payment.
> **Blueprint Reference**: §12 (Build Sequencing), §11 (Coding Standards), §8 (Infrastructure)
> **Estimated Duration**: 10–14 weeks across 6 sprints

---

## User Review Required

> [!IMPORTANT]
> **Seven owner-decisions must be made before we write the first line of product code.** Sprints 1–2 (Repo + IaC Scaffold) can begin immediately. Sprints 3–6 require answers to Q1, Q2, Q4, Q5, Q9, Q10, Q11 from `docs/revision/QUESTIONS_FOR_OWNER.md`.

> [!WARNING]
> **Blueprint invariant I-08 is in effect**: All public identifiers (document slugs, API key prefixes, public URL domain, webhook paths) chosen in this phase are **permanent**. Confirm the recipient-facing domain (Q5) and email subdomain (Q4) before Sprint 3 begins.

> [!CAUTION]
> **UUIDv7 must be used for all internal primary keys.** The blueprint schema in §3.2 still uses `gen_random_uuid()` — this is a known defect to fix. Every Prisma model uses the application-layer UUIDv7 generator, not `gen_random_uuid()`.

---

## Open Questions

| #       | Question                                                                        | Blocks             |
| ------- | ------------------------------------------------------------------------------- | ------------------ |
| **Q1**  | GCP Organization and billing structure — new org or existing?                   | Sprint 2 (IaC)     |
| **Q2**  | Confirm initial cell: `us-central1` primary + `us-east4` DR pilot-light?        | Sprint 2 (IaC)     |
| **Q4**  | Email sending subdomain (e.g., `mail.pactintel.com`)?                           | Sprint 3 (Auth)    |
| **Q5**  | Recipient-facing document domain — permanent, embedded in sent URLs?            | Sprint 3 (Viewer)  |
| **Q9**  | ClickHouse Cloud: single shared service for dev+staging, or separate?           | Sprint 2 (IaC)     |
| **Q10** | Paddle billing currency: USD only from Phase-0b?                                | Sprint 5 (Billing) |
| **Q11** | PR preview environments: TTL-limited Cloud Run revisions or local+staging only? | Sprint 2 (CI)      |

---

## Architecture Overview

```
Phase 0 Runtime Topology (local dev → staging → prod-us1)

  apps/web           Next.js 15 + React 19 + TypeScript
  apps/api           NestJS 11 + Prisma 6 + TypeScript
  apps/collab-server Hocuspocus (Phase 2, scaffolded only)

  libs/shared-types  DTOs, enums, Zod schemas
  libs/shared-utils  Utilities, ID generation, crypto helpers
  libs/ui            Design system tokens + base components
  libs/ai            AiGateway + LlmPort + adapters (scaffold)
  libs/data-manifest Machine-readable store registry (CI-enforced)

  infra/             Terraform/OpenTofu — all GCP resources
```

---

## Sprint 1 — Repo Scaffold and Developer Loop (Week 1–2)

**Goal**: Any engineer can clone the repo and be running locally in under 10 minutes.

---

### Monorepo Root

#### [NEW] `nx.json`

Nx project graph, affected tracking, module boundary tags, computation caching.

```json
{
  "npmScope": "pactintel",
  "affected": { "defaultBase": "main" },
  "tasksRunnerOptions": {
    "default": {
      "runner": "nx/tasks-runners/default",
      "options": { "cacheableOperations": ["build", "lint", "test", "typecheck"] }
    }
  },
  "targetDefaults": {
    "build": { "dependsOn": ["^build"] },
    "test": { "dependsOn": ["^build"] }
  }
}
```

#### [NEW] `pnpm-workspace.yaml`

```yaml
packages:
  - 'apps/*'
  - 'libs/*'
  - 'tools/*'
```

#### [NEW] `tsconfig.base.json`

Path aliases for all libs: `@pactintel/shared-types`, `@pactintel/shared-utils`, `@pactintel/ui`, `@pactintel/data-manifest`.

#### [NEW] `.eslintrc.json`

Nx boundary enforcement:

- `apps/web` can import `libs/*` but NOT `apps/api`
- `apps/api` can import `libs/*` but NOT `apps/web`
- `libs/ui` cannot import from `apps/*`
- Provider SDK imports (BoldSign, Paddle, WorkOS) only in `libs/*/adapters/` (ADP-001 lint-enforced)

#### [NEW] `.prettierrc`

```json
{ "semi": true, "singleQuote": true, "trailingComma": "all", "printWidth": 100 }
```

#### [NEW] `commitlint.config.js`

Conventional commits enforced: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `perf:`

#### [NEW] `.husky/pre-commit`

- `lint-staged`: ESLint + Prettier on staged files
- Secret scanner: grep for patterns matching API keys, PEM headers, connection strings (blocks commit if found)

#### [NEW] `docker-compose.yml`

Exact services per Blueprint §8.4:

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg17
    ports: ['5432:5432']
    environment:
      POSTGRES_PASSWORD: local
      POSTGRES_DB: pactintel
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres']
      interval: 5s

  redis-queue:
    image: redis:7-alpine
    command: redis-server --save "" --appendonly no
    ports: ['6379:6379']

  redis-session:
    image: redis:7-alpine
    ports: ['6380:6379']

  redis-cache:
    image: redis:7-alpine
    ports: ['6381:6379']

  redis-realtime:
    image: redis:7-alpine
    ports: ['6382:6379']

  clickhouse:
    image: clickhouse/clickhouse-server:24
    ports: ['8123:8123', '9000:9000']

  object-store:
    image: chrislusf/seaweedfs:latest
    command: server -s3
    ports: ['8333:8333']

  mailpit:
    image: axllent/mailpit:latest
    ports: ['1025:1025', '8025:8025']
```

---

### `libs/shared-types`

#### [NEW] `libs/shared-types/src/index.ts`

All Zod schemas and TypeScript interfaces shared between `apps/api` and `apps/web`:

- `OrganizationDto`, `UserDto`, `DocumentDto`, `DocumentVersionDto`
- `SignatureRequestDto`, `SignerDto`, `PaymentDto`, `SubscriptionDto`
- `ApiResponse<T>`, `PaginatedResponse<T>`, `CursorPage<T>`, `ApiError`
- Status enums: `DocumentStatus`, `SignerStatus`, `PaymentStatus`, `PlanTier`, `SigningOrder`

#### [NEW] `libs/shared-types/src/events.ts`

```typescript
export type WebhookEventType =
  | 'document.created'
  | 'document.sent'
  | 'document.viewed'
  | 'document.signed'
  | 'document.declined'
  | 'document.expired'
  | 'document.voided'
  | 'signer.viewed'
  | 'signer.signed'
  | 'signer.declined'
  | 'payment.completed'
  | 'payment.failed'
  | 'payment.refunded';
```

---

### `libs/shared-utils`

#### [NEW] `libs/shared-utils/src/id.ts`

UUIDv7 generator — the ONLY ID generation utility. All Prisma model IDs are generated here.

```typescript
import { v7 as uuidv7 } from 'uuid';
export const generateId = (): string => uuidv7();
```

#### [NEW] `libs/shared-utils/src/crypto.ts`

- `sha256(input: string): string` — content hashing and API key hashing
- `hmacSha256(secret: string, payload: string): string` — webhook signature verification
- `canonicalJson(obj: object): string` — sorted-key JSON stringify for deterministic hashing
- `secureRandom(bytes: number): Buffer` — CSPRNG-backed random bytes

#### [NEW] `libs/shared-utils/src/pagination.ts`

Cursor (keyset) pagination helpers. **No offset pagination anywhere** (Blueprint D-21, X-49).

---

### `libs/data-manifest`

#### [NEW] `libs/data-manifest/src/manifest.ts`

Machine-readable registry of every datastore. CI gate verifies:

1. Every Prisma model has an entry
2. Every entry declares: `rls`, `retention`, `erasure`, `residency`

```typescript
export const dataManifest = {
  stores: [
    {
      id: 'pg-documents',
      type: 'postgresql_table',
      table: 'documents',
      rls: true,
      retention: 'until_org_deletion',
      erasure: 'soft_delete',
      residency: 'cell_jurisdiction',
    },
    {
      id: 'ch-analytics-events',
      type: 'clickhouse_table',
      table: 'analytics_events',
      rls: false,
      retention: '2_years',
      erasure: 'partition_drop',
      residency: 'cell_jurisdiction',
    },
    // ... all Phase-0 tables registered here
  ],
} as const;
```

---

### `apps/api` — NestJS Skeleton

#### [NEW] `apps/api/src/main.ts`

Bootstrap with: Helmet, CORS allowlist, global Zod validation pipe, global exception filter, Pino logger, `nestjs-cls` for `AsyncLocalStorage`.

#### [NEW] `apps/api/src/app.module.ts`

Root module, imports all Phase-0 feature modules.

#### [NEW] `apps/api/src/common/`

Infrastructure shared across all modules:

| File                                      | Rule                                                           |
| ----------------------------------------- | -------------------------------------------------------------- |
| `filters/global-exception.filter.ts`      | RULE ERR-001: never expose stack traces to clients             |
| `guards/auth.guard.ts`                    | Session cookie + API key authentication                        |
| `guards/casl.guard.ts`                    | CASL permission enforcement on all routes                      |
| `middleware/tenant-context.middleware.ts` | RULE MT-002: sets `organizationId` in CLS per request          |
| `interceptors/request-id.interceptor.ts`  | Generates and propagates `request_id`                          |
| `interceptors/audit-log.interceptor.ts`   | Writes to `audit_log_entries` on mutations                     |
| `pipes/zod-validation.pipe.ts`            | Validates all DTOs via Zod schemas                             |
| `http-client/http-client.service.ts`      | RULE ERR-002: timeouts + circuit breaker on all external calls |

#### [NEW] `apps/api/src/prisma/schema.prisma`

Complete Phase-0 schema — all tables from §3.2.1 through §3.2.9:

- `organizations`, `workspaces`, `teams`, `users`, `workspace_memberships`, `team_memberships`
- `documents`, `document_versions`, `templates`, `content_blocks`, `folders`, `comments`
- `signature_requests`, `signers`, `signature_events`
- `payments`, `payment_provider_connections`, `payment_credential_audit_logs`
- `subscriptions`, `billing_events`
- `api_keys`, `webhooks`, `audit_log_entries`, `brand_kits`
- `outbox_events` (Invariant I-06 — transactional outbox)

All models use application-generated UUIDv7 PKs (passed to Prisma, no DB `gen_random_uuid()` default).

#### [NEW] `apps/api/src/prisma/migrations/0001_initial/`

SQL migration containing:

- All `CREATE TABLE` statements with correct column types
- All `CREATE INDEX` statements (including partial indexes with `WHERE deleted_at IS NULL`)
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` on all tenant-scoped tables
- `CREATE POLICY tenant_isolation ON <table> USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))` — index-friendly predicate, no cast (X-01)
- Immutability triggers:
  - `trg_immutable_signed_version` (RULE SIG-001)
  - `trg_immutable_signature_events` (audit append-only)
  - `trg_immutable_payment_audit` (audit append-only)
  - `trg_immutable_audit_log` (audit append-only)
  - `trg_mark_version_on_sign` (locks version on first signed event)
- `updated_at` auto-update triggers on all mutable tables

#### [NEW] `apps/api/src/prisma/prisma-tenant.extension.ts`

Prisma Client Extension that:

1. Reads `organizationId` from `ClsService`
2. Executes `SET LOCAL app.current_tenant = '<uuid>'` before every query **on the same connection**
3. **Throws** an error if `organizationId` is not set — no silent bypass (RULE MT-002)

---

### `apps/web` — Next.js Skeleton

#### [NEW] `apps/web/src/app/layout.tsx`

Root layout: Inter font (Google Fonts), metadata, global CSS variables (from `libs/ui` design tokens).

#### [NEW] `apps/web/src/app/(app)/layout.tsx`

Authenticated shell: sidebar nav, top bar, user menu, workspace selector.

#### [NEW] `apps/web/src/app/(recipient)/layout.tsx`

Recipient shell: no sidebar, brand-aware minimal header, SSR-optimized.

#### [NEW] `apps/web/src/lib/api-client.ts`

Type-safe fetch wrapper using `@pactintel/shared-types` DTOs. Handles `ApiResponse<T>`, `ApiError`, cursor pagination.

---

### `apps/collab-server` — Hocuspocus Skeleton

#### [NEW] `apps/collab-server/src/main.ts`

Minimal Hocuspocus server with `onAuthenticate` hook (placeholder for Phase 2). Runs on port 1234. Redis extension configured for scale-out.

---

## Sprint 2 — Infrastructure as Code and CI Skeleton (Week 2–3)

**Goal**: IaC is code-reviewed and ready to `terraform apply` into the dev GCP project. CI pipeline runs lint + test on every PR.

> [!IMPORTANT]
> Requires answers to Q1 (GCP org), Q2 (region pair), Q9 (ClickHouse tier), Q11 (PR previews) before IaC can be finalized.

---

### `infra/`

#### [NEW] `infra/modules/foundation/main.tf`

- GCP Organization Policy setup
- Folder structure: `control-plane/`, `cells-prod-us/`, `non-prod/`, `shared-services/`, `security/`
- Billing account links per Blueprint §8.1

#### [NEW] `infra/modules/cell/main.tf`

Parameterized cell module. `terraform apply -var-file=environments/dev/us1.tfvars` creates:

| Resource             | Config                                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Cloud Run services   | `web-app`, `web-viewer`, `api`, `collab`, `worker-core`, `worker-ai`, `worker-pdf`, `worker-bulk`                                     |
| Cloud SQL            | PostgreSQL 17, HA, private IP, PITR                                                                                                   |
| Memorystore (Valkey) | 4 role-split instances: `queue` (noeviction), `session` (volatile-lru), `cache` (allkeys-lru), `realtime`                             |
| Cloud Storage        | `evidence` (Object Retention Lock, 7yr), `uploads`, `exports`, `public-media`                                                         |
| Cloud KMS            | Key rings: `data-at-rest`, `cred-vault`, `integration-tokens`, `evidence`, `field-encryption`                                         |
| Secret Manager       | `database-url`, `workos-client-secret`, `paddle-webhook-secret`, `boldsign-webhook-secret`, `resend-api-key` (empty, operator-filled) |
| ClickHouse Cloud     | Via Terraform provider, GCP region co-located with cell                                                                               |
| Pub/Sub              | Topic: `analytics-events-ingest`                                                                                                      |
| Load Balancer        | External ALB + Cloud Armor (WAF) + Serverless NEGs                                                                                    |
| Workload Identity    | Pool for GitHub OIDC (no service account JSON keys)                                                                                   |
| Service accounts     | `api-runtime@`, `worker-core@`, `worker-pdf@`, `migrator@`, `app-vault@` — least-privilege IAM                                        |
| Cloud Logging sink   | Admin Activity + Data Access → `pactintel-security` locked bucket                                                                     |

**Mandatory labels on every resource**: `env`, `cell`, `service`, `tier`

#### [NEW] `infra/modules/edge/main.tf`

- Cloudflare zone config, Workers routing (cell-aware, lookup-free)
- Cloud Armor origin lockdown: ALB accepts traffic only from Cloudflare IP ranges
- Turnstile widget configuration

#### [NEW] `infra/environments/dev/us1.tfvars`

Smallest-tier dev cell (scale-to-zero where available, Paddle/BoldSign sandbox).

#### [NEW] `infra/environments/staging/us1.tfvars`

Production-like staging (Paddle/BoldSign sandbox).

---

### `.github/workflows/`

#### [NEW] `.github/workflows/ci.yml`

```yaml
on:
  push: { branches: [main] }
  pull_request: { branches: [main] }

jobs:
  quality:
    permissions: { id-token: write, contents: read }
    steps:
      - uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ vars.WIF_PROVIDER }}
          service_account: ${{ vars.CI_SERVICE_ACCOUNT }}
      - run: pnpm install --frozen-lockfile
      - run: pnpm nx affected:lint
      - run: pnpm nx affected:typecheck
      - run: pnpm nx affected:test --coverage
      - run: pnpm nx affected:build

  build-and-push:
    needs: quality
    if: github.ref == 'refs/heads/main'
    # Build one image per process type tagged with git SHA
    # Push to Artifact Registry
    # Run Artifact Analysis (Container Analysis / vulnerability scan)

  migrate:
    needs: build-and-push
    if: github.ref == 'refs/heads/main'
    # gcloud run jobs execute migrator-job --wait

  deploy-staging:
    needs: migrate
    # Traffic split: NEW=10, OLD=90 → smoke tests → promote to 100%
    # Auto-rollback if smoke fails

  deploy-production:
    needs: deploy-staging
    environment: production # manual approval gate
```

#### [NEW] `.github/workflows/iac.yml`

```yaml
on:
  pull_request: { paths: ['infra/**'] }
  push: { branches: [main], paths: ['infra/**'] }

jobs:
  plan:
    if: github.event_name == 'pull_request'
    steps:
      - run: terraform plan # output posted as PR comment

  apply:
    if: github.event_name == 'push'
    environment: iac-apply # manual approval gate
    steps:
      - run: terraform apply -auto-approve
```

#### [NEW] `.github/workflows/data-manifest-check.yml`

CI gate: verifies every Prisma model has a registered entry in `libs/data-manifest`. Fails the build if any table is unregistered (I-10).

---

## Sprint 3 — Auth, Organization and Data Layer (Week 3–5)

**Goal**: A user can sign up, create an org, and invite a teammate. Sessions, CASL, RLS, and tenant isolation are all proven by integration tests.

---

### `apps/api/src/modules/auth/`

#### [NEW] `auth.module.ts`, `auth.controller.ts`, `auth.service.ts`

WorkOS AuthKit integration:

| Endpoint                    | Behaviour                                                          |
| --------------------------- | ------------------------------------------------------------------ |
| `POST /api/v1/auth/login`   | Redirect to WorkOS AuthKit                                         |
| `GET /api/v1/auth/callback` | Exchange code for WorkOS session, create Redis server-side session |
| `POST /api/v1/auth/logout`  | Delete Redis session immediately (RULE AUTH-001)                   |
| `GET /api/v1/auth/me`       | Return current user + org + active workspace                       |

Session cookie: `HttpOnly`, `Secure`, `SameSite=Lax`. TTL: 24h inactivity, 7d absolute.
On security events: invalidate ALL user sessions (RULE AUTH-001).

#### [NEW] `auth/api-key.service.ts`

- Generate: `pk_live_` + 40 CSPRNG chars
- Store: `key_prefix` (8 chars) + `key_hash` (SHA-256 — per-request lookup, not bcrypt)
- Validate: hash incoming key, lookup hash, check scopes and expiry, update `last_used_at`
- Never retrievable after creation (RULE AUTH-002)

#### [NEW] `auth/workos-webhook.handler.ts`

`POST /api/v1/webhooks/workos/{random_secret_segment}` — RULE AUTH-004:

1. Verify `WorkOS-Signature` using WorkOS SDK `constructEvent()`
2. Return `401` + log attempt if verification fails
3. Return `200 OK` immediately, enqueue BullMQ job for processing

---

### `apps/api/src/modules/organization/`

#### [NEW] `organization.module.ts`, `organization.controller.ts`, `organization.service.ts`, `organization.repository.ts`

All endpoints are tenant-scoped and CASL-guarded:

| Endpoint                     | Behaviour                                                       |
| ---------------------------- | --------------------------------------------------------------- |
| `GET /api/v1/organization`   | Get current org                                                 |
| `PATCH /api/v1/organization` | Update settings                                                 |
| `POST /api/v1/users/invite`  | Invite user — seat count increments immediately (RULE BILL-001) |
| `GET /api/v1/users`          | List org users (cursor pagination)                              |
| `PATCH /api/v1/users/:id`    | Update role/status                                              |
| `DELETE /api/v1/users/:id`   | Deactivate — seat count decrements immediately                  |
| `GET /api/v1/workspaces`     | List workspaces                                                 |
| `POST /api/v1/workspaces`    | Create workspace                                                |

Seat counting (RULE BILL-001, BILL-005):

- `full_seat_count = COUNT(users WHERE status IN ('pending','active') AND seat_type = 'full')`
- Invite rejected with `402 SEAT_LIMIT_REACHED` if at limit
- Daily cron reconciles count from DB (cached vs. real)

#### [NEW] `organization/casl/ability.factory.ts`

Full CASL ability matrix per Blueprint §7.3 for roles: `owner`, `admin`, `manager`, `member`, `collaborator`.

---

### Integration Tests — Auth and Org

#### [NEW] `apps/api/test/auth/rls-isolation.spec.ts`

RULE MT-001: User in Org A cannot read Org B's data via direct SQL (bypasses Prisma). Every table tested.

#### [NEW] `apps/api/test/auth/tenant-context.spec.ts`

RULE MT-002: Query without `organizationId` in CLS throws, not silently proceeds.

#### [NEW] `apps/api/test/auth/api-key.spec.ts`

RULE AUTH-002: Plaintext API key not in database after creation (only SHA-256 hash stored).

---

## Sprint 4 — Document Editor and Lifecycle (Week 5–7)

**Goal**: A user can create a document, write in the Tiptap editor, create versions, and send the document.

---

### `apps/api/src/modules/document/`

#### [NEW] `document.module.ts`, `document.controller.ts`, `document.service.ts`, `document.repository.ts`

Full endpoint surface per §4.3:

| Endpoint                                | Key behaviour                                                                      |
| --------------------------------------- | ---------------------------------------------------------------------------------- |
| `POST /api/v1/documents`                | Create (copy-on-create from template if `source_template_id` given — RULE SIG-006) |
| `GET /api/v1/documents`                 | List, cursor pagination, filterable by status and workspace                        |
| `GET /api/v1/documents/:id`             | Detail                                                                             |
| `PATCH /api/v1/documents/:id`           | Update metadata/status via enforced state machine (RULE SIG-004)                   |
| `DELETE /api/v1/documents/:id`          | Soft delete                                                                        |
| `POST /api/v1/documents/:id/send`       | Check doc limit (RULE BILL-002), transition to `sent`                              |
| `POST /api/v1/documents/:id/versions`   | Snapshot with `SHA-256(canonicalJson(content_snapshot))` (RULE SIG-002)            |
| `GET /api/v1/documents/:id/versions`    | List versions                                                                      |
| `GET /api/v1/documents/:id/audit-trail` | All `signature_events` for this document                                           |
| `POST /api/v1/documents/:id/pdf`        | Queue PDF generation job                                                           |

**Status state machine** enforced in `DocumentService.transitionStatus()` (RULE SIG-004):

```
draft → sent → viewed → signed     (terminal)
draft → sent → viewed → declined   (terminal)
draft → sent → expired             (terminal)
any non-terminal → voided          (terminal)
any non-terminal → archived        (reversible)
```

Content versioning (INSERT-only, pointer pattern per X-05):

- `document_versions` is INSERT-only
- `documents.current_version_id` pointer updated on each save
- `DocumentService.updateContent()` checks `is_signed` before any write — returns `409 DOCUMENT_VERSION_SIGNED` (RULE SIG-001)

#### [NEW] `document/outbox/document-outbox.service.ts`

All document side-effects via transactional outbox (I-06). Events written in the same DB transaction as the mutation:
`document.created`, `document.sent`, `document.version.created`

#### [NEW] `document/pdf/pdf.service.ts`

Queues `generate-pdf` job to `worker-pdf` BullMQ queue (never inline — RULE PDF-001, PDF-002):

- Job uses `version_id` to render that version's `content_snapshot` exactly
- `worker-pdf` runs Playwright in isolated Cloud Run pool (no VPC egress except viewer origin)
- Appends "Certificate of Completion" page with audit data (RULE PDF-002)
- Stores result in `evidence` Cloud Storage bucket (Object Retention Lock, 7-year default)

---

### `apps/web/src/app/(app)/documents/`

#### [NEW] Document Hub page `/documents`

- Real `<table>` element (Design System rule: tables for list data, never card grids)
- Columns: Title, Status badge, Owner, Sent date, Actions
- Filterable by status and workspace; cursor-based pagination
- **Required states**: empty, loading skeleton, error (Design System §15)

#### [NEW] Document Editor page `/documents/[id]/edit`

- Tiptap 3 with extensions: Text, Heading, BulletList, OrderedList, Image, HardBreak
- Save triggers `POST /api/v1/documents/:id/versions`
- Switches to read-only mode the instant `is_signed = true` or any `signature_events` exist (RULE SIG-001)
- Auto-save (debounced 2s)

#### [NEW] Document Send modal

- Recipient email input, expiry date, access controls
- Calls `POST /api/v1/documents/:id/send`
- Shows upgrade modal on `402 DOCUMENT_LIMIT_REACHED` (RULE BILL-002)

---

### Recipient Viewer `apps/web/src/app/(recipient)/d/[slug]/`

#### [NEW] `page.tsx` (SSR)

- Renders entirely from `document_versions.content_snapshot` — BoldSign API not needed for viewing (RULE BOLD-001)
- Timezone-aware expiry display in viewer's local timezone (RULE I18N-001)
- Password gate if `documents.password_hash` is set
- Domain restriction check against `documents.domain_restriction[]`
- Tracking pixel + page-load view event → ClickHouse (RULE AN-001)

---

## Sprint 5 — Billing, Signing and Payments (Week 7–10)

**Goal**: Paddle checkout works. BoldSign signing request is created and webhook handled. Payment link is shown post-signature.

---

### `apps/api/src/modules/billing/`

#### [NEW] `billing.module.ts`, `billing.service.ts`

Paddle integration:

| Endpoint / Handler                      | Behaviour                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------- |
| `POST /api/v1/billing/checkout`         | Returns Paddle Checkout data for client-side overlay                                        |
| `POST /api/v1/webhooks/paddle/{secret}` | Verify `Paddle-Signature` → `401` if fails. Return `200 OK` immediately, enqueue BullMQ job |
| `GET /api/v1/billing/portal`            | Redirect to Paddle Customer Portal                                                          |

BullMQ job processes:

- `subscription.created` — provision plan (RULE PAD-001: handle out-of-order via delayed re-process)
- `subscription.updated` — update plan/seats/status
- `subscription.cancelled` — 30-day grace period, no immediate deactivation (RULE PAD-002)
- `transaction.completed` — confirm payment
- `customer.updated` — sync details

Plan enforcement middleware: checks `subscriptions.plan_tier` + `subscriptions.status` from Redis-cached data on every plan-gated request.

---

### `apps/api/src/modules/signing/`

#### [NEW] `signing.module.ts`, `signing.service.ts`, `signing.repository.ts`

BoldSign integration via `SigningProviderPort` adapter:

| Endpoint                                        | Behaviour                                                                                                         |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `POST /api/v1/documents/:id/signature-requests` | Snapshot version, create BoldSign request, store `external_provider_id`, create signer records, emit outbox event |
| `POST /api/v1/signature-requests/:id/void`      | Void request, emit outbox event                                                                                   |
| `POST /api/v1/signature-requests/:id/remind`    | Send reminder to pending signers                                                                                  |
| `POST /api/v1/webhooks/boldsign/{secret}`       | Verify `X-BoldSign-Signature` → `401` if fails. Return `200 OK`, enqueue job                                      |
| `GET /api/v1/sign/{token}`                      | External signer entry point — verify identity per `verification_method`                                           |

BoldSign webhook job processes:

- `Sent` — update signer status
- `Viewed` — record view event
- `Signed` — lock version (RULE SIG-002), update signer, emit `document.signed` outbox event
- `Declined` — update status, notify sender
- `Completed` — all signed, trigger payment collection
- `Revoked` — void request

Signer substitution: RULE SIG-005 — set old signer to `reassigned`, create event record, create new signer. Never delete.

**BoldSign reconciliation cron** (RULE BOLD-002): every 15 min, polls BoldSign for in-progress requests older than 1 hour, reconciles mismatches server-side.

External signer identity (RULE AUTH-005):

- Identity verified per `verification_method`: `email` OTP, `passcode`, `sms` OTP
- Signing token expires after 90 days or request expiry

---

### `apps/api/src/modules/payments/`

#### [NEW] `payments.module.ts`, `payments.service.ts`

Phase-0 scope: **Payment Link tier only** (no encrypted API keys — that's Phase 2):

| Endpoint                                         | Behaviour                                                                |
| ------------------------------------------------ | ------------------------------------------------------------------------ |
| `POST /api/v1/organizations/payment-connections` | Register payment link URL template                                       |
| `POST /api/v1/documents/:id/payments/initiate`   | Substitute `{{amount}}`, `{{currency}}`, `{{reference}}` in URL template |
| `PATCH /api/v1/payments/:id/confirm`             | Manual sender confirmation of payment                                    |

`CredentialVaultService` scaffolded (per §5.3) but only used for payment-link connections in Phase 0. Full envelope encryption (Cloud KMS → TK → DEK → AES-256-GCM) wired in Phase 2.

---

### `apps/api/src/modules/notification/`

#### [NEW] `notification.module.ts`, `notification.service.ts`

Resend via `EmailPort` adapter:

- Email sending is always a BullMQ job with 3 retries + exponential backoff (RULE NOTIF-001)
- Document status transitions **never** depend on email delivery success
- Preference check before every notification dispatch (RULE NOTIF-002)
- Notification types: `signing-invitation`, `document-signed`, `document-declined`, `document-expired`, `email-delivery-failed`

---

## Sprint 6 — Observability, Tests and Definition of Done (Week 10–14)

**Goal**: CI is green. RLS isolation tests pass 100%. E2E critical flows pass. System deployed to staging.

---

### Observability

#### [NEW] `apps/api/src/common/logging/pino.config.ts`

Structured JSON logging: every line includes `timestamp`, `level`, `message`, `requestId`, `organizationId`, `userId`, `traceId`. Sensitive field masking via Pino serializers.

#### [NEW] `apps/api/src/common/health/health.controller.ts`

RULE INFRA-002:

- `GET /health/live` — process alive check only (always fast)
- `GET /health/ready` — `SELECT 1` on Postgres, `PING` on Redis, `SELECT 1` on ClickHouse (all within 2s), returns `503` with failing component if any fail

#### [NEW] `apps/api/src/common/telemetry/otel.ts`

OpenTelemetry SDK. Traces shipped to Grafana Tempo via Grafana Alloy sidecar.

#### [NEW] `apps/api/src/common/metrics/prometheus.ts`

Prometheus `/metrics` endpoint:

- `http_request_duration_seconds` (histogram by route + status)
- `http_requests_total` (counter by route + status)
- `bullmq_job_duration_seconds` (histogram by queue + job type)
- `bullmq_jobs_waiting` (gauge by queue)

---

### Critical Test Suite

#### [NEW] `apps/api/test/rls/cross-tenant-isolation.spec.ts`

Runs raw SQL with `app.current_tenant = Org_A_id`, attempts to access Org B's records in every Phase-0 table. Every query must return 0 rows.

#### [NEW] `apps/api/test/rls/rls-under-pooler.spec.ts`

Proves `SET LOCAL app.current_tenant` and the subsequent query share the same connection when PgBouncer is in transaction mode (Blueprint §3.4 X-02). Uses TestContainers + PgBouncer container.

#### [NEW] `apps/api/test/signing/immutability.spec.ts`

RULE SIG-001: Raw SQL `UPDATE document_versions SET content_snapshot = '{}'::jsonb WHERE is_signed = true` must throw `RAISE EXCEPTION` from the trigger.

#### [NEW] `apps/api/test/signing/audit-trail-immutability.spec.ts`

Raw SQL `UPDATE signature_events` and `DELETE FROM signature_events` must throw.

#### [NEW] `apps/api/test/billing/seat-counting.spec.ts`

RULE BILL-001: Invite user → `full_seat_count` increments immediately. Deactivate → decrements.

#### [NEW] `apps/api/test/billing/paddle-webhook-idempotency.spec.ts`

Send same `subscription.created` payload twice → only one `subscriptions` record created.

#### [NEW] `apps/api/test/auth/permission-matrix.spec.ts`

For every role × action in §7.3: CASL allows/denies correctly (parametrized test per matrix row).

#### [NEW] `apps/api/test/document/status-machine.spec.ts`

RULE SIG-004: Illegal transitions (e.g., `signed → draft`) return `409 Conflict`.

#### [NEW] `apps/web-e2e/` (Playwright)

Five critical flows (Phase-0 DoD):

1. Sign up → create org → invite teammate
2. Create document → write content → create version
3. Send document → signer receives email → signer views
4. Signer signs → sender sees completion
5. Payment link shown post-signature → manual confirmation

---

## Full Phase 0 File Tree

```
pactintel2/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── common/
│   │   │   │   ├── filters/
│   │   │   │   ├── guards/
│   │   │   │   ├── interceptors/
│   │   │   │   ├── middleware/
│   │   │   │   ├── pipes/
│   │   │   │   ├── health/
│   │   │   │   ├── logging/
│   │   │   │   ├── metrics/
│   │   │   │   ├── telemetry/
│   │   │   │   └── http-client/
│   │   │   ├── modules/
│   │   │   │   ├── auth/
│   │   │   │   ├── organization/
│   │   │   │   ├── document/
│   │   │   │   ├── signing/
│   │   │   │   ├── payments/
│   │   │   │   ├── billing/
│   │   │   │   └── notification/
│   │   │   ├── casl/
│   │   │   └── prisma/
│   │   │       ├── schema.prisma
│   │   │       ├── migrations/0001_initial/
│   │   │       └── prisma-tenant.extension.ts
│   │   └── test/
│   │       ├── rls/
│   │       ├── signing/
│   │       ├── billing/
│   │       ├── auth/
│   │       └── document/
│   ├── web/
│   │   └── src/
│   │       ├── app/
│   │       │   ├── (app)/
│   │       │   │   ├── layout.tsx
│   │       │   │   ├── dashboard/
│   │       │   │   └── documents/
│   │       │   └── (recipient)/
│   │       │       └── d/[slug]/
│   │       ├── components/
│   │       └── lib/
│   ├── collab-server/
│   └── web-e2e/
├── libs/
│   ├── shared-types/
│   ├── shared-utils/
│   ├── ui/
│   ├── ai/
│   └── data-manifest/
├── infra/
│   ├── modules/
│   │   ├── foundation/
│   │   ├── cell/
│   │   ├── control-plane/
│   │   ├── edge/
│   │   └── observability/
│   └── environments/
│       ├── dev/
│       └── staging/
├── docs/
│   └── runbooks/
│       ├── deploy.md
│       ├── rollback.md
│       └── db-migration.md
├── .github/
│   └── workflows/
│       ├── ci.yml
│       ├── iac.yml
│       └── data-manifest-check.yml
├── docker-compose.yml
├── nx.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .eslintrc.json
├── .prettierrc
├── commitlint.config.js
├── .gitignore
├── AGENTS.md
├── GEMINI.md
└── README.md
```

---

## Architecture Invariants — Verification Map

| Invariant                               | Verified In Sprint                                                  |
| --------------------------------------- | ------------------------------------------------------------------- |
| I-01 Defer capacity, never structure    | 1 — IaC parameterized, no hardcoded limits                          |
| I-04 Everything is IaC                  | 2 — Terraform covers all GCP resources                              |
| I-05 Every dependency behind a port     | 3–5 — `SigningProviderPort`, `BillingPort`, `EmailPort`, `AuthPort` |
| I-06 Outbox for all side-effects        | 4 — document outbox service                                         |
| I-07 Process types separated from Day 1 | 1 — separate apps: api, worker-*, collab, web-viewer                |
| I-08 Public IDs permanent and versioned | 1 — document slug format, UUIDv7, API key prefix                    |
| I-09 Sealed content never migrated      | 4 — `is_signed` DB trigger, read-time upcasting only                |
| I-10 Data manifest                      | 1 — `libs/data-manifest` created; CI gate Sprint 2                  |
| I-11 Key hierarchy fixed                | 2 — Cloud KMS key rings per purpose in IaC                          |
| I-13 Noisy-neighbor controls            | 5 — per-org rate limiting, plan-based quotas                        |

---

## Key Design Decisions (Locked)

| Decision              | Value                                                              | Blueprint Ref       |
| --------------------- | ------------------------------------------------------------------ | ------------------- |
| Primary keys          | UUIDv7 (application-generated)                                     | D-05, X-14          |
| Pagination            | Cursor-based only — no offset                                      | D-21, X-49          |
| Tenant isolation      | CASL + Prisma extension + RLS (3 layers)                           | §7.1                |
| Content hash          | SHA-256 of `canonicalJson(content_snapshot)`                       | RULE SIG-002        |
| Session storage       | Redis server-side only — never JWT                                 | RULE AUTH-001       |
| API key hashing       | SHA-256 (not bcrypt) — per-request lookup                          | RULE AUTH-002, D-13 |
| Evidence storage      | Cloud Storage + Object Retention Lock (7yr)                        | RULE STORE-002      |
| Document immutability | DB triggers (not application code)                                 | RULE SIG-001, §3.3  |
| Email delivery        | Always BullMQ job — never inline — never blocks status transitions | RULE NOTIF-001      |
| Webhook processing    | Always `200 OK` immediately, then BullMQ job                       | RULE WH-002         |

---

## Verification Plan

### Automated Tests

```bash
# Full test suite with coverage
pnpm nx run-many --target=test --all --coverage

# RLS isolation — MUST pass 100%
pnpm nx run api:test --testPathPattern=rls

# Document immutability triggers
pnpm nx run api:test --testPathPattern=signing/immutability

# Permission matrix (all role × action combinations)
pnpm nx run api:test --testPathPattern=auth/permission-matrix

# Billing rules
pnpm nx run api:test --testPathPattern=billing

# E2E critical flows (5 flows)
pnpm nx run web-e2e:e2e

# Type check all projects
pnpm nx run-many --target=typecheck --all

# Lint all projects
pnpm nx run-many --target=lint --all

# Build all process types
pnpm nx run-many --target=build --all
```

### Manual Verification — Definition of Done

Phase-0 DoD is complete when ALL of the following are demonstrated on staging:

- [ ] **Signup**: New user signs up via WorkOS AuthKit → org created → workspace created → dashboard
- [ ] **Invite**: Admin invites teammate → `full_seat_count` increments → invite email via Resend → teammate accepts → active
- [ ] **Document creation**: Member creates blank document → writes in Tiptap → saves (version + SHA-256 hash created)
- [ ] **Send**: Member sends document → `documents_used_this_period` increments → BoldSign request created → email delivered
- [ ] **Signing**: External signer views doc (renders from `content_snapshot`, no BoldSign needed) → signs → `signature_events` row created → `is_signed = true` → trigger blocks further UPDATE
- [ ] **Payment link**: Post-signature block renders → signer redirected to payment URL → sender manually confirms
- [ ] **Paddle billing**: Upgrade → Checkout overlay → subscribe → `subscription.created` webhook handled → `plan_tier` updated → limits enforced
- [ ] **Plan enforcement**: User at doc limit → `POST /send` returns `402 DOCUMENT_LIMIT_REACHED` → upgrade modal shown
- [ ] **RLS**: Automated test — Org B's records return 0 rows when `app.current_tenant = Org A`
- [ ] **Immutability**: Raw SQL UPDATE on signed `document_versions` throws PostgreSQL exception
- [ ] **CI green**: All lints + tests pass, all process-type images build, staging deploy succeeds
- [ ] **Health check**: `GET /health/ready` returns `200` with all components healthy

---

## Risk Register

| Risk                                                         | Likelihood | Impact | Mitigation                                                                        |
| ------------------------------------------------------------ | ---------- | ------ | --------------------------------------------------------------------------------- |
| Hocuspocus WebSocket sticky-session requirement on Cloud Run | Medium     | High   | ADR-0036 documents GKE Autopilot fallback; Phase-0 collab is scaffold only        |
| SeaweedFS not fully GCS API-compatible                       | Medium     | Low    | Only proves structural plumbing; use real GCS dev bucket for retention-lock tests |
| Paddle webhook out-of-order delivery                         | Medium     | High   | Delayed re-process job (RULE PAD-001), idempotency key, test case                 |
| BoldSign API surface changes pre-integration                 | Low        | Medium | `SigningProviderPort` adapter isolates all BoldSign-specific code                 |
| Cloud Run min-instances = 0 cold start on signing page       | Medium     | Medium | Set `min-instances = 1` for `web-viewer` in production IaC from Day 1             |
| UUIDv7 library compatibility with Prisma                     | Low        | Medium | Application-generated IDs passed to Prisma — no DB `DEFAULT` needed               |
| SeaweedFS Docker image version drift                         | Low        | Low    | Pin exact image tag; document `[VERIFY]` flag                                     |
