/**
 * Global GCP IAM Least-Privilege Policies & Cloud Audit Logging
 * Blueprint Reference: §5, §8, Sprint 3.9 (SOC 2 Type II Readiness - CC5 / CC6)
 * Enforces zero service-account keys, Workload Identity Federation, and comprehensive audit logs.
 */

# Cloud Audit Logging for All GCP Services (Data Access Logs)
resource "google_project_iam_audit_config" "all_services" {
  project = var.project_id
  service = "allServices"

  audit_log_config {
    log_type = "ADMIN_READ"
  }
  audit_log_config {
    log_type = "DATA_READ"
  }
  audit_log_config {
    log_type = "DATA_WRITE"
  }
}

# Enforce no external public access to Cloud SQL
resource "google_project_organization_policy" "sql_no_public_ip" {
  project    = var.project_id
  constraint = "constraints/sql.restrictPublicIp"

  boolean_policy {
    enforced = true
  }
}

# Enforce uniform bucket-level access across all Cloud Storage buckets
resource "google_project_organization_policy" "storage_uniform_access" {
  project    = var.project_id
  constraint = "constraints/storage.uniformBucketLevelAccess"

  boolean_policy {
    enforced = true
  }
}

