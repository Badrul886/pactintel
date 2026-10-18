variable "organization_id" {
  description = "The GCP Organization ID for pactintel.com"
  type        = string
}

variable "billing_account_id" {
  description = "The GCP Billing Account ID"
  type        = string
}

variable "primary_domain" {
  description = "Primary corporate domain"
  type        = string
  default     = "pactintel.com"
}

variable "state_bucket_location" {
  description = "Multi-region location for Terraform state GCS bucket"
  type        = string
  default     = "US"
}
