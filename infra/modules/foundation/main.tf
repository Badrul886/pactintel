/**
 * Foundation Module — GCP Organization Structure & Policies
 * Blueprint Reference: §8.1, Architecture Decisions ADR-0001, Invariants I-04
 * Q1 Decision: New GCP Org rooted at pactintel.com with structured folder hierarchy.
 */

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
}

# -----------------------------------------------------------------------------
# 1. Organization Folders
# -----------------------------------------------------------------------------

resource "google_folder" "shared_services" {
  display_name = "shared-services"
  parent       = "organizations/${var.organization_id}"
}

resource "google_folder" "security" {
  display_name = "security"
  parent       = "organizations/${var.organization_id}"
}

resource "google_folder" "control_plane" {
  display_name = "control-plane"
  parent       = "organizations/${var.organization_id}"
}

resource "google_folder" "cells" {
  display_name = "cells"
  parent       = "organizations/${var.organization_id}"
}

resource "google_folder" "non_prod" {
  display_name = "non-prod"
  parent       = "organizations/${var.organization_id}"
}

# -----------------------------------------------------------------------------
# 2. Shared Services & Security Projects
# -----------------------------------------------------------------------------

resource "google_project" "shared_services" {
  name            = "pactintel-shared-services"
  project_id      = "pactintel-shared-services"
  folder_id       = google_folder.shared_services.name
  billing_account = var.billing_account_id

  labels = {
    service = "shared"
    tier    = "platform"
    env     = "shared"
    cell    = "global"
  }
}

resource "google_project" "security" {
  name            = "pactintel-security"
  project_id      = "pactintel-security"
  folder_id       = google_folder.security.name
  billing_account = var.billing_account_id

  labels = {
    service = "security"
    tier    = "audit"
    env     = "shared"
    cell    = "global"
  }
}

# -----------------------------------------------------------------------------
# 3. Organization Policies (Mandatory Security Invariants)
# -----------------------------------------------------------------------------

# Disable Service Account JSON Key Creation (Invariant I-04, ADR-0001)
resource "google_organization_policy" "disable_sa_key_creation" {
  org_id     = var.organization_id
  constraint = "constraints/iam.disableServiceAccountKeyCreation"

  boolean_policy {
    enforced = true
  }
}

# Enforce Uniform Bucket-Level Access (No legacy ACLs)
resource "google_organization_policy" "uniform_bucket_level_access" {
  org_id     = var.organization_id
  constraint = "constraints/storage.uniformBucketLevelAccess"

  boolean_policy {
    enforced = true
  }
}

# Require Shielded VMs
resource "google_organization_policy" "require_shielded_vm" {
  org_id     = var.organization_id
  constraint = "constraints/compute.requireShieldedVm"

  boolean_policy {
    enforced = true
  }
}

# -----------------------------------------------------------------------------
# 4. Terraform State Storage (shared-services)
# -----------------------------------------------------------------------------

resource "google_storage_bucket" "tf_state" {
  name                        = "pactintel-tf-state"
  project                     = google_project.shared_services.project_id
  location                    = var.state_bucket_location
  uniform_bucket_level_access = true
  storage_class               = "STANDARD"

  versioning {
    enabled = true
  }

  lifecycle_rule {
    action {
      type = "Delete"
    }
    condition {
      num_newer_versions = 10
    }
  }

  labels = {
    service = "iac"
    tier    = "platform"
    env     = "shared"
    cell    = "global"
  }
}

# -----------------------------------------------------------------------------
# 5. Security Audit Log Sink (Organization Sink → Locked Security Bucket)
# -----------------------------------------------------------------------------

resource "google_storage_bucket" "audit_logs" {
  name                        = "pactintel-org-audit-logs"
  project                     = google_project.security.project_id
  location                    = var.state_bucket_location
  uniform_bucket_level_access = true

  versioning {
    enabled = true
  }

  retention_policy {
    is_locked        = true
    retention_period = 220752000 # 7 years in seconds (7 * 365 * 86400)
  }

  labels = {
    service = "audit-sink"
    tier    = "security"
    env     = "shared"
    cell    = "global"
  }
}

resource "google_logging_organization_sink" "org_audit_sink" {
  name        = "pactintel-org-audit-sink"
  org_id      = var.organization_id
  destination = "storage.googleapis.com/${google_storage_bucket.audit_logs.name}"
  filter      = "logName:\"logs/cloudaudit.googleapis.com\""

  include_children = true
}

# Grant sink SA write permissions to audit bucket
resource "google_storage_bucket_iam_member" "sink_writer" {
  bucket = google_storage_bucket.audit_logs.name
  role   = "roles/storage.objectCreator"
  member = google_logging_organization_sink.org_audit_sink.writer_identity
}
