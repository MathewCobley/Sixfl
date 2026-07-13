-- Prevent duplicate SIXFL payment rows when Stripe re-sends the same
-- team subscription invoice webhook very close together.
--
-- The application stores Stripe subscription invoice payments with
-- PaymentTransaction.reference = Stripe invoice id, then later updates
-- PaymentTransaction.stripeInvoiceId. That leaves a short race window where
-- duplicate webhooks can create two rows before the invoice id is written.
--
-- This trigger copies the invoice reference into stripeInvoiceId before insert,
-- so the existing unique stripeInvoiceId index can stop duplicates immediately.

CREATE OR REPLACE FUNCTION "set_subscription_invoice_id_from_reference"()
RETURNS trigger AS $$
BEGIN
  IF NEW."stripeInvoiceId" IS NULL
     AND NEW."reference" IS NOT NULL
     AND NEW."method" = 'STRIPE'
     AND NEW."notes" LIKE 'Recurring team subscription paid via Stripe%'
  THEN
    NEW."stripeInvoiceId" := NEW."reference";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "payment_transaction_subscription_invoice_id_before_write" ON "PaymentTransaction";

CREATE TRIGGER "payment_transaction_subscription_invoice_id_before_write"
BEFORE INSERT OR UPDATE OF "reference", "notes", "stripeInvoiceId", "method"
ON "PaymentTransaction"
FOR EACH ROW
EXECUTE FUNCTION "set_subscription_invoice_id_from_reference"();
