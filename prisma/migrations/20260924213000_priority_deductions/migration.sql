CREATE TABLE "SixflTvPriorityReview" (
  "id" TEXT PRIMARY KEY,
  "teamId" TEXT NOT NULL REFERENCES "Team"("id") ON DELETE CASCADE,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('PAYMENT_HOLD','SHIN_PAD_DISMISSED','RED_CARD')),
  "referenceId" TEXT NOT NULL,
  "points" INTEGER NOT NULL DEFAULT 0 CHECK ("points" IN (0,10,20)),
  "reason" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  "revokedBy" TEXT
);
CREATE UNIQUE INDEX "SixflTvPriorityReview_active_key" ON "SixflTvPriorityReview"("teamId","kind","referenceId") WHERE "revokedAt" IS NULL;
CREATE INDEX "SixflTvPriorityReview_team_idx" ON "SixflTvPriorityReview"("teamId");
