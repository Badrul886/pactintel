variable "project_id" {
  type = string
}

variable "cell_id" {
  type    = string
  default = "us1"
}

variable "region" {
  type    = string
  default = "us-central1"
}

variable "dr_region" {
  type    = string
  default = "us-east4"
}

variable "vpc_cidr" {
  type    = string
  default = "10.10.0.0/16"
}

variable "serverless_subnet_cidr" {
  type    = string
  default = "10.10.1.0/28"
}

variable "sql_tier" {
  type    = string
  default = "db-custom-1-3840"
}

variable "sql_ha" {
  type    = string
  default = "ZONAL"
}

variable "sql_disk_size_gb" {
  type    = number
  default = 20
}

variable "redis_tier" {
  type    = string
  default = "BASIC"
}

variable "redis_memory_size_gb" {
  type    = number
  default = 1
}

variable "kms_location" {
  type    = string
  default = "us"
}

variable "evidence_bucket_location" {
  type    = string
  default = "US"
}

variable "github_repository" {
  type    = string
  default = "Badrul886/pactintel"
}

variable "primary_domain" {
  type    = string
  default = "dev.pactintel.com"
}

variable "recipient_domain" {
  type    = string
  default = "dev.pact.link"
}
