CREATE TABLE "PlayerWeeklyAvailability" (
  "id" TEXT NOT NULL,
  "teamMemberId" TEXT NOT NULL,
  "availabilityDate" DATE NOT NULL,
  "response" TEXT NOT NULL DEFAULT 'NO_RESPONSE',
  "note" TEXT,
  "respondedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PlayerWeeklyAvailability_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlayerWeeklyAvailability_teamMemberId_availabilityDate_key"
ON "PlayerWeeklyAvailability"("teamMemberId", "availabilityDate");

CREATE INDEX "PlayerWeeklyAvailability_availabilityDate_response_idx"
ON "PlayerWeeklyAvailability"("availabilityDate", "response");

CREATE INDEX "PlayerWeeklyAvailability_teamMemberId_response_idx"
ON "PlayerWeeklyAvailability"("teamMemberId", "response");

ALTER TABLE "PlayerWeeklyAvailability"
ADD CONSTRAINT "PlayerWeeklyAvailability_teamMemberId_fkey"
FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
