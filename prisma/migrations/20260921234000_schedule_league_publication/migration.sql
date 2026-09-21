ALTER TABLE "League"
ADD COLUMN IF NOT EXISTS "publicAt" TIMESTAMP(3);

UPDATE "League"
SET "publicAt" = "createdAt"
WHERE "publicAt" IS NULL;

CREATE INDEX IF NOT EXISTS "League_publicAt_idx"
ON "League"("publicAt");
