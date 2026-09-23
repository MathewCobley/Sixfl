BEGIN;

CREATE TABLE IF NOT EXISTS "PlayerPaymentLinkHistory" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "feeId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "fixtureId" TEXT NOT NULL,
  "teamMemberId" TEXT,
  "prospectId" TEXT,
  "userId" TEXT,
  "playerName" TEXT,
  "fixtureLabel" TEXT,
  "amountPence" INTEGER,
  "paymentToken" TEXT NOT NULL,
  "paymentUrl" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'LIVE',
  "firstOpenedAt" TIMESTAMP(3),
  "lastOpenedAt" TIMESTAMP(3),
  "openCount" INTEGER NOT NULL DEFAULT 0 CHECK ("openCount" >= 0),
  "isRemoved" BOOLEAN NOT NULL DEFAULT false,
  "removedAt" TIMESTAMP(3),
  "removedReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlayerPaymentLinkHistory_feeId_paymentToken_key" UNIQUE ("feeId","paymentToken")
);

CREATE INDEX IF NOT EXISTS "PlayerPaymentLinkHistory_teamId_userId_createdAt_idx"
  ON "PlayerPaymentLinkHistory"("teamId","userId","createdAt");
CREATE INDEX IF NOT EXISTS "PlayerPaymentLinkHistory_teamId_teamMemberId_createdAt_idx"
  ON "PlayerPaymentLinkHistory"("teamId","teamMemberId","createdAt");
CREATE INDEX IF NOT EXISTS "PlayerPaymentLinkHistory_teamId_prospectId_createdAt_idx"
  ON "PlayerPaymentLinkHistory"("teamId","prospectId","createdAt");
CREATE INDEX IF NOT EXISTS "PlayerPaymentLinkHistory_feeId_createdAt_idx"
  ON "PlayerPaymentLinkHistory"("feeId","createdAt");

-- Recover distinct links that were previously sent by email/SMS. These rows
-- remain useful even if the current PlayerMatchFee link has since been cleared.
WITH sent_links AS (
  SELECT DISTINCT ON (d."sourceId", d.metadata->>'paymentUrl')
    d."sourceId" AS "feeId",
    s."teamId",
    s."fixtureId",
    s."teamMemberId",
    s."prospectId",
    s."userId",
    s."playerName",
    COALESCE(NULLIF(d.variables->>'fixtureLabel',''), NULLIF(d.variables->>'fixtureName','')) AS fixture_label,
    f."amountPence" AS amount_pence,
    substring(d.metadata->>'paymentUrl' from '/pay/player-match-fee/([^/?#]+)') AS token,
    d.metadata->>'paymentUrl' AS url,
    d."createdAt",
    f."paymentToken" AS current_token,
    f."paymentUrl" AS current_url
  FROM "NotificationDispatch" d
  JOIN "PlayerFeeLedgerState" s ON s."feeId" = d."sourceId"
  LEFT JOIN "PlayerMatchFee" f ON f.id = d."sourceId"
  WHERE d."sourceType" IN (
    'PLAYER_MATCH_FEE_REQUEST',
    'PLAYER_MATCH_FEE_CHASE_24H',
    'PLAYER_MATCH_FEE_CHASE_72H'
  )
    AND NULLIF(d.metadata->>'paymentUrl','') IS NOT NULL
    AND substring(d.metadata->>'paymentUrl' from '/pay/player-match-fee/([^/?#]+)') IS NOT NULL
  ORDER BY d."sourceId", d.metadata->>'paymentUrl', d."createdAt" ASC
)
INSERT INTO "PlayerPaymentLinkHistory" (
  "feeId","teamId","fixtureId","teamMemberId","prospectId","userId","playerName",
  "fixtureLabel","amountPence","paymentToken","paymentUrl","source","isRemoved","removedReason","createdAt","updatedAt"
)
SELECT
  "feeId","teamId","fixtureId","teamMemberId","prospectId","userId","playerName",
  fixture_label,amount_pence,token,url,'NOTIFICATION_BACKFILL',
  NOT (current_token IS NOT DISTINCT FROM token AND current_url IS NOT DISTINCT FROM url),
  CASE
    WHEN current_token IS NOT DISTINCT FROM token AND current_url IS NOT DISTINCT FROM url THEN NULL
    ELSE 'Historical link is no longer active; exact removal time was not recorded by the legacy system.'
  END,
  "createdAt","createdAt"
FROM sent_links
ON CONFLICT ("feeId","paymentToken") DO NOTHING;

-- Capture current links that were never sent through the notification system.
INSERT INTO "PlayerPaymentLinkHistory" (
  "feeId","teamId","fixtureId","teamMemberId","prospectId","userId","playerName",
  "fixtureLabel","amountPence","paymentToken","paymentUrl","source","isRemoved","createdAt","updatedAt"
)
SELECT
  f.id,f."teamId",f."fixtureId",s."teamMemberId",s."prospectId",s."userId",s."playerName",
  home.name||' vs '||away.name,f."amountPence",
  f."paymentToken",f."paymentUrl",'CURRENT_BACKFILL',false,f."updatedAt",f."updatedAt"
FROM "PlayerMatchFee" f
JOIN "PlayerFeeLedgerState" s ON s."feeId"=f.id
JOIN "Fixture" fixture ON fixture.id=f."fixtureId"
JOIN "Team" home ON home.id=fixture."homeTeamId"
JOIN "Team" away ON away.id=fixture."awayTeamId"
WHERE f."paymentToken" IS NOT NULL AND f."paymentUrl" IS NOT NULL
ON CONFLICT ("feeId","paymentToken") DO UPDATE SET
  "isRemoved"=false,
  "removedAt"=NULL,
  "removedReason"=NULL;

CREATE OR REPLACE FUNCTION sixfl_player_payment_link_history_capture()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  uid TEXT;
  pname TEXT;
  member_id TEXT;
  prospect_id TEXT;
  fixture_label TEXT;
  removal_reason TEXT;
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD."paymentToken" IS NOT NULL THEN
      UPDATE "PlayerPaymentLinkHistory"
      SET "isRemoved"=true,
          "removedAt"=COALESCE("removedAt",CURRENT_TIMESTAMP),
          "removedReason"=COALESCE("removedReason",'Player fee record removed.'),
          "updatedAt"=CURRENT_TIMESTAMP
      WHERE "feeId"=OLD.id AND "paymentToken"=OLD."paymentToken";
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
  ON CONFLICT ("feeId","paymentToken") DO NOTHING;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS sixfl_player_payment_link_history_capture_trigger ON "PlayerMatchFee";
CREATE TRIGGER sixfl_player_payment_link_history_capture_trigger
AFTER INSERT OR UPDATE OR DELETE ON "PlayerMatchFee"
FOR EACH ROW EXECUTE FUNCTION sixfl_player_payment_link_history_capture();

-- Link identity/snapshot fields are immutable. Only lifecycle fields may change.
CREATE OR REPLACE FUNCTION sixfl_player_payment_link_history_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'Player payment-link history is permanent. Mark the link removed instead of deleting its audit record.';
  END IF;

  IF NEW."feeId" IS DISTINCT FROM OLD."feeId"
     OR NEW."teamId" IS DISTINCT FROM OLD."teamId"
     OR NEW."fixtureId" IS DISTINCT FROM OLD."fixtureId"
     OR NEW."teamMemberId" IS DISTINCT FROM OLD."teamMemberId"
     OR NEW."prospectId" IS DISTINCT FROM OLD."prospectId"
     OR NEW."userId" IS DISTINCT FROM OLD."userId"
     OR NEW."playerName" IS DISTINCT FROM OLD."playerName"
     OR NEW."fixtureLabel" IS DISTINCT FROM OLD."fixtureLabel"
     OR NEW."amountPence" IS DISTINCT FROM OLD."amountPence"
     OR NEW."paymentToken" IS DISTINCT FROM OLD."paymentToken"
     OR NEW."paymentUrl" IS DISTINCT FROM OLD."paymentUrl"
     OR NEW."source" IS DISTINCT FROM OLD."source"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'Player payment-link identity and original URL are immutable.';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS sixfl_player_payment_link_history_guard_trigger ON "PlayerPaymentLinkHistory";
CREATE TRIGGER sixfl_player_payment_link_history_guard_trigger
BEFORE UPDATE OR DELETE ON "PlayerPaymentLinkHistory"
FOR EACH ROW EXECUTE FUNCTION sixfl_player_payment_link_history_guard();

COMMIT;
