BEGIN;

CREATE TABLE IF NOT EXISTS "PlayerPaymentLinkEvent" (
  "sequence" BIGSERIAL UNIQUE,
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "feeId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "paymentToken" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "actorKind" TEXT NOT NULL,
  "actorUserId" TEXT,
  "actorName" TEXT,
  "actorRole" TEXT,
  "via" TEXT NOT NULL,
  "reason" TEXT,
  "sourceKey" TEXT UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "PlayerPaymentLinkEvent_feeId_paymentToken_createdAt_idx"
  ON "PlayerPaymentLinkEvent"("feeId","paymentToken","createdAt");
CREATE INDEX IF NOT EXISTS "PlayerPaymentLinkEvent_teamId_createdAt_idx"
  ON "PlayerPaymentLinkEvent"("teamId","createdAt");
CREATE INDEX IF NOT EXISTS "PlayerPaymentLinkEvent_actorUserId_createdAt_idx"
  ON "PlayerPaymentLinkEvent"("actorUserId","createdAt");

-- Existing links pre-date actor auditing, so preserve them honestly as legacy
-- records rather than guessing who created or ended them.
INSERT INTO "PlayerPaymentLinkEvent" (
  "feeId","teamId","paymentToken","eventType","actorKind","via","reason","sourceKey","createdAt"
)
SELECT
  h."feeId",h."teamId",h."paymentToken",'CREATED','LEGACY','Legacy payment-link history',
  'Actor was not recorded before payment-link actor auditing was introduced.',
  'legacy-created:'||h.id,h."createdAt"
FROM "PlayerPaymentLinkHistory" h
ON CONFLICT ("sourceKey") DO NOTHING;

INSERT INTO "PlayerPaymentLinkEvent" (
  "feeId","teamId","paymentToken","eventType","actorKind","via","reason","sourceKey","createdAt"
)
SELECT
  h."feeId",h."teamId",h."paymentToken",'REMOVED','LEGACY','Legacy payment-link history',
  COALESCE(h."removedReason",'Actor was not recorded before payment-link actor auditing was introduced.'),
  'legacy-removed:'||h.id,COALESCE(h."removedAt",h."updatedAt")
FROM "PlayerPaymentLinkHistory" h
WHERE h."isRemoved" = true
ON CONFLICT ("sourceKey") DO NOTHING;

INSERT INTO "PlayerPaymentLinkEvent" (
  "feeId","teamId","paymentToken","eventType","actorKind","via","reason","sourceKey","createdAt"
)
SELECT
  h."feeId",h."teamId",h."paymentToken",'CLOSED','LEGACY','Legacy payment-link history',
  CASE f.status::text
    WHEN 'PAID' THEN 'Player match fee was paid.'
    WHEN 'WAIVED' THEN 'Player match fee was waived / no charge.'
    WHEN 'CANCELLED' THEN 'Player match fee was cancelled.'
    ELSE 'Payment link is no longer payable.'
  END,
  'legacy-closed:'||h.id,h."updatedAt"
FROM "PlayerPaymentLinkHistory" h
JOIN "PlayerMatchFee" f ON f.id=h."feeId" AND f."paymentToken"=h."paymentToken"
WHERE h."isRemoved" = false
  AND f.status::text <> 'OPEN'
ON CONFLICT ("sourceKey") DO NOTHING;

-- Rebuild the existing history capture trigger so every future creation,
-- removal/replacement and non-removal closure records an actor event.
CREATE OR REPLACE FUNCTION sixfl_player_payment_link_history_capture()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  uid TEXT;
  pname TEXT;
  member_id TEXT;
  prospect_id TEXT;
  fixture_label TEXT;
  removal_reason TEXT;
  close_reason TEXT;
  history_id TEXT;
  ctx JSONB;
  actor_kind TEXT;
  actor_user_id TEXT;
  actor_name TEXT;
  actor_role TEXT;
  actor_via TEXT;
BEGIN
  ctx := COALESCE(
    NULLIF(current_setting('sixfl.player_payment_link_actor', true),''),
    '{}'
  )::jsonb;
  actor_kind := COALESCE(NULLIF(ctx->>'actorKind',''),'SYSTEM');
  actor_user_id := NULLIF(ctx->>'actorUserId','');
  actor_name := NULLIF(ctx->>'actorName','');
  actor_role := NULLIF(ctx->>'actorRole','');
  actor_via := COALESCE(NULLIF(ctx->>'via',''),'SIXFL system');

  IF TG_OP='DELETE' THEN
    IF OLD."paymentToken" IS NOT NULL THEN
      UPDATE "PlayerPaymentLinkHistory"
      SET "isRemoved"=true,
          "removedAt"=COALESCE("removedAt",CURRENT_TIMESTAMP),
          "removedReason"=COALESCE("removedReason",'Player fee record removed.'),
          "updatedAt"=CURRENT_TIMESTAMP
      WHERE "feeId"=OLD.id AND "paymentToken"=OLD."paymentToken";

      INSERT INTO "PlayerPaymentLinkEvent" (
        "feeId","teamId","paymentToken","eventType","actorKind",
        "actorUserId","actorName","actorRole","via","reason"
      )
      VALUES (
        OLD.id,OLD."teamId",OLD."paymentToken",'REMOVED',actor_kind,
        actor_user_id,actor_name,actor_role,actor_via,'Player fee record removed.'
      );
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP='UPDATE'
     AND OLD."paymentToken" IS NOT NULL
     AND OLD."paymentToken" IS DISTINCT FROM NEW."paymentToken" THEN
    removal_reason := CASE
      WHEN NEW.status::text='CANCELLED' THEN 'Payment link removed when the player fee was cancelled.'
      WHEN NEW.status::text='WAIVED' THEN 'Payment link removed when no individual payment was required.'
      WHEN NEW.status::text='PAID' THEN 'Payment link removed after payment was recorded.'
      WHEN NEW."paymentToken" IS NOT NULL THEN 'Payment link replaced by a new link.'
      ELSE 'Payment link removed.'
    END;

    UPDATE "PlayerPaymentLinkHistory"
    SET "isRemoved"=true,
        "removedAt"=COALESCE("removedAt",CURRENT_TIMESTAMP),
        "removedReason"=COALESCE("removedReason",removal_reason),
        "updatedAt"=CURRENT_TIMESTAMP
    WHERE "feeId"=OLD.id AND "paymentToken"=OLD."paymentToken";

    INSERT INTO "PlayerPaymentLinkEvent" (
      "feeId","teamId","paymentToken","eventType","actorKind",
      "actorUserId","actorName","actorRole","via","reason"
    )
    VALUES (
      OLD.id,OLD."teamId",OLD."paymentToken",'REMOVED',actor_kind,
      actor_user_id,actor_name,actor_role,actor_via,removal_reason
    );
  END IF;

  IF TG_OP='UPDATE'
     AND OLD.status::text='OPEN'
     AND NEW.status::text<>'OPEN'
     AND OLD."paymentToken" IS NOT NULL
     AND OLD."paymentToken" IS NOT DISTINCT FROM NEW."paymentToken" THEN
    close_reason := CASE NEW.status::text
      WHEN 'PAID' THEN 'Player match fee paid.'
      WHEN 'WAIVED' THEN 'Player match fee waived / no charge.'
      WHEN 'CANCELLED' THEN 'Player match fee cancelled.'
      ELSE 'Payment link closed.'
    END;

    INSERT INTO "PlayerPaymentLinkEvent" (
      "feeId","teamId","paymentToken","eventType","actorKind",
      "actorUserId","actorName","actorRole","via","reason"
    )
    VALUES (
      NEW.id,NEW."teamId",NEW."paymentToken",'CLOSED',actor_kind,
      actor_user_id,actor_name,actor_role,actor_via,close_reason
    );
  END IF;

  IF TG_OP='UPDATE'
     AND OLD.status::text<>'OPEN'
     AND NEW.status::text='OPEN'
     AND NEW."paymentToken" IS NOT NULL
     AND OLD."paymentToken" IS NOT DISTINCT FROM NEW."paymentToken" THEN
    INSERT INTO "PlayerPaymentLinkEvent" (
      "feeId","teamId","paymentToken","eventType","actorKind",
      "actorUserId","actorName","actorRole","via","reason"
    )
    VALUES (
      NEW.id,NEW."teamId",NEW."paymentToken",'REOPENED',actor_kind,
      actor_user_id,actor_name,actor_role,actor_via,'Payment link reopened.'
    );
  END IF;

  IF NEW."paymentToken" IS NULL OR NEW."paymentUrl" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT s."userId",s."playerName",s."teamMemberId",s."prospectId"
  INTO uid,pname,member_id,prospect_id
  FROM "PlayerFeeLedgerState" s
  WHERE s."feeId"=NEW.id;

  IF uid IS NULL AND NEW."teamMemberId" IS NOT NULL THEN
    SELECT m."userId",u.name INTO uid,pname
    FROM "TeamMember" m
    JOIN "User" u ON u.id=m."userId"
    WHERE m.id=NEW."teamMemberId";
  END IF;

  SELECT home.name||' vs '||away.name INTO fixture_label
  FROM "Fixture" fixture
  JOIN "Team" home ON home.id=fixture."homeTeamId"
  JOIN "Team" away ON away.id=fixture."awayTeamId"
  WHERE fixture.id=NEW."fixtureId";

  IF pname IS NULL AND NEW."prospectId" IS NOT NULL THEN
    SELECT NULLIF(TRIM(CONCAT(p."firstName",' ',p."lastName")),'')
    INTO pname
    FROM "TeamPlayerProspect" p
    WHERE p.id=NEW."prospectId";
  END IF;

  INSERT INTO "PlayerPaymentLinkHistory" (
    "feeId","teamId","fixtureId","teamMemberId","prospectId","userId","playerName",
    "fixtureLabel","amountPence","paymentToken","paymentUrl","source","createdAt","updatedAt"
  )
  VALUES (
    NEW.id,NEW."teamId",NEW."fixtureId",
    COALESCE(member_id,NEW."teamMemberId"),
    COALESCE(prospect_id,NEW."prospectId"),
    uid,pname,fixture_label,NEW."amountPence",NEW."paymentToken",NEW."paymentUrl",'LIVE',
    CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
  )
  ON CONFLICT ("feeId","paymentToken") DO NOTHING
  RETURNING id INTO history_id;

  IF history_id IS NOT NULL THEN
    INSERT INTO "PlayerPaymentLinkEvent" (
      "feeId","teamId","paymentToken","eventType","actorKind",
      "actorUserId","actorName","actorRole","via","reason"
    )
    VALUES (
      NEW.id,NEW."teamId",NEW."paymentToken",'CREATED',actor_kind,
      actor_user_id,actor_name,actor_role,actor_via,'Payment link created.'
    );
  END IF;

  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION sixfl_player_payment_link_event_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Player payment-link events are append-only.';
END $$;

DROP TRIGGER IF EXISTS sixfl_player_payment_link_event_immutable_trigger ON "PlayerPaymentLinkEvent";
CREATE TRIGGER sixfl_player_payment_link_event_immutable_trigger
BEFORE UPDATE OR DELETE ON "PlayerPaymentLinkEvent"
FOR EACH ROW EXECUTE FUNCTION sixfl_player_payment_link_event_immutable();

COMMIT;
