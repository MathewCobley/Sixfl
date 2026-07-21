-- Keep injured players unavailable even if an old or crafted form submits another response.

CREATE OR REPLACE FUNCTION prevent_injured_fixture_availability_override()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."response" <> 'UNAVAILABLE'
     AND EXISTS (
       SELECT 1
       FROM "TeamMember" tm
       WHERE tm."id" = NEW."teamMemberId"
         AND tm."squadStatus" = 'INJURED'
     ) THEN
    RAISE EXCEPTION 'Injured players must remain unavailable until their squad status is changed.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "FixtureAvailability_prevent_injured_insert" ON "FixtureAvailability";
DROP TRIGGER IF EXISTS "FixtureAvailability_prevent_injured_update" ON "FixtureAvailability";

CREATE TRIGGER "FixtureAvailability_prevent_injured_insert"
BEFORE INSERT ON "FixtureAvailability"
FOR EACH ROW
EXECUTE FUNCTION prevent_injured_fixture_availability_override();

CREATE TRIGGER "FixtureAvailability_prevent_injured_update"
BEFORE UPDATE OF "response" ON "FixtureAvailability"
FOR EACH ROW
EXECUTE FUNCTION prevent_injured_fixture_availability_override();
