-- Team kit catalogue and captain order workflow.
-- Images are deliberately stored in Postgres because the catalogue is small,
-- fixed and needs to work without a separate object-storage account.

DO $$
BEGIN
  CREATE TYPE "TeamKitOrderStatus" AS ENUM (
    'DRAFT',
    'SUBMITTED',
    'APPROVED',
    'ORDERED',
    'FULFILLED',
    'CANCELLED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "TeamKitSize" AS ENUM ('S', 'M', 'L', 'XL', 'XXL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "TeamKitSockSize" AS ENUM ('MEDIUM_6_8', 'LARGE_8_PLUS');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "KitDesign" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT,
  "primaryColour" TEXT,
  "secondaryColour" TEXT,
  "style" TEXT,
  "imageMimeType" TEXT NOT NULL,
  "imageData" BYTEA NOT NULL,
  "thumbnailMimeType" TEXT NOT NULL,
  "thumbnailData" BYTEA NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "KitDesign_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "KitDesign_code_key"
  ON "KitDesign"("code");
CREATE INDEX IF NOT EXISTS "KitDesign_isActive_sortOrder_idx"
  ON "KitDesign"("isActive", "sortOrder");

CREATE TABLE IF NOT EXISTS "TeamKitOrder" (
  "id" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "kitDesignId" TEXT,
  "status" "TeamKitOrderStatus" NOT NULL DEFAULT 'DRAFT',
  "kitQuantity" INTEGER NOT NULL DEFAULT 9,
  "captainNotes" TEXT,
  "adminNotes" TEXT,
  "submittedByUserId" TEXT,
  "lastEditedByUserId" TEXT,
  "submittedAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "orderedAt" TIMESTAMP(3),
  "fulfilledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TeamKitOrder_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TeamKitOrder_kitQuantity_check" CHECK ("kitQuantity" = 9),
  CONSTRAINT "TeamKitOrder_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "Team"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TeamKitOrder_kitDesignId_fkey"
    FOREIGN KEY ("kitDesignId") REFERENCES "KitDesign"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TeamKitOrder_submittedByUserId_fkey"
    FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "TeamKitOrder_lastEditedByUserId_fkey"
    FOREIGN KEY ("lastEditedByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "TeamKitOrder_teamId_key"
  ON "TeamKitOrder"("teamId");
CREATE INDEX IF NOT EXISTS "TeamKitOrder_status_updatedAt_idx"
  ON "TeamKitOrder"("status", "updatedAt");
CREATE INDEX IF NOT EXISTS "TeamKitOrder_kitDesignId_idx"
  ON "TeamKitOrder"("kitDesignId");

CREATE TABLE IF NOT EXISTS "TeamKitOrderItem" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "backName" TEXT,
  "shirtNumber" INTEGER NOT NULL,
  "kitSize" "TeamKitSize" NOT NULL,
  "sockSize" "TeamKitSockSize" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TeamKitOrderItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TeamKitOrderItem_position_check"
    CHECK ("position" BETWEEN 1 AND 9),
  CONSTRAINT "TeamKitOrderItem_shirtNumber_check"
    CHECK ("shirtNumber" BETWEEN 1 AND 99),
  CONSTRAINT "TeamKitOrderItem_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "TeamKitOrder"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "TeamKitOrderItem_orderId_position_key"
  ON "TeamKitOrderItem"("orderId", "position");
CREATE UNIQUE INDEX IF NOT EXISTS "TeamKitOrderItem_orderId_shirtNumber_key"
  ON "TeamKitOrderItem"("orderId", "shirtNumber");
CREATE INDEX IF NOT EXISTS "TeamKitOrderItem_orderId_idx"
  ON "TeamKitOrderItem"("orderId");
