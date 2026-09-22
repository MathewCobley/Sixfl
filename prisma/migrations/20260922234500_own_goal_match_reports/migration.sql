ALTER TABLE "MatchResultTeamMeta"
ADD COLUMN IF NOT EXISTS "ownGoals" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "FixtureMatchReport"
ADD COLUMN IF NOT EXISTS "ownGoals" INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MatchResultTeamMeta_ownGoals_nonnegative'
  ) THEN
    ALTER TABLE "MatchResultTeamMeta"
    ADD CONSTRAINT "MatchResultTeamMeta_ownGoals_nonnegative" CHECK ("ownGoals" >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FixtureMatchReport_ownGoals_nonnegative'
  ) THEN
    ALTER TABLE "FixtureMatchReport"
    ADD CONSTRAINT "FixtureMatchReport_ownGoals_nonnegative" CHECK ("ownGoals" >= 0);
  END IF;
END
$$;

-- Carry a captain-entered own-goal count from a pre-result report into the
-- canonical team metadata when the official result arrives.
CREATE OR REPLACE FUNCTION sixfl_promote_early_match_reports() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  report RECORD;
  performance JSONB;
  goal_total INTEGER;
  expected INTEGER;
  meta_id TEXT;
BEGIN
  FOR report IN
    SELECT draft.*, f."homeTeamId", f."awayTeamId"
    FROM "FixtureMatchReport" draft JOIN "Fixture" f ON f."id" = draft."fixtureId"
    WHERE draft."fixtureId" = NEW."fixtureId"
      AND draft."teamId" IN (f."homeTeamId", f."awayTeamId")
  LOOP
    SELECT COALESCE(SUM((value->>'goals')::INTEGER), 0) INTO goal_total
    FROM JSONB_ARRAY_ELEMENTS(report."contributions");
    expected := CASE WHEN report."teamId" = report."homeTeamId" THEN NEW."homeScore" ELSE NEW."awayScore" END;
    meta_id := NULL;
    INSERT INTO "MatchResultTeamMeta" (
      "id", "matchResultId", "teamId", "scorers", "goalsRecorded", "ownGoals", "playerOfMatchName",
      "priorityCoreCompletedAt", "priorityAssistsCompletedAt", "priorityRatingsCompletedAt", "createdAt", "updatedAt"
    ) VALUES (
      'early-meta-' || MD5(NEW."id" || ':' || report."teamId"), NEW."id", report."teamId",
      report."contributions", goal_total, report."ownGoals", report."playerOfMatchName",
      CASE WHEN goal_total + report."ownGoals" = expected THEN report."coreCompletedAt" END,
      CASE WHEN expected = 0 THEN report."coreCompletedAt" ELSE report."assistsCompletedAt" END,
      report."ratingsCompletedAt", report."createdAt", report."updatedAt"
    ) ON CONFLICT ("matchResultId", "teamId") DO NOTHING RETURNING "id" INTO meta_id;
    IF meta_id IS NULL THEN CONTINUE; END IF;

    FOR performance IN SELECT value FROM JSONB_ARRAY_ELEMENTS(report."performances") LOOP
      IF NOT EXISTS (
        SELECT 1 FROM "TeamMember"
        WHERE "id" = performance->>'teamMemberId'
          AND "teamId" = report."teamId"
      ) THEN
        CONTINUE;
      END IF;

      INSERT INTO "PlayerMatchPerformance" (
        "id", "matchResultId", "teamId", "teamMemberId", "played", "appearanceRecorded",
        "rating", "goals", "assists", "isPlayerOfMatch", "source", "createdAt", "updatedAt"
      ) VALUES (
        'early-performance-' || MD5(NEW."id" || ':' || report."teamId" || ':' || (performance->>'teamMemberId')),
        NEW."id", report."teamId", performance->>'teamMemberId', TRUE, TRUE,
        (performance->>'rating')::DOUBLE PRECISION, 0, 0, FALSE, 'CAPTAIN_RECORDED', report."createdAt", report."updatedAt"
      ) ON CONFLICT ("matchResultId", "teamId", "teamMemberId") DO UPDATE SET
        "appearanceRecorded" = TRUE,
        "rating" = EXCLUDED."rating",
        "source" = 'CAPTAIN_RECORDED';
    END LOOP;
  END LOOP;
  RETURN NEW;
END;
$$;
