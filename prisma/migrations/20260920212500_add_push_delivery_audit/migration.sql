ALTER TABLE "PushNotification"
  ADD COLUMN "targetedDeviceCount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "PushNotificationDelivery" (
  "id" TEXT NOT NULL,
  "notificationId" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PushNotificationDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PushNotificationDelivery_notificationId_subscriptionId_key"
  ON "PushNotificationDelivery"("notificationId", "subscriptionId");

CREATE INDEX "PushNotificationDelivery_status_recordedAt_idx"
  ON "PushNotificationDelivery"("status", "recordedAt");

CREATE INDEX "PushNotificationDelivery_subscriptionId_recordedAt_idx"
  ON "PushNotificationDelivery"("subscriptionId", "recordedAt");

ALTER TABLE "PushNotificationDelivery"
  ADD CONSTRAINT "PushNotificationDelivery_notificationId_fkey"
  FOREIGN KEY ("notificationId") REFERENCES "PushNotification"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PushNotificationDelivery"
  ADD CONSTRAINT "PushNotificationDelivery_subscriptionId_fkey"
  FOREIGN KEY ("subscriptionId") REFERENCES "PushSubscription"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
