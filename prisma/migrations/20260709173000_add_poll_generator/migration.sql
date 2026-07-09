-- Add a simple SIXFL poll generator with per-recipient voting links.

CREATE TABLE IF NOT EXISTS "SIXFLPoll" (
  "id" TEXT PRIMARY KEY,
  "title" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "slug" TEXT NOT NULL UNIQUE,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SIXFLPoll_status_check" CHECK ("status" IN ('DRAFT', 'ACTIVE', 'CLOSED'))
);

CREATE TABLE IF NOT EXISTS "SIXFLPollOption" (
  "id" TEXT PRIMARY KEY,
  "pollId" TEXT NOT NULL REFERENCES "SIXFLPoll"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "label" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "SIXFLPollOption_pollId_sortOrder_idx"
  ON "SIXFLPollOption"("pollId", "sortOrder");

CREATE TABLE IF NOT EXISTS "SIXFLPollRecipient" (
  "id" TEXT PRIMARY KEY,
  "pollId" TEXT NOT NULL REFERENCES "SIXFLPoll"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "teamName" TEXT NOT NULL,
  "contactName" TEXT,
  "contactEmail" TEXT,
  "contactPhone" TEXT,
  "sourceType" TEXT,
  "sourceId" TEXT,
  "token" TEXT NOT NULL UNIQUE,
  "selectedOptionId" TEXT REFERENCES "SIXFLPollOption"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "note" TEXT,
  "votedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "SIXFLPollRecipient_pollId_idx"
  ON "SIXFLPollRecipient"("pollId");

CREATE INDEX IF NOT EXISTS "SIXFLPollRecipient_selectedOptionId_idx"
  ON "SIXFLPollRecipient"("selectedOptionId");
