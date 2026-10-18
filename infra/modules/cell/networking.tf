/**
 * Cell Networking — VPC, Subnets, Private Service Access, Serverless VPC Access Connector
 * Blueprint Reference: §8.1, Q2 (CIDR 10.10.0.0/16 for us1)
 */

# -----------------------------------------------------------------------------
# 1. Cell VPC
# -----------------------------------------------------------------------------
resource "google_compute_network" "cell_vpc" {
  name                    = "${local.name_prefix}-vpc"
  project                 = var.project_id
  auto_create_subnetworks = false
  routing_mode            = "REGIONAL"
  description             = "Dedicated VPC for cell ${var.cell_id} (${var.environment})"
}

# -----------------------------------------------------------------------------
# 2. Serverless VPC Access Connector Subnet (/28 required by GCP connector)
# -----------------------------------------------------------------------------
resource "google_compute_subnetwork" "serverless_connector_subnet" {
  name          = "${local.name_prefix}-connector-subnet"
  project       = var.project_id
  region        = var.region
  network       = google_compute_network.cell_vpc.id
  ip_cidr_range = var.serverless_subnet_cidr

  private_ip_google_access = true
  description              = "Subnet dedicated to Serverless VPC Access connector"
}

# -----------------------------------------------------------------------------
# 3. Serverless VPC Access Connector (Cloud Run -> Cloud SQL / Memorystore)
# -----------------------------------------------------------------------------
resource "google_vpc_access_connector" "connector" {
  name    = "${local.name_prefix}-vpc-conn"
  project = var.project_id
  region  = var.region
  subnet {
    name = google_compute_subnetwork.serverless_connector_subnet.name
  }
  min_instances = var.environment == "dev" ? 2 : 2
  max_instances = var.environment == "dev" ? 3 : 10
  machine_type  = "e2-micro"
}

# -----------------------------------------------------------------------------
# 4. Private Service Access for Cloud SQL & Managed Services
# -----------------------------------------------------------------------------
resource "google_compute_global_address" "private_ip_alloc" {
  name          = "${local.name_prefix}-psa-range"
  project       = var.project_id
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 20
  network       = google_compute_network.cell_vpc.id
  description   = "Private Service Access IP allocation for Cloud SQL and Memorystore"
}

resource "google_service_networking_connection" "private_vpc_connection" {
  network                 = google_compute_network.cell_vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_alloc.name]
}
