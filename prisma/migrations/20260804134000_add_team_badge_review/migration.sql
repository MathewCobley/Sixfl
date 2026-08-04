ALTER TABLE "Team"
ADD COLUMN "kitBadgeConfirmedAt" TIMESTAMP(3),
ADD COLUMN "kitBadgeChangeRequestedAt" TIMESTAMP(3),
ADD COLUMN "kitBadgeChangeRequestNote" TEXT;

CREATE INDEX "Team_kitBadgeChangeRequestedAt_idx"
ON "Team"("kitBadgeChangeRequestedAt");
