-- TBC is a fixture placeholder only. A real team playing a fixture against TBC
-- must still receive its normal match-fee charge. Only the placeholder itself is
-- forbidden from receiving a PaymentCharge.
--
-- This supersedes 20260725200000_block_all_tbc_fixture_charges, which blocked
-- charges for both sides whenever either side of the fixture was TBC.

CREATE OR REPLACE FUNCTION sixfl_block_placeholder_payment_charge()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Team"
    WHERE "id" = NEW."teamId"
      AND COALESCE("isFixturePlaceholder", false) = true
  ) THEN
    RAISE EXCEPTION 'Fixture placeholder teams cannot receive payment charges.';
  END IF;

  RETURN NEW;
END;
$$;
