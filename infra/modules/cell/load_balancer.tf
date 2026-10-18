/**
 * Cell Load Balancer & Cloud Armor — External ALB with Serverless NEGs & Origin Lockdown
 * Blueprint Reference: §2.1 (Load Balancer / WAF row), §8.1 (Cloud Armor origin lockdown)
 */

# -----------------------------------------------------------------------------
# 1. Cloud Armor Security Policy (Origin Lockdown to Cloudflare + WAF)
# -----------------------------------------------------------------------------
resource "google_compute_security_policy" "cell_waf" {
  name        = "${local.name_prefix}-armor-policy"
  project     = var.project_id
  description = "Origin lockdown to Cloudflare IP ranges and baseline WAF protection"

  # Cloudflare IPv4 IP ranges per https://www.cloudflare.com/ips-v4
  rule {
    action   = "allow"
    priority = "1000"
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = [
          "173.245.48.0/20",
          "103.21.244.0/22",
          "103.22.200.0/22",
          "103.31.4.0/22",
          "141.101.64.0/18",
          "108.162.192.0/18",
          "190.93.240.0/20",
          "188.114.96.0/20",
          "197.234.240.0/22",
          "198.41.128.0/17",
          "162.158.0.0/15",
          "104.16.0.0/13",
          "104.24.0.0/14",
          "172.64.0.0/13",
          "131.0.72.0/22"
        ]
      }
    }
    description = "Allow inbound traffic exclusively from Cloudflare edge proxy IPs"
  }

  # Rate limiting rule: 300 requests per minute per IP
  rule {
    action   = "rate_based_ban"
    priority = "2000"
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
    rate_limit_options {
      conform_action = "allow"
      exceed_action  = "deny(429)"
      rate_limit_threshold {
        count        = 300
        interval_sec = 60
      }
      ban_duration_sec = 300
    }
    description = "Rate limiting protection against abusive bursts"
  }

  # Default deny for any traffic bypassing Cloudflare
  rule {
    action   = var.environment == "dev" ? "allow" : "deny(403)" # Relax in dev for easy local testing if direct
    priority = "2147483647"
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
    description = "Default deny all non-Cloudflare traffic"
  }
}

# -----------------------------------------------------------------------------
# 2. Serverless NEGs for Cloud Run
# -----------------------------------------------------------------------------
resource "google_compute_region_network_endpoint_group" "api_neg" {
  name                  = "${local.name_prefix}-api-neg"
  project               = var.project_id
  region                = var.region
  network_endpoint_type = "SERVERLESS"
  cloud_run {
    service = google_cloud_run_v2_service.api.name
  }
}

resource "google_compute_region_network_endpoint_group" "web_app_neg" {
  name                  = "${local.name_prefix}-web-app-neg"
  project               = var.project_id
  region                = var.region
  network_endpoint_type = "SERVERLESS"
  cloud_run {
    service = google_cloud_run_v2_service.web_app.name
  }
}

resource "google_compute_region_network_endpoint_group" "web_viewer_neg" {
  name                  = "${local.name_prefix}-web-viewer-neg"
  project               = var.project_id
  region                = var.region
  network_endpoint_type = "SERVERLESS"
  cloud_run {
    service = google_cloud_run_v2_service.web_viewer.name
  }
}

resource "google_compute_region_network_endpoint_group" "collab_neg" {
  name                  = "${local.name_prefix}-collab-neg"
  project               = var.project_id
  region                = var.region
  network_endpoint_type = "SERVERLESS"
  cloud_run {
    service = google_cloud_run_v2_service.collab.name
  }
}

# -----------------------------------------------------------------------------
# 3. Backend Services with Cloud Armor Attachment
# -----------------------------------------------------------------------------
resource "google_compute_backend_service" "api_backend" {
  name                  = "${local.name_prefix}-api-backend"
  project               = var.project_id
  protocol              = "HTTPS"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  security_policy       = google_compute_security_policy.cell_waf.id

  backend {
    group = google_compute_region_network_endpoint_group.api_neg.id
  }
}

resource "google_compute_backend_service" "web_app_backend" {
  name                  = "${local.name_prefix}-web-app-backend"
  project               = var.project_id
  protocol              = "HTTPS"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  security_policy       = google_compute_security_policy.cell_waf.id

  backend {
    group = google_compute_region_network_endpoint_group.web_app_neg.id
  }
}

resource "google_compute_backend_service" "web_viewer_backend" {
  name                  = "${local.name_prefix}-web-viewer-backend"
  project               = var.project_id
  protocol              = "HTTPS"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  security_policy       = google_compute_security_policy.cell_waf.id

  backend {
    group = google_compute_region_network_endpoint_group.web_viewer_neg.id
  }
}

resource "google_compute_backend_service" "collab_backend" {
  name                  = "${local.name_prefix}-collab-backend"
  project               = var.project_id
  protocol              = "HTTPS"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  timeout_sec           = 3600 # WebSocket persistent connection timeout
  security_policy       = google_compute_security_policy.cell_waf.id

  backend {
    group = google_compute_region_network_endpoint_group.collab_neg.id
  }
}

# -----------------------------------------------------------------------------
# 4. URL Map & Routing
# -----------------------------------------------------------------------------
resource "google_compute_url_map" "cell_url_map" {
  name            = "${local.name_prefix}-url-map"
  project         = var.project_id
  default_service = google_compute_backend_service.web_app_backend.id

  host_rule {
    hosts        = ["api.${var.primary_domain}"]
    path_matcher = "api-routes"
  }

  host_rule {
    hosts        = ["app.${var.primary_domain}"]
    path_matcher = "app-routes"
  }

  host_rule {
    hosts        = [var.recipient_domain, "*.${var.recipient_domain}"]
    path_matcher = "recipient-routes"
  }

  path_matcher {
    name            = "api-routes"
    default_service = google_compute_backend_service.api_backend.id
  }

  path_matcher {
    name            = "app-routes"
    default_service = google_compute_backend_service.web_app_backend.id
  }

  path_matcher {
    name            = "recipient-routes"
    default_service = google_compute_backend_service.web_viewer_backend.id

    path_rule {
      paths   = ["/ws/*"]
      service = google_compute_backend_service.collab_backend.id
    }
  }
}

# -----------------------------------------------------------------------------
# 5. External IP & HTTPS Target Proxy
# -----------------------------------------------------------------------------
resource "google_compute_global_address" "lb_ip" {
  name        = "${local.name_prefix}-lb-ip"
  project     = var.project_id
  description = "Static external IP for Application Load Balancer"
}

resource "google_compute_managed_ssl_certificate" "cell_cert" {
  name    = "${local.name_prefix}-ssl-cert"
  project = var.project_id

  managed {
    domains = [
      "app.${var.primary_domain}",
      "api.${var.primary_domain}",
      var.recipient_domain
    ]
  }
}

resource "google_compute_target_https_proxy" "https_proxy" {
  name             = "${local.name_prefix}-https-proxy"
  project          = var.project_id
  url_map          = google_compute_url_map.cell_url_map.id
  ssl_certificates = [google_compute_managed_ssl_certificate.cell_cert.id]
}

resource "google_compute_global_forwarding_rule" "https_rule" {
  name                  = "${local.name_prefix}-https-forwarding-rule"
  project               = var.project_id
  target                = google_compute_target_https_proxy.https_proxy.id
  port_range            = "443"
  ip_protocol           = "TCP"
  ip_address            = google_compute_global_address.lb_ip.address
  load_balancing_scheme = "EXTERNAL_MANAGED"
}
