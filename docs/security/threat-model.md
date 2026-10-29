# STRIDE Threat Model: PactIntel Legal-Tech Platform

**Date:** Phase 3 Sprint 3.9  
**Scope:** Multi-Tenant Core API, Collab Server, Identity & SSO, Deal Rooms, Signing Engine, and AI Gateway  
**Methodology:** Microsoft STRIDE (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege)

---

## 1. System Architecture & Trust Boundaries

```
[ Internet Client / Browser / Mobile ]
         │ (HTTPS / TLS 1.3)
   ┌─────▼──────────────────────────────┐
   │ Cloudflare WAF + Cloud Armor       │
   └─────┬──────────────────────────────┘
         │ (Private VPC Origin)
   ┌─────▼──────────────────────────────┐
   │ External Application Load Balancer │
   └─────┬──────────────────────────────┘
         │
   ┌─────▼──────────────────────────────┐
   │ Cloud Run: API Service             │
   │ (NestJS 11 + Prisma 6 + CASL)      │
   └─────┬───────────────┬──────────────┘
         │               │
  ┌──────▼──────┐ ┌──────▼──────┐ ┌─────────────┐
  │ Cloud SQL   │ │ Memorystore │ │ Cloud KMS   │
  │ PostgreSQL  │ │ Redis Valkey│ │ Key Rings   │
  │ (with RLS)  │ │ (Sessions)  │ │ (Envelope)  │
  └─────────────┘ └─────────────┘ └─────────────┘
```

Trust Boundaries:

- **TB-1 (Public / Edge):** Untrusted Internet clients to Cloudflare / Cloud Armor WAF.
- **TB-2 (Application / Ingress):** Authenticated HTTPS sessions to Cloud Run API services.
- **TB-3 (Tenant Boundary):** Strict logical isolation between Organization A and Organization B enforced via PostgreSQL Row-Level Security (`app.current_tenant`).
- **TB-4 (Third-Party Integrations):** WorkOS (SSO/SCIM), BoldSign (e-signatures), Paddle (billing), Vertex AI (LLMs).

---

## 2. STRIDE Threat Analysis & Mitigations

### 2.1 Spoofing (Identity & Authentication)

| Threat                           | Description                                                          | Impact   | Mitigations                                                                                                                                                               |
| :------------------------------- | :------------------------------------------------------------------- | :------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **T-01: Session Hijacking**      | Adversary steals session cookie or token to impersonate user.        | High     | Cookies set to `HttpOnly`, `Secure`, `SameSite=Lax`. Sessions cryptographically keyed in Redis. Revocation enforced immediately upon security events (**RULE AUTH-001**). |
| **T-02: SAML Assertion Forgery** | Attacker crafts forged SAML assertion to impersonate corporate user. | Critical | SAML assertions validated cryptographically by WorkOS AuthKit with verified IdP certificates. Tenant domain matching enforced.                                            |
| **T-03: Signer Impersonation**   | Attacker signs legal document as another recipient.                  | Critical | Multi-factor signing verification (Email OTP, SMS, KBA, Government ID, QES, and Sift risk-adaptive scoring).                                                              |
| **T-04: API Key Spoofing**       | Compromised API key used to access tenant APIs.                      | High     | API keys hashed with SHA-256; fast indexed prefix lookup; MFA required for API key generation.                                                                            |

---

### 2.2 Tampering (Data Integrity)

| Threat                                | Description                                                                    | Impact   | Mitigations                                                                                                                                                          |
| :------------------------------------ | :----------------------------------------------------------------------------- | :------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **T-05: Modifying Signed Contract**   | Malicious actor or rogue admin modifies contract text after execution.         | Critical | Signed `DocumentVersion` records are locked by database immutability triggers. Storage copies stored in Cloud Storage with Object Retention Lock (WORM locked mode). |
| **T-06: Audit Trail Manipulation**    | Attacker alters or deletes audit log records to conceal unauthorized activity. | Critical | `audit_log_entries` and `signature_events` tables are strictly append-only (PostgreSQL triggers reject `UPDATE` and `DELETE`).                                       |
| **T-07: In-Flight Webhook Tampering** | Attacker intercepts or replays payment/signing webhook events.                 | High     | HMAC-SHA256 signature verification with timestamp tolerance windows; idempotency tables prevent replay attacks.                                                      |

---

### 2.3 Repudiation (Disavowal of Actions)

| Threat                               | Description                                                    | Impact   | Mitigations                                                                                                                                                      |
| :----------------------------------- | :------------------------------------------------------------- | :------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **T-08: Disavowal of Signature**     | Signer claims they never signed the contract.                  | Critical | Forensic Certificate of Completion captures IP address, user agent, timestamps, authentication proof, SHA-256 document checksum, and cryptographic provider IDs. |
| **T-09: Disavowal of Admin Actions** | Admin denies changing organization settings or adding members. | Medium   | Comprehensive audit logging captures actor ID, IP address, user agent, and granular before/after diffs in `changes`.                                             |

---

### 2.4 Information Disclosure (Confidentiality & Privacy)

| Threat                                   | Description                                                              | Impact   | Mitigations                                                                                                                                              |
| :--------------------------------------- | :----------------------------------------------------------------------- | :------- | :------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **T-10: Cross-Tenant Data Leakage**      | Tenant A accesses contracts or templates belonging to Tenant B.          | Critical | PostgreSQL Row-Level Security (RLS) on all tenant tables (`app.current_tenant`); connection pooler isolation tests run in CI; strict CASL role matrices. |
| **T-11: Deal Room Buyer/Seller Leak**    | Buyer accesses internal seller deal notes or margin discussions.         | High     | Deal Room chat and document channels are strictly partitioned by role (`internal` seller vs `external` buyer).                                           |
| **T-12: Stored Payment Credential Leak** | Direct database leak exposes customer payment gateways or merchant keys. | Critical | Envelope encryption via Cloud KMS-managed keys; decrypted credentials never stored in logs or caches.                                                    |

---

### 2.5 Denial of Service (Availability)

| Threat                                  | Description                                                   | Impact | Mitigations                                                                                                            |
| :-------------------------------------- | :------------------------------------------------------------ | :----- | :--------------------------------------------------------------------------------------------------------------------- |
| **T-13: Noisy Neighbor API Exhaustion** | One tenant spams endpoints, exhausting Cloud SQL pool or CPU. | High   | Per-tenant rate limiting and quotas via Redis token bucket; Cloud Armor layer 7 DDoS mitigation; BullMQ fair queueing. |
| **T-14: Heavy PDF Rendering Overload**  | Adversary initiates massive batch PDF exports.                | Medium | PDF generation offloaded to asynchronous worker pools (`worker_pdf`); concurrency throttled per tenant.                |

---

### 2.6 Elevation of Privilege (Authorization)

| Threat                                 | Description                                                   | Impact   | Mitigations                                                                                                                                                |
| :------------------------------------- | :------------------------------------------------------------ | :------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **T-15: Workspace Role Escalation**    | Member in Workspace B attempts to execute admin actions.      | High     | CASL policy guard checks on every endpoint; per-workspace membership roles (`admin`, `manager`, `member`, `collaborator`) checked in service repositories. |
| **T-16: Cloud Run Container Breakout** | Attacker compromises container to access GCP cloud resources. | Critical | gVisor container sandbox on Cloud Run; zero service-account JSON keys; least-privilege IAM roles; metadata server emulation disabled.                      |
