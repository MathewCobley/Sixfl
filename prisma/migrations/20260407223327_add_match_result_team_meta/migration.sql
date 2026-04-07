-- CreateTable
CREATE TABLE "MatchResultTeamMeta" (
    "id" TEXT NOT NULL,
    "matchResultId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "scorers" JSONB,
    "goalsRecorded" INTEGER NOT NULL DEFAULT 0,
    "playerOfMatchName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchResultTeamMeta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MatchResultTeamMeta_teamId_idx" ON "MatchResultTeamMeta"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchResultTeamMeta_matchResultId_teamId_key" ON "MatchResultTeamMeta"("matchResultId", "teamId");

-- AddForeignKey
ALTER TABLE "MatchResultTeamMeta" ADD CONSTRAINT "MatchResultTeamMeta_matchResultId_fkey" FOREIGN KEY ("matchResultId") REFERENCES "MatchResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchResultTeamMeta" ADD CONSTRAINT "MatchResultTeamMeta_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
