CREATE TABLE "ResultDisputeMessage" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "authorType" TEXT NOT NULL,
    "authorName" TEXT,
    "authorUserId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResultDisputeMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ResultDisputeMessage_disputeId_createdAt_idx"
ON "ResultDisputeMessage"("disputeId", "createdAt");

ALTER TABLE "ResultDisputeMessage"
ADD CONSTRAINT "ResultDisputeMessage_disputeId_fkey"
FOREIGN KEY ("disputeId") REFERENCES "ResultDispute"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
