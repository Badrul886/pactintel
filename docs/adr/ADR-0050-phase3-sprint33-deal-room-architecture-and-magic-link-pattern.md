# ADR-0050: Phase 3 Sprint 3.3 — Deal Room Architecture and Magic Link Pattern

## Status: Accepted

## Context

Phase 2 delivered recipient-facing single-document views and signature collection flows (`/d/:slug` and `/sign/:token`). However, enterprise contract negotiation and high-velocity B2B sales cycles involve multiple stakeholders (the entire buying committee: economic buyer, legal counsel, technical evaluator, procurement), multiple documents (NDAs, master agreements, order forms, security whitepapers, SOC 2 reports), interactive negotiation questions, and milestone tracking. Conducting this across fragmented email threads results in lost context, delayed approvals, security vulnerabilities, and decreased closing velocity.

Product Blueprint §5.11 establishes **Deal Rooms (Digital Sales Rooms)**: a shared, branded, secure workspace where buyer and seller exchange documents, collaborate on a Mutual Action Plan (MAP), communicate through threaded messages, and track committee-wide deal activity under a single unified URL.

Key engineering and security requirements:

1. **Multi-Tenant Isolation & Row-Level Security**: Every deal room, member, document mapping, message, and access token must belong to an organization and be strictly partitioned via PostgreSQL RLS.
2. **Cryptographic Magic Links**: External buyer stakeholders have no native PactIntel user account; access must be granted via frictionless, cryptographically secure 32-byte CSPRNG magic links hashed with SHA-256 at rest and valid for 30 days.
3. **Internal vs. External Visibility Separation**: The system must enforce strict data boundaries between internal deal team notes (`visibility = 'internal'`) and buyer-visible communication (`visibility = 'external'`). External members must never receive internal notes over REST or real-time channels.
4. **Real-Time Mutual Action Plan (MAP) Collaboration**: The collaborative deal milestone timeline must support real-time state synchronization via Yjs and Hocuspocus under the namespace `deal-room:<roomId>`.
5. **Activity Auditing**: Committee interactions (document views, comments, MAP updates, downloads, signing) must be audited and delivered via an activity feed without degrading database read performance.

---

## Decisions

### 1. Database Schema & RLS Policies

Five tenant-scoped tables are introduced with UUIDv7 primary keys and explicit foreign key constraints:

- `deal_rooms`: Master room record (`title`, `slug`, `status`, `brand_kit_id`, `mutual_action_plan` JSONB). A partial unique index `(organization_id, slug) WHERE deleted_at IS NULL` ensures slug uniqueness per organization while permitting slug reuse following soft-deletion (Revision Brief X-03).
- `deal_room_members`: Links internal users (`user_id`) or external buyers (`external_email`, `external_name`) with roles (`owner`, `member`, `viewer`).
- `deal_room_documents`: Associative mapping between rooms and `documents` with `UNIQUE (deal_room_id, document_id)`.
- `deal_room_messages`: Threaded discussions supporting parent/child hierarchy, author references, and a strict `visibility` enum (`internal`, `external`).
- `deal_room_magic_links`: Cryptographic access tokens (`token_hash` SHA-256, `expires_at`, `used_at`).

All five tables enable PostgreSQL Row-Level Security:

```sql
ALTER TABLE deal_rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON deal_rooms
  USING (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid))
  WITH CHECK (organization_id = (SELECT current_setting('app.current_tenant', true)::uuid));
```

### 2. Magic Link Authentication & Token Lifecycle Pattern

- **Token Generation**: 32-byte cryptographically secure pseudo-random bytes generated via `crypto.randomBytes(32).toString('hex')` (256 bits of entropy).
- **Storage Security**: The raw token is NEVER stored in plaintext. The database only persists `token_hash = sha256(rawToken)`.
- **Validation**: On GET `/r/:slug?token=:token` or POST `/api/v1/deal-rooms/access/:token`, the server computes `sha256(:token)`, queries `deal_room_magic_links` where `expires_at > now()`, marks `used_at = now()`, and initializes a scoped guest session.
- **Session Scoping**: The resulting session is cryptographically signed and strictly scoped to `{ dealRoomId, memberId, role: 'viewer', isExternal: true }`. It cannot be used to query any other room or tenant resources.

### 3. Visibility Guardrails for Internal Notes

To eliminate any possibility of leaking private internal discussions, pricing debates, or legal risk assessments to external buyers:

- All database message queries for external sessions strictly enforce `WHERE visibility = 'external' AND deleted_at IS NULL` directly in SQL.
- Internal messages (`visibility = 'internal'`) are filtered before serialization and never emitted across public WebSocket/SSE feeds.

### 4. Real-Time Mutual Action Plan (MAP) via Hocuspocus

- Hocuspocus WebSocket server is extended to handle document namespace `deal-room:<roomId>`.
- The `onAuthenticateHook` checks whether the target document starts with `deal-room:`. If so, it validates either the PactIntel user session or the external magic link guest session against `deal_room_members`.
- The Mutual Action Plan is persisted in Yjs binary format and synced back to `deal_rooms.mutual_action_plan` JSONB.

### 5. Activity Feed & Committee Telemetry

- All deal room actions (milestone completed, document shared, message posted, buyer opened room) trigger outbox events (`deal_room.*`).
- Real-time notification is broadcasted to active room participants, and event metrics are streamed to ClickHouse for committee-level engagement reporting.

---

## Consequences

### Positive

- **Streamlined Buyer Journey**: External buying committees can review all contracts, NDAs, security attachments, and timelines in one branded location without account registration passwords.
- **Complete Confidentiality**: Private sales notes and legal risk discussions are securely co-located with the deal room but strictly invisible to buyers at the database query level.
- **Audit Compliance**: Every milestone edit, document access, and message is permanently recorded in the immutable audit trail.
- **Real-Time Responsiveness**: Sales reps and buyers see instant updates to milestones and negotiation threads without manual page refreshes.

### Negative / Trade-offs

- External guests access via magic link tokens; if an external buyer forwards their magic link URL to an unauthorized third party, that party can view external room materials. (Mitigated by: IP/user-agent auditing, token revocation capability in the internal dashboard, and optional email OTP verification for high-risk deals).

---

## Alternatives Considered

1. **Requiring External Buyers to Create Full PactIntel Accounts**: Rejected due to high drop-off and friction in sales cycles. Enterprise buyers routinely refuse to create new software accounts just to review a quote or NDA.
2. **Plaintext Magic Link Storage**: Rejected. Storing unhashed tokens in PostgreSQL would create a severe credential exposure vulnerability if read-only replicas or database backups were compromised.
3. **Separate Chat Database/Service**: Rejected. Utilizing PostgreSQL for messages with Redis/Hocuspocus for pub/sub maintains transactional consistency with the outbox and keeps infrastructure unified on Cloud SQL.
