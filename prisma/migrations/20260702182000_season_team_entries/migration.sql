-- Make team membership season-aware.
-- Teams belong to the parent LeagueCompetition. LeagueSeasonTeam decides which teams play in each season and division.
-- Written defensively because the first production attempt may have partially created objects before failing.

ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "competitionId" TEXT;

CREATE TABLE IF NOT EXISTS "LeagueSeasonTeam" (
  "id" TEXT NOT NULL,
  "leagueId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "divisionId" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LeagueSeasonTeam_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "LeagueSeasonTeam" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "LeagueSeasonTeam" ADD COLUMN IF NOT EXISTS "leagueId" TEXT;
ALTER TABLE "LeagueSeasonTeam" ADD COLUMN IF NOT EXISTS "teamId" TEXT;
ALTER TABLE "LeagueSeasonTeam" ADD COLUMN IF NOT EXISTS "divisionId" TEXT;
ALTER TABLE "LeagueSeasonTeam" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "LeagueSeasonTeam" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "LeagueSeasonTeam" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS "LeagueSeasonTeam_leagueId_teamId_key" ON "LeagueSeasonTeam"("leagueId", "teamId");
CREATE INDEX IF NOT EXISTS "LeagueSeasonTeam_leagueId_idx" ON "LeagueSeasonTeam"("leagueId");
CREATE INDEX IF NOT EXISTS "LeagueSeasonTeam_teamId_idx" ON "LeagueSeasonTeam"("teamId");
CREATE INDEX IF NOT EXISTS "LeagueSeasonTeam_divisionId_idx" ON "LeagueSeasonTeam"("divisionId");
CREATE INDEX IF NOT EXISTS "LeagueSeasonTeam_leagueId_divisionId_idx" ON "LeagueSeasonTeam"("leagueId", "divisionId");
CREATE INDEX IF NOT EXISTS "Team_competitionId_idx" ON "Team"("competitionId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Team_competitionId_fkey'
  ) THEN
    ALTER TABLE "Team"
      ADD CONSTRAINT "Team_competitionId_fkey"
      FOREIGN KEY ("competitionId") REFERENCES "LeagueCompetition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'LeagueSeasonTeam_leagueId_fkey'
  ) THEN
    ALTER TABLE "LeagueSeasonTeam"
      ADD CONSTRAINT "LeagueSeasonTeam_leagueId_fkey"
      FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'LeagueSeasonTeam_teamId_fkey'
  ) THEN
    ALTER TABLE "LeagueSeasonTeam"
      ADD CONSTRAINT "LeagueSeasonTeam_teamId_fkey"
      FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'LeagueSeasonTeam_divisionId_fkey'
  ) THEN
    ALTER TABLE "LeagueSeasonTeam"
      ADD CONSTRAINT "LeagueSeasonTeam_divisionId_fkey"
      FOREIGN KEY ("divisionId") REFERENCES "LeagueDivision"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

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
  'lst_' || md5(t."leagueId" || ':' || t."id"),
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
  "divisionId" = COALESCE("LeagueSeasonTeam"."divisionId", EXCLUDED."divisionId"),
  "isActive" = true,
  "updatedAt" = NOW();
