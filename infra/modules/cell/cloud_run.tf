/**
 * Cell Cloud Run Services, Worker Pools, and Migrator Job
 * Blueprint References: §8.1, §16, Invariant I-01, I-07 (Process types separated from Day 1)
 *
 * HTTP Services (Behind ALB + Cloud Armor):
 * 1. web-app    -> Next.js Authenticated App Shell
 * 2. web-viewer -> Recipient-facing Signing/Viewer UI
 * 3. api        -> NestJS 11 REST API
 * 4. collab     -> Hocuspocus WebSocket Server
 *
 * Worker Pools (BullMQ Consumers):
 * 5. worker-core -> Outbox relay, webhooks, general jobs
 * 6. worker-ai   -> Vertex AI LLM pipelines
 * 7. worker-pdf  -> Playwright PDF generation
 * 8. worker-bulk -> Batch operations
 *
 * Cloud Run Job:
 * 9. migrator    -> Prisma migration runner
 */

locals {
  image_registry = var.artifact_registry_repo != "" ? var.artifact_registry_repo : "us-central1-docker.pkg.dev/${var.project_id}/pactintel-apps"
}

# -----------------------------------------------------------------------------
# 1. API Service (NestJS)
# -----------------------------------------------------------------------------
resource "google_cloud_run_v2_service" "api" {
  name     = "${local.name_prefix}-api"
  location = var.region
  project  = var.project_id
  ingress  = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"

  template {
    timeout         = "3600s"
    service_account = google_service_account.api_runtime.email

    scaling {
      min_instance_count = var.environment == "dev" ? 0 : 2
      max_instance_count = var.environment == "dev" ? 3 : 20
    }

    vpc_access {
      connector = google_vpc_access_connector.connector.id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    containers {
      image = "${local.image_registry}/api:${var.image_tag}"

      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi"
        }
      }

      env {
        name  = "NODE_ENV"
        value = var.environment == "dev" ? "development" : "production"
      }
      env {
        name  = "PORT"
        value = "3000"
      }
      env {
        name  = "CELL_ID"
        value = var.cell_id
      }
      env {
        name  = "REDIS_QUEUE_HOST"
        value = google_redis_instance.queue.host
      }
      env {
        name  = "REDIS_QUEUE_PORT"
        value = tostring(google_redis_instance.queue.port)
      }
      env {
        name  = "REDIS_SESSION_HOST"
        value = google_redis_instance.session.host
      }
      env {
        name  = "REDIS_SESSION_PORT"
        value = tostring(google_redis_instance.session.port)
      }
      env {
        name  = "REDIS_CACHE_HOST"
        value = google_redis_instance.cache.host
      }
      env {
        name  = "REDIS_CACHE_PORT"
        value = tostring(google_redis_instance.cache.port)
      }
      env {
        name  = "EVIDENCE_BUCKET"
        value = google_storage_bucket.evidence.name
      }
      env {
        name  = "UPLOADS_BUCKET"
        value = google_storage_bucket.uploads.name
      }
      env {
        name  = "EXPORTS_BUCKET"
        value = google_storage_bucket.exports.name
      }
      env {
        name  = "ANALYTICS_TOPIC"
        value = google_pubsub_topic.analytics_ingest.name
      }

      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.database_url.secret_id
            version = "latest"
          }
        }
      }

      startup_probe {
        http_get {
          path = "/health/live"
          port = 3000
        }
        initial_delay_seconds = 5
        period_seconds        = 10
        failure_threshold     = 3
      }

      liveness_probe {
        http_get {
          path = "/health/live"
          port = 3000
        }
        period_seconds    = 15
        failure_threshold = 3
      }
    }

    labels = merge(local.base_labels, {
      service = "api"
      tier    = "app"
    })
  }

  labels = merge(local.base_labels, {
    service = "api"
    tier    = "app"
  })
}

# -----------------------------------------------------------------------------
# 2. Web App Service (Next.js Authenticated App Shell)
# -----------------------------------------------------------------------------
resource "google_cloud_run_v2_service" "web_app" {
  name     = "${local.name_prefix}-web-app"
  location = var.region
  project  = var.project_id
  ingress  = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"

  template {
    scaling {
      min_instance_count = var.environment == "dev" ? 0 : 2
      max_instance_count = var.environment == "dev" ? 3 : 20
    }

    containers {
      image = "${local.image_registry}/web-app:${var.image_tag}"

      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi"
        }
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "PORT"
        value = "3000"
      }
      env {
        name  = "NEXT_PUBLIC_APP_URL"
        value = "https://app.${var.primary_domain}"
      }
      env {
        name  = "NEXT_PUBLIC_API_URL"
        value = "https://api.${var.primary_domain}"
      }

      startup_probe {
        http_get {
          path = "/"
          port = 3000
        }
        initial_delay_seconds = 5
        period_seconds        = 10
      }
    }

    labels = merge(local.base_labels, {
      service = "web-app"
      tier    = "frontend"
    })
  }

  labels = merge(local.base_labels, {
    service = "web-app"
    tier    = "frontend"
  })
}

# -----------------------------------------------------------------------------
# 3. Web Viewer Service (Next.js Recipient Viewer & Signing Shell)
# -----------------------------------------------------------------------------
resource "google_cloud_run_v2_service" "web_viewer" {
  name     = "${local.name_prefix}-web-viewer"
  location = var.region
  project  = var.project_id
  ingress  = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"

  template {
    scaling {
      min_instance_count = var.environment == "dev" ? 0 : 2
      max_instance_count = var.environment == "dev" ? 3 : 20
    }

    containers {
      image = "${local.image_registry}/web-viewer:${var.image_tag}"

      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi"
        }
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "PORT"
        value = "3000"
      }
      env {
        name  = "NEXT_PUBLIC_RECIPIENT_DOMAIN"
        value = var.recipient_domain
      }

      startup_probe {
        http_get {
          path = "/"
          port = 3000
        }
        initial_delay_seconds = 5
        period_seconds        = 10
      }
    }

    labels = merge(local.base_labels, {
      service = "web-viewer"
      tier    = "frontend"
    })
  }

  labels = merge(local.base_labels, {
    service = "web-viewer"
    tier    = "frontend"
  })
}

# -----------------------------------------------------------------------------
# 4. Collab Server Service (Hocuspocus WebSocket Server)
# -----------------------------------------------------------------------------
resource "google_cloud_run_v2_service" "collab" {
  name     = "${local.name_prefix}-collab"
  location = var.region
  project  = var.project_id
  ingress  = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"

  template {
    timeout = "3600s"

    scaling {
      min_instance_count = var.environment == "dev" ? 0 : 1
      max_instance_count = var.environment == "dev" ? 2 : 10
    }

    vpc_access {
      connector = google_vpc_access_connector.connector.id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    containers {
      image = "${local.image_registry}/collab-server:${var.image_tag}"

      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi"
        }
        startup_cpu_boost = true
      }

      env {
        name  = "PORT"
        value = "1234"
      }
      env {
        name  = "COLLAB_PORT"
        value = "1234"
      }
      env {
        name  = "MAX_IN_MEMORY_DOCS"
        value = "500"
      }
      env {
        name  = "REDIS_REALTIME_HOST"
        value = google_redis_instance.realtime.host
      }
      env {
        name  = "REDIS_REALTIME_PORT"
        value = tostring(google_redis_instance.realtime.port)
      }
    }

    labels = merge(local.base_labels, {
      service = "collab"
      tier    = "app"
    })
  }

  labels = merge(local.base_labels, {
    service = "collab"
    tier    = "app"
  })
}

# -----------------------------------------------------------------------------
# 5. Worker Core Service (BullMQ Outbox Relay & Webhooks)
# -----------------------------------------------------------------------------
resource "google_cloud_run_v2_service" "worker_core" {
  name     = "${local.name_prefix}-worker-core"
  location = var.region
  project  = var.project_id
  ingress  = "INGRESS_TRAFFIC_INTERNAL_ONLY"

  template {
    service_account = google_service_account.worker_core.email

    scaling {
      min_instance_count = var.environment == "dev" ? 0 : 1
      max_instance_count = var.environment == "dev" ? 2 : 10
    }

    vpc_access {
      connector = google_vpc_access_connector.connector.id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    containers {
      image = "${local.image_registry}/worker-core:${var.image_tag}"

      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi"
        }
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "REDIS_QUEUE_HOST"
        value = google_redis_instance.queue.host
      }
      env {
        name  = "REDIS_QUEUE_PORT"
        value = tostring(google_redis_instance.queue.port)
      }
      env {
        name  = "ANALYTICS_SUBSCRIPTION"
        value = google_pubsub_subscription.analytics_batcher.name
      }

      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.database_url.secret_id
            version = "latest"
          }
        }
      }
    }

    labels = merge(local.base_labels, {
      service = "worker-core"
      tier    = "worker"
    })
  }

  labels = merge(local.base_labels, {
    service = "worker-core"
    tier    = "worker"
  })
}

# -----------------------------------------------------------------------------
# 6. Worker AI Service (Vertex AI Claude Tasks)
# -----------------------------------------------------------------------------
resource "google_cloud_run_v2_service" "worker_ai" {
  name     = "${local.name_prefix}-worker-ai"
  location = var.region
  project  = var.project_id
  ingress  = "INGRESS_TRAFFIC_INTERNAL_ONLY"

  template {
    service_account = google_service_account.worker_ai.email

    scaling {
      min_instance_count = 0
      max_instance_count = var.environment == "dev" ? 2 : 10
    }

    vpc_access {
      connector = google_vpc_access_connector.connector.id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    containers {
      image = "${local.image_registry}/worker-ai:${var.image_tag}"

      resources {
        limits = {
          cpu    = "2"
          memory = "2Gi"
        }
      }

      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "GCP_REGION"
        value = var.region
      }
      env {
        name  = "REDIS_QUEUE_HOST"
        value = google_redis_instance.queue.host
      }
      env {
        name  = "REDIS_QUEUE_PORT"
        value = tostring(google_redis_instance.queue.port)
      }
    }

    labels = merge(local.base_labels, {
      service = "worker-ai"
      tier    = "worker"
    })
  }

  labels = merge(local.base_labels, {
    service = "worker-ai"
    tier    = "worker"
  })
}

# -----------------------------------------------------------------------------
# 7. Worker PDF Service (Headless Playwright PDF Engine)
# -----------------------------------------------------------------------------
resource "google_cloud_run_v2_service" "worker_pdf" {
  name     = "${local.name_prefix}-worker-pdf"
  location = var.region
  project  = var.project_id
  ingress  = "INGRESS_TRAFFIC_INTERNAL_ONLY"

  template {
    service_account = google_service_account.worker_pdf.email

    scaling {
      min_instance_count = 0
      max_instance_count = var.environment == "dev" ? 2 : 8
    }

    vpc_access {
      connector = google_vpc_access_connector.connector.id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    containers {
      image = "${local.image_registry}/worker-pdf:${var.image_tag}"

      resources {
        limits = {
          cpu    = "2"
          memory = "4Gi"
        }
      }

      env {
        name  = "EVIDENCE_BUCKET"
        value = google_storage_bucket.evidence.name
      }
      env {
        name  = "REDIS_QUEUE_HOST"
        value = google_redis_instance.queue.host
      }
      env {
        name  = "REDIS_QUEUE_PORT"
        value = tostring(google_redis_instance.queue.port)
      }
    }

    labels = merge(local.base_labels, {
      service = "worker-pdf"
      tier    = "worker"
    })
  }

  labels = merge(local.base_labels, {
    service = "worker-pdf"
    tier    = "worker"
  })
}

# -----------------------------------------------------------------------------
# 8. Worker Bulk Service (Batch Export & Archives)
# -----------------------------------------------------------------------------
resource "google_cloud_run_v2_service" "worker_bulk" {
  name     = "${local.name_prefix}-worker-bulk"
  location = var.region
  project  = var.project_id
  ingress  = "INGRESS_TRAFFIC_INTERNAL_ONLY"

  template {
    service_account = google_service_account.worker_bulk.email

    scaling {
      min_instance_count = 0
      max_instance_count = var.environment == "dev" ? 1 : 5
    }

    vpc_access {
      connector = google_vpc_access_connector.connector.id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    containers {
      image = "${local.image_registry}/worker-bulk:${var.image_tag}"

      resources {
        limits = {
          cpu    = "1"
          memory = "2Gi"
        }
      }

      env {
        name  = "EXPORTS_BUCKET"
        value = google_storage_bucket.exports.name
      }
      env {
        name  = "REDIS_QUEUE_HOST"
        value = google_redis_instance.queue.host
      }
      env {
        name  = "REDIS_QUEUE_PORT"
        value = tostring(google_redis_instance.queue.port)
      }
    }

    labels = merge(local.base_labels, {
      service = "worker-bulk"
      tier    = "worker"
    })
  }

  labels = merge(local.base_labels, {
    service = "worker-bulk"
    tier    = "worker"
  })
}

# -----------------------------------------------------------------------------
# 9. Cloud Run Job — Migrator (Prisma Schema Migration Deployer)
# -----------------------------------------------------------------------------
resource "google_cloud_run_v2_job" "migrator" {
  name     = "${local.name_prefix}-migrator-job"
  location = var.region
  project  = var.project_id

  template {
    template {
      service_account = google_service_account.migrator.email
      max_retries     = 1
      timeout         = "600s"

      vpc_access {
        connector = google_vpc_access_connector.connector.id
        egress    = "PRIVATE_RANGES_ONLY"
      }

      containers {
        image   = "${local.image_registry}/api:${var.image_tag}"
        command = ["npx", "prisma", "migrate", "deploy", "--schema=apps/api/src/prisma/schema.prisma"]

        resources {
          limits = {
            cpu    = "1"
            memory = "1Gi"
          }
        }

        env {
          name = "DATABASE_URL"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.database_url.secret_id
              version = "latest"
            }
          }
        }
      }
    }
  }

  labels = merge(local.base_labels, {
    service = "migrator"
    tier    = "job"
  })
}
