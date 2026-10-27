# ADR-0041: Real-Time Collaborative Editing via Hocuspocus WebSocket Server, Yjs CRDTs, and Server-Enforced Content Locks

**Status:** Accepted  
**Date:** 2026-10-24  
**Authors:** System Architecture Team  
**Related:** [Blueprint §8, §16, §22, Invariant I-01, I-02, I-07](../MASTER_IMPLEMENTATION_BLUEPRINT.md), [Product Blueprint §6](../PRODUCT_BLUEPRINT.md), [Design System §15](../DESIGN_SYSTEM.md), [Phase 2 Build Plan](../../phase2_build_plan.md)

---

## Context

PactIntel documents require concurrent, real-time collaboration where multiple authors, legal reviewers, and deal desk managers edit contracts simultaneously.
In legal document editing:

1. Document state must never diverge or corrupt across concurrent edits (Conflict-free Replicated Data Types required).
2. Edits to specific sections or blocks (such as Indemnity, Pricing, or Signatures) can be locked by specific users or roles to prevent unauthorized tampering during active negotiation.
3. Signed documents and read-only versions must never permit write updates.
4. Scale-out across Google Cloud Run instances must not partition editing sessions or lose awareness presence.
5. Inactive documents must be persisted to Cloud SQL and garbage collected from memory to prevent memory bloat, while honoring configurable limits (Invariant I-01).

---

## Decisions

### 1. Dedicated Collab Service Process Type (Invariant I-07)

A dedicated process type `apps/collab-server` is deployed on Google Cloud Run:

- Process type is separate from the HTTP API and worker pools from Day 1.
- WebSocket connections are long-lived; Cloud Run service timeout is explicitly configured to `3600s` (preventing standard 60-second HTTP termination).
- Service uses `startup_cpu_boost = true` for rapid cold-start readiness.

### 2. Yjs CRDTs & Dual Storage Engine

- The collaborative data model uses **Yjs** CRDT binary structures.
- Persistence is handled by Hocuspocus's `Database` extension interacting with PostgreSQL `document_versions`:
  - `fetch`: Loads `yjs_state` (`BYTEA`). If null (first collaborative edit), constructs an initial Y.Doc from `content_snapshot` JSON.
  - `store`: Writes binary `yjs_state` and extracts ProseMirror JSON to sync `content_snapshot` on every debounced persist interval (2000ms debounce, 1000ms max debounce).
- Application code never writes `yjs_state` directly. API reads `content_snapshot` for signing and PDF rendering.

### 3. Horizontal Scaling via Redis Realtime (Memorystore)

- The `@hocuspocus/extension-redis` links all Cloud Run collab instances through a dedicated Memorystore Redis Realtime instance in the local cell.
- All Y.Doc document updates and awareness states (presence, cursor position, active selections) are multiplexed over Redis pub/sub.
- Invariant I-02 is strictly upheld: collab servers only connect to the local cell's Redis and Cloud SQL instances.

### 4. Authentication & Authorization via Handshake Query Param (RULE COLLAB-001)

- WebSocket client connects to `wss://collab.{domain}/?token={sessionToken}` with document name `document:{documentId}`.
- Handshake query parameter is used because the browser WebSocket API cannot send custom HTTP authorization headers. This is the sole authorized exception to header-based auth.
- In `onAuthenticate`:
  1. Validates the session token via internal auth service / PostgreSQL session store.
  2. Parses `documentId` and verifies UUID format.
  3. Checks CASL read permissions. Rejects with 401/403 if unauthorized.
  4. Checks write permissions and document signed status. Sets `connection.readOnly = true` if read-only.
  5. Attaches `{ userId, organizationId, documentId, isContentAdmin }` to connection context.

### 5. Server-Enforced Content Locks (RULE COLLAB-002 & EC-COLLAB-01..09)

- In `onUpdate`:
  - If `connection.readOnly` is true, immediately rejects update.
  - Decodes modified block IDs from incoming update using an ephemeral Y.Doc clone.
  - Queries `content_locks` for active locks on the modified blocks.
  - If any block is locked by another user and the current user is not a content admin/owner, throws an error (`Block ${blockId} is locked by another user`).
  - Hocuspocus aborts broadcast of the rejected update. The client Yjs provider automatically rolls back the rejected mutation, preserving legal integrity.

### 6. Memory Management & Garbage Collection (RULE COLLAB-003 & Invariant I-01)

- When the last client disconnects (`connectedClients === 0`), a 5-minute GC timer starts.
- If a client reconnects within 5 minutes, the timer is cleared.
- Upon timer expiry, the final Y.Doc state is persisted to Cloud SQL and unloaded from server memory.
- `MAX_IN_MEMORY_DOCS` (default 500) is configurable via environment variable. When reached, LRU documents are evicted and persisted to disk.

---

## Consequences

- **Positive:** Multi-user editing is seamless, with zero conflicts, real-time presence indicators, and rock-solid server-side legal locking guarantees.
- **Positive:** Automatic graceful persistence to PostgreSQL ensures offline safety and full compatibility with existing PDF generation and e-signing workflows.
- **Mitigation:** Cloud Run 3600s timeout requires clients to handle periodic WebSocket reconnects gracefully via standard exponential backoff in `y-websocket`.
