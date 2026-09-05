-- Database-backed, immutable badge images, using the same BYTEA approach as KitDesign.
-- Kept outside the generated Prisma models, like the existing kit image tables.
CREATE TABLE IF NOT EXISTS "TeamBadgeImage" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "teamId" TEXT NOT NULL REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "createdByUserId" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "imageData" BYTEA NOT NULL,
  "thumbnailData" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "TeamBadgeImage_teamId_idx" ON "TeamBadgeImage"("teamId");
