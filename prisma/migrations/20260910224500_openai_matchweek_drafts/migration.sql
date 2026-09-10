-- Private editorial storage only. No changes to fixtures, results or payments.
-- Raw-SQL extension tables, following PlayerMatchPerformance and other SIXFL extensions.
CREATE TABLE "MatchweekReportDraft" (
  "id" TEXT PRIMARY KEY,
  "leagueId" TEXT NOT NULL REFERENCES "League"("id") ON DELETE CASCADE,
  "matchDate" TEXT NOT NULL CHECK ("matchDate" ~ '^\d{4}-\d{2}-\d{2}$'),
  "version" INTEGER NOT NULL DEFAULT 0 CHECK ("version" >= 0),
  "content" JSONB,
  "source" JSONB,
  "sourceHash" TEXT,
  "model" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("leagueId", "matchDate")
);
CREATE TABLE "MatchweekReportRevision" (
  "id" TEXT PRIMARY KEY,
  "draftId" TEXT NOT NULL REFERENCES "MatchweekReportDraft"("id") ON DELETE CASCADE,
  "actorId" TEXT NOT NULL,
  "baseVersion" INTEGER NOT NULL,
  "version" INTEGER,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('AI', 'EDIT')),
  "status" TEXT NOT NULL CHECK ("status" IN ('RUNNING', 'COMPLETE', 'FAILED')),
  "content" JSONB,
  "source" JSONB NOT NULL,
  "sourceHash" TEXT NOT NULL,
  "model" TEXT,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("draftId", "version")
);
CREATE INDEX "MatchweekReportRevision_draft_created_idx" ON "MatchweekReportRevision"("draftId", "createdAt" DESC);
CREATE INDEX "MatchweekReportRevision_actor_created_idx" ON "MatchweekReportRevision"("actorId", "createdAt" DESC);
