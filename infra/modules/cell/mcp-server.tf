/**
 * Cell Model Context Protocol (MCP) Server — Cloud Run Service
 * Blueprint References: §5.13, ADR-0059, Invariants I-01, I-04
 *
 * Dedicated AI agent interface exposing structured tools for autonomous
 * contract drafting, signing inspection, workflow triggers, and portfolio query.
 */

resource "google_cloud_run_v2_service" "mcp_server" {
  name     = "${local.name_prefix}-mcp"
  location = var.region
  project  = var.project_id
  ingress  = "INGRESS_TRAFFIC_ALL"

  labels = merge(local.mandatory_labels, {
    service = "mcp"
    tier    = "api"
  })

  template {
    timeout         = "60s"
    service_account = google_service_account.api_runtime.email

    scaling {
      min_instance_count = 0
      max_instance_count = 5
    }

    vpc_access {
      connector = google_vpc_access_connector.connector.id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    containers {
      image = "${var.artifact_registry_repository}/mcp-server:${var.image_tag}"

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      env {
        name  = "NODE_ENV"
        value = var.environment == "dev" ? "development" : "production"
      }
      env {
        name  = "CELL_ID"
        value = var.cell_id
      }
      env {
        name  = "PACTINTEL_API_BASE_URL"
        value = "http://${local.name_prefix}-api:4000/api/v1"
      }
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }
}

