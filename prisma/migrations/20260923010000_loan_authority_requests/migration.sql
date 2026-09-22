CREATE TABLE "FixtureLoanAuthorityRequest" (
  "fixtureId" TEXT NOT NULL REFERENCES "Fixture"("id") ON DELETE CASCADE,
  "teamId" TEXT NOT NULL REFERENCES "Team"("id") ON DELETE CASCADE,
  "count" INTEGER NOT NULL CHECK ("count" BETWEEN 0 AND 9),
  "revision" INTEGER NOT NULL DEFAULT 1,
  "updatedBy" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("fixtureId", "teamId")
);
