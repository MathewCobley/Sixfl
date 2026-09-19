-- SIXFL TV YouTube metric history.
-- Stores public/authorised video counters so team view performance and trends are
-- deterministic even when YouTube is unavailable during fixture allocation.
CREATE TABLE IF NOT EXISTS "SixflTvYoutubeMetricSnapshot" (
  "id" TEXT PRIMARY KEY,
  "videoId" TEXT NOT NULL,
  "title" TEXT,
  "viewCount" BIGINT NOT NULL CHECK ("viewCount" >= 0),
  "likeCount" BIGINT CHECK ("likeCount" IS NULL OR "likeCount" >= 0),
  "commentCount" BIGINT CHECK ("commentCount" IS NULL OR "commentCount" >= 0),
  "publishedAt" TIMESTAMPTZ,
  "capturedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "SixflTvYoutubeMetricSnapshot_video_captured_idx"
  ON "SixflTvYoutubeMetricSnapshot" ("videoId", "capturedAt" DESC);

CREATE INDEX IF NOT EXISTS "SixflTvYoutubeMetricSnapshot_captured_idx"
  ON "SixflTvYoutubeMetricSnapshot" ("capturedAt" DESC);
