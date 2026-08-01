CREATE TABLE IF NOT EXISTS "PlayerAccountMerge" (
  "id" TEXT NOT NULL,
  "keptUserId" TEXT NOT NULL,
  "mergedUserId" TEXT NOT NULL,
  "mergedByUserId" TEXT,
  "keptEmail" TEXT,
  "mergedEmail" TEXT,
  "summary" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlayerAccountMerge_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlayerAccountMerge_keptUserId_fkey"
    FOREIGN KEY ("keptUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PlayerAccountMerge_mergedUserId_fkey"
    FOREIGN KEY ("mergedUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PlayerAccountMerge_mergedByUserId_fkey"
    FOREIGN KEY ("mergedByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "PlayerAccountMerge_keptUserId_createdAt_idx"
  ON "PlayerAccountMerge"("keptUserId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "PlayerAccountMerge_mergedUserId_createdAt_idx"
  ON "PlayerAccountMerge"("mergedUserId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "PlayerAccountMerge_mergedByUserId_createdAt_idx"
  ON "PlayerAccountMerge"("mergedByUserId", "createdAt" DESC);
