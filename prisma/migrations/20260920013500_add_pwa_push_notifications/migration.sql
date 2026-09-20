-- Store opted-in PWA push devices and low-volume notification events.
CREATE TABLE "PushSubscription" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT,
  "auth" TEXT,
  "deviceTokenHash" TEXT NOT NULL,
  "userAgent" TEXT,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastDeliveredAt" TIMESTAMP(3),
  "failureCount" INTEGER NOT NULL DEFAULT 0,
  "disabledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PushNotification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "tag" TEXT,
  "sourceType" TEXT,
  "sourceId" TEXT,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PushNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE UNIQUE INDEX "PushSubscription_deviceTokenHash_key" ON "PushSubscription"("deviceTokenHash");
CREATE INDEX "PushSubscription_userId_disabledAt_idx" ON "PushSubscription"("userId", "disabledAt");
CREATE INDEX "PushSubscription_lastSeenAt_idx" ON "PushSubscription"("lastSeenAt");

CREATE INDEX "PushNotification_userId_createdAt_idx" ON "PushNotification"("userId", "createdAt");
CREATE INDEX "PushNotification_sourceType_sourceId_idx" ON "PushNotification"("sourceType", "sourceId");
CREATE INDEX "PushNotification_expiresAt_idx" ON "PushNotification"("expiresAt");

ALTER TABLE "PushSubscription"
  ADD CONSTRAINT "PushSubscription_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PushNotification"
  ADD CONSTRAINT "PushNotification_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
