output "shared_services_folder_id" {
  description = "The ID of the shared-services folder"
  value       = google_folder.shared_services.name
}

output "security_folder_id" {
  description = "The ID of the security folder"
  value       = google_folder.security.name
}

output "control_plane_folder_id" {
  description = "The ID of the control-plane folder"
  value       = google_folder.control_plane.name
}

output "cells_folder_id" {
  description = "The ID of the cells folder"
  value       = google_folder.cells.name
}

output "non_prod_folder_id" {
  description = "The ID of the non-prod folder"
  value       = google_folder.non_prod.name
}

output "shared_services_project_id" {
  description = "Project ID for shared-services"
  value       = google_project.shared_services.project_id
}

output "security_project_id" {
  description = "Project ID for security"
  value       = google_project.security.project_id
}

output "tf_state_bucket_name" {
  description = "Name of the GCS bucket for remote Terraform state"
  value       = google_storage_bucket.tf_state.name
}

output "audit_logs_bucket_name" {
  description = "Name of the GCS bucket with locked retention for audit logs"
  value       = google_storage_bucket.audit_logs.name
}

output "org_audit_sink_writer_identity" {
  description = "Service account identity used by the org audit sink"
  value       = google_logging_organization_sink.org_audit_sink.writer_identity
}
