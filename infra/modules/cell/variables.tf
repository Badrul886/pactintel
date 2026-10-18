variable "project_id" {
  description = "The GCP Project ID for this cell"
  type        = string
}

variable "environment" {
  description = "Environment name: dev, staging, or prod"
  type        = string
}

variable "cell_id" {
  description = "Cell identifier (e.g., us1, eu1)"
  type        = string
}

variable "region" {
  description = "Primary GCP region for the cell (e.g., us-central1)"
  type        = string
  default     = "us-central1"
}

variable "dr_region" {
  description = "Secondary DR pilot-light region (e.g., us-east4)"
  type        = string
  default     = "us-east4"
}

variable "vpc_cidr" {
  description = "VPC primary IPv4 CIDR block (Q2: 10.10.0.0/16 for us1)"
  type        = string
  default     = "10.10.0.0/16"
}

variable "serverless_subnet_cidr" {
  description = "Subnet CIDR for Serverless VPC Access connector"
  type        = string
  default     = "10.10.1.0/28"
}

variable "sql_tier" {
  description = "Compute tier for Cloud SQL PostgreSQL instance"
  type        = string
  default     = "db-custom-2-7680"
}

variable "sql_ha" {
  description = "Cloud SQL availability type: ZONAL (dev) or REGIONAL (staging/prod)"
  type        = string
  default     = "REGIONAL"
}

variable "sql_disk_size_gb" {
  description = "Initial disk size for Cloud SQL in GB"
  type        = number
  default     = 20
}

variable "redis_tier" {
  description = "Tier for Memorystore Redis/Valkey instances (BASIC or STANDARD_HA)"
  type        = string
  default     = "STANDARD_HA"
}

variable "redis_memory_size_gb" {
  description = "Memory size in GB for each role-split Redis instance"
  type        = number
  default     = 1
}

variable "kms_location" {
  description = "Multi-region location for Cloud KMS key ring (Q2: 'us')"
  type        = string
  default     = "us"
}

variable "evidence_bucket_location" {
  description = "Multi-region location for evidence GCS bucket (Q2: 'US')"
  type        = string
  default     = "US"
}

variable "github_repository" {
  description = "GitHub repository for Workload Identity Federation (e.g. Badrul886/pactintel)"
  type        = string
  default     = "Badrul886/pactintel"
}

variable "artifact_registry_repo" {
  description = "Artifact registry repository URL for container images"
  type        = string
  default     = ""
}

variable "image_tag" {
  description = "Default container image tag to deploy"
  type        = string
  default     = "latest"
}

variable "primary_domain" {
  description = "Primary application domain"
  type        = string
  default     = "pactintel.com"
}

variable "recipient_domain" {
  description = "Recipient signing & viewing short domain (Q5: pact.link)"
  type        = string
  default     = "pact.link"
}

variable "extra_labels" {
  description = "Additional labels to merge with mandatory labels"
  type        = map(string)
  default     = {}
}
