# ADR-0046: Phase 2 Sprint 2.7 — Webhooks, Clickwrap Agreements & BYOK Payment Credentials

## Status

Accepted

## Context

Sprint 2.7 of Phase 2 ("Build Once, Scale Forever") introduces three mission-critical platform capabilities:

1. **Outbound Webhooks Engine (Zapier/Third-Party Integration)**: Delivering real-time signed contract, signature, approval, and payment events to external customer endpoints with strict idempotency (RULE WH-001), SSRF protection (EC-WH-05), BullMQ exponential retry delivery (RULE I-07), and circuit breaker auto-disable upon persistent failure.
2. **Clickwrap / Consent Capture**: Providing verifiable, legally binding terms and agreement acceptance (RULE CW-001) with tamper-proof versioning, content hashing (SHA-256), immutable audit records (`clickwrap_acceptances` table with PostgreSQL trigger preventing UPDATE and DELETE), and a public embeddable widget.
3. **BYOK (Bring Your Own Key) Payment Credentials**: Enabling customers to connect their own Stripe or PayPal merchant gateways using envelope encryption (Cloud KMS CMK + per-credential AES-256-GCM DEK; Blueprint §5.3, RULE PAY-001..PAY-003). Volatile memory Buffers are zeroed immediately upon use (EC-BYOK-04), and all credential access creates append-only audit logs in `payment_credential_audit_logs`.

## Architectural Decisions

### 1. Webhook Engine Architecture (RULE WH-001, Invariant I-05, I-07, I-12)

- **Port/Adapter Boundary**: All outbound HTTP webhook calls sit behind `WebhookPort` and `WebhookAdapter`. No direct raw fetch calls from domain logic.
- **HMAC-SHA256 Signatures**: Every payload is signed using a 32-byte CSPRNG secret (`X-PactIntel-Signature: t=${timestamp},v1=${signature}`).
- **Secret Management**: Webhook secrets are hashed via SHA-256 for database storage (`secret_hash`). The raw secret is returned once upon creation and stored securely in Secret Manager.
- **SSRF Prevention (EC-WH-05)**: Creation validates that URLs use HTTPS (or HTTP in local dev/test) and do NOT resolve to internal RFC1918 addresses (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`, `localhost`).
- **Idempotency & Retries (RULE WH-001)**: Every outbound job assigns a unique `eventId` (`generateId()`). The worker checks `webhook_delivery_logs.findSuccessfulDelivery(webhookId, eventId)` prior to dispatch. Delivery uses 6 attempts with exponential backoff (`[1s, 5s, 30s, 5m, 30m, 2h]`).
- **Auto-Disable**: If `failure_count >= 10`, the webhook is automatically marked `is_active = false`, and an admin notification is emitted.

### 2. Clickwrap Immutability & Consent Capture (RULE CW-001, Invariant I-06, I-08)

- **Append-Only Acceptances**: `clickwrap_acceptances` table is strictly append-only. The database trigger `prevent_clickwrap_acceptance_mutation()` forbids UPDATE and DELETE operations.
- **Version Isolation (EC-CW-01)**: When a new `ClickwrapVersion` is published, previous versions have `is_current = false` set atomically. Existing acceptances remain permanently associated with the exact version ID accepted at that moment in time.
- **Integrity**: Every version computes `content_hash = sha256(content)` server-side.
- **Embeddable Widget**: Public endpoints (`/api/v1/public/clickwrap/:slug` and `/api/v1/public/clickwrap/:slug/accept`) allow iframe embedding without customer authentication while logging IP address, user agent, and timestamp.

### 3. BYOK Payment Credentials Envelope Encryption (Blueprint §5.3, RULE PAY-001..003)

- **Envelope Encryption**:
  1. Per-credential 256-bit Data Encryption Key (DEK) is generated via `crypto.randomBytes(32)`.
  2. The credential JSON is encrypted using AES-256-GCM producing `ciphertext`, `iv`, and auth `tag`.
  3. The DEK is encrypted using Cloud KMS CMK (`kmsService.encryptDek`), storing `dek_ciphertext` and `kms_key_id`.
  4. Decryption fetches the DEK from KMS, decrypts the payload in volatile memory, and immediately overwrites the buffer with zeros (`Buffer.fill(0)`).
  5. DEK is never cached in application memory (`EC-BYOK-04`).
- **Append-Only Auditing**: Every credential creation, decryption, test, or revocation appends a row to `payment_credential_audit_logs`.

## Consequences

- Guarantees 100% adherence to legal compliance, non-repudiation, and tenant isolation.
- Prevents SSRF attacks and webhook replay vulnerabilities.
- Satisfies all Sprint 2.7 specifications and edge cases in `phase2_build_plan.md`.
