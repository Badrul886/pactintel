-- Migration: 0009_phase3_risk_adaptive_verification
-- Phase 3 Sprint 3.7: Risk-Adaptive Identity Verification & Pre-Verified Network

-- 1. Create global pre_verified_signers table (Invariant I-03: Zero PII, SHA-256 email hash only)
CREATE TABLE IF NOT EXISTS "pre_verified_signers" (
    "id" TEXT NOT NULL,
    "email_hash" TEXT NOT NULL,
    "verification_method" TEXT NOT NULL,
    "verified_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pre_verified_signers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "pre_verified_signers_email_hash_key" ON "pre_verified_signers"("email_hash");
CREATE INDEX IF NOT EXISTS "pre_verified_signers_email_hash_idx" ON "pre_verified_signers"("email_hash");
CREATE INDEX IF NOT EXISTS "pre_verified_signers_expires_at_idx" ON "pre_verified_signers"("expires_at");

-- 2. Create tenant-scoped risk_assessments table
CREATE TABLE IF NOT EXISTS "risk_assessments" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "signer_id" TEXT,
    "document_id" TEXT,
    "signature_request_id" TEXT,
    "risk_score" DOUBLE PRECISION NOT NULL,
    "risk_level" TEXT NOT NULL,
    "assigned_method" TEXT NOT NULL,
    "is_pre_verified" BOOLEAN NOT NULL DEFAULT false,
    "fallback_applied" BOOLEAN NOT NULL DEFAULT false,
    "factors" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_assessments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "risk_assessments_organization_id_idx" ON "risk_assessments"("organization_id");
CREATE INDEX IF NOT EXISTS "risk_assessments_signer_id_idx" ON "risk_assessments"("signer_id");
CREATE INDEX IF NOT EXISTS "risk_assessments_document_id_idx" ON "risk_assessments"("document_id");
CREATE INDEX IF NOT EXISTS "risk_assessments_signature_request_id_idx" ON "risk_assessments"("signature_request_id");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'risk_assessments_organization_id_fkey'
    ) THEN
        ALTER TABLE "risk_assessments" ADD CONSTRAINT "risk_assessments_organization_id_fkey"
            FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Enable and force Row-Level Security on risk_assessments (Invariant I-10)
ALTER TABLE "risk_assessments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "risk_assessments" FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'risk_assessments' AND policyname = 'risk_assessments_isolation_policy'
    ) THEN
        CREATE POLICY "risk_assessments_isolation_policy" ON "risk_assessments"
            FOR ALL
            USING (organization_id = (SELECT NULLIF(current_setting('app.current_organization_id', true), '')::text))
            WITH CHECK (organization_id = (SELECT NULLIF(current_setting('app.current_organization_id', true), '')::text));
    END IF;
END $$;

-- 3. Expand signers verification_method check constraint to include 'adaptive'
ALTER TABLE "signers" DROP CONSTRAINT IF EXISTS "signers_verification_method_check";
ALTER TABLE "signers" ADD CONSTRAINT "signers_verification_method_check"
    CHECK (verification_method IN ('none', 'email', 'passcode', 'sms', 'kba', 'id_document', 'qes', 'adaptive'));

