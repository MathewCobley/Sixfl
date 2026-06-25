-- ========================================
-- Migration: link promoted prospect comms history to managed squad members
-- ========================================

CREATE OR REPLACE FUNCTION sixfl_link_team_member_profile_to_prospect(
  p_team_member_id TEXT,
  p_prospect_id TEXT
)
RETURNS VOID AS $$
DECLARE
  matched_prospect RECORD;
BEGIN
  SELECT
    p."id",
    p."phone",
    p."ageBand",
    p."preferredPositions",
    p."experienceSummary",
    p."availabilityLevel",
    p."preferredNights",
    p."availabilitySummary",
    p."notes"
  INTO matched_prospect
  FROM "TeamPlayerProspect" p
  WHERE p."id" = p_prospect_id
  LIMIT 1;

  IF matched_prospect."id" IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "TeamMemberProfile" existing_profile
    WHERE existing_profile."sourceProspectId" = matched_prospect."id"
      AND existing_profile."teamMemberId" <> p_team_member_id
  ) THEN
    RETURN;
  END IF;

  INSERT INTO "TeamMemberProfile" (
    "id",
    "teamMemberId",
    "sourceProspectId",
    "phone",
    "ageBand",
    "preferredPositions",
    "experienceSummary",
    "availabilityLevel",
    "preferredNights",
    "availabilitySummary",
    "notes",
    "createdAt",
    "updatedAt"
  ) VALUES (
    CONCAT('tmp_', MD5(p_team_member_id)),
    p_team_member_id,
    matched_prospect."id",
    matched_prospect."phone",
    matched_prospect."ageBand",
    matched_prospect."preferredPositions",
    matched_prospect."experienceSummary",
    matched_prospect."availabilityLevel",
    matched_prospect."preferredNights",
    matched_prospect."availabilitySummary",
    matched_prospect."notes",
    NOW(),
    NOW()
  )
  ON CONFLICT ("teamMemberId") DO UPDATE SET
    "sourceProspectId" = COALESCE("TeamMemberProfile"."sourceProspectId", EXCLUDED."sourceProspectId"),
    "phone" = COALESCE("TeamMemberProfile"."phone", EXCLUDED."phone"),
    "ageBand" = COALESCE("TeamMemberProfile"."ageBand", EXCLUDED."ageBand"),
    "preferredPositions" = COALESCE("TeamMemberProfile"."preferredPositions", EXCLUDED."preferredPositions"),
    "experienceSummary" = COALESCE("TeamMemberProfile"."experienceSummary", EXCLUDED."experienceSummary"),
    "availabilityLevel" = COALESCE("TeamMemberProfile"."availabilityLevel", EXCLUDED."availabilityLevel"),
    "preferredNights" = COALESCE("TeamMemberProfile"."preferredNights", EXCLUDED."preferredNights"),
    "availabilitySummary" = COALESCE("TeamMemberProfile"."availabilitySummary", EXCLUDED."availabilitySummary"),
    "notes" = COALESCE("TeamMemberProfile"."notes", EXCLUDED."notes"),
    "updatedAt" = NOW()
  WHERE "TeamMemberProfile"."sourceProspectId" IS NULL
     OR "TeamMemberProfile"."sourceProspectId" = EXCLUDED."sourceProspectId";
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION sixfl_link_inserted_team_member_to_prospect()
RETURNS TRIGGER AS $$
DECLARE
  matched_prospect_id TEXT;
BEGIN
  SELECT p."id"
  INTO matched_prospect_id
  FROM "TeamMember" tm
  JOIN "Team" t ON t."id" = tm."teamId"
  JOIN "User" u ON u."id" = tm."userId"
  JOIN "TeamPlayerProspect" p
    ON p."teamId" = tm."teamId"
   AND LOWER(TRIM(p."email")) = LOWER(TRIM(u."email"))
  WHERE tm."id" = NEW."id"
    AND t."teamMode" = 'MANAGED'
    AND u."email" IS NOT NULL
    AND TRIM(u."email") <> ''
    AND p."email" IS NOT NULL
    AND TRIM(p."email") <> ''
    AND NOT EXISTS (
      SELECT 1
      FROM "TeamMemberProfile" existing_profile
      WHERE existing_profile."sourceProspectId" = p."id"
        AND existing_profile."teamMemberId" <> NEW."id"
    )
  ORDER BY
    CASE WHEN p."status" = 'ACTIVE_SQUAD' THEN 0 ELSE 1 END,
    p."updatedAt" DESC,
    p."createdAt" DESC
  LIMIT 1;

  IF matched_prospect_id IS NOT NULL THEN
    PERFORM sixfl_link_team_member_profile_to_prospect(NEW."id", matched_prospect_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION sixfl_link_active_prospect_to_team_member()
RETURNS TRIGGER AS $$
DECLARE
  matched_team_member_id TEXT;
BEGIN
  IF NEW."teamId" IS NULL
     OR NEW."email" IS NULL
     OR TRIM(NEW."email") = ''
     OR NEW."status" <> 'ACTIVE_SQUAD' THEN
    RETURN NEW;
  END IF;

  SELECT tm."id"
  INTO matched_team_member_id
  FROM "TeamMember" tm
  JOIN "Team" t ON t."id" = tm."teamId"
  JOIN "User" u ON u."id" = tm."userId"
  LEFT JOIN "TeamMemberProfile" tmp ON tmp."teamMemberId" = tm."id"
  WHERE tm."teamId" = NEW."teamId"
    AND t."teamMode" = 'MANAGED'
    AND u."email" IS NOT NULL
    AND LOWER(TRIM(u."email")) = LOWER(TRIM(NEW."email"))
    AND (tmp."sourceProspectId" IS NULL OR tmp."sourceProspectId" = NEW."id")
    AND NOT EXISTS (
      SELECT 1
      FROM "TeamMemberProfile" existing_profile
      WHERE existing_profile."sourceProspectId" = NEW."id"
        AND existing_profile."teamMemberId" <> tm."id"
    )
  ORDER BY tm."createdAt" DESC
  LIMIT 1;

  IF matched_team_member_id IS NOT NULL THEN
    PERFORM sixfl_link_team_member_profile_to_prospect(matched_team_member_id, NEW."id");
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sixfl_link_inserted_team_member_to_prospect_trigger ON "TeamMember";
CREATE TRIGGER sixfl_link_inserted_team_member_to_prospect_trigger
AFTER INSERT ON "TeamMember"
FOR EACH ROW
EXECUTE FUNCTION sixfl_link_inserted_team_member_to_prospect();

DROP TRIGGER IF EXISTS sixfl_link_active_prospect_to_team_member_trigger ON "TeamPlayerProspect";
CREATE TRIGGER sixfl_link_active_prospect_to_team_member_trigger
AFTER INSERT OR UPDATE OF "teamId", "email", "status" ON "TeamPlayerProspect"
FOR EACH ROW
EXECUTE FUNCTION sixfl_link_active_prospect_to_team_member();

-- Backfill existing promoted prospects so their prospect/player communication history
-- appears immediately on the managed squad player communication page.
SELECT sixfl_link_team_member_profile_to_prospect(tm."id", p."id")
FROM "TeamMember" tm
JOIN "Team" t ON t."id" = tm."teamId"
JOIN "User" u ON u."id" = tm."userId"
CROSS JOIN LATERAL (
  SELECT prospect."id"
  FROM "TeamPlayerProspect" prospect
  WHERE prospect."teamId" = tm."teamId"
    AND prospect."email" IS NOT NULL
    AND u."email" IS NOT NULL
    AND LOWER(TRIM(prospect."email")) = LOWER(TRIM(u."email"))
    AND NOT EXISTS (
      SELECT 1
      FROM "TeamMemberProfile" existing_profile
      WHERE existing_profile."sourceProspectId" = prospect."id"
        AND existing_profile."teamMemberId" <> tm."id"
    )
  ORDER BY
    CASE WHEN prospect."status" = 'ACTIVE_SQUAD' THEN 0 ELSE 1 END,
    prospect."updatedAt" DESC,
    prospect."createdAt" DESC
  LIMIT 1
) p
LEFT JOIN "TeamMemberProfile" tmp ON tmp."teamMemberId" = tm."id"
WHERE t."teamMode" = 'MANAGED'
  AND u."email" IS NOT NULL
  AND TRIM(u."email") <> ''
  AND (tmp."sourceProspectId" IS NULL OR tmp."sourceProspectId" = p."id");
