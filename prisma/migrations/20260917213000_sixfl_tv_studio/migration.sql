-- SIXFL TV render/publish manifests. Source footage remains in the existing private library.
-- No source footage or published fixture links are changed by this migration.
CREATE TABLE "SixflTvRenderJob" (
  "id" TEXT PRIMARY KEY,
  "fixtureId" TEXT NOT NULL REFERENCES "Fixture"("id") ON DELETE RESTRICT,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('HIGHLIGHTS','FULL_MATCH')),
  "state" TEXT NOT NULL DEFAULT 'QUEUED' CHECK ("state" IN ('QUEUED','PROCESSING','READY','FAILED')),
  "sourceFingerprint" TEXT NOT NULL CHECK ("sourceFingerprint" ~ '^[0-9a-f]{64}$'),
  "metadataJson" JSONB NOT NULL,
  "requestedByActor" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "startedAt" TIMESTAMPTZ,
  "completedAt" TIMESTAMPTZ,
  "leaseToken" TEXT,
  "busyUntil" TIMESTAMPTZ,
  "error" TEXT,
  "outputSizeBytes" BIGINT,
  "partCount" INTEGER,
  "durationMs" INTEGER,
  CHECK (("state" = 'READY' AND "outputSizeBytes" IS NOT NULL AND "partCount" IS NOT NULL)
    OR "state" <> 'READY')
);
CREATE INDEX "SixflTvRenderJob_fixture_kind_created" ON "SixflTvRenderJob" ("fixtureId","kind","createdAt" DESC);
CREATE INDEX "SixflTvRenderJob_state_created" ON "SixflTvRenderJob" ("state","createdAt");
CREATE UNIQUE INDEX "SixflTvRenderJob_one_active_kind" ON "SixflTvRenderJob" ("fixtureId","kind")
  WHERE "state" IN ('QUEUED','PROCESSING');

CREATE TABLE "SixflTvRenderInput" (
  "jobId" TEXT NOT NULL REFERENCES "SixflTvRenderJob"("id") ON DELETE RESTRICT,
  "assetId" TEXT NOT NULL REFERENCES "SixflTvFootageAsset"("id") ON DELETE RESTRICT,
  "role" TEXT NOT NULL CHECK ("role" IN ('INTRO','CONTENT','OUTRO')),
  "position" INTEGER NOT NULL CHECK ("position" BETWEEN 0 AND 99),
  PRIMARY KEY ("jobId","assetId","role","position")
);
CREATE INDEX "SixflTvRenderInput_asset" ON "SixflTvRenderInput" ("assetId","jobId");

CREATE TABLE "SixflTvRenderPart" (
  "jobId" TEXT NOT NULL REFERENCES "SixflTvRenderJob"("id") ON DELETE RESTRICT,
  "partNumber" INTEGER NOT NULL CHECK ("partNumber" BETWEEN 0 AND 4095),
  "objectKey" TEXT NOT NULL UNIQUE,
  "sha256" TEXT NOT NULL CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
  "sizeBytes" INTEGER NOT NULL CHECK ("sizeBytes" BETWEEN 1 AND 8388608),
  "stored" BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY ("jobId","partNumber")
);

CREATE TABLE "SixflTvThumbnail" (
  "fixtureId" TEXT NOT NULL REFERENCES "Fixture"("id") ON DELETE RESTRICT,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('HIGHLIGHTS','FULL_MATCH')),
  "headline" TEXT NOT NULL,
  "strapline" TEXT NOT NULL DEFAULT '',
  "showScore" BOOLEAN NOT NULL DEFAULT true,
  "objectKey" TEXT NOT NULL,
  "sha256" TEXT NOT NULL CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
  "sizeBytes" INTEGER NOT NULL CHECK ("sizeBytes" BETWEEN 1 AND 52428800),
  "updatedByActor" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("fixtureId","kind")
);

CREATE TABLE "SixflTvYoutubeConnection" (
  "id" TEXT PRIMARY KEY CHECK ("id" = 'primary'),
  "refreshTokenCiphertext" TEXT NOT NULL,
  "channelId" TEXT,
  "channelTitle" TEXT,
  "scope" TEXT NOT NULL,
  "connectedByActor" TEXT NOT NULL,
  "connectedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "SixflTvYoutubePublish" (
  "id" TEXT PRIMARY KEY,
  "fixtureId" TEXT NOT NULL REFERENCES "Fixture"("id") ON DELETE RESTRICT,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('HIGHLIGHTS','FULL_MATCH')),
  "renderJobId" TEXT NOT NULL REFERENCES "SixflTvRenderJob"("id") ON DELETE RESTRICT,
  "thumbnailObjectKey" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "privacyStatus" TEXT NOT NULL DEFAULT 'private' CHECK ("privacyStatus" IN ('private','unlisted','public')),
  "state" TEXT NOT NULL DEFAULT 'QUEUED' CHECK ("state" IN ('QUEUED','PROCESSING','READY','FAILED')),
  "requestedByActor" TEXT NOT NULL,
  "youtubeVideoId" TEXT,
  "youtubeUrl" TEXT,
  "error" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "completedAt" TIMESTAMPTZ
);
CREATE INDEX "SixflTvYoutubePublish_fixture_kind_created" ON "SixflTvYoutubePublish" ("fixtureId","kind","createdAt" DESC);
CREATE UNIQUE INDEX "SixflTvYoutubePublish_one_active_kind" ON "SixflTvYoutubePublish" ("fixtureId","kind")
  WHERE "state" IN ('QUEUED','PROCESSING');
