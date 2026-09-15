-- One-time reconciliation for Veo bookings confirmed before SIXFL started adding
-- the agreed £5 Priority charge at booking confirmation time.
--
-- Only accepted £5 requests on still-active PLANNED/READY bookings are touched.
-- Existing linked charges are left alone. If a matching non-void Veo charge already
-- exists but lost its request link, it is re-linked instead of duplicated.
DO $$
DECLARE
  rec RECORD;
  existing_charge_id TEXT;
  generated_charge_id TEXT;
BEGIN
  FOR rec IN
    SELECT
      r."fixtureId",
      r."teamId",
      r."leagueId",
      f."kickoffAt",
      h.name AS "homeName",
      a.name AS "awayName"
    FROM "VeoFixtureRequest" r
    JOIN "VeoMatchBooking" b ON b."fixtureId" = r."fixtureId"
    JOIN "Fixture" f ON f.id = r."fixtureId"
    JOIN "Team" h ON h.id = f."homeTeamId"
    JOIN "Team" a ON a.id = f."awayTeamId"
    JOIN "Team" t ON t.id = r."teamId"
    WHERE r.status::text = 'ACCEPTED'
      AND r."agreedPence" = 500
      AND r."chargeId" IS NULL
      AND b.state::text IN ('PLANNED', 'READY')
      AND t."teamMode"::text = 'STANDARD'
    ORDER BY r."fixtureId", r."teamId"
  LOOP
    existing_charge_id := NULL;

    SELECT pc.id
    INTO existing_charge_id
    FROM "PaymentCharge" pc
    WHERE pc."teamId" = rec."teamId"
      AND pc."leagueId" IS NOT DISTINCT FROM rec."leagueId"
      AND pc."amountPence" = 500
      AND pc.status::text <> 'VOID'
      AND COALESCE(pc.description, '') LIKE ('%fixture ' || rec."fixtureId" || '%')
    ORDER BY pc."createdAt" DESC
    LIMIT 1;

    IF existing_charge_id IS NULL THEN
      generated_charge_id := 'veo_backfill_' || md5(rec."fixtureId" || ':' || rec."teamId");

      INSERT INTO "PaymentCharge" (
        id,
        "teamId",
        "leagueId",
        "fixtureId",
        title,
        description,
        "amountPence",
        "dueDate",
        status,
        "latePaymentFeeStatus",
        "latePaymentFeeNote",
        "paymentToken",
        "createdAt",
        "updatedAt"
      ) VALUES (
        generated_charge_id,
        rec."teamId",
        rec."leagueId",
        NULL,
        'Veo Priority — ' || rec."homeName" || ' vs ' || rec."awayName" || ' (' ||
          to_char(rec."kickoffAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/London', 'YYYY-MM-DD') || ')',
        'Optional filming confirmed for fixture ' || rec."fixtureId" ||
          '. The £5 Veo Priority charge is included before the match so the team balance is correct when squad payments are arranged. If filming fails or usable footage is not produced, this charge is voided and money received is returned to team credit.',
        500,
        rec."kickoffAt",
        'OPEN',
        'WAIVED',
        'No late fee on optional Veo recording.',
        md5(gen_random_uuid()::text) || md5(gen_random_uuid()::text),
        NOW(),
        NOW()
      )
      ON CONFLICT (id) DO NOTHING;

      existing_charge_id := generated_charge_id;
    END IF;

    UPDATE "VeoFixtureRequest"
    SET "chargeId" = existing_charge_id,
        revision = revision + 1
    WHERE "fixtureId" = rec."fixtureId"
      AND "teamId" = rec."teamId"
      AND status::text = 'ACCEPTED'
      AND "agreedPence" = 500
      AND "chargeId" IS NULL;
  END LOOP;
END $$;
