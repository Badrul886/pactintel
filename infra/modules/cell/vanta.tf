/**
 * Vanta Compliance Monitoring Service Account
 * Blueprint Reference: §8.1, Sprint 3.9 (SOC 2 Type II Audit Preparation)
 * Grants read-only audit visibility to Vanta agent for automated continuous compliance inspection.
 */

resource "google_service_account" "vanta_auditor" {
  account_id   = "${local.name_prefix}-sa-vanta"
  display_name = "PactIntel Vanta SOC 2 Auditor (${var.environment}-${var.cell_id})"
  project      = var.project_id
}

# Scoped read-only viewer role for compliance monitoring
resource "google_project_iam_member" "vanta_viewer" {
  project = var.project_id
  role    = "roles/viewer"
  member  = "serviceAccount:${google_service_account.vanta_auditor.email}"
}

# Security reviewer role for IAM & policy configuration monitoring
resource "google_project_iam_member" "vanta_security_reviewer" {
  project = var.project_id
  role    = "roles/iam.securityReviewer"
  member  = "serviceAccount:${google_service_account.vanta_auditor.email}"
}

