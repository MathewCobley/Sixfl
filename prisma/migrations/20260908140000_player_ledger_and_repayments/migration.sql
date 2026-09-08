-- Add an independent, append-only player statement. Existing balances are
-- imported exactly as currently stored; historical fee reductions are NOT undone.
CREATE TABLE IF NOT EXISTS "PlayerFeeLedgerState" (
  "feeId" TEXT PRIMARY KEY, "teamId" TEXT NOT NULL, "fixtureId" TEXT NOT NULL,
  "teamMemberId" TEXT, "prospectId" TEXT, "userId" TEXT, "playerName" TEXT,
  "openingAmountPence" INTEGER NOT NULL, "balancePence" INTEGER NOT NULL CHECK ("balancePence" >= 0),
  "receivedPence" INTEGER NOT NULL DEFAULT 0 CHECK ("receivedPence" >= 0),
  "captainReceivedPence" INTEGER NOT NULL DEFAULT 0 CHECK ("captainReceivedPence" >= 0),
  "controlled" BOOLEAN NOT NULL DEFAULT false, "collectionPaused" BOOLEAN NOT NULL DEFAULT false,
  "planId" TEXT, "version" INTEGER NOT NULL DEFAULT 0, "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "PlayerFeeLedgerState_teamId_userId_idx" ON "PlayerFeeLedgerState"("teamId","userId");
CREATE INDEX IF NOT EXISTS "PlayerFeeLedgerState_teamId_teamMemberId_idx" ON "PlayerFeeLedgerState"("teamId","teamMemberId");
CREATE INDEX IF NOT EXISTS "PlayerFeeLedgerState_teamId_prospectId_idx" ON "PlayerFeeLedgerState"("teamId","prospectId");
CREATE INDEX IF NOT EXISTS "PlayerFeeLedgerState_planId_idx" ON "PlayerFeeLedgerState"("planId");
CREATE TABLE IF NOT EXISTS "PlayerLedgerEntry" (
  "sequence" BIGSERIAL UNIQUE,
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text, "feeId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL, "kind" TEXT NOT NULL, "amountPence" INTEGER NOT NULL,
  "balanceAfterPence" INTEGER NOT NULL, "receiptPence" INTEGER NOT NULL DEFAULT 0,
  "receivedBy" TEXT, "actorUserId" TEXT, "reason" TEXT NOT NULL, "reference" TEXT,
  "sourceKey" TEXT UNIQUE, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "PlayerLedgerEntry_teamId_feeId_createdAt_idx" ON "PlayerLedgerEntry"("teamId","feeId","createdAt");
CREATE TABLE IF NOT EXISTS "PlayerRepaymentPlan" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text, "teamId" TEXT NOT NULL,
  "anchorFeeId" TEXT NOT NULL, "token" TEXT NOT NULL UNIQUE,
  "instalmentPence" INTEGER NOT NULL CHECK ("instalmentPence" >= 50),
  "instalmentPaidPence" INTEGER NOT NULL DEFAULT 0,
  "nextDueAt" TIMESTAMP(3) NOT NULL, "intervalDays" INTEGER NOT NULL DEFAULT 7 CHECK ("intervalDays" IN (7,14,28)),
  "status" TEXT NOT NULL DEFAULT 'ACTIVE' CHECK ("status" IN ('ACTIVE','PAUSED','ENDED','COMPLETED','REVIEW')),
  "reason" TEXT NOT NULL, "createdByUserId" TEXT NOT NULL, "activeRequestId" TEXT,
  "version" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "PlayerRepaymentPlan_teamId_anchorFeeId_idx" ON "PlayerRepaymentPlan"("teamId","anchorFeeId");
CREATE INDEX IF NOT EXISTS "PlayerRepaymentPlan_status_nextDueAt_idx" ON "PlayerRepaymentPlan"("status","nextDueAt");
CREATE TABLE IF NOT EXISTS "PlayerRepaymentRequest" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text, "teamId" TEXT NOT NULL,
  "planId" TEXT, "feeId" TEXT, "status" TEXT NOT NULL DEFAULT 'CREATING',
  "amountPence" INTEGER NOT NULL CHECK ("amountPence" >= 50), "dueAt" TIMESTAMP(3) NOT NULL,
  "allocations" JSONB NOT NULL, "stripeParams" JSONB,
  "checkoutSessionId" TEXT UNIQUE, "paymentIntentId" TEXT UNIQUE, "checkoutUrl" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL, "paidAt" TIMESTAMP(3), "refundedPence" INTEGER NOT NULL DEFAULT 0,
  "failureReason" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "PlayerRepaymentRequest_planId_status_idx" ON "PlayerRepaymentRequest"("planId","status");
CREATE INDEX IF NOT EXISTS "PlayerRepaymentRequest_feeId_status_idx" ON "PlayerRepaymentRequest"("feeId","status");

WITH imported AS (
INSERT INTO "PlayerFeeLedgerState" ("feeId","teamId","fixtureId","teamMemberId","prospectId","userId","playerName","openingAmountPence","balancePence")
SELECT f.id,f."teamId",f."fixtureId",f."teamMemberId",f."prospectId",COALESCE(m."userId",to_jsonb(f)->>'temporaryUserId'),
  COALESCE(u.name,NULLIF(TRIM(CONCAT(p."firstName",' ',p."lastName")),'')),f."amountPence",
  CASE WHEN f.status='OPEN' THEN GREATEST(f."amountPence",0) ELSE 0 END
FROM "PlayerMatchFee" f LEFT JOIN "TeamMember" m ON m.id=f."teamMemberId"
LEFT JOIN "User" u ON u.id=m."userId" LEFT JOIN "TeamPlayerProspect" p ON p.id=f."prospectId"
ON CONFLICT ("feeId") DO NOTHING RETURNING *
)
INSERT INTO "PlayerLedgerEntry" ("feeId","teamId","kind","amountPence","balanceAfterPence","reason","sourceKey")
SELECT s."feeId",s."teamId",'OPENING_BALANCE',s."balancePence",s."balancePence",
  'Opening balance from the existing stored fee. Earlier edits and historical payments were not reconstructed.',
  'opening:'||s."feeId" FROM imported s
ON CONFLICT ("sourceKey") DO NOTHING;

-- Every legacy writer, including prepared routes, records the obligation.
-- Controlled balances cannot be silently overwritten by the old link editor.
CREATE OR REPLACE FUNCTION sixfl_player_ledger_capture() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  s "PlayerFeeLedgerState"%ROWTYPE; ctx JSONB; next_balance INTEGER; delta INTEGER;
  actor TEXT; kind TEXT; reason TEXT; uid TEXT; pname TEXT; receipt INTEGER := 0;
  marker TEXT := '[SIXFL_PLAYER_LEDGER_RECEIPTS]';
BEGIN
  ctx := COALESCE(NULLIF(current_setting('sixfl.player_ledger_context',true),''),'{}')::jsonb;
  IF TG_OP='DELETE' THEN
    SELECT * INTO s FROM "PlayerFeeLedgerState" WHERE "feeId"=OLD.id FOR UPDATE;
    IF COALESCE(s."balancePence",0)>0 THEN
      RAISE EXCEPTION 'This player has an unpaid ledger balance. Settle or explicitly waive the charge before deleting it.';
    END IF;
    UPDATE "PlayerFeeLedgerState" SET "deletedAt"=CURRENT_TIMESTAMP WHERE "feeId"=OLD.id;
    RETURN OLD;
  END IF;
  SELECT * INTO s FROM "PlayerFeeLedgerState" WHERE "feeId"=NEW.id FOR UPDATE;
  IF TG_OP='UPDATE' AND s."controlled" AND
     (NEW."amountPence" IS DISTINCT FROM OLD."amountPence" OR NEW.status IS DISTINCT FROM OLD.status) AND
     (ctx->>'feeId' IS DISTINCT FROM NEW.id) THEN
    RAISE EXCEPTION 'This fee has a player repayment ledger. Use Player account to record payments or reduce its balance; editing a link cannot change the debt.';
  END IF;
  IF TG_OP='UPDATE' AND s."feeId" IS NOT NULL AND NEW."teamId" IS DISTINCT FROM OLD."teamId" THEN
    RAISE EXCEPTION 'An unpaid player balance must stay with its original team. Resolve the balance before moving the charge.';
  END IF;
  IF s."controlled" THEN
    IF position(marker in COALESCE(NEW.note,''))=0 THEN NEW.note := CONCAT_WS(E'\n',NULLIF(NEW.note,''),marker); END IF;
  ELSIF position(marker in COALESCE(NEW.note,''))>0 THEN
    RAISE EXCEPTION 'Reserved player ledger marker cannot be added to an ordinary fee.';
  END IF;
  SELECT m."userId",u.name INTO uid,pname FROM "TeamMember" m JOIN "User" u ON u.id=m."userId" WHERE m.id=NEW."teamMemberId";
  IF pname IS NULL THEN SELECT TRIM(CONCAT(p."firstName",' ',p."lastName")) INTO pname FROM "TeamPlayerProspect" p WHERE p.id=NEW."prospectId"; END IF;
  uid := COALESCE(uid,to_jsonb(NEW)->>'temporaryUserId');
  IF pname IS NULL AND uid IS NOT NULL THEN SELECT name INTO pname FROM "User" WHERE id=uid; END IF;
  next_balance := CASE WHEN NEW.status='OPEN' THEN GREATEST(NEW."amountPence",0) ELSE 0 END;
  IF s."feeId" IS NULL THEN
    INSERT INTO "PlayerFeeLedgerState" ("feeId","teamId","fixtureId","teamMemberId","prospectId","userId","playerName","openingAmountPence","balancePence")
    VALUES(NEW.id,NEW."teamId",NEW."fixtureId",NEW."teamMemberId",NEW."prospectId",uid,pname,NEW."amountPence",next_balance);
    INSERT INTO "PlayerLedgerEntry" ("feeId","teamId","kind","amountPence","balanceAfterPence","reason")
    VALUES(NEW.id,NEW."teamId",CASE WHEN NEW.status='OPEN' THEN 'CHARGE' ELSE 'RECORDED_SETTLEMENT' END,next_balance,next_balance,
      CONCAT('Player match fee recorded: ',NEW.status::text,'. ',COALESCE(NEW.note,'')));
    RETURN NEW;
  END IF;
  IF ctx->>'feeId' IS DISTINCT FROM NEW.id THEN ctx := '{}'::jsonb; END IF;
  delta := next_balance-s."balancePence";
  IF ctx->>'feeId'=NEW.id THEN
    actor := NULLIF(ctx->>'actorUserId',''); kind := NULLIF(ctx->>'kind','');
    reason := NULLIF(ctx->>'reason',''); receipt := COALESCE((ctx->>'receiptPence')::integer,0);
  END IF;
  IF delta<>0 OR receipt<>0 THEN
    kind := COALESCE(kind,CASE WHEN NEW.status='PAID' THEN 'SETTLEMENT' WHEN NEW.status='WAIVED' THEN 'WAIVER_OR_CAPTAIN_RECEIPT'
      WHEN NEW.status='CANCELLED' THEN 'CHARGE_CANCELLED' WHEN TG_OP='UPDATE' AND OLD.status<>'OPEN' THEN 'CHARGE_REOPENED' ELSE 'FEE_ADJUSTMENT' END);
    reason := COALESCE(reason,NULLIF(NEW.note,''),'Existing match-fee action changed the player obligation.');
    INSERT INTO "PlayerLedgerEntry" ("feeId","teamId","kind","amountPence","balanceAfterPence","receiptPence","receivedBy","actorUserId","reason","reference","sourceKey")
    VALUES(NEW.id,NEW."teamId",kind,delta,next_balance,receipt,ctx->>'receivedBy',actor,reason,ctx->>'reference',ctx->>'sourceKey');
  END IF;
  UPDATE "PlayerFeeLedgerState" SET "balancePence"=next_balance,
    "teamId"=NEW."teamId","fixtureId"=NEW."fixtureId",
    "teamMemberId"=COALESCE(NEW."teamMemberId",s."teamMemberId"),"prospectId"=COALESCE(NEW."prospectId",s."prospectId"),
    "userId"=COALESCE(uid,s."userId"),"playerName"=COALESCE(NULLIF(pname,''),s."playerName"),
    "receivedPence"=s."receivedPence"+CASE WHEN ctx->>'feeId'=NEW.id AND ctx->>'receivedBy'='SIXFL' THEN receipt ELSE 0 END,
    "captainReceivedPence"=s."captainReceivedPence"+CASE WHEN ctx->>'feeId'=NEW.id AND ctx->>'receivedBy'='CAPTAIN' THEN receipt ELSE 0 END,
    "version"=s.version+CASE WHEN delta<>0 OR receipt<>0 THEN 1 ELSE 0 END,
    "updatedAt"=CURRENT_TIMESTAMP WHERE "feeId"=NEW.id;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sixfl_player_ledger_capture_trigger ON "PlayerMatchFee";
CREATE TRIGGER sixfl_player_ledger_capture_trigger BEFORE INSERT OR UPDATE OR DELETE ON "PlayerMatchFee"
FOR EACH ROW EXECUTE FUNCTION sixfl_player_ledger_capture();

CREATE OR REPLACE FUNCTION sixfl_player_ledger_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Player ledger entries are immutable. Record a new correcting entry instead.'; END $$;
DROP TRIGGER IF EXISTS sixfl_player_ledger_immutable_trigger ON "PlayerLedgerEntry";
CREATE TRIGGER sixfl_player_ledger_immutable_trigger BEFORE UPDATE OR DELETE ON "PlayerLedgerEntry"
FOR EACH ROW EXECUTE FUNCTION sixfl_player_ledger_immutable();

-- No plans or messages are created by this migration.
INSERT INTO "NotificationTemplate" (id,key,name,description,kind,channel,audience,subject,body,"ctaLabel","ctaUrlKey","isActive","createdAt","updatedAt")
VALUES ('player-repayment-instalment-email','player-repayment-instalment-email','Player agreed repayment instalment',
 'One email per agreed instalment. The remaining balance is separate from the amount requested now.',
 'TRANSACTIONAL','EMAIL','PLAYER','Your agreed SIXFL payment: {{amount}}',
 $body$Hi {{firstName}},

Your agreed payment of {{amount}} towards your {{teamName}} player balance is due on {{dueDate}}.

Total balance in this arrangement: {{balance}}
Payment requested now: {{amount}}
Balance after this payment is received: {{remainingBalance}}

This is a part-payment arrangement, not a reduction of the debt. Any new match fees are separate unless your captain has explicitly included them. Please contact your captain or SIXFL if you need to discuss the arrangement.

{{cta}}

Thanks,
SIXFL$body$,'Pay agreed amount','paymentUrl',true,NOW(),NOW())
ON CONFLICT (key) DO NOTHING;
