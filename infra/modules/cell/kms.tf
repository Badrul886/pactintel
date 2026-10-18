/**
 * Cell Cloud KMS — Multi-Region Key Ring & Purpose-Separated Crypto Keys
 * Blueprint Reference: §2.1 (KMS/Secrets row), §5.3 (Envelope Encryption),
 * Invariant I-11 (Fixed key hierarchy, multi-region), Q2 (KMS location: 'us'), Q7 (No per-tenant CMK).
 */

resource "google_kms_key_ring" "cell_keyring" {
  name     = "${local.name_prefix}-keyring"
  project  = var.project_id
  location = var.kms_location
}

# -----------------------------------------------------------------------------
# 1. Data-at-Rest Master Key
# -----------------------------------------------------------------------------
resource "google_kms_crypto_key" "data_at_rest" {
  name            = "data-at-rest"
  key_ring        = google_kms_key_ring.cell_keyring.id
  rotation_period = "7776000s" # 90 days

  labels = merge(local.base_labels, {
    service = "kms"
    tier    = "security"
  })
}

# -----------------------------------------------------------------------------
# 2. Credential Vault Master Key (Wraps Tenant Data Keys for BYOK credentials)
# -----------------------------------------------------------------------------
resource "google_kms_crypto_key" "cred_vault" {
  name            = "cred-vault"
  key_ring        = google_kms_key_ring.cell_keyring.id
  rotation_period = "7776000s" # 90 days

  labels = merge(local.base_labels, {
    service = "kms-vault"
    tier    = "security"
  })
}

# -----------------------------------------------------------------------------
# 3. Integration Tokens Master Key (OAuth and external provider secrets)
# -----------------------------------------------------------------------------
resource "google_kms_crypto_key" "integration_tokens" {
  name            = "integration-tokens"
  key_ring        = google_kms_key_ring.cell_keyring.id
  rotation_period = "7776000s" # 90 days

  labels = merge(local.base_labels, {
    service = "kms-integration"
    tier    = "security"
  })
}

# -----------------------------------------------------------------------------
# 4. Evidence Integrity Key
# -----------------------------------------------------------------------------
resource "google_kms_crypto_key" "evidence" {
  name            = "evidence"
  key_ring        = google_kms_key_ring.cell_keyring.id
  rotation_period = "7776000s" # 90 days

  labels = merge(local.base_labels, {
    service = "kms-evidence"
    tier    = "security"
  })
}

# -----------------------------------------------------------------------------
# 5. Field-Level Encryption Key (PII and sensitive column encryption)
# -----------------------------------------------------------------------------
resource "google_kms_crypto_key" "field_encryption" {
  name            = "field-encryption"
  key_ring        = google_kms_key_ring.cell_keyring.id
  rotation_period = "7776000s" # 90 days

  labels = merge(local.base_labels, {
    service = "kms-field"
    tier    = "security"
  })
}
