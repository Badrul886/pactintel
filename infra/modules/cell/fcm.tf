/**
 * Cell Push Notification Relay — Firebase Cloud Messaging (FCM)
 * Blueprint References: §12 Phase 3, Sprint 3.12, Invariants I-01, I-04
 *
 * Dedicated GCP Firebase integration for reliable real-time mobile alert dispatch.
 */

resource "google_firebase_project" "fcm" {
  provider = google-beta
  project  = var.project_id
}

resource "google_secret_manager_secret" "firebase_server_key" {
  secret_id = "${local.name_prefix}-firebase-server-key"
  project   = var.project_id

  labels = merge(local.mandatory_labels, {
    service = "fcm"
    tier    = "notifications"
  })

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret" "apns_private_key" {
  secret_id = "${local.name_prefix}-apns-private-key"
  project   = var.project_id

  labels = merge(local.mandatory_labels, {
    service = "fcm"
    tier    = "notifications"
  })

  replication {
    auto {}
  }
}

