-- Track Stripe checkout sessions used specifically to pass player money collected
-- directly by a captain/organiser onto the fixture charge. A row is only counted
-- as remitted once a matching PaymentTransaction exists for the Stripe session.
CREATE TABLE IF NOT EXISTS "CaptainCollectedRemittanceCheckout" (
  "checkoutSessionId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "chargeId" TEXT NOT NULL,
  "fixtureId" TEXT NOT NULL,
  "amountPence" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CaptainCollectedRemittanceCheckout_pkey" PRIMARY KEY ("checkoutSessionId"),
  CONSTRAINT "CaptainCollectedRemittanceCheckout_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CaptainCollectedRemittanceCheckout_chargeId_fkey"
    FOREIGN KEY ("chargeId") REFERENCES "PaymentCharge"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CaptainCollectedRemittanceCheckout_fixtureId_fkey"
    FOREIGN KEY ("fixtureId") REFERENCES "Fixture"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "CaptainCollectedRemittanceCheckout_chargeId_idx"
  ON "CaptainCollectedRemittanceCheckout"("chargeId");

CREATE INDEX IF NOT EXISTS "CaptainCollectedRemittanceCheckout_team_fixture_idx"
  ON "CaptainCollectedRemittanceCheckout"("teamId", "fixtureId");
