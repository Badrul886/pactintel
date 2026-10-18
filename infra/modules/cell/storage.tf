/**
 * Cell Cloud Storage — 4 Purpose-Separated Buckets
 * Blueprint Reference: §2.1 (Object Storage row), Invariant I-09 (Sealed content is never migrated),
 * Q2 Decision (Evidence uses US multi-region).
 *
 * 1. evidence     -> WORM locked retention (7 years), versioned, audit & signed PDFs
 * 2. uploads      -> Staging for inbound files, 7-day TTL lifecycle
 * 3. exports      -> Temporary export downloads, 30-day TTL lifecycle
 * 4. public-media -> Public brand assets and signatures
 */

# -----------------------------------------------------------------------------
# 1. Evidence Storage Bucket (Object Retention Lock - LOCKED mode, 7 Years)
# -----------------------------------------------------------------------------
resource "google_storage_bucket" "evidence" {
  name                        = "${local.name_prefix}-evidence"
  project                     = var.project_id
  location                    = var.evidence_bucket_location
  uniform_bucket_level_access = true
  storage_class               = "STANDARD"

  versioning {
    enabled = true
  }

  retention_policy {
    is_locked        = var.environment == "prod" ? true : false
    retention_period = 220752000 # 7 years in seconds (7 * 365 * 86400)
  }

  labels = merge(local.base_labels, {
    service = "evidence-storage"
    tier    = "storage"
  })
}

# -----------------------------------------------------------------------------
# 2. Uploads Storage Bucket (Temporary Staging)
# -----------------------------------------------------------------------------
resource "google_storage_bucket" "uploads" {
  name                        = "${local.name_prefix}-uploads"
  project                     = var.project_id
  location                    = var.region
  uniform_bucket_level_access = true
  storage_class               = "STANDARD"

  lifecycle_rule {
    action {
      type = "Delete"
    }
    condition {
      age = 7 # 7 days auto-expiration for staged uploads
    }
  }

  lifecycle_rule {
    action {
      type = "AbortIncompleteMultipartUpload"
    }
    condition {
      age = 1
    }
  }

  labels = merge(local.base_labels, {
    service = "uploads-storage"
    tier    = "storage"
  })
}

# -----------------------------------------------------------------------------
# 3. Exports Storage Bucket (Temporary Export Artifacts)
# -----------------------------------------------------------------------------
resource "google_storage_bucket" "exports" {
  name                        = "${local.name_prefix}-exports"
  project                     = var.project_id
  location                    = var.region
  uniform_bucket_level_access = true
  storage_class               = "STANDARD"

  lifecycle_rule {
    action {
      type = "Delete"
    }
    condition {
      age = 30 # 30 days auto-expiration for export downloads
    }
  }

  labels = merge(local.base_labels, {
    service = "exports-storage"
    tier    = "storage"
  })
}

# -----------------------------------------------------------------------------
# 4. Public Media Bucket (Brand Kits, Tenant Logos, Signatures)
# -----------------------------------------------------------------------------
resource "google_storage_bucket" "public_media" {
  name                        = "${local.name_prefix}-public-media"
  project                     = var.project_id
  location                    = var.region
  uniform_bucket_level_access = true
  storage_class               = "STANDARD"

  cors {
    origin          = ["https://${var.primary_domain}", "https://${var.recipient_domain}"]
    method          = ["GET", "HEAD"]
    response_header = ["*"]
    max_age_seconds = 3600
  }

  labels = merge(local.base_labels, {
    service = "public-media"
    tier    = "storage"
  })
}

# Allow public read on public_media bucket
resource "google_storage_bucket_iam_member" "public_media_reader" {
  bucket = google_storage_bucket.public_media.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}
