output "turnstile_site_key" {
  description = "Site key for Cloudflare Turnstile widget"
  value       = cloudflare_turnstile_widget.signing_bot_protection.id
}

output "turnstile_secret_key" {
  description = "Secret key for Cloudflare Turnstile widget"
  value       = cloudflare_turnstile_widget.signing_bot_protection.secret
  sensitive   = true
}

output "app_hostname" {
  description = "Hostname for the authenticated app shell"
  value       = cloudflare_record.app.hostname
}

output "api_hostname" {
  description = "Hostname for the REST API"
  value       = cloudflare_record.api.hostname
}

output "recipient_hostname" {
  description = "Hostname for recipient signing and viewing"
  value       = cloudflare_record.recipient_root.hostname
}
