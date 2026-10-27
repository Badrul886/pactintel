# ADR-0044: In-Editor AI Drafting, Centralized AiGateway, Regional Routing, and Server-Side Guardrails

**Status:** Accepted  
**Date:** 2026-10-25  
**Authors:** System Architecture Team  
**Related:** [Blueprint §7, §8, §16, §20, Invariant I-05, I-08, I-10, I-12, I-13, I-14](../MASTER_IMPLEMENTATION_BLUEPRINT.md), [Product Blueprint §7](../PRODUCT_BLUEPRINT.md), [Design System §15](../DESIGN_SYSTEM.md), [Phase 2 Build Plan](../../phase2_build_plan.md)

---

## Context

PactIntel is a legal-tech SaaS platform handling legally binding contracts, signatures, and payments. Customers and sales professionals require generative AI assistance directly within the document editor to draft contract clauses, refine language, and fix grammatical mistakes.

However, enterprise legal-tech platforms face critical compliance, privacy, and security hazards when integrating LLMs:

1. **Model & Provider Encapsulation (RULE AI-004)**: Application and feature code must never directly import external vendor SDKs (`@google-cloud/aiplatform` or `@anthropic-ai/sdk`) or reference specific model family strings. All AI interactions must traverse an abstracted `AiGateway` using task IDs.
2. **Strict Prompt Registry (RULE A6.7)**: Prompts must not be scattered or hardcoded inline in feature services or UI components. All prompts must reside in a centralized, versioned prompt registry (`libs/ai/prompts/`).
3. **Data Residency & In-Jurisdiction Processing (Invariant I-14, RULE EC-AI-02)**: EU customer documents and prompts must stay within EU jurisdiction. The gateway must resolve the organization's cell region and route EU requests to the regional Vertex AI EU endpoint (`europe-west1` / `europe-west4`).
4. **Tenant Isolation & Zero Training (RULE AI-001, AI-014)**: Model calls must use provider zero-data-retention / no-training enterprise contracts (DPAs). Cross-tenant context leakage is strictly prohibited. Document context passed to the prompt must be an author-specified summary ($\le 500$ chars), never an automated dump of entire contract bodies or other documents.
5. **Server-Side Guardrails & Audit Logging (RULE AI-002, AI-003)**: Organizations must be able to globally disable AI features or selectively exclude confidential documents. Every AI generation attempt must be immutably recorded in `ai_generation_logs` storing SHA-256 `prompt_hash` (never raw prompt text for confidentiality), token usage, latency, and outcome.
6. **Editor Attribution vs. Recipient Privacy (RULE AI-002)**: In-editor generated text carries a `data-ai-generated="true"` attribute and UI spark indicator for the internal sales rep. This visual indicator must NEVER be visible or leaked on recipient viewing or signing pages (`/d/[slug]`, `/sign/[token]`).
7. **Rate Limiting & Abuse Prevention (Invariant I-13)**: To prevent runaway costs and denial-of-service, AI endpoints must be protected by per-user (20 req/min) and per-organization (200 req/min) rate limits.

---

## Decisions

### 1. Centralized Prompt Registry (`libs/ai/src/prompts/`)

- All system prompts and user templates are defined as structured task definitions:
  - `DRAFT_SECTION_V1`: Generates a professional clause/section given a task, tone, and brief context.
  - `REFINE_TEXT_V1`: Rephrases selected text (condense, expand, tone shift, custom).
  - `GRAMMAR_FIX_V1`: Corrects spelling and punctuation with zero content drift.
  - `TRANSLATE_V1`: Stubbed for Phase 4 internationalization.
- System prompts explicitly enforce conciseness, refuse fabrication of facts/names/figures not provided by the user, and output only the desired text without preambles or conversational commentary.

### 2. Multi-Tiered Architecture & Ports (`LlmPort`)

- `LlmPort` specifies an abstract interface:
  ```typescript
  export interface LlmPort {
    generate(request: LlmCompletionRequest): Promise<LlmCompletionResponse>;
  }
  ```
- Concrete adapters:
  - `VertexAiAdapter` (`apps/api/src/modules/ai/adapters/vertex-ai/vertex-ai.adapter.ts`): Primary adapter invoking Claude via Google Cloud Vertex AI endpoint. Dynamically targets regional endpoints (`us-central1` vs `europe-west1`). Handles 429 transient rate limits with backoff retry (`EC-AI-01`).
  - `AnthropicAdapter` (`apps/api/src/modules/ai/adapters/anthropic/anthropic.adapter.ts`): Fallback adapter communicating directly with Anthropic API.
- Vendor SDK imports (`@google-cloud/aiplatform`, `@anthropic-ai/sdk`) are restricted strictly to these adapter directories, enforced by automated CI lint rule `ADP-001`.

### 3. Gateway Routing & Guardrails (`AiGateway`)

- `AiGateway.generate(taskId, input, context)` coordinates execution:
  1. **Server-Side Guardrails (RULE AI-003)**: Queries `organization.settings.ai_guardrails`. Rejects with `403 ForbiddenException` (`AI_GUARDRAIL_VIOLATION`) if AI is globally disabled or if `context.documentId` is in the excluded list.
  2. **Regional Routing (Invariant I-14)**: Resolves the tenant's cell region; selects the appropriate regional Vertex AI endpoint.
  3. **Prompt Resolution**: Looks up task definition in `PROMPT_REGISTRY`. Throws `400 BadRequestException` on unknown tasks.
  4. **Hashing & Execution**: Computes SHA-256 of the synthesized prompt. Dispatches to `LlmPort`.
  5. **Auditing (RULE AI-002)**: In a `finally` block, creates an entry in `ai_generation_logs` recording `promptHash`, token counts, `latencyMs`, status (`success` | `error` | `rejected`), and error codes. Raw prompt text is never stored.

### 4. API Endpoint & Rate Limiting

- `POST /api/v1/ai/generate`:
  - Protected by `AuthGuard` and CASL policy `can('use', 'AiFeature')`.
  - Collaborator role explicitly denied `AiFeature` access. Member and Manager permitted.
  - Validated by `ZodValidationPipe(AiDraftDtoSchema)`.
  - Protected by Redis sliding-window rate limiters: 20 req/user/min and 200 req/org/min. Returns `429 Too Many Requests` on breach.

### 5. Frontend In-Editor AI Panel

- Integrated into the document editor (`apps/web/src/app/(app)/documents/[id]/edit/`):
  - 300px non-modal right-side drawer that does not block document co-editing.
  - Activated via toolbar "AI" button or floating bubble button when text $>10$ characters is selected.
  - Modes:
    - **Draft Section**: Prompt textarea + tone dropdown (`professional`, `friendly`, `formal`, `casual`).
    - **Refine Selected**: Text snippet preview (truncated to 200 chars) + instruction selector (`condense`, `expand`, `change_tone`, `grammar_fix`, `custom`).
    - **Grammar Fix**: One-click spelling and grammar revision.
  - Displays loading state with animated indicator.
  - Results box with explicit **[Accept]** and **[Discard]** buttons. Auto-insertion is strictly prohibited.
  - On Accept: Inserts content marked with `data-ai-generated="true"`.
  - Editor displays an AI indicator in the block header.
  - Recipient pages (`/d/[slug]`, `/sign/[token]`) strip or never render `data-ai-generated` attributes (RULE AI-002).

---

## Consequences

### Positive

- Strict compliance with enterprise legal and confidentiality standards.
- In-jurisdiction guarantee for European Union tenants.
- Complete auditability of AI usage with zero storage of sensitive prompt plaintext.
- Seamless pair-drafting experience for sales and legal reps in Tiptap.

### Non-Functional Requirements Satisfied

- **Security**: Server-side guardrails cannot be bypassed by client tampering.
- **Reliability**: Vertex AI 429 retries and Anthropic fallback prevent user interruption.
- **Performance**: Sub-2s generation for standard clauses; full response return without partial stream rendering complexity.
