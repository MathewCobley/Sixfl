CREATE TABLE IF NOT EXISTS "TeamFreeKitOfferAudit" (
  "id" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "previousValue" BOOLEAN NOT NULL,
  "newValue" BOOLEAN NOT NULL,
  "actorUserId" TEXT,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TeamFreeKitOfferAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TeamFreeKitOfferAudit_team_created_idx"
ON "TeamFreeKitOfferAudit"("teamId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "TeamFreeKitOfferAudit_actor_idx"
ON "TeamFreeKitOfferAudit"("actorUserId", "createdAt" DESC);
