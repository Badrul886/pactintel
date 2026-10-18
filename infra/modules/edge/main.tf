/**
 * Edge Module — Cloudflare DNS, WAF, Turnstile, and Email Authentication
 * Blueprint Reference: §2.1 (Edge/CDN row), Q4 (mail.pactintel.com), Q5 (pact.link), Q6 (Cloudflare for SaaS)
 */

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }
}

# -----------------------------------------------------------------------------
# 1. DNS Records for pactintel.com
# -----------------------------------------------------------------------------

# Authenticated App: app.pactintel.com
resource "cloudflare_record" "app" {
  zone_id = var.cloudflare_zone_id_primary
  name    = "app"
  content = var.alb_ip
  type    = "A"
  proxied = true
  comment = "PactIntel App Shell routed to GCP ALB"
}

# API Endpoint: api.pactintel.com
resource "cloudflare_record" "api" {
  zone_id = var.cloudflare_zone_id_primary
  name    = "api"
  content = var.alb_ip
  type    = "A"
  proxied = true
  comment = "PactIntel REST API routed to GCP ALB"
}

# -----------------------------------------------------------------------------
# 2. DNS Records for pact.link (Recipient Viewer & Signing)
# -----------------------------------------------------------------------------

resource "cloudflare_record" "recipient_root" {
  zone_id = var.cloudflare_zone_id_recipient
  name    = "@"
  content = var.alb_ip
  type    = "A"
  proxied = true
  comment = "Pact.link recipient viewer root routed to GCP ALB"
}

resource "cloudflare_record" "recipient_wildcard" {
  zone_id = var.cloudflare_zone_id_recipient
  name    = "*"
  content = var.alb_ip
  type    = "A"
  proxied = true
  comment = "Wildcard support for cell routing and tenant white-labeling fallback"
}

# -----------------------------------------------------------------------------
# 3. Email Authentication DNS Records (Q4 Decision: mail.pactintel.com)
# -----------------------------------------------------------------------------

# SPF Record
resource "cloudflare_record" "mail_spf" {
  zone_id = var.cloudflare_zone_id_primary
  name    = "mail"
  content = "v=spf1 include:_spf.resend.com ~all"
  type    = "TXT"
  proxied = false
  comment = "Transactional email SPF for mail.pactintel.com"
}

# DMARC Record with quarantine policy (ramp to reject at 30 days per Q4)
resource "cloudflare_record" "mail_dmarc" {
  zone_id = var.cloudflare_zone_id_primary
  name    = "_dmarc.mail"
  content = "v=DMARC1; p=quarantine; rua=mailto:dmarc@pactintel.com; pct=100"
  type    = "TXT"
  proxied = false
  comment = "DMARC policy for transactional email subdomain"
}

# Resend Inbound / Bounce MX
resource "cloudflare_record" "mail_mx" {
  zone_id  = var.cloudflare_zone_id_primary
  name     = "mail"
  content  = "feedback-smtp.us-east-1.amazonses.com" # Resend mail bounce router
  type     = "MX"
  priority = 10
  proxied  = false
}

# -----------------------------------------------------------------------------
# 4. Cloudflare Turnstile Bot Protection Widget
# -----------------------------------------------------------------------------
resource "cloudflare_turnstile_widget" "signing_bot_protection" {
  account_id = "pactintel-cf-account"
  name       = "pactintel-turnstile-${var.environment}"
  domains    = [var.recipient_domain, "app.${var.primary_domain}"]
  mode       = "managed"
}

# -----------------------------------------------------------------------------
# 5. Security & TLS Configuration
# -----------------------------------------------------------------------------
resource "cloudflare_zone_settings_override" "primary_settings" {
  zone_id = var.cloudflare_zone_id_primary

  settings {
    min_tls_version          = "1.2"
    always_use_https         = "on"
    ssl                      = "strict"
    brotli                   = "on"
    security_header {
      enabled            = true
      max_age            = 31536000
      include_subdomains = true
      preload            = true
      nosniff            = true
    }
  }
}
