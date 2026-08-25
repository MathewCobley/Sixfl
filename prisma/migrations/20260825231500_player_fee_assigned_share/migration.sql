ALTER TABLE "PlayerMatchFee"
  ADD COLUMN IF NOT EXISTS "captainAssignedAmountPence" INTEGER;

-- Recover the original captain-entered share from existing capped-payment notes
-- where that information is already available. Do not guess legacy values when
-- there is no reliable source for the captain's original amount.
UPDATE "PlayerMatchFee"
SET "captainAssignedAmountPence" = ROUND(
  REPLACE(
    SUBSTRING(
      "note" FROM 'Player fee cap applied: captain share £([0-9,.]+);'
    ),
    ',',
    ''
  )::numeric * 100
)::integer
WHERE "captainAssignedAmountPence" IS NULL
  AND "note" ~* 'Player fee cap applied: captain share £[0-9,.]+;';

UPDATE "PlayerMatchFee"
SET "captainAssignedAmountPence" = "amountPence"
WHERE "captainAssignedAmountPence" IS NULL;

DO $$
BEGIN
  ALTER TABLE "PlayerMatchFee"
    ADD CONSTRAINT "PlayerMatchFee_captainAssignedAmountPence_nonnegative"
    CHECK ("captainAssignedAmountPence" >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION sixfl_preserve_player_fee_assigned_share()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  captain_share_text text;
  captain_share_pence integer;
BEGIN
  captain_share_text := SUBSTRING(
    COALESCE(NEW."note", '') FROM
    'Player fee cap applied: captain share £([0-9,.]+);'
  );

  IF captain_share_text IS NOT NULL THEN
    captain_share_pence := ROUND(
      REPLACE(captain_share_text, ',', '')::numeric * 100
    )::integer;
    NEW."captainAssignedAmountPence" := captain_share_pence;
  ELSIF TG_OP = 'INSERT' THEN
    NEW."captainAssignedAmountPence" := COALESCE(
      NEW."captainAssignedAmountPence",
      NEW."amountPence"
    );
  ELSIF OLD."status"::text = 'OPEN'
    AND NEW."status"::text = 'OPEN'
    AND NEW."amountPence" IS DISTINCT FROM OLD."amountPence" THEN
    -- An open fee being edited is a new captain allocation. For an actual cap,
    -- the structured cap note above takes precedence and preserves the larger
    -- captain-entered share while amountPence remains the amount charged.
    NEW."captainAssignedAmountPence" := NEW."amountPence";
  ELSE
    -- Stripe completion is allowed to synchronise amountPence to the amount
    -- actually charged, but it must never rewrite the captain's allocation.
    NEW."captainAssignedAmountPence" := COALESCE(
      NEW."captainAssignedAmountPence",
      OLD."captainAssignedAmountPence",
      NEW."amountPence"
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "PlayerMatchFee_preserve_assigned_share" ON "PlayerMatchFee";
CREATE TRIGGER "PlayerMatchFee_preserve_assigned_share"
BEFORE INSERT OR UPDATE ON "PlayerMatchFee"
FOR EACH ROW
EXECUTE FUNCTION sixfl_preserve_player_fee_assigned_share();
