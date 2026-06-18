-- ========================================
-- File: prisma/migrations/20260618142000_add_social_generated_images/migration.sql
-- ========================================

CREATE TABLE IF NOT EXISTS "SocialGeneratedImage" (
  "id" TEXT NOT NULL,
  "socialMatchCardId" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL DEFAULT 'image/png',
  "imageBase64" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'openai',
  "model" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SocialGeneratedImage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SocialGeneratedImage_socialMatchCardId_key"
  ON "SocialGeneratedImage"("socialMatchCardId");

CREATE INDEX IF NOT EXISTS "SocialGeneratedImage_createdAt_idx"
  ON "SocialGeneratedImage"("createdAt");

ALTER TABLE "SocialGeneratedImage"
  ADD CONSTRAINT "SocialGeneratedImage_socialMatchCardId_fkey"
  FOREIGN KEY ("socialMatchCardId") REFERENCES "SocialMatchCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
