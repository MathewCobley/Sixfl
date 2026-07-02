-- Add first-class league divisions while keeping existing leagues backwards compatible.

CREATE TABLE "LeagueDivision" (
  "id" TEXT NOT NULL,
  "leagueId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LeagueDivision_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Team" ADD COLUMN "divisionId" TEXT;
ALTER TABLE "Fixture" ADD COLUMN "divisionId" TEXT;

CREATE UNIQUE INDEX "LeagueDivision_leagueId_slug_key" ON "LeagueDivision"("leagueId", "slug");
CREATE INDEX "LeagueDivision_leagueId_idx" ON "LeagueDivision"("leagueId");
CREATE INDEX "LeagueDivision_leagueId_isActive_sortOrder_idx" ON "LeagueDivision"("leagueId", "isActive", "sortOrder");
CREATE INDEX "Team_divisionId_idx" ON "Team"("divisionId");
CREATE INDEX "Fixture_divisionId_kickoffAt_idx" ON "Fixture"("divisionId", "kickoffAt");
CREATE INDEX "Fixture_leagueId_divisionId_kickoffAt_idx" ON "Fixture"("leagueId", "divisionId", "kickoffAt");

ALTER TABLE "LeagueDivision"
  ADD CONSTRAINT "LeagueDivision_leagueId_fkey"
  FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Team"
  ADD CONSTRAINT "Team_divisionId_fkey"
  FOREIGN KEY ("divisionId") REFERENCES "LeagueDivision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Fixture"
  ADD CONSTRAINT "Fixture_divisionId_fkey"
  FOREIGN KEY ("divisionId") REFERENCES "LeagueDivision"("id") ON DELETE SET NULL ON UPDATE CASCADE;
