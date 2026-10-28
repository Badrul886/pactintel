# ADR-0053: Phase 3 Sprint 3.6 — Advanced ID-Verification Signing (KBA, Government ID, QES)

## Status: Accepted

## Context

Phase 0 delivered baseline electronic signature verification (Standard Electronic Signatures / SES), including email OTP and recipient passcode verification. However, high-value enterprise contracts, regulated agreements, real-estate transactions, financial services, and European cross-border commerce mandate heightened levels of identity verification:

1. **Knowledge-Based Authentication (KBA)**: High-assurance identity verification in the US where signers are presented dynamic, out-of-wallet credit-bureau questions (e.g. historical mortgage amounts, previous vehicle registrations) before accessing or signing a document.
2. **KBA Lockout & Abuse Prevention**: Repeated guessing attacks threaten signer privacy and contract integrity. An automated lockout threshold (default 3 failed attempts) must lock signer access, notify the sender, and record an immutable audit event (`kba_locked`).
3. **Government ID & Biometric Liveness Verification**: Global document validation where signers submit front and back photos of an official government ID (passport, driver's license, national ID) paired with a live selfie for liveness detection and biometric matching.
4. **Zero-PII Storage Policy**: To maintain strict privacy posture and prevent liability under GDPR, CCPA, and CPRA, PactIntel must **never** store extracted identity PII (e.g., Social Security Numbers, driver's license numbers, date of birth, identity card scans). Only the verification outcome (passed/failed), confidence score, and vendor audit reference ID are retained.
5. **Qualified Electronic Signatures (QES)**: Under EU Regulation 910/2014 (eIDAS), QES provides the highest legal weight—legally equivalent to a handwritten signature across all EU member states. QES requires verification via an EU Qualified Trust Service Provider (QTSP) and embeds a cryptographic proof-of-verification certificate into the executed PDF.
6. **Plan Gating & Jurisdiction Controls**: Advanced verification methods incur vendor costs and geographic limitations:
   - KBA: Professional tier and above (US jurisdiction only).
   - Government ID: Business tier and above (Global jurisdiction).
   - QES: Enterprise tier only (EU jurisdiction only).
7. **CRITICAL RULE RISK-001 (Verification Service Outage & Circuit Breaker)**: When external verification vendors experience outages or network timeouts (> 5 seconds), the platform must apply the most conservative configured fallback (e.g. falling back to SMS or passcode OTP) without skipping verification entirely or blocking platform-wide signing.

---

## Decisions

### 1. Database Schema & Migration

We extend the `signers` table in PostgreSQL 17 to accommodate advanced verification state:

```sql
ALTER TABLE signers DROP CONSTRAINT IF EXISTS signers_verification_method_check;
ALTER TABLE signers ADD CONSTRAINT signers_verification_method_check
  CHECK (verification_method IN ('none', 'email', 'passcode', 'sms', 'kba', 'id_document', 'qes'));

ALTER TABLE signers
  ADD COLUMN IF NOT EXISTS verification_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS verification_result JSONB,
  ADD COLUMN IF NOT EXISTS kba_locked_at TIMESTAMPTZ;
```

- `verification_attempts`: Tracks verification challenges. When attempts reach 3 for KBA, the signer is locked.
- `verification_result`: Stores sanitized verification results (`status`, `confidenceScore`, `vendorReferenceId`, `verifiedAt`, `method`). PII is strictly excluded.
- `kba_locked_at`: Timestamp indicating when the signer was locked out due to failed KBA attempts.

New append-only event types registered in `signature_events`:

- `kba_attempt`, `kba_passed`, `kba_failed`, `kba_locked`
- `id_verification_submitted`, `id_verification_passed`, `id_verification_failed`
- `qes_applied`
- `risk_scoring_fallback`

### 2. SigningProviderPort & BoldSignAdapter Architecture (Invariant I-05)

All third-party identity verification calls are abstracted behind `SigningProviderPort`:

- `initiateKba(signerId, signerEmail, ipAddress)`
- `submitKbaAnswers(sessionId, answers)`
- `initiateIdVerification(signerId, returnUrl)`
- `getIdVerificationResult(sessionId)`
- `initiateQes(signerId, returnUrl)`
- `getQesResult(sessionId)`

The `BoldSignAdapter` implements these capabilities against BoldSign's identity verification APIs with resilient timeout handling (5-second timeout) and local dev / contract test simulation.

### 3. Circuit Breaker & RULE RISK-001 Outage Fallback (Invariant I-12)

- External verification client calls are monitored by a circuit breaker: 5 failures within a 10-minute sliding window trips the breaker open for 30 minutes.
- When the circuit breaker is open or a vendor call times out:
  1. The platform automatically falls back to the most conservative alternative verification method configured for the organization (e.g. SMS OTP or passcode).
  2. If no alternative method is configured, standard signing proceeds with an audit log entry.
  3. A `signature_events` audit record is created: `eventType: 'risk_scoring_fallback'`, with `metadata: { reason: 'vendor_unreachable', originalMethod: ... }`.
  4. Platform signing is never blocked platform-wide, and identity verification is never silently bypassed without audit logging.

### 4. Recipient Signing Experience & Lockout Governance

- When a recipient visits `/sign/:token`:
  - If `kba_locked_at` is set, the document view is masked, signing inputs are disabled, and a prominent security lock notice instructs the signer to contact the sender.
  - If `verification_method === 'kba'`, an interactive multi-question questionnaire modal is presented with an attempt counter.
  - If `verification_method === 'id_document'`, a front/back ID upload and live selfie challenge is triggered.
  - If `verification_method === 'qes'`, the signer is guided through the EU eIDAS trust service provider flow.
  - Passing verification unlocks the legal assent and signature capture pad.

---

## Consequences

### Positive

- Full legal compliance with US ESIGN / UETA (KBA), eIDAS Advanced (AES), and eIDAS Qualified (QES) standards.
- Privacy-first zero-PII architecture prevents data breach liability.
- Brute-force and identity fraud prevention via 3-attempt KBA lockout.
- High availability under vendor failure via RULE RISK-001 circuit breaker and conservative fallback.
- Clear subscription monetization through plan-gated verification methods.

### Negative / Trade-offs

- External vendor API latency during live verification challenge flows. Mitigated by 5s timeouts and async session handoffs.
- KBA is restricted to US signers with established credit bureau records; QES is restricted to EU signers with approved eID credentials. Enforced via jurisdiction validation rules.
