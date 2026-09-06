-- Foundation for SIXFL cup competitions.
-- Existing LeagueCompetition rows remain normal leagues by default.
-- Cup seasons continue to use League + Fixture + LeagueSeasonTeam so a team can
-- enter a cup without moving out of its normal league.

ALTER TABLE "LeagueCompetition"
  ADD COLUMN IF NOT EXISTS "competitionType" TEXT NOT NULL DEFAULT 'LEAGUE',
  ADD COLUMN IF NOT EXISTS "cupFormat" TEXT,
  ADD COLUMN IF NOT EXISTS "isInterLeague" BOOLEAN NOT NULL DEFAULT false;

UPDATE "LeagueCompetition"
SET "competitionType" = 'LEAGUE'
WHERE "competitionType" IS NULL
   OR "competitionType" NOT IN ('LEAGUE', 'CUP');

UPDATE "LeagueCompetition"
SET "cupFormat" = NULL,
    "isInterLeague" = false
WHERE "competitionType" = 'LEAGUE';

ALTER TABLE "LeagueCompetition"
  DROP CONSTRAINT IF EXISTS "LeagueCompetition_competitionType_check";

ALTER TABLE "LeagueCompetition"
  ADD CONSTRAINT "LeagueCompetition_competitionType_check"
  CHECK ("competitionType" IN ('LEAGUE', 'CUP'));

ALTER TABLE "LeagueCompetition"
  DROP CONSTRAINT IF EXISTS "LeagueCompetition_cupFormat_check";

ALTER TABLE "LeagueCompetition"
  ADD CONSTRAINT "LeagueCompetition_cupFormat_check"
  CHECK (
    "cupFormat" IS NULL
    OR "cupFormat" IN ('KNOCKOUT', 'GROUPS_THEN_KNOCKOUT')
  );

CREATE INDEX IF NOT EXISTS "LeagueCompetition_competitionType_idx"
  ON "LeagueCompetition"("competitionType");

CREATE INDEX IF NOT EXISTS "LeagueCompetition_type_active_idx"
  ON "LeagueCompetition"("competitionType", "isActive");
