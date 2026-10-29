# Incident Response Playbook

**Platform:** PactIntel Legal-Tech Platform  
**Target:** SOC 2 Type II Incident Management (CC9.1, CC9.2) & GDPR Data Protection  
**Version:** 1.0.0

---

## 1. Severity Classifications

| Severity             | Definition                                                                                                                         | Response SLA      | Update Cadence   |
| :------------------- | :--------------------------------------------------------------------------------------------------------------------------------- | :---------------- | :--------------- |
| **SEV-1 (Critical)** | Catastrophic incident: Cross-tenant data breach, signing compromise, total platform outage, or cryptographic key loss.             | < 15 minutes      | Every 30 minutes |
| **SEV-2 (Major)**    | Core service degraded: E-signing unavailable, SAML SSO failing for all enterprise users, or billing webhook processing stalled.    | < 30 minutes      | Hourly           |
| **SEV-3 (Moderate)** | Non-critical service failure: Deal Room attachments delayed, analytics dashboard slow, or single non-enterprise customer affected. | < 2 hours         | Daily            |
| **SEV-4 (Minor)**    | Low-impact bug: Cosmetic UI defect or non-critical error logging without business impact.                                          | Next business day | On resolution    |

---

## 2. Incident Response Lifecycle

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ 1. Detection &  │────►│ 2. Containment  │────►│ 3. Eradication  │
│ Triage (Sentry) │     │ & Mitigation    │     │ & Recovery      │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                                                ┌────────▼────────┐
                                                │ 4. Post-Mortem  │
                                                │ & Lessons       │
                                                └─────────────────┘
```

### Phase 1: Detection & Triage

1. **Trigger Sources:** Sentry alert, Cloud Monitoring latency spike, Cloud Armor anomaly, or security report (`security@pactintel.com`).
2. **On-Call Engineer Responsibilities:**
   - Acknowledge alert in PagerDuty within SLA window.
   - Open an incident response channel (`#incident-[date]-[severity]-[descriptor]`).
   - Assign Incident Commander (IC) and Communications Lead.
   - Declare severity level.

### Phase 2: Containment & Immediate Mitigation

- **For Active Credential / Session Compromise:**
  - Execute `AuthService.invalidateAllUserSessions(userId)` immediately (**RULE AUTH-001**).
  - Rotate compromised API key via `ApiKeyService.revokeApiKey()`.
- **For Infrastructure Attack / DoS:**
  - Enable Cloud Armor rate-limiting rule or ban attacking IP range in Cloudflare WAF.
  - Scale up Cloud Run instance limits if benign traffic spike.
- **For Database Anomaly / Data Corruption:**
  - Put application in read-only maintenance mode.
  - Snapshot Cloud SQL instance before any forensic intervention.

### Phase 3: Eradication & Recovery

1. Identify and patch root cause (PR with hotfix, emergency review, automated CI verification).
2. Deploy fix via GitHub Actions Workload Identity Federation pipeline.
3. Verify system health using prometheus metrics (`/api/v1/metrics`) and health endpoints (`/api/v1/health/liveness`).
4. Re-enable traffic and revoke maintenance mode.

### Phase 4: Post-Mortem & Regulatory Notification

1. **Breach Notification:** If tenant contract or PII data was exposed, notify affected enterprise data protection officers within **72 hours** (GDPR Art. 33 / SOC 2 CC9).
2. **Blameless Post-Mortem:** Conduct root cause analysis meeting within 48 hours. Document timeline, contributing factors, preventative action items, and create Jira/GitHub tracking tickets.

---

## 3. Escalation & Contact Directory

| Role                        | Responsibility                                                             | Escalation Point            |
| :-------------------------- | :------------------------------------------------------------------------- | :-------------------------- |
| **Incident Commander (IC)** | Leads technical triage and mitigation decisions.                           | On-Call Lead Engineer       |
| **Tech Lead / Architect**   | Evaluates schema, database, or cryptographic impacts.                      | Staff Platform Engineer     |
| **Communications Lead**     | Manages status page updates (`status.pactintel.com`) and customer notices. | Head of Customer Operations |
| **Legal & Privacy Officer** | Reviews breach notifications and legal liability.                          | General Counsel / DPO       |
