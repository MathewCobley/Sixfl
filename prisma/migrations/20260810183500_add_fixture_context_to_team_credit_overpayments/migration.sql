-- Keep automatically generated team-credit overpayments traceable to the exact
-- fixture that created them. The credit ledger already stores sourceFixtureId;
-- this function makes that source visible anywhere the ledger description is
-- rendered, including both admin and captain payment views.

CREATE OR REPLACE FUNCTION "sixfl_team_credit_fixture_description"(
  base_description TEXT,
  source_fixture_id TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
  fixture_context TEXT;
  clean_description TEXT;
BEGIN
  IF source_fixture_id IS NULL OR BTRIM(source_fixture_id) = '' THEN
    RETURN base_description;
  END IF;

  SELECT
    home_team."name" || ' vs ' || away_team."name" || ' · ' ||
    TO_CHAR(
      fixture."kickoffAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/London',
      'Dy DD Mon YYYY, HH24:MI'
    )
  INTO fixture_context
  FROM "Fixture" fixture
  INNER JOIN "Team" home_team ON home_team."id" = fixture."homeTeamId"
  INNER JOIN "Team" away_team ON away_team."id" = fixture."awayTeamId"
  WHERE fixture."id" = source_fixture_id
  LIMIT 1;

  IF fixture_context IS NULL OR BTRIM(fixture_context) = '' THEN
    RETURN base_description;
  END IF;

  -- Rebuild the suffix rather than repeatedly appending it when the automatic
  -- overpayment synchroniser upserts the same ledger entry again.
  clean_description := REGEXP_REPLACE(
    COALESCE(base_description, ''),
    '\s+Source fixture:.*$',
    '',
    'i'
  );
  clean_description := BTRIM(clean_description);

  IF clean_description = '' THEN
    RETURN 'Source fixture: ' || fixture_context || '.';
  END IF;

  RETURN clean_description || ' Source fixture: ' || fixture_context || '.';
END;
$function$;

CREATE OR REPLACE FUNCTION "sixfl_add_team_credit_fixture_context"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW."entryType" = 'CREDIT_ADDED'::"TeamCreditLedgerEntryType"
     AND NEW."sourceFixtureId" IS NOT NULL
     AND NEW."id" LIKE 'tcred_player_overpay_%' THEN
    NEW."description" := "sixfl_team_credit_fixture_description"(
      NEW."description",
      NEW."sourceFixtureId"
    );
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS "TeamCreditLedgerEntry_fixture_context" ON "TeamCreditLedgerEntry";
CREATE TRIGGER "TeamCreditLedgerEntry_fixture_context"
BEFORE INSERT OR UPDATE OF "description", "sourceFixtureId", "entryType"
ON "TeamCreditLedgerEntry"
FOR EACH ROW
EXECUTE FUNCTION "sixfl_add_team_credit_fixture_context"();

-- Backfill existing automatic overpayment entries immediately so historical
-- credit rows gain the fixture name and kickoff without waiting for a new
-- payment event.
UPDATE "TeamCreditLedgerEntry"
SET "description" = "sixfl_team_credit_fixture_description"(
  "description",
  "sourceFixtureId"
)
WHERE "entryType" = 'CREDIT_ADDED'::"TeamCreditLedgerEntryType"
  AND "sourceFixtureId" IS NOT NULL
  AND "id" LIKE 'tcred_player_overpay_%';
