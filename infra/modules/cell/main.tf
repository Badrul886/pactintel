/**
 * Cell Module — Regional Data Plane Infrastructure
 * Blueprint References: §0.2, §0.3, §8.1, Architecture Decisions ADR-0001, ADR-0002
 * Architecture Invariants: I-01 (Defer capacity, never structure), I-02 (Cell isolation),
 * I-04 (IaC only), I-07 (Separated process types), I-11 (Fixed key hierarchy), I-14 (Jurisdiction aware).
 */

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }
}

locals {
  name_prefix = "pactintel-${var.environment}-${var.cell_id}"

  # Mandatory GCP Labels: env, cell, service, tier (AGENTS.md / Blueprint §11)
  base_labels = merge({
    env  = var.environment
    cell = var.cell_id
  }, var.extra_labels)
}
