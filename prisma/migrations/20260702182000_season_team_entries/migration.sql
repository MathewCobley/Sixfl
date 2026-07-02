-- Make team membership season-aware.
-- Teams belong to the parent LeagueCompetition. LeagueSeasonTeam decides which teams play in each season and division.

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

CREATE UNIQUE INDEX "LeagueSeasonTeam_leagueId_teamId_key" ON "LeagueSeasonTeam"("leagueId", "teamId");
CREATE INDEX "LeagueSeasonTeam_leagueId_idx" ON "LeagueSeasonTeam"("leagueId");
CREATE INDEX "LeagueSeasonTeam_teamId_idx" ON "LeagueSeasonTeam"("teamId");
CREATE INDEX "LeagueSeasonTeam_divisionId_idx" ON "LeagueSeasonTeam"("divisionId");
CREATE INDEX "LeagueSeasonTeam_leagueId_divisionId_idx" ON "LeagueSeasonTeam"("leagueId", "divisionId");
CREATE INDEX "Team_competitionId_idx" ON "Team"("competitionId");

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
  AND l."competitionId" IS NOT NULL
  AND t."competitionId" IS NULL;

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
  'lst_' || md5(random()::text || clock_timestamp()::text || t."id"),
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
