# Phase 1 Build Plan — PactIntel Blueprint v2.0.0 (Google Cloud)

## PRECISION EDITION — Designed for reliable execution by any AI model

> Read AGENTS.md, MASTER_IMPLEMENTATION_BLUEPRINT.md, PRODUCT_BLUEPRINT.md, and DESIGN_SYSTEM.md before starting any work.
> Phase 0 Definition of Done must be complete before Phase 1 begins.
> Duration: 8-12 weeks, 5 sprints.

---

## HARD CONSTRAINTS — violations block CI or break production

| Constraint      | Rule                                                                                            |
| --------------- | ----------------------------------------------------------------------------------------------- |
| IDs             | Use generateId() from libs/shared-utils (UUIDv7) — never gen_random_uuid() or Math.random()     |
| Pagination      | Cursor only (opaque base64 cursor) — never offset                                               |
| SDK calls       | Only inside port/adapter files (ADP-001)                                                        |
| Schedules       | BullMQ upsertJobScheduler only — never @Cron or @nestjs/schedule (I-07)                         |
| Data manifest   | Every new table must be registered (I-10) — CI blocks if missing                                |
| RLS             | Every tenant table needs organization_id + ENABLE ROW LEVEL SECURITY + policy (MT-001)          |
| Analytics       | Pub/Sub buffer only — never direct ClickHouse INSERT (AN-001)                                   |
| Pricing math    | Decimal.js only — never JS floating point                                                       |
| Template link   | Deep copy only on create — never live-link (SIG-006)                                            |
| HubSpot failure | Must not block document operations (I-12)                                                       |
| Design          | Colors from DESIGN_SYSTEM.md section 2 only. Inter font. No gradients, no glassmorphism (DS-15) |

---

## Architecture Invariants

| #    | Phase 1 Verification                                                            |
| ---- | ------------------------------------------------------------------------------- |
| I-01 | IaC parameterised — no hardcoded limits                                         |
| I-05 | HubSpot behind IntegrationPort; Cloudflare SaaS behind CustomDomainProviderPort |
| I-06 | All side-effects via outbox_events in same Prisma                               |
| I-07 | BullMQ upsertJobScheduler for domain health check and periodic sync             |
| I-08 | Custom domain slugs + template slugs permanent once provisioned                 |
| I-10 | 6 new tables, 6 data-manifest entries (see Sprint 1.1)                          |
| I-12 | HubSpot sync wrapped in try/catch; signing succeeds regardless                  |
| I-13 | Per-org rate limits on HubSpot API calls and analytics Pub/Sub                  |
| I-14 | ClickHouse in same cell region; HubSpot EU account for EU orgs                  |

---

## Sprint 1 — Templates, Content Library, Folders (Week 1-2)

### 1.1 Migration: 0002_phase1_additions

File: apps/api/src/prisma/migrations/0002_phase1_additions/migration.sql

ALL 6 new tables with RLS (copy this SQL verbatim):

`sql
-- custom_domains
CREATE TABLE IF NOT EXISTS custom_domains (
id UUID PRIMARY KEY,
organization_id UUID NOT NULL REFERENCES organizations(id),
domain TEXT NOT NULL,
cloudflare_hostname_id TEXT,
ssl_status TEXT NOT NULL DEFAULT 'pending'
CHECK (ssl_status IN ('pending','active','error','expiring_soon')),
verified_at TIMESTAMPTZ,
last_health_check TIMESTAMPTZ,
created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
deleted_at TIMESTAMPTZ,
UNIQUE (organization_id, domain)
);
ALTER TABLE custom_domains ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON custom_domains
USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));

-- integration_connections
CREATE TABLE IF NOT EXISTS integration_connections (
id UUID PRIMARY KEY,
organization_id UUID NOT NULL REFERENCES organizations(id),
provider TEXT NOT NULL CHECK (provider IN ('hubspot','salesforce','pipedrive')),
status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked','error')),
encrypted_oauth_token BYTEA,
dek_ciphertext BYTEA,
kms_key_id TEXT,
token_expires_at TIMESTAMPTZ,
scopes TEXT[] NOT NULL DEFAULT '{}',
external_portal_id TEXT,
sync_cursor JSONB NOT NULL DEFAULT '{}',
settings JSONB NOT NULL DEFAULT '{}',
created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
deleted_at TIMESTAMPTZ
);
ALTER TABLE integration_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON integration_connections
USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));

-- crm_sync_events (append-only, no updated_at)
CREATE TABLE IF NOT EXISTS crm_sync_events (
id UUID PRIMARY KEY,
organization_id UUID NOT NULL REFERENCES organizations(id),
connection_id UUID NOT NULL REFERENCES integration_connections(id),
entity_type TEXT NOT NULL CHECK (entity_type IN ('contact','deal','company')),
entity_id_local UUID,
entity_id_external TEXT,
direction TEXT NOT NULL CHECK (direction IN ('push','pull')),
status TEXT NOT NULL CHECK (status IN ('success','error','skipped')),
changes JSONB NOT NULL DEFAULT '{}',
error_message TEXT,
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE crm_sync_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON crm_sync_events
USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));
CREATE INDEX idx_crm_sync_connection ON crm_sync_events (connection_id, created_at);

-- notification_preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
id UUID PRIMARY KEY,
organization_id UUID NOT NULL REFERENCES organizations(id),
user_id UUID NOT NULL REFERENCES users(id),
channel TEXT NOT NULL CHECK (channel IN ('email','in_app','push')),
event_type TEXT NOT NULL,
is_enabled BOOLEAN NOT NULL DEFAULT true,
created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
UNIQUE (user_id, channel, event_type)
);
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON notification_preferences
USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));

-- in_app_notifications
CREATE TABLE IF NOT EXISTS in_app_notifications (
id UUID PRIMARY KEY,
organization_id UUID NOT NULL REFERENCES organizations(id),
user_id UUID NOT NULL REFERENCES users(id),
event_type TEXT NOT NULL,
title TEXT NOT NULL,
body TEXT NOT NULL,
resource_type TEXT,
resource_id UUID,
is_read BOOLEAN NOT NULL DEFAULT false,
read_at TIMESTAMPTZ,
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE in_app_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON in_app_notifications
USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));
CREATE INDEX idx_in_app_notif_user ON in_app_notifications (user_id, is_read, created_at DESC);

-- buyer_pricing_selections (RULE CPQ-001: never mutate line_items)
CREATE TABLE IF NOT EXISTS buyer_pricing_selections (
id UUID PRIMARY KEY,
organization_id UUID NOT NULL REFERENCES organizations(id),
document_id UUID NOT NULL REFERENCES documents(id),
pricing_table_id UUID NOT NULL REFERENCES pricing_tables(id),
viewer_session_id TEXT NOT NULL,
selections JSONB NOT NULL DEFAULT '[]',
calculated_total NUMERIC(15,2),
created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE buyer_pricing_selections ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON buyer_pricing_selections
USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));
CREATE INDEX idx_bps_document ON buyer_pricing_selections (document_id, viewer_session_id);
`

After running migration — add 6 entries to libs/data-manifest/src/manifest.ts stores array:
{ id: 'pg-custom-domains', table: 'custom_domains', rls: true, retention: 'until_org_deletion', erasure: 'soft_delete', residency: 'cell_jurisdiction' },
{ id: 'pg-integration-connections', table: 'integration_connections', rls: true, retention: 'until_org_deletion', erasure: 'soft_delete', residency: 'cell_jurisdiction' },
{ id: 'pg-crm-sync-events', table: 'crm_sync_events', rls: true, retention: '2_years', erasure: 'none', residency: 'cell_jurisdiction' },
{ id: 'pg-notification-preferences', table: 'notification_preferences', rls: true, retention: 'until_org_deletion', erasure: 'soft_delete', residency: 'cell_jurisdiction' },
{ id: 'pg-in-app-notifications', table: 'in_app_notifications', rls: true, retention: '1_year', erasure: 'hard_delete_on_request', residency: 'cell_jurisdiction' },
{ id: 'pg-buyer-pricing-selections', table: 'buyer_pricing_selections', rls: true, retention: '1_year', erasure: 'hard_delete_on_request', residency: 'cell_jurisdiction' },

### 1.2 Template Module

File tree (create all before any implementation):
template.module.ts, template.controller.ts, template.service.ts, template.repository.ts
dto/create-template.dto.ts, dto/update-template.dto.ts, dto/template-response.dto.ts
dto/create-from-template.dto.ts, events/template-created.event.ts
**tests**/template.service.spec.ts, **tests**/template.controller.spec.ts

EXACT Zod schema — dto/create-template.dto.ts:
workspaceId: z.string().uuid()
title: z.string().min(1).max(500)
category: z.string().max(100).optional()
industryTags: z.array(z.string().max(50)).max(10).optional()
content: z.record(z.unknown()) // Tiptap JSON block tree
defaultSettings: z.object({ expiresInDays, maxViews, domainRestriction, requirePassword }).optional().default({})
variableFields: z.array(z.object({ key, label, type: enum[text|number|date|email], required })).optional().default([])
signerRoles: z.array(z.object({ roleLabel, verificationMethod: enum[none|email|passcode|sms] })).optional().default([])
folderId: z.string().uuid().optional()

createTemplate method contract:

1. id = generateId() (UUIDv7 ALWAYS)
2. prisma.$transaction([template.create, outboxEvents.create({ eventType: 'template.created' })])
3. Return template

createDocumentFromTemplate contract (RULE SIG-006 — deep copy, never live-link):

1. template = findByIdOrThrow(templateId) + CASL check: can('use', 'Template')
2. contentSnapshot = JSON.parse(JSON.stringify(template.content)) // deep copy
3. contentHash = sha256(JSON.stringify(contentSnapshot))
4. docId = generateId(); versionId = generateId()
5. prisma.$transaction([document.create, documentVersion.create, template.update(usageCount+1), outboxEvents.create])
6. NEVER read template.content again after step 2

saveDocumentAsTemplate contract:

1. Load current document version content_snapshot
2. Create new template with that snapshot + write outbox event in same $transaction
3. Source document is NOT modified

ENDPOINTS:
POST /api/v1/templates CASL: create Template (201)
GET /api/v1/templates CASL: read Template (cursor-paginated)
GET /api/v1/templates/:id CASL: read Template
PATCH /api/v1/templates/:id CASL: update Template (soft update + audit log)
DELETE /api/v1/templates/:id CASL: delete Template (soft delete)
POST /api/v1/templates/:id/documents CASL: use Template (RULE SIG-006 copy-on-create)
POST /api/v1/documents/:id/save-as-template CASL: create Template

CONTENT BLOCKS (same module):
POST/GET/GET/:id/PATCH/:id/DELETE/:id /api/v1/content-blocks
POST /api/v1/content-blocks/:id/insert (use ContentBlock — increments usage_count)

FOLDERS (same module):
POST/GET/PATCH/:id/DELETE/:id /api/v1/folders
RULE FOLD-001: DELETE returns 409 FOLDER_NOT_EMPTY if non-deleted docs/templates exist

INTEGRATION TESTS:
template-copy-on-create.spec.ts: create template -> create doc from it -> update template raw SQL -> assert doc content unchanged
template-rls.spec.ts: create under Org A -> query with Org B tenant -> assert 0 rows
template-usage-count.spec.ts: create template -> createDocumentFromTemplate x2 -> assert usageCount === 2

FRONTEND:
(app)/templates/page.tsx: two-panel (sidebar filters + <table>) with empty/loading/error states
(app)/templates/new/page.tsx: 4-step wizard (start | tiptap editor | configure | confirm)
(app)/templates/[id]/edit/page.tsx: tiptap + variable sidebar + preview modal
(app)/documents/new/page.tsx: add From Template tab

---

## Sprint 2 — Interactive Pricing Tables (Week 2-4)

Prerequisite: pricing_tables, line_items, product_catalog_items tables exist from Phase 0.
Install: pnpm add decimal.js (REQUIRED — no JS floating point for money math)

MODULE FILE TREE: apps/api/src/modules/cpq/
cpq.module.ts, cpq.controller.ts, cpq.service.ts, cpq.repository.ts
catalog.controller.ts, catalog.service.ts, catalog.repository.ts
dto/create-pricing-table.dto.ts, dto/create-line-item.dto.ts, dto/buyer-selection.dto.ts
dto/pricing-table-response.dto.ts, dto/create-catalog-item.dto.ts
**tests**/cpq.service.spec.ts, **tests**/pricing-totals.spec.ts

PRICING TABLE DTO FIELDS:
documentId, displayFormat: enum[line_items|tier_cards|combined], discountRules: [{type,value,condition,label}]
taxConfig: { taxRate(0-1), taxLabel, taxIncluded }, settings: { showDiscount, showTax, currency(3-char), allowBuyerQuantityChange }

LINE ITEM DTO FIELDS:
pricingTableId, productItemId?, name, description?, quantity(positive multipleOf 0.0001)
unitPrice(nonneg multipleOf 0.0001), discountPercent(0-100), discountAmount(nonneg)
billingFrequency: enum[one_time|monthly|quarterly|semi_annual|annual]
isOptional, isSelected, sortOrder

BUYER SELECTION DTO:
selections: [{ lineItemId: uuid, isSelected: boolean, quantity?: positive }]

EXACT CALCULATION ALGORITHM (use Decimal.js — NEVER native JS for money):

1. Merge buyerSelections into lineItems (override isSelected and optionally quantity)
2. Filter to isSelected === true
3. Per item:
   lineSubtotal = new Decimal(qty).mul(unitPrice).toDecimalPlaces(2)
   lineDiscount = 0; if discountPercent > 0: lineDiscount = lineSubtotal.mul(discountPercent/100).toDecimalPlaces(2)
   if discountAmount > 0: lineDiscount = Decimal.max(lineDiscount, discountAmount)
   lineNet = lineSubtotal.minus(lineDiscount)
4. subtotal = sum(lineNet)
5. Apply table-level discountRules -> tableDiscount
6. discountedSubtotal = subtotal - tableDiscount
7. Tax: if taxIncluded: taxAmount = discountedSubtotal * taxRate / (1 + taxRate); total = discountedSubtotal
   else: taxAmount = discountedSubtotal * taxRate; total = discountedSubtotal + taxAmount
8. Return { subtotal, totalDiscount, taxAmount, total, lineItems }

updateBuyerSelections (RULE CPQ-001):
NEVER UPDATE line_items table. Upsert buyer_pricing_selections. Recalculate. Update documents.total_value.

ENDPOINTS:
POST /api/v1/documents/:id/pricing-tables CASL: create PricingTable
GET /api/v1/documents/:id/pricing-tables CASL: read PricingTable
GET /api/v1/pricing-tables/:id CASL: read PricingTable (include line items)
PATCH /api/v1/pricing-tables/:id CASL: update PricingTable
DELETE /api/v1/pricing-tables/:id CASL: delete PricingTable (hard delete)
POST /api/v1/pricing-tables/:id/line-items CASL: create LineItem
GET /api/v1/pricing-tables/:id/line-items CASL: read LineItem (ordered by sort_order)
PATCH /api/v1/line-items/:id CASL: update LineItem
DELETE /api/v1/line-items/:id CASL: delete LineItem (hard delete)
PUT /api/v1/pricing-tables/:id/line-items/reorder CASL: update LineItem (body: {order:[id,id,...]})
POST /api/v1/documents/:id/pricing-tables/:t/buyer-selections NO AUTH (RULE CPQ-001)
GET /api/v1/documents/:id/pricing-tables/:t/totals NO AUTH
GET/POST/PATCH/:id/DELETE/:id /api/v1/catalog-items (read|create|update|delete ProductCatalogItem)

UNIT TESTS — pricing-totals.spec.ts (ALL 6 REQUIRED):
Test 1: [{qty:2, price:100, discPct:10}] -> total=180
Test 2: [required $500, optional(deselected) $150] -> total=500
Test 3: [{qty:1, price:1000}] + taxRate=0.08 -> tax=80, total=1080
Test 4: [{qty:1, price:1080}] + taxRate=0.08, taxIncluded=true -> extractedTax=80, total=1080
Test 5: [{qty:3, price:33.33}] -> lineNet === 99.99 (NOT 99.99000000000001) -- Decimal.js safety test
Test 6: optional item(deselected) + buyerSelection(isSelected:true, qty:3, price:200) -> total=600

TIPTAP EXTENSION: libs/ui/src/editor/extensions/pricing-table.extension.ts
Node extension + NodeView (React). Attribute: pricingTableId.
Editor: summary + Edit link button. Recipient viewer: full interactive table.

FRONTEND:
(app)/documents/[id]/edit/pricing-table/[tableId]/page.tsx
Draggable rows (sort_order). Columns: Name|Qty|Unit Price|Discount%|Optional(toggle)|Subtotal(readonly).
Footer: Subtotal|Discount|Tax|TOTAL. "Add from catalog" + "Add blank" buttons.
Auto-save on blur debounced 500ms. ALL totals from API (no client math).
(recipient)/d/[slug]/components/PricingTable.tsx
Optional items: checkbox toggleable. Qty editable if allowBuyerQuantityChange.
On change: POST buyer-selections -> optimistic UI update.
Currency: Intl.NumberFormat. Display: <table> (not cards). Mobile: overflow-x: auto.

INTEGRATION TESTS:
buyer-selections.spec.ts: POST buyer-selections -> assert line_items table unchanged, buyer_pricing_selections row created
pricing-table-rls.spec.ts: cross-tenant isolation (standard pattern)

---

## Sprint 3 — Open Tracking, Notifications, Brand Kits (Week 4-6)

### 3.1 Analytics Tracking Pixel

Expand existing apps/api/src/modules/analytics/ module.

ClickHouse viewer_sessions table (add to clickhouse-schema.sql):
session_id String, organization_id UUID, document_id UUID, viewer_email Nullable(String)
started_at DateTime64(3,'UTC'), last_active_at DateTime64(3,'UTC')
ip_address Nullable(IPv4), country Nullable(String)
ENGINE = MergeTree() PARTITION BY toYYYYMM(started_at) ORDER BY (organization_id, document_id, session_id)

GET /api/v1/t/:documentSlug.gif (NO auth):

1. Validate documentSlug -> load document id + organizationId
2. Read v_session cookie. If absent: set new HttpOnly, SameSite=None, Secure, MaxAge=2592000 cookie
3. Query ClickHouse: COUNT(*) FROM analytics_events WHERE session_id=:s AND document_id=:d AND event_type='view'
   IF count=0 (first view): publish to Pub/Sub buffer (RULE AN-001 - never direct CH insert)
   write outbox: analytics.document_viewed_first_time
   IF count>0: heartbeat only (update last_active_at)
4. Return 1x1 transparent GIF bytes. Content-Type: image/gif. Cache-Control: no-store,no-cache,must-revalidate

POST /api/v1/analytics/heartbeat (NO auth):
Body: { documentSlug, sessionId, durationMs }. Validate durationMs <= 3600000.
Publish to Pub/Sub: { eventType: 'time_update', sessionId, documentId, durationMs }. Return 204.

Embed in recipient page.tsx: <img src="/api/v1/t/{slug}.gif" width="1" height="1" style={{ display:'none' }} alt="" />
Client heartbeat: setInterval(sendHeartbeat, 30000) + visibilitychange listener.

RULE ACC-001: A view = one unique session_id. Use COUNT(DISTINCT session_id). Never COUNT(*).

### 3.2 Real-Time Notifications (SSE — NOT WebSocket)

LOCKED: NestJS @Sse() for Phase 1. WebSocket (Hocuspocus) is Phase 2. Do NOT use Socket.io.
REQUIRED IaC change: Set Cloud Run api service timeout_seconds = 3600 in infra/.

GET /api/v1/notifications/stream (@Sse() — authenticated):

1. userId from session
2. Create Subject<MessageEvent>
3. Subscribe to Redis channel: notifications:${userId} (redis-realtime instance)
4. setInterval(ping every 30s) -> prevents Cloud Run timeout
5. req.on('close'): clearInterval + unsubscribe + subject.complete()
6. Return subject.asObservable()

notifyUser(userId, orgId, notification) method:

1. prisma.inAppNotification.create({ id: generateId(), ...notification })
2. redisRealtimeClient.publish('notifications:${userId}', JSON.stringify(notification))
3. Check notification_preferences -> if email enabled: emailQueue.add('send-notification-email', ...)
4. NEVER await email queue (RULE NOTIF-001 — fire and forget)

Outbox listener bindings (document-event.listener.ts):
analytics.document_viewed_first_time -> notifyUser(owner, 'document_viewed')
document.signed -> notifyUser(owner, 'document_signed')
document.declined -> notifyUser(owner, 'document_declined')
document.expired -> notifyUser(owner, 'document_expired')

NOTIFICATION ENDPOINTS:
GET /api/v1/notifications/stream SSE stream
GET /api/v1/notifications cursor-paginated; filter: is_read, event_type
PATCH /api/v1/notifications/:id/read mark single read
POST /api/v1/notifications/mark-all-read mark all read for user
DELETE /api/v1/notifications/:id delete
GET /api/v1/notification-preferences get all for user
PUT /api/v1/notification-preferences upsert all [{channel, eventType, isEnabled}]

NotificationBell component (apps/web/src/components/layout/NotificationBell.tsx):
Bell icon (Lucide React) + unread badge. Dropdown: last 20 notifications.
SSE: new EventSource('/api/v1/notifications/stream') on mount + cleanup on unmount.
On SSE event: prepend to list + increment badge + show toast.
"Mark all read" button. Item click: mark read + navigate to resource.

### 3.3 Brand Kit Module — apps/api/src/modules/brand-kit/

File tree: module/controller/service/repository + dto/ + **tests**/

DTO FIELDS: name, workspaceId?, primaryColor(#rrggbb regex), secondaryColor?, accentColor?,
logoUrl(url)?, faviconUrl(url)?, fontHeading?, fontBody?, customCss(max 50000 chars)?,
emailFromName?, emailFromDomain?, removeBadge(boolean default false), isDefault(boolean default false)

ENDPOINTS:
GET/POST /api/v1/brand-kits
GET/:id/PATCH/:id /api/v1/brand-kits/:id
DELETE /:id refuse with 409 if is_default = true
POST /:id/set-default unsets old default in same $transaction
POST /:id/upload-logo upload to Cloud Storage public-media bucket; store URL

RULE BRAND-001 — Recipient page (SSR):
Load workspace.brand_kit_id -> load brand kit.
Inject CSS vars: --brand-primary, --brand-heading-font, --brand-body-font on wrapper div.
Show brand logo. If removeBadge=true: hide "Powered by PactIntel".

RULE BRAND-002 — Emails:
All Resend calls accept brandKitId param. Load kit -> inject emailFromName + logo + primaryColor.

TESTS:
brand-kit-default.spec.ts:
set new default -> old default.is_default becomes false (same $transaction)
delete default brand kit -> 409

---

## Sprint 4 — CASL, HubSpot, Custom Domains, Access Control (Week 6-9)

### 4.1 CASL Matrix Extensions

Step 1: Add to libs/shared-types/src/casl.ts AppAbility union:
'Template' | 'ContentBlock' | 'PricingTable' | 'LineItem' | 'ProductCatalogItem'
'BrandKit' | 'CustomDomain' | 'IntegrationConnection' | 'Folder' | 'NotificationPreference'

Step 2: Update ability.factory.ts switch statement:
owner/admin: can('manage') all Phase 1 subjects
manager: can('manage', 'Template', { workspaceId: { $in: user.managedWorkspaceIds } })
can('read'/'use', 'Template'), can('read', 'BrandKit')
CANNOT manage BrandKit, CustomDomain, IntegrationConnection
member: can('read'/'use', 'Template'), can('create', 'PricingTable'), can('read', 'BrandKit')
CANNOT create Template, manage BrandKit
collaborator: can('read', 'Template'), CANNOT use Template (explicit deny)
can('read', 'BrandKit')

12 REQUIRED PARAMETRISED TESTS (permission-matrix-phase1.spec.ts):
member+use+Template=allow, collaborator+use+Template=deny, member+create+Template=deny
manager+create+Template=allow, member+create+PricingTable=allow, collaborator+create+PricingTable=deny
admin+manage+BrandKit=allow, member+update+BrandKit=deny, admin+manage+CustomDomain=allow
manager+manage+CustomDomain=deny, admin+manage+IntegrationConnection=allow, member+manage+IntegrationConnection=deny

### 4.2 HubSpot Integration Module — apps/api/src/modules/integration/

FILE TREE:
module/controller/service/repository
ports/integration.port.ts
adapters/hubspot/hubspot.adapter.ts (HubSpot SDK ONLY here — ADP-001)
adapters/hubspot/hubspot.types.ts
adapters/hubspot/hubspot-oauth.service.ts
dto/connect-integration.dto.ts, dto/sync-config.dto.ts
listeners/document-signed.listener.ts
jobs/hubspot-sync.job.ts
**tests**/integration.service.spec.ts, **tests**/hubspot-sync.spec.ts

PORT INTERFACE (ports/integration.port.ts):
getAuthorizationUrl(state): string
exchangeCodeForTokens(code): Promise<{accessToken, refreshToken, expiresAt: Date}>
refreshAccessToken(refreshToken): Promise<{accessToken, expiresAt: Date}>
upsertContact(token, CrmContact): Promise<{externalId: string}>
upsertDeal(token, CrmDeal): Promise<{externalId: string}>
associateDealWithContact(token, dealId, contactId): Promise<void>

ADAPTER RULES (hubspot.adapter.ts):
HubSpot SDK import ONLY in this file (ADP-001).
Before every API call: check token_expires_at < now() -> refresh first.
429: throw RetryableError with retryAfter value.
401: throw IntegrationAuthError -> service marks status = 'error'.
Use HttpClientService (circuit breaker + timeout — RULE ERR-002).

OAUTH TOKEN STORAGE (envelope encryption — same pattern as BYOK):

1. dek = crypto.randomBytes(32)
2. encryptedPayload = credentialVaultService.aesGcmEncrypt(JSON.stringify({accessToken, refreshToken}), dek)
3. dekCiphertext = await credentialVaultService.encryptDek(dek, 'integration-tokens')
4. Store: encrypted_oauth_token, dek_ciphertext, kms_key_id in integration_connections
   To read: decryptDek -> aesGcmDecrypt -> parse JSON

OAUTH ENDPOINTS:
GET /api/v1/integrations list connections (read IntegrationConnection)
GET /api/v1/integrations/hubspot/connect redirect to HubSpot OAuth; state=signJwt({orgId})
GET /api/v1/integrations/hubspot/callback exchange code+encrypt+store+redirect to settings
DELETE /api/v1/integrations/:id revoke + soft-delete
GET /api/v1/integrations/:id/sync-status last sync stats
POST /api/v1/integrations/:id/sync manual trigger -> BullMQ job
PATCH /api/v1/integrations/:id/settings update field mapping

BULLMQ JOB (jobs/hubspot-sync.job.ts):
Queue: 'integration-sync' on redis-queue. Job: 'hubspot-sync'.
Payload: { connectionId, entityType: 'contact'|'deal', documentId? }
Options: { attempts: 5, backoff: { type: 'exponential', delay: 2000 } }
Processor (ALWAYS wrapped in try/catch — RULE I-12): 1. Load connection, check status = 'active' 2. Decrypt token via CredentialVaultService 3. If token_expires_at < now(): refresh + re-encrypt + store 4. upsertContact or upsertDeal via adapter 5. Write crm_sync_events { status: 'success'|'error' }
CATCH: log + write crm_sync_events { status: 'error' } + if RetryableError rethrow else swallow

LISTENER (document-signed.listener.ts):
On 'document.signed' outbox event:
Load org's active HubSpot connections.
For each: try { enqueue hubspot-sync for contact + deal } catch { log + SWALLOW (RULE I-12) }

INTEGRATION TESTS (4 required):
Test 1 — encrypted at rest: mock OAuth callback -> assert stored != plaintext, decrypt === original
Test 2 — sync failure doesn't break signing: mock HubSpot 500 -> complete signing -> assert doc.status='signed' + crm_sync_events.status='error'
Test 3 — expired token refresh: set token_expires_at past -> trigger job -> assert refreshAccessToken called + new token stored
Test 4 — 429 retry: mock 429 first call, 200 second -> assert job eventually succeeds

### 4.3 Custom Domain Module — apps/api/src/modules/custom-domain/

FILE TREE:
module/controller/service/repository
ports/custom-domain-provider.port.ts
adapters/cloudflare/cloudflare-saas.adapter.ts (Cloudflare SDK ONLY — ADP-001)
jobs/domain-health-check.job.ts (BullMQ scheduler — NOT @Cron)
**tests**/custom-domain.service.spec.ts

PORT INTERFACE:
provisionHostname(domain, orgId): Promise<{ hostnameId, sslStatus, verificationRecord: {type,name,value} }>
getHostnameStatus(hostnameId): Promise<{ sslStatus, isActive }>
deleteHostname(hostnameId): Promise<void>

ENDPOINTS:
GET /api/v1/custom-domains read CustomDomain
POST /api/v1/custom-domains create -> provision Cloudflare hostname; return DNS instructions
GET /api/v1/custom-domains/:id read (include ssl_status, last_health_check)
DELETE /api/v1/custom-domains/:id deprovision + soft-delete
POST /api/v1/custom-domains/:id/verify manual status check

DOMAIN HEALTH CHECK JOB (RULE I-07 — NOT @Cron):
In onModuleInit():
await this.queue.upsertJobScheduler(
'domain-health-check-hourly', // idempotent scheduler ID
{ pattern: '0 * * * *' }, // every hour
{ name: 'check-all-domains', data: {} }
);
Processor:
SELECT all custom_domains WHERE deleted_at IS NULL AND cloudflare_hostname_id IS NOT NULL
For each: getHostnameStatus(hostnameId) -> UPDATE ssl_status + last_health_check
If ssl_status = 'error' AND was 'error' on last check: enqueue email notification to org admin
If ssl_status = 'active' AND verified_at IS NULL: SET verified_at = now()

### 4.4 Recipient Access Guard (RULE ACC-004 — EXACT ORDER)

Update apps/web/src/app/(recipient)/d/[slug]/page.tsx SSR:

CHECK ORDER (MUST be this sequence):

1. Link expiry: if expires_at < now() -> render <ExpiredPage brandKit={kit} />
2. Domain restriction: if domain_restriction.length > 0 -> prompt email -> if wrong domain -> render <RequestAccessPage brandKit={kit} />
3. View limit (COUNT DISTINCT session_id): if count >= max_views AND isNewSession -> render <ViewLimitExceededPage brandKit={kit} />
4. Password: if password_hash set AND no valid password in cookie -> render <PasswordPage brandKit={kit} />

ALL denial pages MUST:
Return HTTP 200 (not 403/404)
Show org brand kit (logo + CSS vars)
Show "Request Access" button -> POST /api/v1/documents/:id/access-requests

POST /api/v1/documents/:id/access-requests (NO auth):
Body: { requesterEmail, requesterName, message? }

1. Validate document exists (not deleted)
2. Write audit_log_entry { action: 'access_requested' }
3. notifyUser(document.ownerId, orgId, { eventType: 'access_requested', ... })
4. Return 202 Accepted

ACCESS CONTROL TESTS (recipient-access-guard.spec.ts):
expired link -> ExpiredPage HTTP 200
wrong domain -> RequestAccessPage HTTP 200
view limit exceeded -> ViewLimitExceededPage HTTP 200
password required -> PasswordPage HTTP 200
order test: expired link with all other restrictions also set -> ExpiredPage (expiry checked first)

---

## Sprint 5 — Mobile Polish, Test Suite, Definition of Done (Week 9-12)

MOBILE BREAKPOINTS (recipient pages):
< 640px: single-column; pricing table overflow-x: auto; action buttons width: 100%
640-1024px: two-column; sidebar -> top filter tabs

> 1024px: full layout
> Mobile pricing table: hide Description first, then Discount. Keep: Name|Qty|Total.
> Test: Chrome Mobile Android, Safari iOS, Firefox Android. Touch signature (draw+type) must work.

OUTBOX EVENT REGISTRY (all must be in same $transaction as triggering mutation):
template.created <- TemplateService.createTemplate
document.created_from_template <- TemplateService.createDocumentFromTemplate
analytics.document_viewed_first_time <- analytics pixel (first view)
integration.connected <- IntegrationService.storeOAuthConnection
integration.revoked <- IntegrationService.revokeConnection
custom_domain.provisioned <- CustomDomainService.provision
custom_domain.ssl_error <- domain-health-check job

E2E PLAYWRIGHT FLOWS (add to apps/web-e2e/):
flow-06: admin creates template -> member creates doc -> admin updates template -> assert doc unchanged (SIG-006)
flow-07: pricing table with optional item -> recipient toggles on -> assert total updated + line_items unchanged (CPQ-001)
flow-08: brand kit primaryColor=#FF5733 -> send doc -> recipient opens -> assert --brand-primary=#FF5733
flow-09: member sends doc + connects SSE -> recipient opens -> assert SSE receives document_viewed within 5s

DEFINITION OF DONE (all must pass on staging):
Templates: create template -> doc from it -> update template -> doc content unchanged (SIG-006)
Pricing: recipient toggles optional -> total updates -> line_items unchanged in DB (CPQ-001)
Tracking: recipient opens -> sender notification within 5 seconds
Brand kit: custom logo + colors on recipient page
Custom domain: SSL active -> doc accessible at docs.client.com
HubSpot: signed doc -> signer contact in HubSpot -> crm_sync_events success row
Permissions: collaborator cannot use templates; member cannot manage brand kits
Access control: expired link -> branded page; wrong domain -> Request Access page
Tests: pnpm nx run-many --target=test --all passes; coverage >=80% on Phase 1 modules
CI: lint + typecheck + test + build all green
Staging: all features deployed and accessible

FORBIDDEN PATTERNS CHECKLIST (check before every PR):
[ ] No @Cron or @nestjs/schedule imports
[ ] No HubSpot SDK outside adapters/hubspot/
[ ] No Cloudflare SDK outside adapters/cloudflare/
[ ] No direct ClickHouse INSERT from application code
[ ] No gen_random_uuid() or Math.random() for PKs
[ ] No offset pagination
[ ] No floating-point math for prices (Decimal.js only)
[ ] No CSS color not in DESIGN_SYSTEM.md section 2
[ ] No gradient backgrounds or glassmorphism
[ ] No new table without organization_id + RLS + policy
[ ] No new table without libs/data-manifest entry

RISK REGISTER:
HubSpot OAuth redirect_uri mismatch staging vs prod [HIGH] -> register separate URIs per env
Cloudflare SSL provisioning delay up to 72h [MEDIUM] -> show pending status + DNS instructions
Decimal.js + Prisma NUMERIC returns string not number [HIGH] -> always new Decimal(field.toString())
BullMQ duplicate jobs on restart [MEDIUM] -> use upsertJobScheduler (idempotent by ID)
SSE timeout on Cloud Run default 60s [HIGH] -> set api service timeout to 3600s in IaC + 30s ping
HubSpot rate limit 110 req/10s [MEDIUM] -> per-org call queue + exponential backoff on 429
