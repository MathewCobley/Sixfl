-- A fixture containing TBC must not create a charge for either side.

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

  IF NEW."fixtureId" IS NOT NULL
     AND sixfl_fixture_contains_placeholder(NEW."fixtureId") THEN
    RAISE EXCEPTION 'TBC fixtures cannot create payment charges until the team is confirmed.';
  END IF;

  RETURN NEW;
END;
$$;
