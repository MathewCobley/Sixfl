-- Goal of the Month scorers need a durable squad identity for player photos,
-- squad numbers, stats and awards. Existing legacy scorer text is preserved.
ALTER TABLE "GoalOfMonthCandidate"
  ADD COLUMN IF NOT EXISTS "scorerTeamMemberId" TEXT;

DO $$
BEGIN
  ALTER TABLE "GoalOfMonthCandidate"
    ADD CONSTRAINT "GoalOfMonthCandidate_scorerTeamMemberId_fkey"
    FOREIGN KEY ("scorerTeamMemberId")
    REFERENCES "TeamMember"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "GoalOfMonthCandidate_scorerTeamMemberId_idx"
  ON "GoalOfMonthCandidate" ("scorerTeamMemberId");
