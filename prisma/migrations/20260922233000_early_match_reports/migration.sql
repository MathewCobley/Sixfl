CREATE TABLE "FixtureMatchReport" (
  "fixtureId" TEXT NOT NULL REFERENCES "Fixture"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "teamId" TEXT NOT NULL,
  "contributions" JSONB NOT NULL,
  "performances" JSONB NOT NULL,
  "playerOfMatchName" TEXT,
  "coreCompletedAt" TIMESTAMP(3),
  "assistsCompletedAt" TIMESTAMP(3),
  "ratingsCompletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  PRIMARY KEY ("fixtureId", "teamId")
);

-- Share the fixture lock with early-report saves. This closes the race between
-- checking for a result and committing a report, for ALL result entry routes.
CREATE FUNCTION sixfl_lock_early_report_fixture() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM "Fixture" WHERE "id" = NEW."fixtureId" FOR UPDATE;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "MatchResult_lock_early_report_fixture"
BEFORE INSERT ON "MatchResult" FOR EACH ROW EXECUTE FUNCTION sixfl_lock_early_report_fixture();

-- Promotion is part of result creation, never a page-load side effect. Existing
-- metadata/performance triggers remain authoritative for player statistics.
CREATE FUNCTION sixfl_promote_early_match_reports() RETURNS TRIGGER LANGUAGE plpgsql AS $$
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
      "id", "matchResultId", "teamId", "scorers", "goalsRecorded", "playerOfMatchName",
      "priorityCoreCompletedAt", "priorityAssistsCompletedAt", "priorityRatingsCompletedAt", "createdAt", "updatedAt"
    ) VALUES (
      'early-meta-' || MD5(NEW."id" || ':' || report."teamId"), NEW."id", report."teamId",
      report."contributions", goal_total, report."playerOfMatchName",
      CASE WHEN goal_total = expected THEN report."coreCompletedAt" END,
      CASE WHEN expected = 0 THEN report."coreCompletedAt" ELSE report."assistsCompletedAt" END,
      report."ratingsCompletedAt", report."createdAt", report."updatedAt"
    ) ON CONFLICT ("matchResultId", "teamId") DO NOTHING RETURNING "id" INTO meta_id;
    IF meta_id IS NULL THEN CONTINUE; END IF;

    FOR performance IN SELECT value FROM JSONB_ARRAY_ELEMENTS(report."performances") LOOP
      -- Removed squad memberships must never prevent recording an official result.
      IF NOT EXISTS (SELECT 1 FROM "TeamMember" WHERE "id" = performance->>'teamMemberId' AND "teamId" = report."teamId") THEN
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
        "appearanceRecorded" = TRUE, "rating" = EXCLUDED."rating", "source" = 'CAPTAIN_RECORDED';
    END LOOP;
  END LOOP;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "MatchResult_promote_early_reports"
AFTER INSERT ON "MatchResult" FOR EACH ROW EXECUTE FUNCTION sixfl_promote_early_match_reports();
