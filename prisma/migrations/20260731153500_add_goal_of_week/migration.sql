CREATE TABLE "GoalOfWeek" (
  "id" TEXT NOT NULL,
  "videoUrl" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "playerName" TEXT,
  "opponentName" TEXT,
  "caption" TEXT,
  "weekOf" TIMESTAMP(3) NOT NULL,
  "isFeatured" BOOLEAN NOT NULL DEFAULT false,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GoalOfWeek_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GoalOfWeek_teamId_idx" ON "GoalOfWeek"("teamId");
CREATE INDEX "GoalOfWeek_weekOf_idx" ON "GoalOfWeek"("weekOf");
CREATE INDEX "GoalOfWeek_publishedAt_idx" ON "GoalOfWeek"("publishedAt");
CREATE UNIQUE INDEX "GoalOfWeek_one_featured_idx"
  ON "GoalOfWeek"("isFeatured")
  WHERE "isFeatured" = true;

ALTER TABLE "GoalOfWeek"
  ADD CONSTRAINT "GoalOfWeek_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "Team"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
