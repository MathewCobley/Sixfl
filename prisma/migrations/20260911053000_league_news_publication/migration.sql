-- Separate public snapshots: existing drafts remain private. Nothing is published by migration.
CREATE TABLE IF NOT EXISTS "LeagueNewsArticle" (
  "id" TEXT PRIMARY KEY,
  "draftId" TEXT NOT NULL UNIQUE REFERENCES "MatchweekReportDraft"("id") ON DELETE CASCADE,
  "leagueId" TEXT NOT NULL REFERENCES "League"("id") ON DELETE CASCADE,
  "matchDate" TEXT NOT NULL CHECK ("matchDate" ~ '^\d{4}-\d{2}-\d{2}$'),
  "status" TEXT NOT NULL DEFAULT 'DRAFT' CHECK ("status" IN ('DRAFT','PUBLISHED','UNPUBLISHED')),
  "revision" INTEGER NOT NULL DEFAULT 0 CHECK ("revision" >= 0),
  "settings" JSONB NOT NULL DEFAULT '{}',
  "snapshot" JSONB,
  "teamIds" TEXT[] NOT NULL DEFAULT '{}',
  "sourceVersion" INTEGER,
  "publishedAt" TIMESTAMP(3),
  "publishedUpdatedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("leagueId","matchDate"),
  CHECK ("status" <> 'PUBLISHED' OR ("snapshot" IS NOT NULL AND "publishedAt" IS NOT NULL AND "sourceVersion" IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS "LeagueNewsArticle_league_published_idx" ON "LeagueNewsArticle" ("leagueId","matchDate" DESC) WHERE "status"='PUBLISHED';
CREATE INDEX IF NOT EXISTS "LeagueNewsArticle_team_idx" ON "LeagueNewsArticle" USING GIN ("teamIds") WHERE "status"='PUBLISHED';
CREATE TABLE IF NOT EXISTS "LeagueNewsEvent" (
  "requestId" TEXT PRIMARY KEY,
  "articleId" TEXT NOT NULL REFERENCES "LeagueNewsArticle"("id") ON DELETE CASCADE,
  "actorId" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('settings','publish','unpublish')),
  "revision" INTEGER NOT NULL,
  "snapshot" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
