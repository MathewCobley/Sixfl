-- Backfill captain member-profile mobile numbers from existing team/lead contact data.
-- Only exact email matches are used. If the same email has conflicting known
-- mobile numbers for a team, that captain is deliberately skipped.
-- Existing non-empty TeamMemberProfile.phone values are never overwritten.

DO $$
BEGIN
  IF to_regclass('"TeamMemberProfile"') IS NULL THEN
    RAISE NOTICE 'TeamMemberProfile does not exist yet; runtime contact sync will backfill captains when teams are next touched.';
    RETURN;
  END IF;

  CREATE UNIQUE INDEX IF NOT EXISTS "TeamMemberProfile_teamMemberId_key"
    ON "TeamMemberProfile"("teamMemberId");

  WITH known_contacts AS (
    SELECT
      team."id" AS "teamId",
      LOWER(BTRIM(team."contactEmail")) AS "emailKey",
      team."contactPhone" AS "phone"
    FROM "Team" team
    WHERE NULLIF(BTRIM(team."contactEmail"), '') IS NOT NULL
      AND NULLIF(BTRIM(team."contactPhone"), '') IS NOT NULL

    UNION ALL

    SELECT
      team."id" AS "teamId",
      LOWER(BTRIM(team."secondaryContactEmail")) AS "emailKey",
      team."secondaryContactPhone" AS "phone"
    FROM "Team" team
    WHERE NULLIF(BTRIM(team."secondaryContactEmail"), '') IS NOT NULL
      AND NULLIF(BTRIM(team."secondaryContactPhone"), '') IS NOT NULL

    UNION ALL

    SELECT
      lead."convertedTeamId" AS "teamId",
      LOWER(BTRIM(lead."email")) AS "emailKey",
      lead."phone" AS "phone"
    FROM "InterestLead" lead
    WHERE lead."convertedTeamId" IS NOT NULL
      AND NULLIF(BTRIM(lead."email"), '') IS NOT NULL
      AND NULLIF(BTRIM(lead."phone"), '') IS NOT NULL
  ),
  normalised_contacts AS (
    SELECT
      "teamId",
      "emailKey",
      "phone",
      REGEXP_REPLACE("phone", '\D', '', 'g') AS "phoneKey"
    FROM known_contacts
    WHERE NULLIF(REGEXP_REPLACE("phone", '\D', '', 'g'), '') IS NOT NULL
  ),
  unambiguous_contacts AS (
    SELECT
      "teamId",
      "emailKey",
      MIN("phone") AS "phone"
    FROM normalised_contacts
    GROUP BY "teamId", "emailKey"
    HAVING COUNT(DISTINCT "phoneKey") = 1
  ),
  captain_matches AS (
    SELECT
      member."id" AS "teamMemberId",
      contact."phone" AS "phone"
    FROM "TeamMember" member
    INNER JOIN "User" usr ON usr."id" = member."userId"
    INNER JOIN unambiguous_contacts contact
      ON contact."teamId" = member."teamId"
      AND contact."emailKey" = LOWER(BTRIM(usr."email"))
    WHERE member."role"::text = 'CAPTAIN'
  )
  INSERT INTO "TeamMemberProfile" (
    "id",
    "teamMemberId",
    "phone",
    "createdAt",
    "updatedAt"
  )
  SELECT
    'captain_phone_' || MD5(
      matches."teamMemberId" || ':' || matches."phone" || ':' || RANDOM()::text
    ),
    matches."teamMemberId",
    matches."phone",
    NOW(),
    NOW()
  FROM captain_matches matches
  ON CONFLICT ("teamMemberId") DO UPDATE
  SET
    "phone" = EXCLUDED."phone",
    "updatedAt" = NOW()
  WHERE NULLIF(BTRIM("TeamMemberProfile"."phone"), '') IS NULL;
END $$;
