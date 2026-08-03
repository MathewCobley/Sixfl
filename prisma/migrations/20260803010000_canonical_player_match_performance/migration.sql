-- Make one player-match row the authoritative source for appearances, ratings,
-- goals, assists and Player of the Match. This migration is deliberately safe
-- for databases where the legacy runtime-created table already exists.

CREATE TABLE IF NOT EXISTS "PlayerMatchPerformance" (
  "id" TEXT NOT NULL,
  "matchResultId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "teamMemberId" TEXT NOT NULL,
  "played" BOOLEAN NOT NULL DEFAULT TRUE,
  "rating" DOUBLE PRECISION,
  "goals" INTEGER NOT NULL DEFAULT 0,
  "assists" INTEGER NOT NULL DEFAULT 0,
  "isPlayerOfMatch" BOOLEAN NOT NULL DEFAULT FALSE,
  "source" TEXT NOT NULL DEFAULT 'CAPTAIN_RECORDED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlayerMatchPerformance_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PlayerMatchPerformance"
  ADD COLUMN IF NOT EXISTS "goals" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "assists" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "isPlayerOfMatch" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'CAPTAIN_RECORDED';

ALTER TABLE "MatchResultTeamMeta"
  ADD COLUMN IF NOT EXISTS "playerOfMatchTeamMemberId" TEXT;

-- Remove impossible legacy rows before adding/validating the permanent keys.
DELETE FROM "PlayerMatchPerformance" performance
WHERE NOT EXISTS (
    SELECT 1 FROM "MatchResult" result WHERE result."id" = performance."matchResultId"
  )
  OR NOT EXISTS (
    SELECT 1 FROM "Team" team WHERE team."id" = performance."teamId"
  )
  OR NOT EXISTS (
    SELECT 1
    FROM "TeamMember" member
    WHERE member."id" = performance."teamMemberId"
      AND member."teamId" = performance."teamId"
  );

UPDATE "PlayerMatchPerformance"
SET
  "played" = TRUE,
  "rating" = CASE
    WHEN "rating" BETWEEN 1 AND 10 THEN "rating"
    ELSE NULL
  END,
  "goals" = GREATEST(COALESCE("goals", 0), 0),
  "assists" = GREATEST(COALESCE("assists", 0), 0),
  "isPlayerOfMatch" = COALESCE("isPlayerOfMatch", FALSE),
  "source" = COALESCE(NULLIF(BTRIM("source"), ''), 'CAPTAIN_RECORDED'),
  "updatedAt" = NOW();

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'PlayerMatchPerformance_matchResultId_fkey'
  ) THEN
    ALTER TABLE "PlayerMatchPerformance"
      ADD CONSTRAINT "PlayerMatchPerformance_matchResultId_fkey"
      FOREIGN KEY ("matchResultId") REFERENCES "MatchResult"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'PlayerMatchPerformance_teamId_fkey'
  ) THEN
    ALTER TABLE "PlayerMatchPerformance"
      ADD CONSTRAINT "PlayerMatchPerformance_teamId_fkey"
      FOREIGN KEY ("teamId") REFERENCES "Team"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'PlayerMatchPerformance_teamMemberId_fkey'
  ) THEN
    ALTER TABLE "PlayerMatchPerformance"
      ADD CONSTRAINT "PlayerMatchPerformance_teamMemberId_fkey"
      FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'MatchResultTeamMeta_playerOfMatchTeamMemberId_fkey'
  ) THEN
    ALTER TABLE "MatchResultTeamMeta"
      ADD CONSTRAINT "MatchResultTeamMeta_playerOfMatchTeamMemberId_fkey"
      FOREIGN KEY ("playerOfMatchTeamMemberId") REFERENCES "TeamMember"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'PlayerMatchPerformance_non_negative_contributions_check'
  ) THEN
    ALTER TABLE "PlayerMatchPerformance"
      ADD CONSTRAINT "PlayerMatchPerformance_non_negative_contributions_check"
      CHECK ("goals" >= 0 AND "assists" >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'PlayerMatchPerformance_rating_range_check'
  ) THEN
    ALTER TABLE "PlayerMatchPerformance"
      ADD CONSTRAINT "PlayerMatchPerformance_rating_range_check"
      CHECK ("rating" IS NULL OR ("rating" >= 1 AND "rating" <= 10));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'PlayerMatchPerformance_source_check'
  ) THEN
    ALTER TABLE "PlayerMatchPerformance"
      ADD CONSTRAINT "PlayerMatchPerformance_source_check"
      CHECK (
        "source" IN (
          'CAPTAIN_RECORDED',
          'SQUAD_SELECTION',
          'MATCH_CONTRIBUTION',
          'PLAYER_OF_MATCH',
          'ADMIN_CORRECTED',
          'LEGACY_UNKNOWN'
        )
      );
  END IF;
END
$migration$;

CREATE UNIQUE INDEX IF NOT EXISTS "PlayerMatchPerformance_result_team_member_key"
  ON "PlayerMatchPerformance"("matchResultId", "teamId", "teamMemberId");
CREATE INDEX IF NOT EXISTS "PlayerMatchPerformance_teamMemberId_idx"
  ON "PlayerMatchPerformance"("teamMemberId");
CREATE INDEX IF NOT EXISTS "PlayerMatchPerformance_teamId_matchResultId_idx"
  ON "PlayerMatchPerformance"("teamId", "matchResultId");
CREATE UNIQUE INDEX IF NOT EXISTS "PlayerMatchPerformance_one_pom_per_team_result_key"
  ON "PlayerMatchPerformance"("matchResultId", "teamId")
  WHERE "isPlayerOfMatch" = TRUE;
CREATE INDEX IF NOT EXISTS "MatchResultTeamMeta_playerOfMatchTeamMemberId_idx"
  ON "MatchResultTeamMeta"("playerOfMatchTeamMemberId");

CREATE TABLE IF NOT EXISTS "PlayerPerformanceBackfillIssue" (
  "id" TEXT NOT NULL,
  "matchResultId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "reference" JSONB,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "PlayerPerformanceBackfillIssue_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlayerPerformanceBackfillIssue_matchResultId_fkey"
    FOREIGN KEY ("matchResultId") REFERENCES "MatchResult"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PlayerPerformanceBackfillIssue_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "Team"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "PlayerPerformanceBackfillIssue_open_idx"
  ON "PlayerPerformanceBackfillIssue"("resolvedAt", "teamId");

CREATE OR REPLACE FUNCTION "sixfl_normalise_player_name"(value TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $function$
  SELECT LOWER(
    REGEXP_REPLACE(
      BTRIM(COALESCE(value, '')),
      '[[:space:]]+',
      ' ',
      'g'
    )
  );
$function$;

CREATE OR REPLACE FUNCTION "sixfl_resolve_team_member"(
  requested_team_id TEXT,
  requested_member_id TEXT,
  requested_name TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
  resolved_id TEXT;
  candidate_count BIGINT;
BEGIN
  IF NULLIF(BTRIM(COALESCE(requested_member_id, '')), '') IS NOT NULL THEN
    SELECT member."id"
    INTO resolved_id
    FROM "TeamMember" member
    WHERE member."id" = BTRIM(requested_member_id)
      AND member."teamId" = requested_team_id
    LIMIT 1;

    IF resolved_id IS NOT NULL THEN
      RETURN resolved_id;
    END IF;
  END IF;

  IF NULLIF("sixfl_normalise_player_name"(requested_name), '') IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COUNT(*), MIN(member."id")
  INTO candidate_count, resolved_id
  FROM "TeamMember" member
  INNER JOIN "User" account ON account."id" = member."userId"
  WHERE member."teamId" = requested_team_id
    AND "sixfl_normalise_player_name"(
      COALESCE(NULLIF(BTRIM(account."name"), ''), account."email", '')
    ) = "sixfl_normalise_player_name"(requested_name);

  IF candidate_count = 1 THEN
    RETURN resolved_id;
  END IF;

  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION "sixfl_validate_player_match_performance"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
  membership_team_id TEXT;
  home_team_id TEXT;
  away_team_id TEXT;
BEGIN
  SELECT member."teamId"
  INTO membership_team_id
  FROM "TeamMember" member
  WHERE member."id" = NEW."teamMemberId";

  IF membership_team_id IS NULL OR membership_team_id <> NEW."teamId" THEN
    RAISE EXCEPTION 'Player performance membership does not belong to the selected team.';
  END IF;

  SELECT fixture."homeTeamId", fixture."awayTeamId"
  INTO home_team_id, away_team_id
  FROM "MatchResult" result
  INNER JOIN "Fixture" fixture ON fixture."id" = result."fixtureId"
  WHERE result."id" = NEW."matchResultId";

  IF home_team_id IS NULL OR NEW."teamId" NOT IN (home_team_id, away_team_id) THEN
    RAISE EXCEPTION 'Player performance team does not belong to the selected result.';
  END IF;

  NEW."goals" := GREATEST(COALESCE(NEW."goals", 0), 0);
  NEW."assists" := GREATEST(COALESCE(NEW."assists", 0), 0);
  NEW."isPlayerOfMatch" := COALESCE(NEW."isPlayerOfMatch", FALSE);
  NEW."source" := COALESCE(NULLIF(BTRIM(NEW."source"), ''), 'CAPTAIN_RECORDED');

  IF NEW."rating" IS NOT NULL
     OR NEW."goals" > 0
     OR NEW."assists" > 0
     OR NEW."isPlayerOfMatch" THEN
    NEW."played" := TRUE;
  END IF;

  NEW."updatedAt" := NOW();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS "PlayerMatchPerformance_validate" ON "PlayerMatchPerformance";
CREATE TRIGGER "PlayerMatchPerformance_validate"
BEFORE INSERT OR UPDATE ON "PlayerMatchPerformance"
FOR EACH ROW
EXECUTE FUNCTION "sixfl_validate_player_match_performance"();

CREATE OR REPLACE FUNCTION "sixfl_resolve_player_of_match_member"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
  contribution JSONB;
  resolved_member_id TEXT;
BEGIN
  IF NULLIF(BTRIM(COALESCE(NEW."playerOfMatchName", '')), '') IS NULL THEN
    NEW."playerOfMatchTeamMemberId" := NULL;
    RETURN NEW;
  END IF;

  IF JSONB_TYPEOF(COALESCE(NEW."scorers"::jsonb, '[]'::jsonb)) = 'array' THEN
    FOR contribution IN
      SELECT value
      FROM JSONB_ARRAY_ELEMENTS(COALESCE(NEW."scorers"::jsonb, '[]'::jsonb))
    LOOP
      IF "sixfl_normalise_player_name"(contribution ->> 'name') =
         "sixfl_normalise_player_name"(NEW."playerOfMatchName") THEN
        resolved_member_id := "sixfl_resolve_team_member"(
          NEW."teamId",
          contribution ->> 'teamMemberId',
          contribution ->> 'name'
        );
        EXIT WHEN resolved_member_id IS NOT NULL;
      END IF;
    END LOOP;
  END IF;

  IF resolved_member_id IS NULL THEN
    resolved_member_id := "sixfl_resolve_team_member"(
      NEW."teamId",
      NULL,
      NEW."playerOfMatchName"
    );
  END IF;

  NEW."playerOfMatchTeamMemberId" := resolved_member_id;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS "MatchResultTeamMeta_resolve_player_of_match" ON "MatchResultTeamMeta";
CREATE TRIGGER "MatchResultTeamMeta_resolve_player_of_match"
BEFORE INSERT OR UPDATE OF "scorers", "playerOfMatchName", "teamId"
ON "MatchResultTeamMeta"
FOR EACH ROW
EXECUTE FUNCTION "sixfl_resolve_player_of_match_member"();

CREATE OR REPLACE FUNCTION "sixfl_sync_player_performance_from_meta"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
  contribution JSONB;
  resolved_member_id TEXT;
  contribution_goals INTEGER;
  contribution_assists INTEGER;
  issue_id TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtext('player-performance:' || NEW."matchResultId" || ':' || NEW."teamId")
  );

  UPDATE "PlayerPerformanceBackfillIssue"
  SET "resolvedAt" = NOW()
  WHERE "matchResultId" = NEW."matchResultId"
    AND "teamId" = NEW."teamId"
    AND "resolvedAt" IS NULL;

  UPDATE "PlayerMatchPerformance"
  SET
    "goals" = 0,
    "assists" = 0,
    "isPlayerOfMatch" = FALSE,
    "updatedAt" = NOW()
  WHERE "matchResultId" = NEW."matchResultId"
    AND "teamId" = NEW."teamId";

  IF JSONB_TYPEOF(COALESCE(NEW."scorers"::jsonb, '[]'::jsonb)) = 'array' THEN
    FOR contribution IN
      SELECT value
      FROM JSONB_ARRAY_ELEMENTS(COALESCE(NEW."scorers"::jsonb, '[]'::jsonb))
    LOOP
      contribution_goals := CASE
        WHEN COALESCE(contribution ->> 'goals', '') ~ '^[0-9]+$'
          THEN (contribution ->> 'goals')::INTEGER
        ELSE 0
      END;
      contribution_assists := CASE
        WHEN COALESCE(contribution ->> 'assists', '') ~ '^[0-9]+$'
          THEN (contribution ->> 'assists')::INTEGER
        ELSE 0
      END;

      IF contribution_goals + contribution_assists = 0 THEN
        CONTINUE;
      END IF;

      resolved_member_id := "sixfl_resolve_team_member"(
        NEW."teamId",
        contribution ->> 'teamMemberId',
        contribution ->> 'name'
      );

      IF resolved_member_id IS NULL THEN
        issue_id := MD5(
          NEW."matchResultId" || ':' || NEW."teamId" || ':SCORER:' || contribution::TEXT
        );
        INSERT INTO "PlayerPerformanceBackfillIssue" (
          "id", "matchResultId", "teamId", "kind", "reference", "reason", "resolvedAt"
        ) VALUES (
          issue_id,
          NEW."matchResultId",
          NEW."teamId",
          'SCORER',
          contribution,
          'No single team membership could be matched safely.',
          NULL
        )
        ON CONFLICT ("id") DO UPDATE SET
          "reference" = EXCLUDED."reference",
          "reason" = EXCLUDED."reason",
          "resolvedAt" = NULL;
        CONTINUE;
      END IF;

      INSERT INTO "PlayerMatchPerformance" (
        "id",
        "matchResultId",
        "teamId",
        "teamMemberId",
        "played",
        "rating",
        "goals",
        "assists",
        "isPlayerOfMatch",
        "source",
        "createdAt",
        "updatedAt"
      ) VALUES (
        MD5(NEW."matchResultId" || ':' || NEW."teamId" || ':' || resolved_member_id),
        NEW."matchResultId",
        NEW."teamId",
        resolved_member_id,
        TRUE,
        NULL,
        contribution_goals,
        contribution_assists,
        FALSE,
        'MATCH_CONTRIBUTION',
        NOW(),
        NOW()
      )
      ON CONFLICT ("matchResultId", "teamId", "teamMemberId") DO UPDATE SET
        "played" = TRUE,
        "goals" = "PlayerMatchPerformance"."goals" + EXCLUDED."goals",
        "assists" = "PlayerMatchPerformance"."assists" + EXCLUDED."assists",
        "source" = CASE
          WHEN "PlayerMatchPerformance"."source" = 'CAPTAIN_RECORDED'
            THEN "PlayerMatchPerformance"."source"
          ELSE EXCLUDED."source"
        END,
        "updatedAt" = NOW();
    END LOOP;
  END IF;

  IF NEW."playerOfMatchTeamMemberId" IS NOT NULL THEN
    INSERT INTO "PlayerMatchPerformance" (
      "id",
      "matchResultId",
      "teamId",
      "teamMemberId",
      "played",
      "rating",
      "goals",
      "assists",
      "isPlayerOfMatch",
      "source",
      "createdAt",
      "updatedAt"
    ) VALUES (
      MD5(
        NEW."matchResultId" || ':' || NEW."teamId" || ':' ||
        NEW."playerOfMatchTeamMemberId"
      ),
      NEW."matchResultId",
      NEW."teamId",
      NEW."playerOfMatchTeamMemberId",
      TRUE,
      NULL,
      0,
      0,
      TRUE,
      'PLAYER_OF_MATCH',
      NOW(),
      NOW()
    )
    ON CONFLICT ("matchResultId", "teamId", "teamMemberId") DO UPDATE SET
      "played" = TRUE,
      "isPlayerOfMatch" = TRUE,
      "source" = CASE
        WHEN "PlayerMatchPerformance"."source" = 'CAPTAIN_RECORDED'
          THEN "PlayerMatchPerformance"."source"
        ELSE EXCLUDED."source"
      END,
      "updatedAt" = NOW();
  ELSIF NULLIF(BTRIM(COALESCE(NEW."playerOfMatchName", '')), '') IS NOT NULL THEN
    issue_id := MD5(
      NEW."matchResultId" || ':' || NEW."teamId" || ':POM:' || NEW."playerOfMatchName"
    );
    INSERT INTO "PlayerPerformanceBackfillIssue" (
      "id", "matchResultId", "teamId", "kind", "reference", "reason", "resolvedAt"
    ) VALUES (
      issue_id,
      NEW."matchResultId",
      NEW."teamId",
      'PLAYER_OF_MATCH',
      JSONB_BUILD_OBJECT('name', NEW."playerOfMatchName"),
      'No single team membership could be matched safely.',
      NULL
    )
    ON CONFLICT ("id") DO UPDATE SET
      "reference" = EXCLUDED."reference",
      "reason" = EXCLUDED."reason",
      "resolvedAt" = NULL;
  END IF;

  UPDATE "PlayerMatchPerformance"
  SET "played" = TRUE, "updatedAt" = NOW()
  WHERE "matchResultId" = NEW."matchResultId"
    AND "teamId" = NEW."teamId"
    AND (
      "rating" IS NOT NULL
      OR "goals" > 0
      OR "assists" > 0
      OR "isPlayerOfMatch" = TRUE
    );

  DELETE FROM "PlayerMatchPerformance"
  WHERE "matchResultId" = NEW."matchResultId"
    AND "teamId" = NEW."teamId"
    AND "played" = FALSE
    AND "rating" IS NULL
    AND "goals" = 0
    AND "assists" = 0
    AND "isPlayerOfMatch" = FALSE;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS "MatchResultTeamMeta_sync_player_performance" ON "MatchResultTeamMeta";
CREATE TRIGGER "MatchResultTeamMeta_sync_player_performance"
AFTER INSERT OR UPDATE OF "scorers", "playerOfMatchName", "teamId"
ON "MatchResultTeamMeta"
FOR EACH ROW
EXECUTE FUNCTION "sixfl_sync_player_performance_from_meta"();

-- A completed selected squad is valid historical evidence of an appearance.
INSERT INTO "PlayerMatchPerformance" (
  "id",
  "matchResultId",
  "teamId",
  "teamMemberId",
  "played",
  "rating",
  "goals",
  "assists",
  "isPlayerOfMatch",
  "source",
  "createdAt",
  "updatedAt"
)
SELECT
  MD5(result."id" || ':' || member."teamId" || ':' || member."id"),
  result."id",
  member."teamId",
  member."id",
  TRUE,
  NULL,
  0,
  0,
  FALSE,
  'SQUAD_SELECTION',
  NOW(),
  NOW()
FROM "FixtureSelection" selection
INNER JOIN "TeamMember" member ON member."id" = selection."teamMemberId"
INNER JOIN "Fixture" fixture ON fixture."id" = selection."fixtureId"
INNER JOIN "MatchResult" result ON result."fixtureId" = fixture."id"
WHERE selection."selectionStatus" = 'SELECTED'
  AND member."teamId" IN (fixture."homeTeamId", fixture."awayTeamId")
ON CONFLICT ("matchResultId", "teamId", "teamMemberId") DO UPDATE SET
  "played" = TRUE,
  "source" = CASE
    WHEN "PlayerMatchPerformance"."source" = 'CAPTAIN_RECORDED'
      THEN "PlayerMatchPerformance"."source"
    ELSE EXCLUDED."source"
  END,
  "updatedAt" = NOW();

-- Resolve Player of the Match IDs and run the canonical contribution backfill.
UPDATE "MatchResultTeamMeta"
SET "playerOfMatchName" = "playerOfMatchName";
