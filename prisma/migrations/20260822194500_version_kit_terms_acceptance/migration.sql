ALTER TABLE "TeamKitOrder"
  ADD COLUMN IF NOT EXISTS "kitTermsVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "kitTermsAcceptedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "kitTermsAcceptedByUserId" TEXT;

CREATE INDEX IF NOT EXISTS "TeamKitOrder_kitTermsVersion_idx"
  ON "TeamKitOrder" ("kitTermsVersion");

COMMENT ON COLUMN "TeamKitOrder"."kitTermsVersion" IS
  'Snapshot of the Founding Team Kit Offer Terms version accepted when the order was submitted. Null means the order predates version tracking.';

COMMENT ON COLUMN "TeamKitOrder"."kitTermsAcceptedAt" IS
  'Timestamp at which the submitting captain accepted the recorded kit terms version.';

COMMENT ON COLUMN "TeamKitOrder"."kitTermsAcceptedByUserId" IS
  'User account that accepted the recorded kit terms version. Stored as an audit snapshot rather than a foreign key so history survives account changes.';
