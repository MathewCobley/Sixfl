-- ========================================
-- File: prisma/migrations/20260428231500_add_weekly_social_match_cards/migration.sql
-- ========================================

CREATE TABLE "SocialMatchCard" (
  "id" TEXT NOT NULL,
  "leagueId" TEXT NOT NULL,
  "fixtureDate" TIMESTAMP(3) NOT NULL,
  "round" INTEGER,
  "postType" "SocialPostType" NOT NULL DEFAULT 'FIXTURE',
  "postStatus" "SocialPostStatus" NOT NULL DEFAULT 'NONE',
  "caption" TEXT,
  "imageUrl" TEXT,
  "externalPostId" TEXT,
  "lastError" TEXT,
  "needsApproval" BOOLEAN NOT NULL DEFAULT true,
  "queuedAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SocialMatchCard_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SocialMatchCardFixture" (
  "id" TEXT NOT NULL,
  "socialMatchCardId" TEXT NOT NULL,
  "fixtureId" TEXT NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SocialMatchCardFixture_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SocialMatchCard_leagueId_fixtureDate_postType_key"
  ON "SocialMatchCard"("leagueId", "fixtureDate", "postType");

CREATE INDEX "SocialMatchCard_leagueId_fixtureDate_idx"
  ON "SocialMatchCard"("leagueId", "fixtureDate");

CREATE INDEX "SocialMatchCard_postStatus_idx"
  ON "SocialMatchCard"("postStatus");

CREATE INDEX "SocialMatchCard_postType_idx"
  ON "SocialMatchCard"("postType");

CREATE UNIQUE INDEX "SocialMatchCardFixture_socialMatchCardId_fixtureId_key"
  ON "SocialMatchCardFixture"("socialMatchCardId", "fixtureId");

CREATE INDEX "SocialMatchCardFixture_fixtureId_idx"
  ON "SocialMatchCardFixture"("fixtureId");

ALTER TABLE "SocialMatchCard"
  ADD CONSTRAINT "SocialMatchCard_leagueId_fkey"
  FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SocialMatchCardFixture"
  ADD CONSTRAINT "SocialMatchCardFixture_socialMatchCardId_fkey"
  FOREIGN KEY ("socialMatchCardId") REFERENCES "SocialMatchCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SocialMatchCardFixture"
  ADD CONSTRAINT "SocialMatchCardFixture_fixtureId_fkey"
  FOREIGN KEY ("fixtureId") REFERENCES "Fixture"("id") ON DELETE CASCADE ON UPDATE CASCADE;
