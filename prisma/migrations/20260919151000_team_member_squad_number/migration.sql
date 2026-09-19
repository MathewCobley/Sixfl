ALTER TABLE "TeamMemberProfile"
  ADD COLUMN IF NOT EXISTS "squadNumber" INTEGER;

ALTER TABLE "TeamMemberProfile"
  DROP CONSTRAINT IF EXISTS "TeamMemberProfile_squadNumber_check";

ALTER TABLE "TeamMemberProfile"
  ADD CONSTRAINT "TeamMemberProfile_squadNumber_check"
  CHECK ("squadNumber" IS NULL OR ("squadNumber" BETWEEN 1 AND 99));

CREATE INDEX IF NOT EXISTS "TeamMemberProfile_squadNumber_idx"
  ON "TeamMemberProfile" ("squadNumber");
