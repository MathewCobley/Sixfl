-- ========================================
-- File: prisma/migrations/20260626133000_add_referee_profiles/migration.sql
-- ========================================

CREATE TABLE IF NOT EXISTS "RefereeProfile" (
  "userId" TEXT PRIMARY KEY,
  "phone" TEXT,
  "phoneNormalized" TEXT,
  "standardNightFeePence" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RefereeProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "RefereeProfile_isActive_idx"
  ON "RefereeProfile"("isActive");

CREATE INDEX IF NOT EXISTS "RefereeProfile_phoneNormalized_idx"
  ON "RefereeProfile"("phoneNormalized");

INSERT INTO "RefereeProfile" (
  "userId",
  "phone",
  "phoneNormalized",
  "standardNightFeePence",
  "isActive",
  "createdAt",
  "updatedAt"
)
SELECT
  u."id",
  l."phone",
  l."phoneNormalized",
  0,
  TRUE,
  NOW(),
  NOW()
FROM "User" u
LEFT JOIN "InterestLead" l ON l."id" = u."createdFromLeadId"
WHERE u."role" = 'REFEREE'
ON CONFLICT ("userId") DO NOTHING;
