-- Phase 3 Sprint 3.6: Advanced ID-Verification Signing (KBA, Government ID, QES)
-- Blueprint References: §5.3, §12 Phase 3, ADR-0053, RULE RISK-001

-- 1. Modify signers table with verification attempts, sanitized result JSONB, and KBA lockout timestamp
ALTER TABLE "signers"
  ADD COLUMN IF NOT EXISTS "verification_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "verification_result" JSONB,
  ADD COLUMN IF NOT EXISTS "kba_locked_at" TIMESTAMPTZ;

-- 2. Update verification_method check constraint to support KBA, Government ID, and QES
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'signers_verification_method_check'
  ) THEN
    ALTER TABLE "signers" DROP CONSTRAINT "signers_verification_method_check";
  END IF;
END $$;

ALTER TABLE "signers" ADD CONSTRAINT "signers_verification_method_check"
  CHECK ("verification_method" IN ('none', 'email', 'passcode', 'sms', 'kba', 'id_document', 'qes'));

-- 3. Add index on kba_locked_at for rapid lockout verification
CREATE INDEX IF NOT EXISTS "signers_kba_locked_at_idx" ON "signers" ("kba_locked_at");
