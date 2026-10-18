output "cell_vpc_id" {
  description = "The ID of the cell VPC"
  value       = google_compute_network.cell_vpc.id
}

output "sql_primary_ip" {
  description = "Private IP address of the primary Cloud SQL PostgreSQL instance"
  value       = google_sql_database_instance.primary.private_ip_address
}

output "sql_instance_name" {
  description = "Instance name of the primary Cloud SQL instance"
  value       = google_sql_database_instance.primary.name
}

output "redis_queue_host" {
  description = "Host IP for BullMQ Queue Redis instance"
  value       = google_redis_instance.queue.host
}

output "redis_session_host" {
  description = "Host IP for Session Redis instance"
  value       = google_redis_instance.session.host
}

output "redis_cache_host" {
  description = "Host IP for Cache Redis instance"
  value       = google_redis_instance.cache.host
}

output "redis_realtime_host" {
  description = "Host IP for Realtime Collab Redis instance"
  value       = google_redis_instance.realtime.host
}

output "evidence_bucket_name" {
  description = "Name of the locked evidence GCS bucket"
  value       = google_storage_bucket.evidence.name
}

output "uploads_bucket_name" {
  description = "Name of the uploads staging GCS bucket"
  value       = google_storage_bucket.uploads.name
}

output "exports_bucket_name" {
  description = "Name of the exports GCS bucket"
  value       = google_storage_bucket.exports.name
}

output "public_media_bucket_name" {
  description = "Name of the public media GCS bucket"
  value       = google_storage_bucket.public_media.name
}

output "kms_keyring_id" {
  description = "ID of the cell KMS key ring"
  value       = google_kms_key_ring.cell_keyring.id
}

output "load_balancer_ip" {
  description = "External static IP of the cell Application Load Balancer"
  value       = google_compute_global_address.lb_ip.address
}

output "workload_identity_provider" {
  description = "WIF Provider name for GitHub Actions auth (google-github-actions/auth)"
  value       = google_iam_workload_identity_pool_provider.github_provider.name
}

output "github_ci_sa_email" {
  description = "Email of the CI deployment service account"
  value       = google_service_account.github_ci.email
}

output "migrator_job_name" {
  description = "Name of the Cloud Run database migrator job"
  value       = google_cloud_run_v2_job.migrator.name
}

output "api_service_name" {
  description = "Name of the API Cloud Run service"
  value       = google_cloud_run_v2_service.api.name
}

output "web_app_service_name" {
  description = "Name of the Web App Cloud Run service"
  value       = google_cloud_run_v2_service.web_app.name
}

output "web_viewer_service_name" {
  description = "Name of the Web Viewer Cloud Run service"
  value       = google_cloud_run_v2_service.web_viewer.name
}
