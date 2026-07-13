ALTER TABLE "PaymentTransaction"
  ADD COLUMN IF NOT EXISTS "playerMatchFeeId" TEXT;

CREATE INDEX IF NOT EXISTS "PaymentTransaction_playerMatchFeeId_idx"
  ON "PaymentTransaction" ("playerMatchFeeId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'PaymentTransaction_playerMatchFeeId_fkey'
  ) THEN
    ALTER TABLE "PaymentTransaction"
      ADD CONSTRAINT "PaymentTransaction_playerMatchFeeId_fkey"
      FOREIGN KEY ("playerMatchFeeId") REFERENCES "PlayerMatchFee"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION "sixfl_enrich_player_payment_notes"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  fee_id TEXT;
  payer_name TEXT;
  payer_contact TEXT;
  fixture_label TEXT;
  searchable_line TEXT;
BEGIN
  fee_id := NULLIF(BTRIM(NEW."playerMatchFeeId"), '');

  IF fee_id IS NULL THEN
    fee_id := NULLIF(
      BTRIM(SUBSTRING(COALESCE(NEW."notes", '') FROM 'Player fee ID:\s*([A-Za-z0-9_-]+)')),
      ''
    );
  END IF;

  IF fee_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT
    COALESCE(
      NULLIF(BTRIM(CONCAT(prospect."firstName", ' ', prospect."lastName")), ''),
      NULLIF(BTRIM(u."name"), ''),
      NULLIF(BTRIM(u."email"), ''),
      NULLIF(BTRIM(prospect."email"), ''),
      NULLIF(BTRIM(prospect."phone"), ''),
      'Player'
    ) AS payer_name,
    NULLIF(
      BTRIM(
        CONCAT_WS(
          ' · ',
          NULLIF(BTRIM(u."email"), ''),
          NULLIF(BTRIM(prospect."email"), ''),
          NULLIF(BTRIM(prospect."phone"), '')
        )
      ),
      ''
    ) AS payer_contact,
    CASE
      WHEN home."name" IS NOT NULL AND away."name" IS NOT NULL
        THEN home."name" || ' vs ' || away."name"
      ELSE NULL
    END AS fixture_label
  INTO payer_name, payer_contact, fixture_label
  FROM "PlayerMatchFee" pmf
  LEFT JOIN "TeamMember" tm ON tm."id" = pmf."teamMemberId"
  LEFT JOIN "User" u ON u."id" = tm."userId"
  LEFT JOIN "TeamPlayerProspect" prospect ON prospect."id" = pmf."prospectId"
  LEFT JOIN "Fixture" fixture ON fixture."id" = pmf."fixtureId"
  LEFT JOIN "Team" home ON home."id" = fixture."homeTeamId"
  LEFT JOIN "Team" away ON away."id" = fixture."awayTeamId"
  WHERE pmf."id" = fee_id
  LIMIT 1;

  NEW."playerMatchFeeId" := fee_id;

  IF payer_name IS NULL AND payer_contact IS NULL AND fixture_label IS NULL THEN
    RETURN NEW;
  END IF;

  searchable_line := CONCAT_WS(
    ' · ',
    'Player fee payer: ' || payer_name,
    payer_contact,
    fixture_label
  );

  IF searchable_line IS NOT NULL
    AND BTRIM(searchable_line) <> ''
    AND POSITION(searchable_line IN COALESCE(NEW."notes", '')) = 0 THEN
    NEW."notes" := BTRIM(CONCAT_WS(E'\n', NULLIF(NEW."notes", ''), searchable_line));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "sixfl_enrich_player_payment_notes_trigger" ON "PaymentTransaction";

CREATE TRIGGER "sixfl_enrich_player_payment_notes_trigger"
BEFORE INSERT OR UPDATE OF "notes", "playerMatchFeeId" ON "PaymentTransaction"
FOR EACH ROW
EXECUTE FUNCTION "sixfl_enrich_player_payment_notes"();

UPDATE "PaymentTransaction"
SET "playerMatchFeeId" = NULLIF(
  BTRIM(SUBSTRING(COALESCE("notes", '') FROM 'Player fee ID:\s*([A-Za-z0-9_-]+)')),
  ''
)
WHERE "playerMatchFeeId" IS NULL
  AND COALESCE("notes", '') ~* 'Player fee ID:\s*[A-Za-z0-9_-]+';

UPDATE "PaymentTransaction"
SET "notes" = "notes"
WHERE "playerMatchFeeId" IS NOT NULL;
