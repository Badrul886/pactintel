variable "cloudflare_zone_id_primary" {
  description = "Cloudflare Zone ID for pactintel.com"
  type        = string
}

variable "cloudflare_zone_id_recipient" {
  description = "Cloudflare Zone ID for pact.link"
  type        = string
}

variable "primary_domain" {
  description = "Primary corporate and app domain"
  type        = string
  default     = "pactintel.com"
}

variable "recipient_domain" {
  description = "Recipient signing short domain (Q5: pact.link)"
  type        = string
  default     = "pact.link"
}

variable "alb_ip" {
  description = "Static IP address of the GCP Application Load Balancer"
  type        = string
}

variable "environment" {
  description = "Deployment environment: dev, staging, or prod"
  type        = string
}
