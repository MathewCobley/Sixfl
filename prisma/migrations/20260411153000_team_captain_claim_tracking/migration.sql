ALTER TABLE "Team"
ADD COLUMN "captainUserId" TEXT,
ADD COLUMN "captainLinkedAt" TIMESTAMP(3),
ADD COLUMN "captainLinkedSource" TEXT,
ADD COLUMN "captainInviteSentAt" TIMESTAMP(3),
ADD COLUMN "captainInviteSentTo" TEXT,
ADD COLUMN "captainClaimedAt" TIMESTAMP(3),
ADD COLUMN "captainClaimSource" TEXT;

CREATE INDEX "Team_captainUserId_idx" ON "Team"("captainUserId");
CREATE INDEX "Team_captainLinkedAt_idx" ON "Team"("captainLinkedAt");
CREATE INDEX "Team_captainInviteSentAt_idx" ON "Team"("captainInviteSentAt");
CREATE INDEX "Team_captainClaimedAt_idx" ON "Team"("captainClaimedAt");