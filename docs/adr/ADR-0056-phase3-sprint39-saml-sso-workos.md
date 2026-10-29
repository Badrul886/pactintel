# ADR-0056: Phase 3 Sprint 3.9 - SAML SSO Implementation via WorkOS & SCIM Provisioning

## Status: Accepted

## Context

Enterprise customers require federated identity integration with their corporate Identity Providers (IdPs) such as Okta, Microsoft Entra ID (Azure AD), Google Workspace, PingFederate, and OneLogin. For legal-tech and contract lifecycle management platforms handling legally binding contracts, signatures, and payments:

1. **Security & Access Governance:** Organizations must be able to mandate Single Sign-On (SSO) so that credentials never touch PactIntel servers directly.
2. **Lifecycle Automation (JIT & SCIM):** When employees join, they should automatically be provisioned (Just-In-Time) into the organization. When employees are terminated, they must be deprovisioned immediately across all active sessions (**RULE AUTH-001**) to prevent unauthorized access to sensitive contracts.
3. **Immutability of Legal Evidence:** Deprovisioning a user in SCIM must never delete their signature events, contract approvals, or audit log entries (**Invariants I-03, I-09**). Deprovisioning must be a non-destructive deactivation.
4. **SOC 2 Type II Audit Readiness:** Enterprise readiness requires automated compliance monitoring (Vanta), continuous audit logging, least-privilege cloud IAM, and documented trust service criteria (CC1–CC9).

## Decision

1. **Identity Provider Federation via WorkOS:**
   - Standardize on WorkOS SSO (`AuthPort`) for SAML 2.0 and OIDC enterprise connections.
   - WorkOS manages IdP metadata exchange, certificate rotation, SP/IdP-initiated login flows, and cryptographic assertions.
   - PactIntel stores `workos_saml_connection_id` on the `organizations` table.
   - Secrets and API keys (`WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, `SCIM_API_KEY`) reside in GCP Secret Manager and are injected at runtime via environment variables.

2. **Organization-Level SSO Policies:**
   - Organizations feature an `sso_policy` column with three discrete settings:
     - `'optional'`: Users may authenticate via email/password, social OAuth, or SAML SSO.
     - `'required'`: All non-SSO authentication attempts are rejected with HTTP 403 `SSO_REQUIRED`.
     - `'required_admin_bypass'`: Non-admin members must use SAML SSO; organization Owner and Admins may bypass SSO using password/OAuth + MFA in the event of an IdP outage.

3. **Just-In-Time (JIT) Provisioning:**
   - On the first successful SAML assertion from a verified IdP domain, if no user record exists, PactIntel auto-provisions a `User` entity linked to the tenant's default workspace with role `'member'`.
   - A transactional outbox event (`scim.user_provisioned` or `auth.jit_user_created`) is emitted in the same transaction.

4. **SCIM 2.0 Provisioning & Deprovisioning (`/scim/v2/Users`):**
   - Provide RFC 7643 and RFC 7644 compliant endpoints secured by a dedicated `SCIM_API_KEY` bearer token.
   - Supports user creation (`POST`), user update (`PUT`/`PATCH`), and user deprovisioning (`DELETE`).
   - Deprovisioning sets `status = 'deactivated'`, immediately invalidates all active sessions in Redis (**RULE AUTH-001**), logs an append-only entry in `audit_log_entries`, and emits `scim.user_deactivated` via the outbox. Historical documents, comments, and signatures are preserved.

5. **SOC 2 Type II Governance & IaC:**
   - Maintain comprehensive audit artifacts: `soc2-evidence-index.md`, `threat-model.md` (STRIDE), `incident-response.md`, and `access-control-matrix.md`.
   - GCP IAM least-privilege configurations implemented via Terraform in `infra/iam.tf` and `infra/modules/cell/vanta.tf`.

## Consequences

### Positive

- Zero PII credential handling for SAML logins; cryptographic authentication handled by WorkOS.
- Seamless compatibility with all major enterprise IdPs (Okta, Azure AD, Google Workspace).
- Instant offboarding compliance for SOC 2 Type II controls.
- Full preservation of legal evidence and audit trail immutability.

### Negative / Trade-offs

- External dependency on WorkOS API availability (mitigated by `required_admin_bypass` fallback and circuit breakers).
- SCIM Group-to-workspace mapping is deferred to Phase 4 (basic SCIM user sync is delivered in Phase 3).

## Alternatives Considered

1. **Custom in-house SAML 2.0 engine (Passport-SAML / samlify):** High engineering overhead, ongoing XML signature vulnerability risks, and complex manual certificate rotation.
2. **Direct IdP integrations (separate Okta SDK, Azure AD SDK):** Vendor lock-in, non-uniform API contracts, and high maintenance burden.
3. **Auth0 Enterprise Connections:** Exorbitant enterprise pricing per active SSO connection compared to WorkOS flat pricing.
