ALTER TABLE "Fixture"
ADD COLUMN "matchFeePence" INTEGER;

ALTER TABLE "PaymentCharge"
ADD COLUMN "fixtureId" TEXT,
ADD COLUMN "paymentToken" TEXT,
ADD COLUMN "lastStripeCheckoutUrl" TEXT,
ADD COLUMN "lastStripeCheckoutSessionId" TEXT,
ADD COLUMN "lastStripeCheckoutCreatedAt" TIMESTAMP(3),
ADD COLUMN "lastStripeCheckoutAmountPence" INTEGER;

ALTER TABLE "PaymentTransaction"
ADD COLUMN "stripeCheckoutSessionId" TEXT,
ADD COLUMN "stripePaymentIntentId" TEXT,
ADD COLUMN "stripeChargeId" TEXT;

CREATE INDEX "PaymentCharge_fixtureId_idx" ON "PaymentCharge"("fixtureId");
CREATE UNIQUE INDEX "PaymentCharge_fixtureId_teamId_key" ON "PaymentCharge"("fixtureId", "teamId");
CREATE UNIQUE INDEX "PaymentCharge_paymentToken_key" ON "PaymentCharge"("paymentToken");
CREATE UNIQUE INDEX "PaymentCharge_lastStripeCheckoutSessionId_key" ON "PaymentCharge"("lastStripeCheckoutSessionId");
CREATE UNIQUE INDEX "PaymentTransaction_stripeCheckoutSessionId_key" ON "PaymentTransaction"("stripeCheckoutSessionId");

ALTER TABLE "PaymentCharge"
ADD CONSTRAINT "PaymentCharge_fixtureId_fkey"
FOREIGN KEY ("fixtureId") REFERENCES "Fixture"("id") ON DELETE SET NULL ON UPDATE CASCADE;
