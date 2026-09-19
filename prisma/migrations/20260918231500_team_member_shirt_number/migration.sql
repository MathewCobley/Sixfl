ALTER TABLE "TeamMember"
ADD COLUMN IF NOT EXISTS "shirtNumber" INTEGER;

ALTER TABLE "TeamMember"
ADD CONSTRAINT "TeamMember_shirtNumber_range_check"
CHECK ("shirtNumber" IS NULL OR ("shirtNumber" >= 1 AND "shirtNumber" <= 99));

CREATE UNIQUE INDEX IF NOT EXISTS "TeamMember_teamId_shirtNumber_key"
ON "TeamMember"("teamId", "shirtNumber");
