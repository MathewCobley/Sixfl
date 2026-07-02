-- Correct league structure:
-- Teams belong to the parent competition.
-- Each season has separate season-team entries, with division assignment per season.
-- Existing Team.leagueId / Team.divisionId are kept as legacy current-season cache fields for compatibility.

ALTER TABLE "Team" ADD COLUMN "competitionId" TEXT;

CREATE TABLE "LeagueSeasonTeam" (
  "id" TEXT NOT NULL,
  "leagueId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "divisionId" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LeagueSeasonTeam_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Team_competitionId_idx" ON "Team"("competitionId");
CREATE UNIQUE INDEX "LeagueSeasonTeam_leagueId_teamId_key" ON "LeagueSeasonTeam"("leagueId", "teamId");
CREATE INDEX "LeagueSeasonTeam_leagueId_idx" ON "LeagueSeasonTeam"("leagueId");
CREATE INDEX "LeagueSeasonTeam_teamId_idx" ON "LeagueSeasonTeam"("teamId");
CREATE INDEX "LeagueSeasonTeam_divisionId_idx" ON "LeagueSeasonTeam"("divisionId");
CREATE INDEX "LeagueSeasonTeam_leagueId_divisionId_isActive_idx" ON "LeagueSeasonTeam"("leagueId", "divisionId", "isActive");

ALTER TABLE "Team"
  ADD CONSTRAINT "Team_competitionId_fkey"
  FOREIGN KEY ("competitionId") REFERENCES "LeagueCompetition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LeagueSeasonTeam"
  ADD CONSTRAINT "LeagueSeasonTeam_leagueId_fkey"
  FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LeagueSeasonTeam"
  ADD CONSTRAINT "LeagueSeasonTeam_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LeagueSeasonTeam"
  ADD CONSTRAINT "LeagueSeasonTeam_divisionId_fkey"
  FOREIGN KEY ("divisionId") REFERENCES "LeagueDivision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "Team" t
SET "competitionId" = l."competitionId"
FROM "League" l
WHERE t."leagueId" = l."id"
  AND l."competitionId" IS NOT NULL;

INSERT INTO "LeagueSeasonTeam" (
  "id",
  "leagueId",
  "teamId",
  "divisionId",
  "isActive",
  "createdAt",
  "updatedAt"
)
SELECT
  'lst_' || md5(t."id" || ':' || t."leagueId"),
  t."leagueId",
  t."id",
  t."divisionId",
  true,
  NOW(),
  NOW()
FROM "Team" t
WHERE t."leagueId" IS NOT NULL
ON CONFLICT ("leagueId", "teamId") DO UPDATE
SET
  "divisionId" = EXCLUDED."divisionId",
  "isActive" = true,
  "updatedAt" = NOW();
