/**
 * Cell IAM — Least-Privilege Service Accounts & Workload Identity Federation
 * Blueprint Reference: §8.1, Invariant I-04 (No service account JSON keys)
 */

# -----------------------------------------------------------------------------
# 1. Service Accounts
# -----------------------------------------------------------------------------

# API Runtime Service Account
resource "google_service_account" "api_runtime" {
  account_id   = "${local.name_prefix}-sa-api"
  display_name = "PactIntel API Runtime (${var.environment}-${var.cell_id})"
  project      = var.project_id
}

# Worker Core Service Account (BullMQ jobs, outbox dispatch, batch analytics)
resource "google_service_account" "worker_core" {
  account_id   = "${local.name_prefix}-sa-worker"
  display_name = "PactIntel Worker Core (${var.environment}-${var.cell_id})"
  project      = var.project_id
}

# Worker AI Service Account (AiGateway, Vertex AI Claude calls)
resource "google_service_account" "worker_ai" {
  account_id   = "${local.name_prefix}-sa-ai"
  display_name = "PactIntel Worker AI (${var.environment}-${var.cell_id})"
  project      = var.project_id
}

# Worker PDF Service Account (Playwright PDF rendering + Evidence archive)
resource "google_service_account" "worker_pdf" {
  account_id   = "${local.name_prefix}-sa-pdf"
  display_name = "PactIntel Worker PDF (${var.environment}-${var.cell_id})"
  project      = var.project_id
}

# Worker Bulk Service Account (Batch operations, large export archives)
resource "google_service_account" "worker_bulk" {
  account_id   = "${local.name_prefix}-sa-bulk"
  display_name = "PactIntel Worker Bulk (${var.environment}-${var.cell_id})"
  project      = var.project_id
}

# Migrator Job Service Account (Prisma migrate deploy)
resource "google_service_account" "migrator" {
  account_id   = "${local.name_prefix}-sa-migrator"
  display_name = "PactIntel DB Migrator (${var.environment}-${var.cell_id})"
  project      = var.project_id
}

# CI/CD Deployment Service Account (Used via Workload Identity Federation)
resource "google_service_account" "github_ci" {
  account_id   = "${local.name_prefix}-sa-ci"
  display_name = "PactIntel GitHub Actions CI (${var.environment}-${var.cell_id})"
  project      = var.project_id
}

# -----------------------------------------------------------------------------
# 2. IAM Role Assignments — Least Privilege
# -----------------------------------------------------------------------------

# Cloud SQL Client role
resource "google_project_iam_member" "api_cloudsql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.api_runtime.email}"
}

resource "google_project_iam_member" "worker_cloudsql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.worker_core.email}"
}

resource "google_project_iam_member" "migrator_cloudsql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.migrator.email}"
}

# Secret Manager Access
resource "google_project_iam_member" "api_secrets" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.api_runtime.email}"
}

resource "google_project_iam_member" "worker_secrets" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.worker_core.email}"
}

resource "google_project_iam_member" "migrator_secrets" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.migrator.email}"
}

# Vertex AI User (worker-ai only)
resource "google_project_iam_member" "worker_ai_vertex" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.worker_ai.email}"
}

# Cloud KMS Decrypt / Encrypt
resource "google_kms_crypto_key_iam_member" "api_field_enc" {
  crypto_key_id = google_kms_crypto_key.field_encryption.id
  role          = "roles/cloudkms.cryptoKeyEncrypterDecrypter"
  member        = "serviceAccount:${google_service_account.api_runtime.email}"
}

resource "google_kms_crypto_key_iam_member" "worker_cred_vault" {
  crypto_key_id = google_kms_crypto_key.cred_vault.id
  role          = "roles/cloudkms.cryptoKeyEncrypterDecrypter"
  member        = "serviceAccount:${google_service_account.worker_core.email}"
}

resource "google_kms_crypto_key_iam_member" "pdf_evidence_kms" {
  crypto_key_id = google_kms_crypto_key.evidence.id
  role          = "roles/cloudkms.cryptoKeyEncrypterDecrypter"
  member        = "serviceAccount:${google_service_account.worker_pdf.email}"
}

# GCS Storage Access
resource "google_storage_bucket_iam_member" "pdf_evidence_writer" {
  bucket = google_storage_bucket.evidence.name
  role   = "roles/storage.objectCreator"
  member = "serviceAccount:${google_service_account.worker_pdf.email}"
}

resource "google_storage_bucket_iam_member" "api_uploads_admin" {
  bucket = google_storage_bucket.uploads.name
  role   = "roles/storage.objectUser"
  member = "serviceAccount:${google_service_account.api_runtime.email}"
}

resource "google_storage_bucket_iam_member" "api_exports_admin" {
  bucket = google_storage_bucket.exports.name
  role   = "roles/storage.objectUser"
  member = "serviceAccount:${google_service_account.api_runtime.email}"
}

# Pub/Sub Access
resource "google_pubsub_topic_iam_member" "api_pubsub_publisher" {
  topic   = google_pubsub_topic.analytics_ingest.name
  project = var.project_id
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:${google_service_account.api_runtime.email}"
}

resource "google_pubsub_subscription_iam_member" "worker_pubsub_subscriber" {
  subscription = google_pubsub_subscription.analytics_batcher.name
  project      = var.project_id
  role         = "roles/pubsub.subscriber"
  member       = "serviceAccount:${google_service_account.worker_core.email}"
}

# -----------------------------------------------------------------------------
# 3. Workload Identity Federation for GitHub Actions (No JSON Keys)
# -----------------------------------------------------------------------------
resource "google_iam_workload_identity_pool" "github_pool" {
  workload_identity_pool_id = "${local.name_prefix}-gh-pool"
  project                   = var.project_id
  display_name              = "GitHub Actions Pool (${var.environment}-${var.cell_id})"
  description               = "OIDC Identity Pool for GitHub Actions CI/CD"
}

resource "google_iam_workload_identity_pool_provider" "github_provider" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github_pool.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-provider"
  project                            = var.project_id
  display_name                       = "GitHub OIDC Provider"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.actor"      = "assertion.actor"
    "attribute.repository" = "assertion.repository"
  }

  attribute_condition = "assertion.repository == '${var.github_repository}'"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# Allow GitHub Actions in the specific repo to impersonate CI service account
resource "google_service_account_iam_member" "github_wif_impersonate" {
  service_account_id = google_service_account.github_ci.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github_pool.name}/attribute.repository/${var.github_repository}"
}

# Grant CI permissions to deploy Cloud Run services and jobs
resource "google_project_iam_member" "ci_run_admin" {
  project = var.project_id
  role    = "roles/run.admin"
  member  = "serviceAccount:${google_service_account.github_ci.email}"
}

resource "google_project_iam_member" "ci_sa_user" {
  project = var.project_id
  role    = "roles/iam.serviceAccountUser"
  member  = "serviceAccount:${google_service_account.github_ci.email}"
}
