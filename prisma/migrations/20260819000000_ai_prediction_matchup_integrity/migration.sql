ALTER TABLE "FixtureAiPrediction"
  ADD COLUMN IF NOT EXISTS "homeTeamIdSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "awayTeamIdSnapshot" TEXT;

CREATE OR REPLACE FUNCTION sixfl_stamp_fixture_ai_prediction_matchup()
RETURNS TRIGGER AS $$
BEGIN
  SELECT fixture."homeTeamId", fixture."awayTeamId"
  INTO NEW."homeTeamIdSnapshot", NEW."awayTeamIdSnapshot"
  FROM "Fixture" fixture
  WHERE fixture."id" = NEW."fixtureId";

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "FixtureAiPrediction_stamp_matchup" ON "FixtureAiPrediction";
CREATE TRIGGER "FixtureAiPrediction_stamp_matchup"
BEFORE INSERT OR UPDATE ON "FixtureAiPrediction"
FOR EACH ROW
EXECUTE FUNCTION sixfl_stamp_fixture_ai_prediction_matchup();

CREATE OR REPLACE FUNCTION sixfl_invalidate_fixture_ai_prediction_on_team_change()
RETURNS TRIGGER AS $$
BEGIN
  IF (
    OLD."homeTeamId" IS DISTINCT FROM NEW."homeTeamId"
    OR OLD."awayTeamId" IS DISTINCT FROM NEW."awayTeamId"
  ) AND NEW."status"::text = 'SCHEDULED'
    AND NEW."kickoffAt" > CURRENT_TIMESTAMP
  THEN
    DELETE FROM "FixtureAiPrediction"
    WHERE "fixtureId" = NEW."id";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "Fixture_invalidate_ai_prediction_on_team_change" ON "Fixture";
CREATE TRIGGER "Fixture_invalidate_ai_prediction_on_team_change"
AFTER UPDATE OF "homeTeamId", "awayTeamId" ON "Fixture"
FOR EACH ROW
EXECUTE FUNCTION sixfl_invalidate_fixture_ai_prediction_on_team_change();

-- Historical predictions keep the teams currently attached to the completed/past fixture.
UPDATE "FixtureAiPrediction" prediction
SET
  "homeTeamIdSnapshot" = fixture."homeTeamId",
  "awayTeamIdSnapshot" = fixture."awayTeamId"
FROM "Fixture" fixture
WHERE fixture."id" = prediction."fixtureId"
  AND (
    fixture."status"::text <> 'SCHEDULED'
    OR fixture."kickoffAt" <= CURRENT_TIMESTAMP
  );

-- Existing future prediction rows pre-date matchup snapshots, so we cannot prove
-- that their prose and score belong to the teams currently attached to the fixture.
-- Remove them once and let the normal pre-match predictor rebuild them before kick-off.
DELETE FROM "FixtureAiPrediction" prediction
USING "Fixture" fixture
WHERE fixture."id" = prediction."fixtureId"
  AND fixture."status"::text = 'SCHEDULED'
  AND fixture."kickoffAt" > CURRENT_TIMESTAMP;
