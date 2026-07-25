-- Database-level guard rails for fixture placeholder teams.

ALTER TABLE "Team"
  DROP CONSTRAINT IF EXISTS "Team_fixture_placeholder_not_direct_league_check";

ALTER TABLE "Team"
  ADD CONSTRAINT "Team_fixture_placeholder_not_direct_league_check"
  CHECK (
    "isFixturePlaceholder" = false
    OR ("leagueId" IS NULL AND "divisionId" IS NULL)
  );

CREATE OR REPLACE FUNCTION sixfl_fixture_contains_placeholder(target_fixture_id TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "Fixture" fixture
    JOIN "Team" home_team ON home_team."id" = fixture."homeTeamId"
    JOIN "Team" away_team ON away_team."id" = fixture."awayTeamId"
    WHERE fixture."id" = target_fixture_id
      AND (
        home_team."isFixturePlaceholder" = true
        OR away_team."isFixturePlaceholder" = true
      )
  );
$$;

CREATE OR REPLACE FUNCTION sixfl_block_placeholder_match_result()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF sixfl_fixture_contains_placeholder(NEW."fixtureId") THEN
    RAISE EXCEPTION 'Replace TBC with the confirmed team before entering a result.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "MatchResult_block_fixture_placeholder" ON "MatchResult";
CREATE TRIGGER "MatchResult_block_fixture_placeholder"
BEFORE INSERT OR UPDATE ON "MatchResult"
FOR EACH ROW
EXECUTE FUNCTION sixfl_block_placeholder_match_result();

CREATE OR REPLACE FUNCTION sixfl_block_placeholder_fixture_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  home_is_placeholder BOOLEAN;
  away_is_placeholder BOOLEAN;
BEGIN
  IF NEW."status"::text <> 'COMPLETED' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE("isFixturePlaceholder", false)
  INTO home_is_placeholder
  FROM "Team"
  WHERE "id" = NEW."homeTeamId";

  SELECT COALESCE("isFixturePlaceholder", false)
  INTO away_is_placeholder
  FROM "Team"
  WHERE "id" = NEW."awayTeamId";

  IF home_is_placeholder OR away_is_placeholder THEN
    RAISE EXCEPTION 'Replace TBC with the confirmed team before completing the fixture.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "Fixture_block_placeholder_completion" ON "Fixture";
CREATE TRIGGER "Fixture_block_placeholder_completion"
BEFORE INSERT OR UPDATE OF "status", "homeTeamId", "awayTeamId" ON "Fixture"
FOR EACH ROW
EXECUTE FUNCTION sixfl_block_placeholder_fixture_completion();

CREATE OR REPLACE FUNCTION sixfl_block_placeholder_payment_charge()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Team"
    WHERE "id" = NEW."teamId"
      AND "isFixturePlaceholder" = true
  ) THEN
    RAISE EXCEPTION 'Fixture placeholder teams cannot receive payment charges.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "PaymentCharge_block_fixture_placeholder" ON "PaymentCharge";
CREATE TRIGGER "PaymentCharge_block_fixture_placeholder"
BEFORE INSERT OR UPDATE OF "teamId" ON "PaymentCharge"
FOR EACH ROW
EXECUTE FUNCTION sixfl_block_placeholder_payment_charge();

CREATE OR REPLACE FUNCTION sixfl_block_placeholder_confirmation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF sixfl_fixture_contains_placeholder(NEW."fixtureId") THEN
    RAISE EXCEPTION 'TBC fixtures do not use captain confirmations.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "FixtureCaptainConfirmation_block_placeholder" ON "FixtureCaptainConfirmation";
CREATE TRIGGER "FixtureCaptainConfirmation_block_placeholder"
BEFORE INSERT OR UPDATE ON "FixtureCaptainConfirmation"
FOR EACH ROW
EXECUTE FUNCTION sixfl_block_placeholder_confirmation();

CREATE OR REPLACE FUNCTION sixfl_block_placeholder_prediction()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF sixfl_fixture_contains_placeholder(NEW."fixtureId") THEN
    RAISE EXCEPTION 'TBC fixtures do not receive AI predictions.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "FixtureAiPrediction_block_placeholder" ON "FixtureAiPrediction";
CREATE TRIGGER "FixtureAiPrediction_block_placeholder"
BEFORE INSERT OR UPDATE ON "FixtureAiPrediction"
FOR EACH ROW
EXECUTE FUNCTION sixfl_block_placeholder_prediction();

CREATE OR REPLACE FUNCTION sixfl_limit_placeholder_per_league()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."isActive" = true AND EXISTS (
    SELECT 1
    FROM "Team"
    WHERE "id" = NEW."teamId"
      AND "isFixturePlaceholder" = true
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM "LeagueSeasonTeam" other_membership
      JOIN "Team" other_team ON other_team."id" = other_membership."teamId"
      WHERE other_membership."leagueId" = NEW."leagueId"
        AND other_membership."isActive" = true
        AND other_membership."teamId" <> NEW."teamId"
        AND other_team."isFixturePlaceholder" = true
    ) THEN
      RAISE EXCEPTION 'This league already has a fixture placeholder team.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "LeagueSeasonTeam_limit_fixture_placeholder" ON "LeagueSeasonTeam";
CREATE TRIGGER "LeagueSeasonTeam_limit_fixture_placeholder"
BEFORE INSERT OR UPDATE OF "leagueId", "teamId", "isActive" ON "LeagueSeasonTeam"
FOR EACH ROW
EXECUTE FUNCTION sixfl_limit_placeholder_per_league();
