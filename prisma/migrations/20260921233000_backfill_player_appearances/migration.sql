-- Keep player appearance totals useful when historical match details were not
-- explicitly completed.  Captain-recorded match squads remain authoritative;
-- otherwise a completed selected squad is accepted as appearance evidence, with
-- PAID/WAIVED player match fees as a conservative legacy fallback.

CREATE OR REPLACE FUNCTION "sixfl_add_inferred_player_appearance"(
  requested_result_id TEXT,
  requested_team_id TEXT,
  requested_member_id TEXT,
  requested_source TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
DECLARE
  membership_team_id TEXT;
  home_team_id TEXT;
  away_team_id TEXT;
BEGIN
  IF requested_source NOT IN ('SQUAD_SELECTION', 'LEGACY_UNKNOWN') THEN
    RAISE EXCEPTION 'Unsupported inferred player-performance source.';
  END IF;

  SELECT member."teamId"
  INTO membership_team_id
  FROM "TeamMember" member
  WHERE member."id" = requested_member_id;

  SELECT fixture."homeTeamId", fixture."awayTeamId"
  INTO home_team_id, away_team_id
  FROM "MatchResult" result
  INNER JOIN "Fixture" fixture ON fixture."id" = result."fixtureId"
  WHERE result."id" = requested_result_id;

  IF membership_team_id IS NULL
    OR membership_team_id <> requested_team_id
    OR home_team_id IS NULL
    OR requested_team_id NOT IN (home_team_id, away_team_id)
  THEN
    RETURN;
  END IF;

  -- Once a captain has explicitly recorded the match squad, do not infer extra
  -- appearances for that team/result from selections or payment history.
  IF EXISTS (
    SELECT 1
    FROM "PlayerMatchPerformance" performance
    WHERE performance."matchResultId" = requested_result_id
      AND performance."teamId" = requested_team_id
      AND performance."source" = 'CAPTAIN_RECORDED'
      AND performance."appearanceRecorded" = TRUE
  ) THEN
    RETURN;
  END IF;

  INSERT INTO "PlayerMatchPerformance" (
    "id",
    "matchResultId",
    "teamId",
    "teamMemberId",
    "played",
    "appearanceRecorded",
    "rating",
    "goals",
    "assists",
    "isPlayerOfMatch",
    "source",
    "createdAt",
    "updatedAt"
  ) VALUES (
    MD5(requested_result_id || ':' || requested_team_id || ':' || requested_member_id),
    requested_result_id,
    requested_team_id,
    requested_member_id,
    TRUE,
    TRUE,
    NULL,
    0,
    0,
    FALSE,
    requested_source,
    NOW(),
    NOW()
  )
  ON CONFLICT ("matchResultId", "teamId", "teamMemberId") DO UPDATE SET
    "appearanceRecorded" = TRUE,
    "source" = CASE
      WHEN "PlayerMatchPerformance"."source" IN (
        'CAPTAIN_RECORDED',
        'MATCH_CONTRIBUTION',
        'PLAYER_OF_MATCH',
        'SQUAD_SELECTION'
      )
        THEN "PlayerMatchPerformance"."source"
      ELSE EXCLUDED."source"
    END,
    "updatedAt" = NOW();
END
$function$;

-- Re-run the selected-squad backfill against all completed fixtures so matches
-- played since the original August migration are included too.
SELECT "sixfl_add_inferred_player_appearance"(
  result."id",
  member."teamId",
  member."id",
  'SQUAD_SELECTION'
)
FROM "FixtureSelection" selection
INNER JOIN "TeamMember" member ON member."id" = selection."teamMemberId"
INNER JOIN "Fixture" fixture ON fixture."id" = selection."fixtureId"
INNER JOIN "MatchResult" result ON result."fixtureId" = fixture."id"
WHERE selection."selectionStatus" = 'SELECTED'
  AND member."teamId" IN (fixture."homeTeamId", fixture."awayTeamId");

-- Older teams did not always have a saved matchday selection.  A settled or
-- deliberately waived player fee on a completed fixture is useful secondary
-- evidence that the player took part.  OPEN and CANCELLED fees are deliberately
-- excluded because they are weaker evidence.
SELECT "sixfl_add_inferred_player_appearance"(
  result."id",
  fee."teamId",
  fee."teamMemberId",
  'LEGACY_UNKNOWN'
)
FROM "PlayerMatchFee" fee
INNER JOIN "TeamMember" member ON member."id" = fee."teamMemberId"
INNER JOIN "Fixture" fixture ON fixture."id" = fee."fixtureId"
INNER JOIN "MatchResult" result ON result."fixtureId" = fixture."id"
WHERE fee."teamMemberId" IS NOT NULL
  AND fee."status"::TEXT IN ('PAID', 'WAIVED')
  AND fee."cancelledAt" IS NULL
  AND member."teamId" = fee."teamId"
  AND fee."teamId" IN (fixture."homeTeamId", fixture."awayTeamId");

-- If a match result is saved after the matchday squad/payment records already
-- exist, immediately create the inferred appearance rows.
CREATE OR REPLACE FUNCTION "sixfl_sync_inferred_appearances_from_result"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
  row_data RECORD;
BEGIN
  FOR row_data IN
    SELECT member."teamId" AS team_id, member."id" AS member_id
    FROM "FixtureSelection" selection
    INNER JOIN "TeamMember" member ON member."id" = selection."teamMemberId"
    INNER JOIN "Fixture" fixture ON fixture."id" = NEW."fixtureId"
    WHERE selection."fixtureId" = NEW."fixtureId"
      AND selection."selectionStatus" = 'SELECTED'
      AND member."teamId" IN (fixture."homeTeamId", fixture."awayTeamId")
  LOOP
    PERFORM "sixfl_add_inferred_player_appearance"(
      NEW."id",
      row_data.team_id,
      row_data.member_id,
      'SQUAD_SELECTION'
    );
  END LOOP;

  FOR row_data IN
    SELECT fee."teamId" AS team_id, fee."teamMemberId" AS member_id
    FROM "PlayerMatchFee" fee
    INNER JOIN "TeamMember" member ON member."id" = fee."teamMemberId"
    INNER JOIN "Fixture" fixture ON fixture."id" = NEW."fixtureId"
    WHERE fee."fixtureId" = NEW."fixtureId"
      AND fee."teamMemberId" IS NOT NULL
      AND fee."status"::TEXT IN ('PAID', 'WAIVED')
      AND fee."cancelledAt" IS NULL
      AND member."teamId" = fee."teamId"
      AND fee."teamId" IN (fixture."homeTeamId", fixture."awayTeamId")
  LOOP
    PERFORM "sixfl_add_inferred_player_appearance"(
      NEW."id",
      row_data.team_id,
      row_data.member_id,
      'LEGACY_UNKNOWN'
    );
  END LOOP;

  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS "MatchResult_sync_inferred_appearances" ON "MatchResult";
CREATE TRIGGER "MatchResult_sync_inferred_appearances"
AFTER INSERT ON "MatchResult"
FOR EACH ROW
EXECUTE FUNCTION "sixfl_sync_inferred_appearances_from_result"();

-- If the selected squad is finalised after a result already exists, keep the
-- appearance table in step without waiting for another backfill.
CREATE OR REPLACE FUNCTION "sixfl_sync_inferred_appearance_from_selection"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
  result_id TEXT;
  team_id TEXT;
BEGIN
  IF NEW."selectionStatus" <> 'SELECTED' THEN
    RETURN NEW;
  END IF;

  SELECT result."id", member."teamId"
  INTO result_id, team_id
  FROM "TeamMember" member
  INNER JOIN "Fixture" fixture ON fixture."id" = NEW."fixtureId"
  LEFT JOIN "MatchResult" result ON result."fixtureId" = fixture."id"
  WHERE member."id" = NEW."teamMemberId"
    AND member."teamId" IN (fixture."homeTeamId", fixture."awayTeamId");

  IF result_id IS NOT NULL AND team_id IS NOT NULL THEN
    PERFORM "sixfl_add_inferred_player_appearance"(
      result_id,
      team_id,
      NEW."teamMemberId",
      'SQUAD_SELECTION'
    );
  END IF;

  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS "FixtureSelection_sync_inferred_appearance" ON "FixtureSelection";
CREATE TRIGGER "FixtureSelection_sync_inferred_appearance"
AFTER INSERT OR UPDATE OF "selectionStatus", "fixtureId", "teamMemberId"
ON "FixtureSelection"
FOR EACH ROW
EXECUTE FUNCTION "sixfl_sync_inferred_appearance_from_selection"();

-- A fee settled/waived after the result is saved is also allowed to supply the
-- conservative legacy fallback evidence.
CREATE OR REPLACE FUNCTION "sixfl_sync_inferred_appearance_from_fee"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
  result_id TEXT;
BEGIN
  IF NEW."teamMemberId" IS NULL
    OR NEW."cancelledAt" IS NOT NULL
    OR NEW."status"::TEXT NOT IN ('PAID', 'WAIVED')
  THEN
    RETURN NEW;
  END IF;

  SELECT result."id"
  INTO result_id
  FROM "MatchResult" result
  INNER JOIN "Fixture" fixture ON fixture."id" = result."fixtureId"
  INNER JOIN "TeamMember" member ON member."id" = NEW."teamMemberId"
  WHERE result."fixtureId" = NEW."fixtureId"
    AND member."teamId" = NEW."teamId"
    AND NEW."teamId" IN (fixture."homeTeamId", fixture."awayTeamId");

  IF result_id IS NOT NULL THEN
    PERFORM "sixfl_add_inferred_player_appearance"(
      result_id,
      NEW."teamId",
      NEW."teamMemberId",
      'LEGACY_UNKNOWN'
    );
  END IF;

  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS "PlayerMatchFee_sync_inferred_appearance" ON "PlayerMatchFee";
CREATE TRIGGER "PlayerMatchFee_sync_inferred_appearance"
AFTER INSERT OR UPDATE OF "status", "cancelledAt", "teamMemberId", "fixtureId"
ON "PlayerMatchFee"
FOR EACH ROW
EXECUTE FUNCTION "sixfl_sync_inferred_appearance_from_fee"();
