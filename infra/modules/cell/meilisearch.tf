/**
 * Cell Search Engine — Meilisearch Cloud Run Service
 * Blueprint References: §8.1, §8.4, ADR-0052, Invariants I-01, I-02, I-04, I-12
 *
 * Dedicated search cluster for full-text portfolio search, faceted filtering,
 * and rapid typo-tolerant search across agreements, counterparties, and clauses.
 * Operates behind internal VPC with transparent fallback to PostgreSQL FTS (SearchPort).
 */

resource "google_cloud_run_v2_service" "meilisearch" {
  name     = "${local.name_prefix}-meilisearch"
  location = var.region
  project  = var.project_id
  ingress  = "INGRESS_TRAFFIC_INTERNAL_ONLY"

  template {
    timeout         = "300s"
    service_account = google_service_account.api_runtime.email

    scaling {
      min_instance_count = var.environment == "dev" ? 0 : 1
      max_instance_count = var.environment == "dev" ? 1 : 5
    }

    vpc_access {
      connector = google_vpc_access_connector.connector.id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    containers {
      image = "getmeili/meilisearch:v1.12"

      resources {
        limits = {
          cpu    = "2"
          memory = "2Gi"
        }
      }

      env {
        name  = "MEILI_ENV"
        value = var.environment == "dev" ? "development" : "production"
      }
      env {
        name  = "MEILI_NO_ANALYTICS"
        value = "true"
      }
      env {
        name = "MEILI_MASTER_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.meilisearch_master_key.secret_id
            version = "latest"
          }
        }
      }

      ports {
        container_port = 7700
      }

      startup_probe {
        http_get {
          path = "/health"
          port = 7700
        }
        initial_delay_seconds = 5
        period_seconds        = 10
        failure_threshold     = 3
      }

      liveness_probe {
        http_get {
          path = "/health"
          port = 7700
        }
        period_seconds    = 15
        failure_threshold = 3
      }
    }

    labels = merge(local.base_labels, {
      service = "meilisearch"
      tier    = "search"
    })
  }

  labels = merge(local.base_labels, {
    service = "meilisearch"
    tier    = "search"
  })
}

resource "google_secret_manager_secret" "meilisearch_master_key" {
  secret_id = "${local.name_prefix}-meilisearch-master-key"
  project   = var.project_id

  replication {
    auto {}
  }

  labels = merge(local.base_labels, {
    service = "meilisearch"
    tier    = "search"
  })
}

