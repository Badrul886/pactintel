# ADR-0059: Phase 3 Sprint 3.12 - Public REST API Design, TypeScript SDK Generation, Model Context Protocol (MCP) Connector, and Mobile Architecture Specification

## Status

Accepted

## Context

As PactIntel completes Phase 3 of its enterprise legal-tech roadmap, the platform must transition from internal web application interfaces to a full developer platform. Modern enterprise legal departments, sales operations, and autonomous AI systems require programmatic access to draft, negotiate, execute, and query contracts, templates, approval workflows, CPQ pricing rules, and standalone forms.

Specifically, Sprint 3.12 requires:

1. A permanent, versioned Public REST API contract (`/api/v1/`) with machine-readable OpenAPI 3.0 specification and Postman collection.
2. High-performance, cryptographically secure API Key management with SHA-256 indexed hashing, granular scope authorization, rate limiting (1000 req/min), and admin MFA protection.
3. Enterprise webhook delivery architecture with HMAC-SHA256 payload signing, automated exponential backoff retries, and manual testing capabilities.
4. An AI Model Context Protocol (MCP) server enabling external AI agents to programmatically query and trigger PactIntel workflows.
5. An official TypeScript/JavaScript SDK (`@pactintel/sdk`) providing a typed developer experience.
6. Embedded White-Label iframe routes (`/embed/editor/:id` and `/embed/sign/:id`) with relaxed Content-Security-Policy (CSP) `frame-ancestors`.
7. Mobile application backend readiness (device token storage, registration/deregistration, push notifications via FCM/APNs) and a comprehensive architectural specification (`docs/mobile/ARCHITECTURE.md`), while deferring native mobile client UI development on demand to future phases (Phase 4+).

## Decision

1. **API Versioning & Stability Contract (Invariant I-08)**:
   - All public endpoints are permanently routed under `/api/v1/`. Breaking contract modifications require a version increment (`/api/v2/`).
   - Deprecated endpoints emit `Deprecation: true` and `Sunset: <date>` HTTP headers.
   - An API Changelog is maintained at `docs/api/CHANGELOG.md`.

2. **API Key Security Architecture**:
   - Plaintext API keys (`pi_live_...` / `pi_test_...`) are displayed to the caller exactly once at creation (RULE AUTH-002).
   - Keys are stored in the database exclusively as SHA-256 hashes for indexed lookup (`where: { keyHash }`, D-13, X-21), avoiding expensive per-request Argon2/bcrypt calculations.
   - Scopes enforce least privilege (e.g., `read:documents`, `write:documents`, `manage:webhooks`).
   - Per-key sliding-window rate limiting is enforced at 1000 requests per minute.
   - API key operations require admin/owner privilege with verified MFA.

3. **OpenAPI 3.0 Specification & Postman Collection**:
   - Comprehensive OpenAPI 3.0 specification committed to `docs/api/openapi.yaml`, defining endpoints, parameters, request/response JSON schemas, and security schemes (`ApiKeyAuth`, `BearerAuth`).
   - Postman Collection committed to `docs/api/pactintel.postman_collection.json` with pre-configured environment variables and test scripts.

4. **Outbound Webhooks Delivery & Verification**:
   - Webhooks are delivered via HTTP POST with header `X-Webhook-Signature: sha256=<hex_hmac>` computed using the subscription's secret and payload body.
   - Deliveries retry up to 3 times on transient failures with exponential backoff delays (1s, 4s, 16s).
   - Interactive testing endpoint: `POST /api/v1/webhooks/:id/test` sends an immediate test event with delivery log capture.
   - Developer documentation with signature verification examples in TypeScript, Python, and Go is published at `docs/api/webhooks.md`.

5. **Model Context Protocol (MCP) Server**:
   - Deployed as a dedicated Cloud Run microservice (`apps/mcp-server/`, `infra/modules/cell/mcp-server.tf`) with mandatory GCP labels (`service=mcp`, `tier=api`).
   - Exposes 8 standard tools: `create_document`, `send_document`, `get_document_status`, `list_documents`, `create_signature_request`, `get_signature_status`, `trigger_workflow`, and `search_portfolio`.
   - AI agents authenticate using standard PactIntel API keys passed in the connection context.

6. **TypeScript SDK (`@pactintel/sdk`)**:
   - Maintained in `libs/sdk/` as a monorepo package.
   - Provides strongly-typed resource clients (`documents`, `templates`, `signatures`, `workflows`, `forms`, `webhooks`), automated transient retry logic, and ergonomic helper methods.

7. **Mobile Architecture & Backend Readiness**:
   - Complete technical specification authored in `docs/mobile/ARCHITECTURE.md` establishing React Native + Expo (managed workflow), Zustand, Expo SecureStore, and WebView renderers for signing/viewing.
   - Client UI development is formally deferred to Phase 4+ per product roadmap directives.
   - Backend implements full mobile readiness:
     - `devices` table with UUIDv7 PK, tenant RLS, and Data Manifest registration.
     - Endpoints: `POST /api/v1/devices/register` and `DELETE /api/v1/devices/:id`.
     - Push notification dispatch integrated into `NotificationService` (with circuit breakers for FCM and APNs).

8. **White-Label Embedded Routes**:
   - `/embed/editor/:id` and `/embed/sign/:id` allow customer host applications to embed PactIntel editor and signing workflows in iframes.
   - HTTP response headers dynamically configure `Content-Security-Policy: frame-ancestors <allowed_origins>` based on the organization's verified domain settings.

## Consequences

- **Pros**:
  - Full developer ecosystem unlocks automated integrations with CRMs, ERPs, CI/CD pipelines, and AI agent workflows.
  - Zero performance degradation on authentication due to SHA-256 indexed lookups.
  - Strict compliance with GCP-only infrastructure rules and multi-tenant RLS isolation.
  - Mobile architecture is fully resolved and backend push endpoints are active, eliminating future mobile backend migration friction.
- **Cons**:
  - Webhook delivery infrastructure requires monitoring for failed consumer endpoints.
  - OpenAPI specifications must be kept strictly synchronized with API route changes.

## Alternatives Considered

- **Bcrypt/Argon2 for API Key Hashes**: Rejected per ADR-0013 and X-21. High CPU overhead on every API call degrades throughput; high-entropy CSPRNG tokens with SHA-256 indexing provide equivalent security without denial-of-service risks.
- **Native Mobile Document Renderer in Phase 3**: Rejected per Blueprint and user guidance. Maintaining dual native rendering engines (Tiptap ProseMirror web vs native canvas) creates severe visual parity divergence; WebView embedding preserves legal document rendering fidelity.
