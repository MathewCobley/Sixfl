-- New policy/audit tables only. Never move, delete or reallocate existing payments.
-- Snapshot IDs intentionally survive deletion of their source records.
CREATE TABLE IF NOT EXISTS "TeamPaymentOrderException" (
  "id" BIGSERIAL PRIMARY KEY,
  "teamId" TEXT NOT NULL,
  "chargeId" TEXT NOT NULL,
  "action" TEXT NOT NULL CHECK ("action" IN ('HOLD', 'ALLOW_PAYMENT', 'RESET')),
  "reason" TEXT NOT NULL CHECK (length(btrim("reason")) BETWEEN 5 AND 1000),
  "createdByUserId" TEXT NOT NULL,
  "createdByLabel" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  CHECK (("action" = 'RESET' AND "expiresAt" IS NULL) OR ("action" <> 'RESET' AND "expiresAt" IS NOT NULL AND "expiresAt" > "createdAt"))
);
CREATE INDEX IF NOT EXISTS "TeamPaymentOrderException_charge_id_idx"
  ON "TeamPaymentOrderException" ("chargeId", "id" DESC);
CREATE INDEX IF NOT EXISTS "TeamPaymentOrderException_team_id_idx"
  ON "TeamPaymentOrderException" ("teamId", "id" DESC);
CREATE TABLE IF NOT EXISTS "TeamPaymentOrderCheckoutAudit" (
  "checkoutSessionId" TEXT NOT NULL,
  "event" TEXT NOT NULL CHECK ("event" IN ('EXPIRED', 'COMPLETED_OUT_OF_ORDER')),
  "chargeId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "blockingChargeId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("checkoutSessionId", "event")
);
CREATE TABLE IF NOT EXISTS "TeamPaymentOrderMaintenance" (
  "id" TEXT PRIMARY KEY,
  "cursor" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "lastCheckedAt" TIMESTAMP(3),
  "lastFailure" TEXT
);
INSERT INTO "TeamPaymentOrderMaintenance" ("id") VALUES ('open-checkouts') ON CONFLICT DO NOTHING;
