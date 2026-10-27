# ADR-0042: Threaded Block-Anchored Comments, Soft-Delete Continuity, and Content Lock Lifecycle

**Status:** Accepted  
**Date:** 2026-10-24  
**Authors:** System Architecture Team  
**Related:** [Blueprint §8, §11, §16, Invariant I-01, I-02, I-06, I-10](../MASTER_IMPLEMENTATION_BLUEPRINT.md), [Product Blueprint §6](../PRODUCT_BLUEPRINT.md), [Design System §15](../DESIGN_SYSTEM.md), [Phase 2 Build Plan](../../phase2_build_plan.md)

---

## Context

Collaborative legal document authoring and contract negotiation in PactIntel require rich inline feedback and strict editorial control:

1. **Threaded Comments & Block Anchoring**: Reviewers, legal teams, and deal desk managers need to leave contextual remarks anchored to specific document blocks (clauses, sections, pricing tables) or general document-level feedback.
2. **Thread Continuity & Integrity (EC-COMMENT-01 & EC-COMMENT-02)**: In legal documents, deleting a comment in an ongoing discussion must not break conversation context for other parties. If replies exist, the comment structure must be preserved with content redacted (`[deleted]`). If leaf comments are deleted, they can be pruned.
3. **Resolution Lifecycle (EC-COMMENT-03..06)**: Resolutions apply to whole conversation threads anchored to root comments. Replies cannot be independently marked resolved. Reopening and resolving must be idempotent and auditable.
4. **Cross-Document Threading Defense (EC-COMMENT-03)**: A reply must strictly match the parent comment's document and organization ID, preventing cross-tenant or cross-document injection.
5. **Content Lock Lifecycle & Real-Time Broadcast (EC-COLLAB-01..04)**: During active negotiation, sections can be locked by specific users. A locked block is strictly single-locker (`409 BLOCK_ALREADY_LOCKED`). Unlocking is restricted to the lock owner or workspace content admins/owners. Active locks must broadcast immediately to all connected clients over Redis Realtime.

---

## Decisions

### 1. Document Comments Architecture & Storage

- Comments are persisted in `document_comments` with PostgreSQL Row-Level Security (RLS) enforcing `organization_id = (SELECT current_setting('app.current_tenant', true)::uuid)`.
- Root comments have `parent_id = NULL`. Replies have `parent_id` referencing a valid root comment in the same document.
- Queries support keyset (cursor) pagination using `createdAt` and `id`, ordering newest first for root threads and oldest first for replies within a thread.

### 2. Thread Continuity & Deletion Semantics (EC-COMMENT-01 & EC-COMMENT-02)

- When a user deletes a comment:
  - If the comment has 1 or more active replies (`parent_id = comment.id` and `deleted_at IS NULL`): perform a **soft delete** setting `deleted_at = now()` and overwriting `content = '[deleted]'`.
  - If the comment is a leaf node (0 active replies): perform a **hard delete** removing the row. If the parent comment was previously soft-deleted and now has 0 remaining active replies, cascade cleanup can occur.
- Authors can only delete/edit their own comments, unless overridden by an organization `admin` or `owner`.

### 3. Thread Resolution Lifecycle (EC-COMMENT-03..06)

- Thread resolution is executed via `POST /api/v1/documents/:id/comments/:commentId/resolve` and `POST .../reopen`.
- If invoked on a reply (`parent_id !== null`), the API throws `400 Bad Request` with code `CANNOT_RESOLVE_REPLY`.
- Resolution sets `is_resolved = true`, `resolved_by_id = userId`, and `resolved_at = now()`.
- State transitions publish transactional outbox events: `comment.created`, `comment.resolved`, `comment.reopened`.

### 4. Content Locking & Real-Time Coordination (EC-COLLAB-01..04)

- Content locks are stored in `content_locks` with a database unique constraint `@@unique([document_id, block_id])`.
- `POST /api/v1/documents/:id/content-locks`:
  - Validates that the block is not currently locked. If locked by another user, throws `409 Conflict` (`BLOCK_ALREADY_LOCKED`).
  - Idempotent: If already locked by the _same_ user, returns the existing lock with `200 OK`.
- `DELETE /api/v1/documents/:id/content-locks/:blockId`:
  - Unlocking is permitted only for the lock owner or users with role `admin` or `owner` (admin override). Unauthorized unlock attempts throw `403 Forbidden` (`NOT_LOCK_OWNER`).
- On successful lock or unlock:
  - The API publishes a real-time event to Redis Realtime pub/sub channel `content-lock:{documentId}` with payload `{ action: 'locked' | 'unlocked', blockId, lockedBy, documentId }`.
  - Connected Hocuspocus/browser clients receive this notification and dynamically decorate the ProseMirror/Tiptap node to prevent local editing and show lock indicators.

### 5. Frontend Editor Integration & Design System Compliance

- Tiptap extension `ContentLockExtension` inspects active locks on the document:
  - Applies a CSS class `is-locked` and node attribute `contenteditable="false"` to locked blocks when the current user is not the lock holder.
  - Renders a floating lock badge indicating who holds the lock and an Admin Unlock action if the user has appropriate permissions.
- Comment Sidebar adheres strictly to `docs/DESIGN_SYSTEM.md`:
  - Standard typography (Inter font), `#2563EB` interactive accents, accessible focus rings, clear empty/loading states, and zero forbidden design elements (no continuous gradients, no glassmorphism).

---

## Consequences

- **Positive:** Full regulatory and legal audit trail for contract negotiations, ensuring discussions cannot be retroactively vanished if relied upon by other parties.
- **Positive:** Multi-tier conflict prevention: HTTP API enforces locks before persistence, and Hocuspocus collab server validates locks during real-time CRDT updates (ADR-0041).
- **Positive:** Clean outbox integration enables asynchronous in-app notifications and email summaries when users are mentioned or threads resolved.
