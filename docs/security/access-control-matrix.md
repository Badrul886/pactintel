# Access Control Matrix

**Platform:** PactIntel  
**Scope:** Identity Governance, RBAC, Service Identities, and Infrastructure Access  
**Compliance Target:** SOC 2 Type II (CC1.3, CC5.1, CC5.3, CC6.1)

---

## 1. Application Role-Based Access Control (RBAC)

Governed by CASL authorization engine (`apps/api/src/modules/organization/casl/ability.factory.ts`) and PostgreSQL Row-Level Security (`organization_id = app.current_tenant`).

| Resource / Subject                   | Owner | Admin | Manager |    Member     |      Collaborator      |
| :----------------------------------- | :---: | :---: | :-----: | :-----------: | :--------------------: |
| **Organization (Delete)**            |  ✅   |  ❌   |   ❌    |      ❌       |           ❌           |
| **Organization (Settings/SAML/SSO)** |  ✅   |  ✅   |   ❌    |      ❌       |           ❌           |
| **Billing & Subscriptions**          |  ✅   |  ✅   |   ❌    |      ❌       |           ❌           |
| **Payment Credentials (BYOK)**       |  ✅   |  ✅   |   ❌    |      ❌       |           ❌           |
| **Workspaces (Create/Update)**       |  ✅   |  ✅   |   ✅    |      ❌       |           ❌           |
| **Workspaces (Delete)**              |  ✅   |  ✅   |   ❌    |      ❌       |           ❌           |
| **Documents (Create/Edit)**          |  ✅   |  ✅   |   ✅    |      ✅       | ❌ (View/Suggest Only) |
| **Documents (Send/Sign)**            |  ✅   |  ✅   |   ✅    |      ✅       |           ❌           |
| **Documents (Delete)**               |  ✅   |  ✅   |   ✅    |      ❌       |           ❌           |
| **Templates (Manage Library)**       |  ✅   |  ✅   |   ✅    | ❌ (Use Only) |     ❌ (View Only)     |
| **Deal Rooms (Create/Manage)**       |  ✅   |  ✅   |   ✅    | ✅ (Own Only) |  ❌ (View/Chat Only)   |
| **CPQ Pricing Rules & Playbooks**    |  ✅   |  ✅   |   ✅    | ❌ (Use Only) |           ❌           |
| **Portfolio Obligations/Analytics**  |  ✅   |  ✅   |   ✅    |  ✅ (Scoped)  |     ❌ (View Only)     |
| **API Keys (Create/Revoke)**         |  ✅   |  ✅   |   ❌    |      ❌       |           ❌           |
| **Audit Log Entries (Export)**       |  ✅   |  ✅   |   ❌    |      ❌       |           ❌           |

---

## 2. GCP Infrastructure & Service Account Matrix

In accordance with **Invariant I-04** and **Invariant I-11**, human engineers have zero direct write access to production infrastructure; all changes are managed via Terraform IaC through GitHub Actions Workload Identity Federation.

| Service Account / Role            | Cloud SQL Access                | Cloud Storage Access              | Cloud KMS Access                        | Secret Manager Access              | Vertex AI Access           |
| :-------------------------------- | :------------------------------ | :-------------------------------- | :-------------------------------------- | :--------------------------------- | :------------------------- |
| **`sa-api` (API Runtime)**        | `Cloud SQL Client`              | Uploads Bucket (`objectAdmin`)    | Multi-region Key (`encrypterDecrypter`) | Stored Secrets (`secretAccessor`)  | None (Delegates to Worker) |
| **`sa-worker` (Core Worker)**     | `Cloud SQL Client`              | Documents Bucket (`objectAdmin`)  | Credential Ring (`encrypterDecrypter`)  | Worker Secrets (`secretAccessor`)  | None                       |
| **`sa-ai` (AI Worker)**           | `Cloud SQL Client`              | Temporary Scratch (`objectUser`)  | None                                    | None                               | `roles/aiplatform.user`    |
| **`sa-pdf` (PDF Worker)**         | `Cloud SQL Client`              | Evidence Bucket (`objectCreator`) | None                                    | None                               | None                       |
| **`sa-migrator` (DB Migrations)** | `Cloud SQL Admin` (Private VPC) | None                              | None                                    | Database Secret (`secretAccessor`) | None                       |
| **`sa-vanta` (SOC 2 Auditor)**    | Read-Only Viewer                | Read-Only Metadata                | Read-Only Metadata                      | Read-Only Metadata                 | None                       |

---

## 3. Environment Separation

| Control                       | Development (`dev`)      | Staging (`staging`)       | Production (`prod`)                       |
| :---------------------------- | :----------------------- | :------------------------ | :---------------------------------------- |
| **GCP Project**               | `pactintel-dev`          | `pactintel-staging`       | `pactintel-prod`                          |
| **Database Instance**         | Cloud SQL Single-AZ      | Cloud SQL Single-AZ       | Cloud SQL Multi-AZ HA + Private VPC       |
| **Customer Data**             | Synthetic Mock Data Only | Synthetic Mock Data Only  | Live Customer Production Data (Encrypted) |
| **Deploy Mechanism**          | Git push to `dev` branch | Git push to `main` branch | Release Tag via Approved Pull Request     |
| **Direct SSH / Shell Access** | Blocked                  | Blocked                   | Blocked (Zero human access)               |
