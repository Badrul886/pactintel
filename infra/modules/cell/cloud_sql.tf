/**
 * Cell Cloud SQL — PostgreSQL 17 HA, Private IP, PITR, Automated Backups
 * Blueprint References: §2.1 (Database row), §3, ADR-0001, ADR-0002
 * Architecture Invariants: I-01, I-02, I-14
 */

resource "random_password" "db_password" {
  length  = 32
  special = false
}

resource "google_sql_database_instance" "primary" {
  name                = "${local.name_prefix}-pg17"
  project             = var.project_id
  region              = var.region
  database_version    = "POSTGRES_17"
  deletion_protection = var.environment == "prod" ? true : false

  depends_on = [google_service_networking_connection.private_vpc_connection]

  settings {
    tier              = var.sql_tier
    availability_type = var.sql_ha
    disk_type         = "PD_SSD"
    disk_size         = var.sql_disk_size_gb
    disk_autoresize   = true

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      start_time                     = "03:00"
      transaction_log_retention_days = 7
      backup_retention_settings {
        retained_backups = 30
        retention_unit   = "COUNT"
      }
    }

    ip_configuration {
      ipv4_enabled                                  = false
      private_network                               = google_compute_network.cell_vpc.id
      enable_private_path_for_google_cloud_services = true
    }

    insights_config {
      query_insights_enabled  = true
      query_string_length     = 1024
      record_application_tags = true
      record_client_address   = false
    }

    database_flags {
      name  = "cloudsql.enable_pgaudit"
      value = "on"
    }

    database_flags {
      name  = "log_connections"
      value = "on"
    }

    database_flags {
      name  = "log_disconnections"
      value = "on"
    }

    database_flags {
      name  = "log_lock_waits"
      value = "on"
    }

    user_labels = merge(local.base_labels, {
      service = "database"
      tier    = "data"
    })
  }
}

# -----------------------------------------------------------------------------
# Database and Application User
# -----------------------------------------------------------------------------
resource "google_sql_database" "pactintel" {
  name     = "pactintel"
  project  = var.project_id
  instance = google_sql_database_instance.primary.name
}

resource "google_sql_user" "app_user" {
  name     = "pactintel_app"
  project  = var.project_id
  instance = google_sql_database_instance.primary.name
  password = random_password.db_password.result
}

# -----------------------------------------------------------------------------
# DR Pilot-Light Read Replica in us-east4 (Q2 requirement)
# Deployed in staging and prod environments (scale-to-zero in dev to defer capacity)
# -----------------------------------------------------------------------------
resource "google_sql_database_instance" "dr_replica" {
  count                = var.environment == "dev" ? 0 : 1
  name                 = "${local.name_prefix}-dr-replica"
  project              = var.project_id
  region               = var.dr_region
  database_version     = "POSTGRES_17"
  master_instance_name = google_sql_database_instance.primary.name
  deletion_protection  = var.environment == "prod" ? true : false

  settings {
    tier              = var.sql_tier
    availability_type = "ZONAL" # DR pilot light promotes to REGIONAL on failover
    disk_type         = "PD_SSD"
    disk_size         = var.sql_disk_size_gb
    disk_autoresize   = true

    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.cell_vpc.id
    }

    user_labels = merge(local.base_labels, {
      service = "database-dr"
      tier    = "data"
    })
  }
}
