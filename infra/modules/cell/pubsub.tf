/**
 * Cell Pub/Sub — Ingestion Buffer for ClickHouse Analytics
 * Blueprint Reference: §2.1 (Analytics Store row), D-10 (Batched ingestion via Pub/Sub buffer)
 */

# Dead-letter Topic
resource "google_pubsub_topic" "analytics_dlq" {
  name    = "${local.name_prefix}-analytics-events-dlq"
  project = var.project_id

  labels = merge(local.base_labels, {
    service = "analytics-dlq"
    tier    = "messaging"
  })
}

# Ingestion Topic for Analytics Events
resource "google_pubsub_topic" "analytics_ingest" {
  name    = "${local.name_prefix}-analytics-events-ingest"
  project = var.project_id

  message_retention_duration = "604800s" # 7 days

  labels = merge(local.base_labels, {
    service = "analytics-pubsub"
    tier    = "messaging"
  })
}

# Pull Subscription for worker-core batch ingestion to ClickHouse
resource "google_pubsub_subscription" "analytics_batcher" {
  name    = "${local.name_prefix}-analytics-batcher-sub"
  project = var.project_id
  topic   = google_pubsub_topic.analytics_ingest.id

  ack_deadline_seconds       = 60
  message_retention_duration = "604800s" # 7 days
  retain_acked_messages      = false

  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.analytics_dlq.id
    max_delivery_attempts = 5
  }

  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }

  labels = merge(local.base_labels, {
    service = "analytics-pubsub"
    tier    = "messaging"
  })
}
