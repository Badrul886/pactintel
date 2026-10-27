/**
 * Collab Server Cloud Run Service — Cell US1
 * Blueprint Reference: §8, §16, Phase 2 Section 2.2.6
 *
 * RULE: collab service timeout MUST be 3600s. Default 60s will kill long WebSocket sessions.
 */

resource "google_cloud_run_v2_service" "collab_us1" {
  name     = "pactintel-${var.env}-${var.cell}-collab"
  location = var.region
  labels   = { env = var.env, cell = var.cell, service = "collab", tier = "application" }

  template {
    timeout = "3600s" # WebSocket connections can be long-lived

    scaling {
      min_instance_count = var.env == "prod" ? 1 : 0
      max_instance_count = 10
    }

    containers {
      image = "${var.artifact_registry}/collab-server:${var.image_tag}"
      resources {
        limits            = { cpu = "2", memory = "2Gi" }
        startup_cpu_boost = true
      }
      env {
        name = "REDIS_REALTIME_HOST"
        value_source {
          secret_key_ref {
            secret  = "redis-realtime-host"
            version = "latest"
          }
        }
      }
      env {
        name = "REDIS_REALTIME_PASSWORD"
        value_source {
          secret_key_ref {
            secret  = "redis-realtime-password"
            version = "latest"
          }
        }
      }
      env {
        name  = "MAX_IN_MEMORY_DOCS"
        value = "500"
      }
      env {
        name  = "COLLAB_PORT"
        value = "1234"
      }
    }
  }
}
