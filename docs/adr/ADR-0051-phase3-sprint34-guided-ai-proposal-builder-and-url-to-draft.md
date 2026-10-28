# ADR-0051: Phase 3 Sprint 3.4 — Guided AI Proposal Builder and URL-to-Draft Architecture

## Status: Accepted

## Context

Phase 2 established foundational in-editor AI text generation and editing capabilities (ADR-0044) with centralized rate-limiting, audit logging with hashed prompts, and server-side guardrails via `AiGateway`. However, sales reps and commercial account executives require a streamlined, guided experience to construct end-to-end commercial proposals rapidly without manually authoring or assembling sections in an editor.

Furthermore, top-of-funnel customer acquisition requires a frictionless public demonstration tool: the **URL-to-Draft** tool (`/ai/url-to-draft`), allowing any prospect to supply their company's landing page or product URL and receive an instant, AI-generated commercial proposal draft without logging in.

These requirements introduce critical architectural, legal, and security considerations:

1. **Dynamic Intake Questionnaires & Schema Decoupling**: Templates must support structured intake question banks with types (text, number, date, single_select, multi_select, crm_field) and conditional logic (`dependsOn`) without requiring destructive schema migrations.
2. **CRM Integration Resilience (Invariant I-12)**: Commercial reps often connect HubSpot or Salesforce. If the CRM service is offline, credentials expire, or rate limits occur, document creation MUST NEVER fail or block. The system must degrade gracefully, substitute sensible placeholders, and issue an advisory warning.
3. **AI Safety, Traceability & Human-in-the-Loop (RULE AI-001, AI-002, AI-003, A6.7)**:
   - Zero customer data used for model training.
   - All AI-assembled nodes in Tiptap must carry explicit metadata `{ attrs: { createdBy: 'ai' } }` to ensure users visually inspect and explicitly accept AI-generated content.
   - AI guardrails (`organizations.settings.ai_guardrails`) must be enforced server-side with 403 `AI_GUARDRAIL_VIOLATION`.
   - Prompts must reside exclusively in the prompt registry (`libs/ai/src/prompts/`), never inline in application code.
4. **Data Residency (Invariant I-14, RULE GDPR-002)**: EU-resident tenants must be routed exclusively to Vertex AI EU regional endpoints. If unavailable, return HTTP 503 `FEATURE_UNAVAILABLE_IN_REGION` rather than silently routing data to US infrastructure.
5. **SSRF & Abuse Hardening for Public URL-to-Draft**: Allowing unauthenticated users to submit arbitrary URLs introduces severe Server-Side Request Forgery (SSRF) and Denial of Service risks against internal cloud infrastructure (e.g., GCP metadata service `169.254.169.254`, internal VPC services, Redis/PostgreSQL ports).
6. **Zero-Persistence Guarantee for Ephemeral Data**: Public URL scraping and generated drafts must never persist to the database to preserve tenant boundaries and avoid unmanaged data accumulation.

---

## Decisions

### 1. Template Intake Question Model in JSONB

Intake questions are stored in `templates.variable_fields` JSONB, supporting backwards-compatible extension of `TemplateVariableField`:

- `id`: Unique identifier (string).
- `label`: Human-readable question text.
- `type`: `'text' | 'number' | 'date' | 'email' | 'single_select' | 'multi_select' | 'crm_field'`.
- `options`: List of allowable options for select questions.
- `crmFieldMapping`: Field key in the CRM entity (e.g., `deal_amount`, `company_name`, `contact_email`).
- `required`: Boolean flag indicating mandatory input.
- `placeholder`: Suggested example input.
- `dependsOn`: Optional conditional rule `{ questionId, operator: 'equals' | 'not_equals', value }` determining conditional visibility.

### 2. Resilient CRM Data Pull (Invariant I-12)

- At proposal assembly time, `GuidedProposalService` attempts to fetch deal and company records from the connected CRM via `IntegrationService`.
- If no integration exists, the connection is suspended, or the request fails/times out, the service catches the error, logs a warning, substitutes standard variable placeholders (e.g., `{{company_name}}`), and returns `crmWarning` to notify the user. Document generation proceeds unimpeded.

### 3. AI Proposal Assembly Engine (`AiGateway`)

- Registered task ID: `guided-proposal-assembly`.
- Prompt specification: `libs/ai/src/prompts/guided-proposal-assembly.prompt.ts`.
- The prompt instructs the model to generate structured Tiptap JSON blocks.
- Post-processing traversal marks all top-level and nested block nodes with `{ attrs: { createdBy: 'ai' } }`.
- Server-side guardrails check `organizations.settings.ai_guardrails` before dispatch; violations throw 403 `AI_GUARDRAIL_VIOLATION`.
- Regional endpoint routing directs EU organizations to `VERTEX_AI_EU_ENDPOINT` and US organizations to `VERTEX_AI_US_ENDPOINT`. If the regional endpoint fails, no cross-region fallback is attempted (strict GDPR-002 compliance).

### 4. Public URL-to-Draft Tool & SSRF Security Barrier

- Endpoint: `POST /api/v1/ai/url-to-draft` (public, unauthenticated).
- **Rate Limiting**: Sliding window of 3 requests per IP per hour enforced via Redis (`ai:ratelimit:ip:<ip>`), falling back to an in-memory sliding window when Redis is unavailable. Excess requests return HTTP 429 `TOO_MANY_REQUESTS`.
- **SSRF Guard (`ssrf-guard.util.ts`)**:
  - Rejects non-HTTP/HTTPS protocols.
  - Resolves target hostnames via DNS.
  - Blocks RFC 1918 private IPv4 ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`).
  - Blocks loopback addresses (`127.0.0.0/8`, `::1`).
  - Blocks link-local addresses, carrier-grade NAT, and cloud metadata endpoints (`169.254.169.254`, `169.254.0.0/16`, `fc00::/7`).
  - Imposes a 5-second fetch timeout and 2MB payload cap.
- **Zero Database Persistence**: Neither scraped text nor generated proposal draft is written to PostgreSQL or object storage. Output is returned ephemerally to the client with a CTA to sign up and import into a workspace.

### 5. Frontend Multi-Step Wizard & Public Layout

- Guided Proposal Builder wizard adheres to `docs/DESIGN_SYSTEM.md`: 5-step flow (Template Selection -> Intake Form -> CRM Review -> Live AI Assembly -> Preview & Accept), Inter typography, `#2563EB` primary interactive accent, clear error/loading states.
- URL-to-Draft page renders a clean 720px centered recipient layout with URL input, sample demonstration links, progress indicator, and an interactive proposal preview with CTA.

---

## Consequences

### Positive

- **High-Velocity Document Creation**: Reduces commercial proposal creation time from hours to under 60 seconds.
- **Enterprise Compliance**: Adheres to strict EU data residency (GDPR-002) and audit logging without leaking prompt contents.
- **Human-in-the-Loop Integrity**: AI-generated blocks are transparently tagged (`createdBy: 'ai'`) preventing unreviewed document dispatch.
- **Zero-Downtime Resilience**: CRM failures never disrupt proposal assembly (Invariant I-12).
- **Public Tool Security**: Robust SSRF prevention eliminates internal network reconnaissance and cloud metadata compromise.

### Negative / Trade-offs

- Ephemeral URL-to-draft tool requires users to sign up and recreate/import drafts into a workspace to preserve them.
- Public rate limiting by IP may affect users sharing corporate NAT gateways (mitigated by generous 3 req/hr baseline for a free acquisition tool).

---

## Alternatives Considered

1. **Inline Prompts within API Services**: Rejected. Blueprint Rule A6.7 strictly mandates that all prompts reside in `libs/ai/src/prompts/` and are cataloged in `PROMPT_REGISTRY`.
2. **Automatic Cross-Region LLM Fallback on Outage**: Rejected. Violates RULE GDPR-002 and Invariant I-14. EU data residency must never be compromised for availability.
3. **Persisting Public URL-to-Draft Submissions to a Scratch Database**: Rejected. Creating unauthenticated database records creates spam vectors and table bloat without verified tenant tenancy.
