-- Route Meta recruitment leads to the real local league records rather than the
-- retired Heartlands holding league. Marketing area and operational league are
-- deliberately separate: Richmond is a recruitment area for Catterick Monday.

CREATE OR REPLACE FUNCTION "route_meta_lead_to_local_league"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  destination_id text;
  lead_area text := LOWER(TRIM(COALESCE(NEW."area", '')));
  lead_message text := LOWER(COALESCE(NEW."message", ''));
  is_meta boolean := COALESCE(NEW."source", '') ILIKE 'Meta - %'
    OR COALESCE(NEW."message", '') ILIKE '%Meta lead ID:%';
BEGIN
  IF NOT is_meta THEN
    RETURN NEW;
  END IF;

  -- Catterick and Richmond campaigns feed the same Monday competition in Catterick.
  IF lead_area LIKE '%catterick%'
     OR lead_area LIKE '%richmond%'
     OR lead_message LIKE '%ad:%catterick%'
     OR lead_message LIKE '%ad:%richmond%' THEN
    SELECT league."id"
    INTO destination_id
    FROM "League" league
    WHERE league."isActive" = TRUE
      AND league."dayOfWeek"::text = 'MONDAY'
      AND (
        LOWER(COALESCE(league."name", '')) LIKE '%catterick%'
        OR LOWER(COALESCE(league."slug", '')) LIKE '%catterick%'
        OR LOWER(COALESCE(league."area", '')) LIKE '%catterick%'
        OR LOWER(COALESCE(league."venueName", '')) LIKE '%catterick%'
      )
    ORDER BY league."createdAt" DESC
    LIMIT 1;

    IF destination_id IS NOT NULL THEN
      NEW."leagueId" := destination_id;
    END IF;

    RETURN NEW;
  END IF;

  -- Thirsk campaigns feed the dedicated Thirsk league record.
  IF lead_area LIKE '%thirsk%'
     OR lead_message LIKE '%ad:%thirsk%' THEN
    SELECT league."id"
    INTO destination_id
    FROM "League" league
    WHERE league."isActive" = TRUE
      AND (
        LOWER(COALESCE(league."name", '')) LIKE '%thirsk%'
        OR LOWER(COALESCE(league."slug", '')) LIKE '%thirsk%'
        OR LOWER(COALESCE(league."area", '')) LIKE '%thirsk%'
        OR LOWER(COALESCE(league."venueName", '')) LIKE '%thirsk%'
      )
    ORDER BY league."createdAt" DESC
    LIMIT 1;

    IF destination_id IS NOT NULL THEN
      NEW."leagueId" := destination_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "InterestLead_route_meta_to_local_league" ON "InterestLead";
CREATE TRIGGER "InterestLead_route_meta_to_local_league"
BEFORE INSERT ON "InterestLead"
FOR EACH ROW
EXECUTE FUNCTION "route_meta_lead_to_local_league"();

-- Correct Meta leads that were previously placed in Heartlands (or left unset).
WITH catterick_league AS (
  SELECT league."id"
  FROM "League" league
  WHERE league."isActive" = TRUE
    AND league."dayOfWeek"::text = 'MONDAY'
    AND (
      LOWER(COALESCE(league."name", '')) LIKE '%catterick%'
      OR LOWER(COALESCE(league."slug", '')) LIKE '%catterick%'
      OR LOWER(COALESCE(league."area", '')) LIKE '%catterick%'
      OR LOWER(COALESCE(league."venueName", '')) LIKE '%catterick%'
    )
  ORDER BY league."createdAt" DESC
  LIMIT 1
)
UPDATE "InterestLead" AS lead
SET
  "leagueId" = catterick_league."id",
  "updatedAt" = CURRENT_TIMESTAMP
FROM catterick_league
WHERE (
    COALESCE(lead."source", '') ILIKE 'Meta - %'
    OR COALESCE(lead."message", '') ILIKE '%Meta lead ID:%'
  )
  AND (
    LOWER(COALESCE(lead."area", '')) LIKE '%catterick%'
    OR LOWER(COALESCE(lead."area", '')) LIKE '%richmond%'
    OR LOWER(COALESCE(lead."message", '')) LIKE '%ad:%catterick%'
    OR LOWER(COALESCE(lead."message", '')) LIKE '%ad:%richmond%'
  )
  AND (
    lead."leagueId" IS NULL
    OR EXISTS (
      SELECT 1
      FROM "League" old_league
      WHERE old_league."id" = lead."leagueId"
        AND (
          LOWER(COALESCE(old_league."name", '')) LIKE '%heartlands%'
          OR LOWER(COALESCE(old_league."slug", '')) LIKE '%heartlands%'
        )
    )
  );

WITH thirsk_league AS (
  SELECT league."id"
  FROM "League" league
  WHERE league."isActive" = TRUE
    AND (
      LOWER(COALESCE(league."name", '')) LIKE '%thirsk%'
      OR LOWER(COALESCE(league."slug", '')) LIKE '%thirsk%'
      OR LOWER(COALESCE(league."area", '')) LIKE '%thirsk%'
      OR LOWER(COALESCE(league."venueName", '')) LIKE '%thirsk%'
    )
  ORDER BY league."createdAt" DESC
  LIMIT 1
)
UPDATE "InterestLead" AS lead
SET
  "leagueId" = thirsk_league."id",
  "updatedAt" = CURRENT_TIMESTAMP
FROM thirsk_league
WHERE (
    COALESCE(lead."source", '') ILIKE 'Meta - %'
    OR COALESCE(lead."message", '') ILIKE '%Meta lead ID:%'
  )
  AND (
    LOWER(COALESCE(lead."area", '')) LIKE '%thirsk%'
    OR LOWER(COALESCE(lead."message", '')) LIKE '%ad:%thirsk%'
  )
  AND (
    lead."leagueId" IS NULL
    OR EXISTS (
      SELECT 1
      FROM "League" old_league
      WHERE old_league."id" = lead."leagueId"
        AND (
          LOWER(COALESCE(old_league."name", '')) LIKE '%heartlands%'
          OR LOWER(COALESCE(old_league."slug", '')) LIKE '%heartlands%'
        )
    )
  );
