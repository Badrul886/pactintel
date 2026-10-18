/**
 * Cell Secret Manager — Environment Secrets & Connection Strings
 * Blueprint Reference: §2.1 (KMS / Secrets row), §8.1
 */

locals {
  secret_keys = [
    "workos-client-secret",
    "workos-webhook-secret",
    "paddle-api-key",
    "paddle-webhook-secret",
    "boldsign-api-key",
    "boldsign-webhook-secret",
    "resend-api-key",
    "clickhouse-password"
  ]
}

# Database URL Secret (automatically constructed with private IP)
resource "google_secret_manager_secret" "database_url" {
  secret_id = "${local.name_prefix}-database-url"
  project   = var.project_id

  replication {
    auto {}
  }

  labels = merge(local.base_labels, {
    service = "secret-manager"
    tier    = "security"
  })
}

resource "google_secret_manager_secret_version" "database_url_val" {
  secret      = google_secret_manager_secret.database_url.id
  secret_data = "postgresql://${google_sql_user.app_user.name}:${random_password.db_password.result}@${google_sql_database_instance.primary.private_ip_address}:5432/${google_sql_database.pactintel.name}?schema=public&sslmode=disable"
}

# Standard Operator-Populated Secrets
resource "google_secret_manager_secret" "app_secrets" {
  for_each  = toset(local.secret_keys)
  secret_id = "${local.name_prefix}-${each.key}"
  project   = var.project_id

  replication {
    auto {}
  }

  labels = merge(local.base_labels, {
    service = "secret-manager"
    tier    = "security"
  })
}
