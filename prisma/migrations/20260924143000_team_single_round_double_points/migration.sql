-- Add an opt-in team scheduling rule for leagues where one team can only play
-- each opponent once, with that single fixture carrying double league points.
ALTER TABLE "Team"
  ADD COLUMN "playsOnceDoublePoints" BOOLEAN NOT NULL DEFAULT FALSE;

-- Snapshot the points treatment onto the fixture so historic standings do not
-- change merely because an admin later changes the team setting.
ALTER TABLE "Fixture"
  ADD COLUMN "doublePoints" BOOLEAN NOT NULL DEFAULT FALSE;

-- Any newly-created fixture involving an opted-in team is automatically marked
-- as double points, including manual fixture creation paths.
CREATE OR REPLACE FUNCTION sixfl_set_fixture_double_points()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT'
     OR NEW."homeTeamId" IS DISTINCT FROM OLD."homeTeamId"
     OR NEW."awayTeamId" IS DISTINCT FROM OLD."awayTeamId" THEN
    SELECT EXISTS (
      SELECT 1
      FROM "Team" t
      WHERE t."id" IN (NEW."homeTeamId", NEW."awayTeamId")
        AND COALESCE(t."playsOnceDoublePoints", FALSE) = TRUE
    )
    INTO NEW."doublePoints";
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "Fixture_set_double_points" ON "Fixture";
CREATE TRIGGER "Fixture_set_double_points"
BEFORE INSERT OR UPDATE OF "homeTeamId", "awayTeamId"
ON "Fixture"
FOR EACH ROW
EXECUTE FUNCTION sixfl_set_fixture_double_points();
