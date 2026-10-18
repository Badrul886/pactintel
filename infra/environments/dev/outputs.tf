output "cell_vpc_id" {
  value = module.cell.cell_vpc_id
}

output "load_balancer_ip" {
  value = module.cell.load_balancer_ip
}

output "workload_identity_provider" {
  value = module.cell.workload_identity_provider
}

output "github_ci_sa_email" {
  value = module.cell.github_ci_sa_email
}

output "sql_primary_ip" {
  value = module.cell.sql_primary_ip
}

output "evidence_bucket_name" {
  value = module.cell.evidence_bucket_name
}
