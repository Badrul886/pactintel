# ADR-0054: Phase 3 Sprint 3.7 — Risk-Adaptive Identity Verification & Vendor Selection

## Status: Accepted

## Context

Phase 3 Sprint 3.6 introduced discrete verification methods (Passcode, SMS, KBA, Government ID, QES). However, enterprise commercial operations, high-velocity sales teams, and legal departments face conflicting priorities:

1. **Friction vs. Fraud Prevention**: Applying strict Government ID or KBA verification to every recipient introduces excessive friction, leading to abandoned transactions on routine or low-risk deals.
2. **Dynamic Risk-Adaptive Selection**: High-value transactions, cross-border counterparty signings, anomalous IP connections (VPNs, TOR exit nodes, datacenter proxies), or rapid credential modifications require real-time step-up authentication.
3. **Pre-Verified Network Recognition**: Signers who have already completed high-assurance identity verification across the PactIntel platform should not be forced to repeatedly upload identity documents, provided their verification remains legally valid (1-year expiration window) and cross-tenant privacy is strictly maintained (Invariant **I-03**).
4. **Regulatory Assurance & Compliance Export (AML/KYC)**: Regulated industries (financial services, FinTech, commercial lending, insurance) require a standalone, exportable cryptographic compliance artifact proving identity verification assurance levels at the time of execution.
5. **RULE RISK-001 (Vendor Outage & Circuit Breaker)**: The risk-scoring service is an external third-party dependency. If it suffers an outage or latency spike (>5000ms), the system must **fail conservative** (applying the configured step-up verification tier) and never fail open to unverified signing.

---

## Decisions

### 1. Vendor Selection: Sift Digital Trust & Safety Engine

We select **Sift** as the primary fraud-risk scoring engine for e-signatures, implemented via `RiskScoringPort` and `SiftRiskScoringAdapter`:

- **Dimensions Evaluated:**
  1. **IP Quality & Geolocation:** Proxy/VPN/TOR detection, ASN reputation, geographical distance anomalies.
  2. **Device Fingerprinting:** Canvas/WebGL signatures, browser environment consistency, headless automation detection.
  3. **Email & Domain Risk:** Disposable/temporary email domains, deliverability flags, domain creation age.
  4. **Contract Value Multiplier:** Dollar-value risk scaling ($0–$25k baseline, $25k–$100k elevated, >$100k high-assurance).
- **Abstracted Port (`RiskScoringPort`):** Application feature logic interacts strictly with the port. The Sift adapter handles API communication, request signing, and local simulation in non-production environments.

### 2. Tier Mapping & Dynamic Method Assignment

The computed risk score $R \in [0.0, 1.0]$ maps to verification requirements:

- **Low Risk ($R < 0.35$):** Low-friction verification (`passcode` or standard email access).
- **Medium Risk ($0.35 \le R \le 0.75$):** Two-factor authentication (`sms` OTP).
- **High Risk ($R > 0.75$):** Step-up identity proofing (`id_document` or `kba`).
- **Jurisdiction & Plan Constraints:** If High Risk requires step-up verification, plan gating (Sprint 3.6) and geographic rules (e.g. EU eIDAS for QES, US for KBA) are respected.

### 3. Pre-Verified Signers Network (`pre_verified_signers`)

To eliminate repetitive verification friction without compromising tenant isolation (Invariant **I-03**):

- We introduce a global, shared table `pre_verified_signers` containing **only**:
  - `id`: UUIDv7
  - `email_hash`: SHA-256 hash of lowercase trimmed email (e.g. `sha256(email.toLowerCase().trim())`)
  - `verification_method`: Method completed (`kba`, `id_document`, `qes`)
  - `verified_at`: Timestamp of completion
  - `expires_at`: 1 year from completion (`verified_at + 365 days`)
- **Strict Privacy Rule:** Zero PII is stored cross-tenant. No names, no IP addresses, no document titles, no organization references.
- When a recipient accesses `/sign/:token`:
  - The system checks if `email_hash` exists and `expires_at > now()`.
  - If present and the prior verification satisfies the required tier, repeat verification is waived, and a `risk_scoring_pre_verified` event is logged to `signature_events`.

### 4. RULE RISK-001 Circuit Breaker Implementation

- **Thresholds:** 5 consecutive failures within a 10-minute sliding window trip the circuit breaker to **OPEN**.
- **Cooldown:** When open, the circuit remains open for 30 minutes, fast-failing any vendor API calls.
- **Timeout:** 5000ms SLA timeout per vendor call.
- **Conservative Fallback:** When the circuit is open or a call fails:
  - If the organization has identity verification enabled, apply the conservative fallback method (`id_document` or `sms`).
  - Log `risk_scoring_fallback` event in `signature_events` with `{ reason: 'vendor_unreachable' }`.
  - Never allow an unverified signature on a document requiring adaptive security.

### 5. Proof-of-Verification Export (`GET /api/v1/signing/signature-requests/:id/verification-report`)

- Generates a formal, tamper-evident AML/KYC Proof of Verification Report in both JSON and PDF formats.
- Summarizes signer risk scores, verification method outcomes, vendor reference IDs, biometric liveness indicators, qualified timestamps, and canonical document SHA-256 content hashes.
- Protected by CASL permissions (Owner, Admin, and Compliance Officer roles).

### 6. Workflow Engine Integration

- Upgrades the visual Workflow Builder's `risk_assessment` node (`WorkflowNodeExecutor`) from a static heuristic stub to a live `RiskScoringPort` invocation.
- Workflow outputs: `riskScore`, `riskLevel` (`low`, `medium`, `high`), and `requiresStepUpVerification`, enabling automated conditional routing (e.g., routing high-risk contracts to legal review).

---

## Consequences

### Positive

- Minimizes recipient friction for low-risk and recognized signers across the PactIntel network.
- Automatically elevates security posture on high-value and anomalous signing attempts.
- Provides financial and legal compliance teams with exportable AML/KYC audit artifacts.
- Guarantees high availability and zero fail-open vulnerabilities via RULE RISK-001 circuit breaker.
- Upholds Invariant **I-03** with zero cross-tenant PII leakage.

### Negative / Trade-Offs

- External vendor calls introduce up to 5000ms latency on the initial adaptive token lookup (mitigated by fast in-memory circuit breakers and pre-verified caching).
- Sift risk scoring incurs per-call transaction costs in production (gated to Business and Enterprise subscription tiers).
