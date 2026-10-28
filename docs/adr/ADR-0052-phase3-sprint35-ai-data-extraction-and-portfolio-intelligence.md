# ADR-0052: Phase 3 Sprint 3.5 — AI Data Extraction and Portfolio Agreement Intelligence

## Status: Accepted

## Context

Phase 2 and earlier sprints delivered transactional contract authoring, CPQ pricing rules, automated approval flows, digital deal rooms, and guided proposal generation. However, once agreements are executed and counter-signed, enterprise legal, finance, and procurement operations require portfolio-wide agreement intelligence:

1. **Automated Structured Data Extraction**: Contracts contain hundreds of commitments, commercial terms, and legal obligations (e.g. effective date, renewal milestones, payment terms, governing law, limitation of liability, non-compete, indemnification caps) that must be extracted without manual data entry.
2. **Scanned PDF & OCR Processing**: Historical contracts and external counterparty paper often arrive as scanned PDFs without accessible text layers, requiring an Optical Character Recognition (OCR) pipeline.
3. **RULE PORT-001 — Obligation Amendment Review (Never Auto-Apply)**: Contract amendments and addenda alter legal terms. Overwriting confirmed legal obligations via unreviewed automated AI extraction creates extreme liability risks.
4. **Search Scalability & Migration (Meilisearch)**: Full-text search across large portfolios of multi-page agreements requires fast, typo-tolerant, faceted search. The system must support Meilisearch as the primary search engine while maintaining PostgreSQL Full-Text Search (FTS) as a resilient zero-dependency fallback (Invariant I-12).
5. **Counterparty Normalization**: The same corporate entity often appears across contracts under multiple name variants (e.g. "Acme Inc.", "Acme Corporation", "Acme Corp Ltd"). Portfolio intelligence requires canonical entity resolution and alias tracking.
6. **Milestone & Expiration Alerts**: Legal teams require automated warnings at 30 days, 7 days, and 1 day prior to obligation due dates, renewal notice windows, and contract expirations.

---

## Decisions

### 1. Database Schema & Row-Level Security

We introduce three new tenant-scoped tables with UUIDv7 primary keys and PostgreSQL Row-Level Security (RLS):

- `counterparties`: Canonical entity records (`canonical_name`, `aliases` TEXT[], `domain`).
- `custom_extraction_fields`: Admin-configured extraction parameters (`field_name`, `description` for natural language LLM prompt, `field_type`, `is_active`).
- `obligation_records`: Granular extracted contractual commitments (`field_name`, `field_value`, `field_value_numeric`, `field_value_date`, `field_type`, `confidence_score`, `extraction_method`, `is_custom_field`, `is_verified`, `pending_update` JSONB).
- `documents`: Altered with `counterparty_id UUID REFERENCES counterparties(id)`.
- `document_versions`: Altered with `content_embedding vector(768)` for pgvector semantic search.

Every table enables PostgreSQL RLS:

```sql
ALTER TABLE obligation_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON obligation_records
  FOR ALL
  USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
  WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));
```

### 2. Strict Enforcement of RULE PORT-001 (Obligation Amendment Review)

When a document is amended (new `DocumentVersion` created) or re-analyzed:

1. The background extraction pipeline (`DocumentExtractionJob`) extracts the new terms.
2. The extracted values are compared against existing `obligation_records` for that document.
3. If values differ, the new value and confidence score are written **exclusively** to `obligation_records.pending_update`. Existing `field_value`, `field_value_date`, and `field_value_numeric` are untouched.
4. An outbox notification is emitted alerting the document owner.
5. In the UI, a side-by-side diff is displayed with explicit `Confirm` and `Dismiss` actions.
6. The active obligation is only updated when an authorized user clicks `Confirm` (`POST /api/v1/documents/:id/obligations/:oblId/confirm-update`), marking `is_verified = true` and clearing `pending_update`.

### 3. SearchPort Architecture & Resilient Meilisearch Migration (Invariant I-05, I-12)

- All search operations sit behind the `SearchPort` interface (`search(query, filters, orgId)`, `index(doc)`, `deleteIndex(docId, orgId)`).
- `MeilisearchAdapter` serves as the primary search engine running as an isolated Cloud Run service (`infra/modules/cell/meilisearch.tf`) and locally via Docker Compose on port 7700.
- `PostgresFtsAdapter` serves as the tested fallback adapter. If Meilisearch is unreachable, encounters timeouts, or is disabled, the system automatically degrades to PostgreSQL full-text search without breaking the user experience (Invariant I-12).

### 4. OCR Integration Behind Port (`OcrPort`)

- To process scanned PDFs, `OcrPort` provides `extractText(buffer: Buffer): Promise<string>`.
- `CloudVisionOcrAdapter` implements Google Cloud Vision / Document AI text detection.
- `DocumentExtractionJob` evaluates whether the document contains selectable digital text. If scanned or below density threshold, it passes the binary through `OcrPort` before dispatching to `AiGateway`.

### 5. AI Prompt Decoupling (RULE A6.7, AI-001..AI-004, GDPR-002)

- Extraction uses `AiGateway` task ID `'document-extraction'` with prompt defined in `libs/ai/src/prompts/document-extraction.prompt.ts`.
- Counterparty deduplication uses task ID `'counterparty-normalization'` (`libs/ai/src/prompts/counterparty-normalization.prompt.ts`).
- Aggregated risk reporting uses task ID `'portfolio-report'` (`libs/ai/src/prompts/portfolio-report.prompt.ts`).
- Regional endpoints route EU tenants to European infrastructure, rejecting cross-border failover.

### 6. Scheduled Obligation Alerts (Invariant I-07)

- Scheduled alerts avoid in-process `@Cron`.
- Cloud Scheduler invokes `POST /api/v1/portfolio/jobs/process-reminders` daily.
- Queries upcoming dates at 30 days, 7 days, and 1 day milestones and dispatches notifications via transactional outbox.

---

## Consequences

### Positive

- **Complete Contract Visibility**: Eliminates hidden risks, missed renewal notice deadlines, and forgotten indemnification liabilities.
- **Safety Against Automated Errors**: RULE PORT-001 prevents automated AI hallucinations or erroneous extractions from corrupting legally binding obligation records.
- **High-Velocity Search**: Meilisearch provides sub-50ms typo-tolerant search across entire agreement catalogs, backed by resilient PostgreSQL fallback.
- **Enterprise Isolation**: Full tenant RLS guarantees zero cross-tenant data leakage in search or AI analysis.

### Negative / Trade-offs

- Meilisearch introduces an additional stateful service in the cell infrastructure, requiring sync jobs on document updates.
- Scanned PDF processing requires an OCR pre-processing step before LLM synthesis.
