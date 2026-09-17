-- Additive only. Video bytes live in private object storage, never Postgres.
-- Keep tombstones/part manifests for safe retry of explicitly requested deletion.
CREATE TABLE "SixflTvFootageAsset" (
  "id" TEXT PRIMARY KEY,
  "fixtureId" TEXT REFERENCES "Fixture"("id") ON DELETE RESTRICT,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('CLIP','HIGHLIGHTS','FULL_MATCH','INTRO','OUTRO')),
  "filename" TEXT NOT NULL,
  "sizeBytes" BIGINT NOT NULL CHECK ("sizeBytes" > 0 AND "sizeBytes" <= 8589934592),
  "lastModified" BIGINT NOT NULL,
  "partCount" INTEGER NOT NULL CHECK ("partCount" BETWEEN 1 AND 1024),
  "state" TEXT NOT NULL DEFAULT 'UPLOADING' CHECK ("state" IN ('UPLOADING','READY','DELETING','DELETED')),
  "position" INTEGER NOT NULL DEFAULT 0,
  "createdByActor" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "completedAt" TIMESTAMPTZ,
  "leaseToken" TEXT,
  "busyUntil" TIMESTAMPTZ,
  CHECK (("kind" IN ('INTRO','OUTRO') AND "fixtureId" IS NULL)
    OR ("kind" NOT IN ('INTRO','OUTRO') AND "fixtureId" IS NOT NULL))
);
CREATE INDEX "SixflTvFootageAsset_fixture_state" ON "SixflTvFootageAsset" ("fixtureId","state","position");
CREATE INDEX "SixflTvFootageAsset_state" ON "SixflTvFootageAsset" ("state");
CREATE TABLE "SixflTvFootagePart" (
  "assetId" TEXT NOT NULL REFERENCES "SixflTvFootageAsset"("id") ON DELETE RESTRICT,
  "partNumber" INTEGER NOT NULL CHECK ("partNumber" BETWEEN 0 AND 1023),
  "objectKey" TEXT NOT NULL UNIQUE,
  "sha256" TEXT NOT NULL CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
  "sizeBytes" INTEGER NOT NULL CHECK ("sizeBytes" BETWEEN 1 AND 8388608),
  "stored" BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY ("assetId","partNumber")
);
