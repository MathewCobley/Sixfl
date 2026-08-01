CREATE TABLE IF NOT EXISTS "EmailDeliveryAdminAlertEvent" (
  "id" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  "deliveryId" TEXT,
  "eventType" TEXT NOT NULL,
  "providerMessageId" TEXT,
  "recipientEmail" TEXT,
  "subject" TEXT,
  "reason" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "alertedAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EmailDeliveryAdminAlertEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EmailDeliveryAdminAlertEvent_eventKey_key"
  ON "EmailDeliveryAdminAlertEvent"("eventKey");

CREATE INDEX IF NOT EXISTS "EmailDeliveryAdminAlertEvent_status_createdAt_idx"
  ON "EmailDeliveryAdminAlertEvent"("status", "createdAt");

CREATE INDEX IF NOT EXISTS "EmailDeliveryAdminAlertEvent_recipientEmail_idx"
  ON "EmailDeliveryAdminAlertEvent"("recipientEmail");
