-- Additive only. Does not overturn any existing result or alter money/messages.
BEGIN;
SET LOCAL lock_timeout = '15s';
ALTER TABLE "MatchResult" ADD COLUMN IF NOT EXISTS "originalHomeScore" INTEGER;
ALTER TABLE "MatchResult" ADD COLUMN IF NOT EXISTS "originalAwayScore" INTEGER;
ALTER TABLE "MatchResult" ADD COLUMN IF NOT EXISTS "overturnedAt" TIMESTAMP(3);
CREATE TABLE IF NOT EXISTS "MatchResultOverturn" (
  id TEXT PRIMARY KEY, "matchResultId" TEXT NOT NULL UNIQUE, "fixtureId" TEXT NOT NULL UNIQUE,
  "homeTeamId" TEXT NOT NULL, "awayTeamId" TEXT NOT NULL,
  "originalHomeScore" INTEGER NOT NULL CHECK ("originalHomeScore">=0),
  "originalAwayScore" INTEGER NOT NULL CHECK ("originalAwayScore">=0),
  "awardedHomeScore" INTEGER NOT NULL, "awardedAwayScore" INTEGER NOT NULL,
  "winnerTeamId" TEXT NOT NULL, "reasonCode" TEXT NOT NULL,
  "decisionReason" TEXT NOT NULL, "evidenceReference" TEXT NOT NULL, "rulesBasis" TEXT NOT NULL,
  "decidedByUserId" TEXT NOT NULL, "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MatchResultOverturn_matchResultId_fkey" FOREIGN KEY ("matchResultId")
    REFERENCES "MatchResult"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CHECK (("winnerTeamId"="homeTeamId" AND "awardedHomeScore"=3 AND "awardedAwayScore"=0)
    OR ("winnerTeamId"="awayTeamId" AND "awardedAwayScore"=3 AND "awardedHomeScore"=0)),
  CHECK ("homeTeamId"<>"awayTeamId"),
  CHECK ("reasonCode" IN ('PLAYER_LIMIT','INELIGIBLE_PLAYER','COMPETITION_BREACH')),
  CHECK (length(trim("decisionReason")) BETWEEN 20 AND 4000),
  CHECK (length(trim("evidenceReference")) BETWEEN 5 AND 2000),
  CHECK (length(trim("rulesBasis")) BETWEEN 5 AND 1000)
);

-- The single insert is the decision. Validate the stored result under a row
-- lock, and apply the official award in the SAME transaction. Existing referee,
-- admin and raw-SQL writers cannot later erase the decision or its original.
CREATE OR REPLACE FUNCTION sixfl_validate_result_overturn() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE f "Fixture"%ROWTYPE; r "MatchResult"%ROWTYPE; abandoned BOOLEAN;
BEGIN
  SELECT * INTO f FROM "Fixture" WHERE id=NEW."fixtureId" FOR UPDATE;
  SELECT * INTO r FROM "MatchResult" WHERE id=NEW."matchResultId" FOR UPDATE;
  IF f.id IS NULL OR r.id IS NULL OR r."fixtureId"<>f.id OR f.status::text<>'COMPLETED' OR f."publishedAt" IS NULL THEN
    RAISE EXCEPTION 'Only a published completed fixture with an existing result can be overturned.';
  END IF;
  IF r."overturnedAt" IS NOT NULL THEN RAISE EXCEPTION 'This result already has an overturn decision.'; END IF;
  IF f."homeTeamId"<>NEW."homeTeamId" OR f."awayTeamId"<>NEW."awayTeamId"
    OR r."homeScore"<>NEW."originalHomeScore" OR r."awayScore"<>NEW."originalAwayScore" THEN
    RAISE EXCEPTION 'The fixture or its result changed. Preview the decision again.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "User" WHERE id=NEW."decidedByUserId" AND role::text='ADMIN') THEN
    RAISE EXCEPTION 'Administrator access is required for an overturn decision.';
  END IF;
  IF to_regclass('"FixtureAbandonment"') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS(SELECT 1 FROM "FixtureAbandonment" WHERE "fixtureId"=$1)' INTO abandoned USING f.id;
    IF abandoned THEN RAISE EXCEPTION 'Use the separate abandonment/no-show decision process for this fixture.'; END IF;
  END IF;
  NEW."decidedAt" := clock_timestamp();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sixfl_validate_result_overturn_trigger ON "MatchResultOverturn";
CREATE TRIGGER sixfl_validate_result_overturn_trigger BEFORE INSERT ON "MatchResultOverturn"
FOR EACH ROW EXECUTE FUNCTION sixfl_validate_result_overturn();

CREATE OR REPLACE FUNCTION sixfl_protect_overturned_result() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d "MatchResultOverturn"%ROWTYPE;
BEGIN
  IF TG_OP='DELETE' THEN
    IF EXISTS (SELECT 1 FROM "MatchResultOverturn" WHERE "matchResultId"=OLD.id) THEN
      RAISE EXCEPTION 'An overturned result and its decision history cannot be deleted.';
    END IF;
    RETURN OLD;
  END IF;
  SELECT * INTO d FROM "MatchResultOverturn" WHERE "matchResultId"=NEW.id;
  IF d.id IS NOT NULL THEN
    IF NEW."fixtureId"<>d."fixtureId" OR NEW."homeScore"<>d."awardedHomeScore"
      OR NEW."awayScore"<>d."awardedAwayScore" OR NEW."originalHomeScore" IS DISTINCT FROM d."originalHomeScore"
      OR NEW."originalAwayScore" IS DISTINCT FROM d."originalAwayScore" OR NEW."overturnedAt" IS DISTINCT FROM d."decidedAt" THEN
      RAISE EXCEPTION 'This result was overturned by SIXFL. Ordinary score edits cannot replace its recorded decision.';
    END IF;
    -- Keep the original entry timestamp/author: historical prediction recovery
    -- must not pretend the playing result was first known on the decision date.
    IF TG_OP='UPDATE' AND OLD."overturnedAt" IS NOT NULL AND
      (NEW."enteredAt" IS DISTINCT FROM OLD."enteredAt" OR NEW."enteredByUserId" IS DISTINCT FROM OLD."enteredByUserId") THEN
      RAISE EXCEPTION 'The original result entry provenance is protected.';
    END IF;
  ELSIF NEW."overturnedAt" IS NOT NULL OR NEW."originalHomeScore" IS NOT NULL OR NEW."originalAwayScore" IS NOT NULL THEN
    RAISE EXCEPTION 'Original result metadata requires an audited overturn decision.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sixfl_protect_overturned_result_trigger ON "MatchResult";
CREATE TRIGGER sixfl_protect_overturned_result_trigger BEFORE INSERT OR UPDATE OR DELETE ON "MatchResult"
FOR EACH ROW EXECUTE FUNCTION sixfl_protect_overturned_result();

CREATE OR REPLACE FUNCTION sixfl_apply_result_overturn() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "MatchResult" SET "homeScore"=NEW."awardedHomeScore", "awayScore"=NEW."awardedAwayScore",
    "originalHomeScore"=NEW."originalHomeScore", "originalAwayScore"=NEW."originalAwayScore",
    "overturnedAt"=NEW."decidedAt", "updatedAt"=CURRENT_TIMESTAMP WHERE id=NEW."matchResultId";
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sixfl_apply_result_overturn_trigger ON "MatchResultOverturn";
CREATE TRIGGER sixfl_apply_result_overturn_trigger AFTER INSERT ON "MatchResultOverturn"
FOR EACH ROW EXECUTE FUNCTION sixfl_apply_result_overturn();

CREATE OR REPLACE FUNCTION sixfl_immutable_result_overturn() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Result-overturn decisions are immutable; a later review needs a separately audited decision.'; END $$;
DROP TRIGGER IF EXISTS sixfl_immutable_result_overturn_trigger ON "MatchResultOverturn";
CREATE TRIGGER sixfl_immutable_result_overturn_trigger BEFORE UPDATE OR DELETE ON "MatchResultOverturn"
FOR EACH ROW EXECUTE FUNCTION sixfl_immutable_result_overturn();

CREATE OR REPLACE FUNCTION sixfl_protect_overturned_fixture() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "MatchResultOverturn" WHERE "fixtureId"=OLD.id) THEN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'An overturned fixture must retain its decision history.'; END IF;
    IF NEW.id<>OLD.id OR NEW."homeTeamId"<>OLD."homeTeamId" OR NEW."awayTeamId"<>OLD."awayTeamId"
      OR NEW.status::text<>'COMPLETED' OR NEW."leagueId"<>OLD."leagueId" OR NEW."kickoffAt"<>OLD."kickoffAt" THEN
      RAISE EXCEPTION 'An overturned fixture cannot be reassigned or reopened.';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sixfl_protect_overturned_fixture_trigger ON "Fixture";
CREATE TRIGGER sixfl_protect_overturned_fixture_trigger BEFORE UPDATE OR DELETE ON "Fixture"
FOR EACH ROW EXECUTE FUNCTION sixfl_protect_overturned_fixture();
COMMIT;
