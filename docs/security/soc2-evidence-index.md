# SOC 2 Type II Evidence Index

**Platform:** PactIntel  
**Scope:** Trust Services Criteria (TSC) — Security, Confidentiality, and Availability  
**Audit Period:** Annual Review  
**Auditor Automation Partner:** Vanta

---

## 1. CC1 — Control Environment

| Control ID | Description                                                                                                   | Evidence Artifact / Verification                                                                              |
| :--------- | :------------------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------ |
| **CC1.1**  | The entity demonstrates commitment to integrity and ethical values.                                           | Code of Conduct; Employee handbook acknowledgment logs; [`AGENTS.md`](../AGENTS.md) architectural invariants. |
| **CC1.2**  | The board of directors demonstrates independence from management and exercises oversight of internal control. | Quarterly security and compliance board review minutes.                                                       |
| **CC1.3**  | Management establishes structures, reporting lines, and appropriate authorities and responsibilities.         | [`docs/security/access-control-matrix.md`](access-control-matrix.md); Engineering org chart.                  |
| **CC1.4**  | The entity demonstrates commitment to attract, develop, and retain competent individuals.                     | Documented background check verification process; Mandatory annual security awareness training records.       |
| **CC1.5**  | The entity holds individuals accountable for their internal control responsibilities.                         | Role-based permission assignments in CASL ability engine; Performance evaluation records.                     |

---

## 2. CC2 — Communication and Information

| Control ID | Description                                                                                                    | Evidence Artifact / Verification                                                                         |
| :--------- | :------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------- |
| **CC2.1**  | The entity obtains or generates relevant, quality information to support the functioning of internal control.  | Cloud Logging, Prometheus metrics (`apps/api/src/common/metrics/`), Sentry error tracking.               |
| **CC2.2**  | The entity internally communicates information necessary to support the functioning of internal controls.      | Internal engineering runbooks; [`docs/runbooks/incident-response.md`](../runbooks/incident-response.md). |
| **CC2.3**  | The entity communicates with external parties regarding matters affecting the functioning of internal control. | Published Security Whitepaper; Vulnerability Disclosure Policy; Privacy Policy; Terms of Service.        |

---

## 3. CC3 — Risk Assessment

| Control ID | Description                                                                                                   | Evidence Artifact / Verification                                                          |
| :--------- | :------------------------------------------------------------------------------------------------------------ | :---------------------------------------------------------------------------------------- |
| **CC3.1**  | The entity specifies objectives with sufficient clarity to enable the identification and assessment of risks. | Master Blueprint §5, §15, §16.                                                            |
| **CC3.2**  | The entity identifies risks to the achievement of its objectives across the entity.                           | STRIDE Threat Model: [`docs/security/threat-model.md`](threat-model.md).                  |
| **CC3.3**  | The entity considers the potential for fraud in assessing risks to the achievement of objectives.             | CPQ approval thresholds; Risk-adaptive identity verification (Sprint 3.7).                |
| **CC3.4**  | The entity identifies and assesses changes that could significantly affect the system of internal control.    | Architecture Decision Records (`docs/adr/`); Architecture Invariants (I-01 through I-15). |

---

## 4. CC4 — Monitoring Activities

| Control ID | Description                                                                             | Evidence Artifact / Verification                                                                    |
| :--------- | :-------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------- |
| **CC4.1**  | The entity selects, develops, and performs ongoing and/or separate evaluations.         | Automated continuous compliance via Vanta agent (`infra/modules/cell/vanta.tf`).                    |
| **CC4.2**  | The entity evaluates and communicates internal control deficiencies in a timely manner. | Immutable audit log trail (`audit_log_entries`); Cloud Armor WAF alerts; PagerDuty on-call routing. |

---

## 5. CC5 — Logical and Physical Access Controls

| Control ID | Description                                                                                  | Evidence Artifact / Verification                                                                                                         |
| :--------- | :------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------- |
| **CC5.1**  | Logical access security measures restrict unauthorized access to system components.          | WorkOS SAML SSO; Multi-Factor Authentication (MFA); SCIM 2.0 automated deprovisioning; Immediate session revocation (**RULE AUTH-001**). |
| **CC5.2**  | User access credentials are authenticated prior to allowing system access.                   | WorkOS AuthKit; SHA-256 hashed API keys; Session token cryptographically bound in Redis.                                                 |
| **CC5.3**  | Access rights to system assets are granted, modified, and removed based on authorized roles. | CASL authorization matrix (`apps/api/src/modules/organization/casl/`); Row-Level Security (RLS).                                         |
| **CC5.4**  | Physical access to facilities housing system assets is restricted to authorized personnel.   | Google Cloud Platform physical datacenter certifications (SOC 1, SOC 2, ISO 27001).                                                      |

---

## 6. CC6 — System Operations

| Control ID | Description                                                                            | Evidence Artifact / Verification                                                                     |
| :--------- | :------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------- |
| **CC6.1**  | The entity manages the operation of system components.                                 | Automated CI/CD pipelines via GitHub Actions; Workload Identity Federation; Zero manual deployments. |
| **CC6.2**  | The entity authorizes, designs, develops, and implements changes to system components. | Branch protection (linear history, required pull request reviews, mandatory CI inspection gates).    |
| **CC6.3**  | The entity implements data recovery and backup procedures.                             | Cloud SQL Point-in-Time Recovery (PITR); Cloud Storage Object Retention Lock (WORM locked mode).     |

---

## 7. CC7 — Change Management

| Control ID | Description                                                                                  | Evidence Artifact / Verification                                                                              |
| :--------- | :------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------ |
| **CC7.1**  | The entity authorizes, designs, develops, configures, and implements infrastructure changes. | Terraform Infrastructure as Code (`infra/`); Zero console-created GCP resources (**Invariant I-04**).         |
| **CC7.2**  | The entity tests system changes prior to implementation.                                     | Automated CI testing (100% test pass rate, RLS isolation tests, CASL matrix tests, data manifest validation). |
| **CC7.3**  | The entity detects and addresses unauthorized changes.                                       | Audit logs for all configuration changes; Data manifest verification blocks unapproved schema alterations.    |

---

## 8. CC8 — Risk Mitigation

| Control ID | Description                                                                            | Evidence Artifact / Verification                                                                  |
| :--------- | :------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------ |
| **CC8.1**  | The entity identifies and manages risks associated with vendors and business partners. | Third-party vendor risk assessment (WorkOS, BoldSign, Paddle, Google Cloud); DPA execution.       |
| **CC8.2**  | The entity performs regular vulnerability scans and penetration testing.               | Annual third-party penetration testing engagement; Snyk/Dependabot automated dependency scanning. |

---

## 9. CC9 — Incident Management

| Control ID | Description                                                                    | Evidence Artifact / Verification                                                                  |
| :--------- | :----------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------ |
| **CC9.1**  | The entity identifies, analyzes, and responds to security incidents.           | Incident Response Plan: [`docs/runbooks/incident-response.md`](../runbooks/incident-response.md). |
| **CC9.2**  | The entity develops and tests business continuity and disaster recovery plans. | Annual DR failover drill documentation; Cross-region cold-standby recovery runbook.               |
