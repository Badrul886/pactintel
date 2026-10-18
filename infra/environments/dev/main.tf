terraform {
  required_version = ">= 1.5.0"
  backend "gcs" {
    bucket = "pactintel-tf-state"
    prefix = "env/dev"
  }
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 6.0"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

module "cell" {
  source = "../../modules/cell"

  project_id             = var.project_id
  environment            = "dev"
  cell_id                = var.cell_id
  region                 = var.region
  dr_region              = var.dr_region
  vpc_cidr               = var.vpc_cidr
  serverless_subnet_cidr = var.serverless_subnet_cidr
  sql_tier               = var.sql_tier
  sql_ha                 = var.sql_ha
  sql_disk_size_gb       = var.sql_disk_size_gb
  redis_tier             = var.redis_tier
  redis_memory_size_gb   = var.redis_memory_size_gb
  kms_location           = var.kms_location
  evidence_bucket_location = var.evidence_bucket_location
  github_repository      = var.github_repository
  primary_domain         = var.primary_domain
  recipient_domain       = var.recipient_domain
}
