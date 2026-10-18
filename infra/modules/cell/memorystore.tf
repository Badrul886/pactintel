/**
 * Cell Memorystore — 4 Role-Split Valkey/Redis Instances
 * Blueprint Reference: §2.1 (Cache / Queues row), Invariant I-01 (Defer capacity, never structure)
 *
 * 1. queue    -> BullMQ jobs (noeviction, RDB persistence)
 * 2. session  -> User and auth sessions (volatile-lru)
 * 3. cache    -> Plan cache, API responses (allkeys-lru)
 * 4. realtime -> Hocuspocus collaboration pub/sub
 */

# -----------------------------------------------------------------------------
# 1. BullMQ Queue Redis Instance (Strictly NO EVICTION)
# -----------------------------------------------------------------------------
resource "google_redis_instance" "queue" {
  name           = "${local.name_prefix}-redis-queue"
  project        = var.project_id
  region         = var.region
  tier           = var.redis_tier
  memory_size_gb = var.redis_memory_size_gb
  redis_version  = "REDIS_7_2"

  authorized_network = google_compute_network.cell_vpc.id
  connect_mode       = "PRIVATE_SERVICE_ACCESS"

  redis_configs = {
    "maxmemory-policy" = "noeviction"
  }

  labels = merge(local.base_labels, {
    service = "redis-queue"
    tier    = "cache"
  })

  depends_on = [google_service_networking_connection.private_vpc_connection]
}

# -----------------------------------------------------------------------------
# 2. Session Redis Instance (VOLATILE-LRU)
# -----------------------------------------------------------------------------
resource "google_redis_instance" "session" {
  name           = "${local.name_prefix}-redis-session"
  project        = var.project_id
  region         = var.region
  tier           = var.redis_tier
  memory_size_gb = var.redis_memory_size_gb
  redis_version  = "REDIS_7_2"

  authorized_network = google_compute_network.cell_vpc.id
  connect_mode       = "PRIVATE_SERVICE_ACCESS"

  redis_configs = {
    "maxmemory-policy" = "volatile-lru"
  }

  labels = merge(local.base_labels, {
    service = "redis-session"
    tier    = "cache"
  })

  depends_on = [google_service_networking_connection.private_vpc_connection]
}

# -----------------------------------------------------------------------------
# 3. Application Cache Redis Instance (ALLKEYS-LRU)
# -----------------------------------------------------------------------------
resource "google_redis_instance" "cache" {
  name           = "${local.name_prefix}-redis-cache"
  project        = var.project_id
  region         = var.region
  tier           = var.redis_tier
  memory_size_gb = var.redis_memory_size_gb
  redis_version  = "REDIS_7_2"

  authorized_network = google_compute_network.cell_vpc.id
  connect_mode       = "PRIVATE_SERVICE_ACCESS"

  redis_configs = {
    "maxmemory-policy" = "allkeys-lru"
  }

  labels = merge(local.base_labels, {
    service = "redis-cache"
    tier    = "cache"
  })

  depends_on = [google_service_networking_connection.private_vpc_connection]
}

# -----------------------------------------------------------------------------
# 4. Collab Server Realtime Redis Instance
# -----------------------------------------------------------------------------
resource "google_redis_instance" "realtime" {
  name           = "${local.name_prefix}-redis-realtime"
  project        = var.project_id
  region         = var.region
  tier           = var.redis_tier
  memory_size_gb = var.redis_memory_size_gb
  redis_version  = "REDIS_7_2"

  authorized_network = google_compute_network.cell_vpc.id
  connect_mode       = "PRIVATE_SERVICE_ACCESS"

  redis_configs = {
    "maxmemory-policy" = "volatile-lru"
  }

  labels = merge(local.base_labels, {
    service = "redis-realtime"
    tier    = "cache"
  })

  depends_on = [google_service_networking_connection.private_vpc_connection]
}
