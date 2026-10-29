# ADR-0055: Phase 3 Sprint 3.8 - Multi-Workspace Architecture and RLS Strategy

## Status: Accepted

## Context

Enterprise customers (franchises, multi-brand corporations, departments, and regional divisions) require multiple isolated operating spaces under a single contract, billing subscription, and security umbrella.

In Phase 0, PactIntel implemented basic workspace isolation where each organization was created with a single default workspace. In Phase 3 (Section 5.16 & 5.17), the platform requires:

1. Multi-workspace creation and administration with URL-safe slugs (`/[org-slug]/[workspace-slug]/...`).
2. Per-workspace membership and roles (`admin`, `manager`, `member`, `collaborator`) allowing a user to be a Manager in Workspace A and a Member in Workspace B.
3. Parent-account oversight granting organization `owner` and `admin` roles global visibility, aggregation dashboards, and cross-workspace search.
4. Shared asset libraries (templates, content blocks, brand kits) enabling organization-wide standard contract assets to be consumed across all workspaces without allowing unauthorized modification by workspace members.
5. Strict PostgreSQL Row-Level Security (RLS) and context validation (**RULE AUTH-003**) ensuring that active workspace context (`X-Workspace-Id`) is validated against the authenticated tenant on every HTTP request and connection pool checkout.
6. Enforcing workspace creation limits per subscription tier (`starter`: 1, `professional`: 3, `business`: 10, `enterprise`: 100/unlimited).

## Decision

1. **Hierarchy & Tenant Boundary:**
   - The primary data and security boundary remains the `Organization` (Invariants **I-02**, **I-03**). All tenant-scoped records retain `organization_id`.
   - `Workspace` records live under an organization with unique URL-safe slugs per organization (`@@unique([organizationId, slug])`).
   - Workspaces feature a self-referencing `parent_workspace_id` for hierarchy, `is_shared_library_enabled` flag, and `branding_defaults` JSON configuration.

2. **Per-Workspace Roles & Authorization:**
   - Account `owner` and `admin` possess organization-wide authority and cross-workspace access.
   - Non-owner users have explicit per-workspace assignments in `workspace_memberships` (`admin`, `manager`, `member`, `collaborator`).
   - Workspace `manager` and `member` roles are strictly confined to their assigned workspaces.

3. **Shared Asset Visibility Model:**
   - Assets (`templates`, `content_blocks`, and `brand_kits`) carry a `visibility` column: `'workspace' | 'organization'`.
   - When `visibility = 'workspace'`, the asset is private to its parent workspace.
   - When `visibility = 'organization'`, the asset is accessible in read/instantiate mode across all workspaces in the tenant.
   - Mutating or deleting organization-wide shared assets requires organization `owner`, `admin`, or an explicit `has_content_admin` role.

4. **RULE AUTH-003 Context Validation & PostgreSQL RLS:**
   - The active workspace is received via the `X-Workspace-Id` header (or session default).
   - Middleware and guards validate that the requested `workspaceId` belongs to the caller's `organizationId`. Any mismatch immediately halts with HTTP 403 `WORKSPACE_FORBIDDEN`.
   - Prisma `withTenantContext(organizationId, operation, workspaceId)` sets both session variables inside the same database transaction:
     ```sql
     SET LOCAL app.current_tenant = '<org-id>';
     SET LOCAL app.current_workspace = '<workspace-id>';
     ```
   - RLS policies for shared asset tables enforce:
     ```sql
     organization_id = (SELECT current_setting('app.current_tenant', true)::uuid)
     AND (
       visibility = 'organization'
       OR (SELECT current_setting('app.current_workspace', true)) IS NULL
       OR (SELECT current_setting('app.current_workspace', true)) = ''
       OR workspace_id = (SELECT current_setting('app.current_workspace', true)::uuid)
     )
     ```

5. **Subscription Tier Quotas:**
   - Subscription plans define `max_workspaces`: Starter (1), Professional (3), Business (10), Enterprise (100).
   - Workspace creation checks total non-deleted workspaces against the subscription plan limit.

## Consequences

### Positive

- Enables scalable multi-divisional and franchise workflows under a single corporate agreement.
- Prevents cross-workspace data leakage for departmental reps while giving executive owners consolidated reporting.
- Eliminates template and clause duplication through controlled org-wide sharing.
- Upholds Invariants **I-03** (single-cell tenant data) and **I-10** (manifest adherence).

### Negative / Trade-offs

- RLS policies for shared assets evaluate composite conditions (`visibility = 'organization' OR workspace_id = ...`). Covered by composite indices `(organization_id, workspace_id)` and `(organization_id, visibility)`.

## Alternatives Considered

1. **Full Sub-Accounts with Separate Billing in Phase 3:** Rejected; per Phase 3 scope preview, separate billing subscriptions belong to Phase 4. Multi-workspace under a unified subscription delivers the enterprise departmental model without billing fragmentation.
2. **Application-Only Workspace Filtering (No RLS Workspace Scoping):** Rejected; relying solely on application-level `WHERE` clauses creates risk of tenant data bleed in complex queries or joins.
