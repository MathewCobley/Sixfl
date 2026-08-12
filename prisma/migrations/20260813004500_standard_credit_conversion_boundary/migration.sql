-- Record the point at which a managed squad becomes a standard squad.
-- Standard-team credit must never be reconstructed from payments/fixtures that
-- belong to the earlier managed-squad period.
ALTER TABLE "Team"
ADD COLUMN IF NOT EXISTS "standardCreditStartedAt" TIMESTAMP(3);

COMMENT ON COLUMN "Team"."standardCreditStartedAt" IS
  'When set, team-credit activity before this MANAGED to STANDARD conversion boundary is excluded from the standard credit ledger.';
