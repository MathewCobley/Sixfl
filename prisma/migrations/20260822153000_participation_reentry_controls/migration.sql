ALTER TABLE "Team"
  ADD COLUMN IF NOT EXISTS "registrationBlocked" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "registrationBlockedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "registrationBlockedReason" TEXT,
  ADD COLUMN IF NOT EXISTS "registrationReviewRequired" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "registrationReviewReason" TEXT,
  ADD COLUMN IF NOT EXISTS "registrationReviewSourceTeamId" TEXT,
  ADD COLUMN IF NOT EXISTS "registrationReviewApprovedAt" TIMESTAMP(3);

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "teamManagementRestricted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "teamManagementRestrictedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "teamManagementRestrictionReason" TEXT,
  ADD COLUMN IF NOT EXISTS "playingRestricted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "playingRestrictedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "playingRestrictedUntil" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "playingRestrictionReason" TEXT;

CREATE INDEX IF NOT EXISTS "Team_registrationBlocked_idx"
  ON "Team" ("registrationBlocked");

CREATE INDEX IF NOT EXISTS "Team_registrationReviewRequired_idx"
  ON "Team" ("registrationReviewRequired");

CREATE INDEX IF NOT EXISTS "User_teamManagementRestricted_idx"
  ON "User" ("teamManagementRestricted");

CREATE INDEX IF NOT EXISTS "User_playingRestricted_idx"
  ON "User" ("playingRestricted");

CREATE TABLE IF NOT EXISTS "ParticipationRestrictionAudit" (
  "id" TEXT PRIMARY KEY,
  "subjectType" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "reason" TEXT,
  "until" TIMESTAMP(3),
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "ParticipationRestrictionAudit_subject_idx"
  ON "ParticipationRestrictionAudit" ("subjectType", "subjectId", "createdAt");

CREATE INDEX IF NOT EXISTS "ParticipationRestrictionAudit_createdAt_idx"
  ON "ParticipationRestrictionAudit" ("createdAt");

CREATE OR REPLACE FUNCTION sixfl_normalise_contact_phone(value TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  digits TEXT;
BEGIN
  digits := REGEXP_REPLACE(COALESCE(value, ''), '[^0-9]', '', 'g');
  IF digits = '' THEN
    RETURN NULL;
  END IF;

  IF digits LIKE '0%' THEN
    RETURN '44' || SUBSTRING(digits FROM 2);
  END IF;

  IF digits LIKE '44%' THEN
    RETURN digits;
  END IF;

  RETURN '44' || digits;
END;
$$;

CREATE OR REPLACE FUNCTION sixfl_flag_blocked_team_contact_reuse()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  blocked_team_id TEXT;
  blocked_team_name TEXT;
BEGIN
  IF COALESCE(NEW."registrationBlocked", false) = true
     OR NEW."registrationReviewApprovedAt" IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT blocked."id", blocked."name"
  INTO blocked_team_id, blocked_team_name
  FROM "Team" blocked
  WHERE blocked."id" <> NEW."id"
    AND COALESCE(blocked."registrationBlocked", false) = true
    AND (
      (
        NULLIF(LOWER(BTRIM(COALESCE(NEW."contactEmail", ''))), '') IS NOT NULL
        AND LOWER(BTRIM(COALESCE(blocked."contactEmail", ''))) = LOWER(BTRIM(NEW."contactEmail"))
      )
      OR (
        sixfl_normalise_contact_phone(NEW."contactPhone") IS NOT NULL
        AND sixfl_normalise_contact_phone(blocked."contactPhone") = sixfl_normalise_contact_phone(NEW."contactPhone")
      )
    )
  ORDER BY blocked."registrationBlockedAt" DESC NULLS LAST, blocked."createdAt" DESC
  LIMIT 1;

  IF blocked_team_id IS NOT NULL THEN
    NEW."registrationReviewRequired" := true;
    NEW."registrationReviewSourceTeamId" := blocked_team_id;
    NEW."registrationReviewReason" :=
      'Possible re-registration of blocked team ' || blocked_team_name ||
      ': captain/contact details match. Admin approval required.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "Team_blocked_contact_reuse_guard" ON "Team";
CREATE TRIGGER "Team_blocked_contact_reuse_guard"
BEFORE INSERT OR UPDATE OF "contactEmail", "contactPhone", "registrationBlocked", "registrationReviewApprovedAt"
ON "Team"
FOR EACH ROW
EXECUTE FUNCTION sixfl_flag_blocked_team_contact_reuse();

CREATE OR REPLACE FUNCTION sixfl_flag_blocked_team_squad_overlap()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  target_blocked BOOLEAN;
  target_approved TIMESTAMP(3);
  blocked_team_id TEXT;
  blocked_team_name TEXT;
  shared_players INTEGER;
BEGIN
  SELECT
    COALESCE("registrationBlocked", false),
    "registrationReviewApprovedAt"
  INTO target_blocked, target_approved
  FROM "Team"
  WHERE "id" = NEW."teamId";

  IF target_blocked = true OR target_approved IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT
    blocked."id",
    blocked."name",
    COUNT(DISTINCT source_member."userId")::INTEGER
  INTO blocked_team_id, blocked_team_name, shared_players
  FROM "Team" blocked
  INNER JOIN "TeamMember" source_member
    ON source_member."teamId" = blocked."id"
  INNER JOIN "TeamMember" target_member
    ON target_member."teamId" = NEW."teamId"
   AND target_member."userId" = source_member."userId"
  WHERE blocked."id" <> NEW."teamId"
    AND COALESCE(blocked."registrationBlocked", false) = true
  GROUP BY blocked."id", blocked."name"
  HAVING COUNT(DISTINCT source_member."userId") >= 4
  ORDER BY COUNT(DISTINCT source_member."userId") DESC, blocked."name"
  LIMIT 1;

  IF blocked_team_id IS NOT NULL THEN
    UPDATE "Team"
    SET
      "registrationReviewRequired" = true,
      "registrationReviewSourceTeamId" = blocked_team_id,
      "registrationReviewReason" =
        'Possible re-formed blocked team: ' || shared_players ||
        ' players overlap with ' || blocked_team_name ||
        '. Admin approval required.'
    WHERE "id" = NEW."teamId";
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "TeamMember_blocked_team_overlap_guard" ON "TeamMember";
CREATE TRIGGER "TeamMember_blocked_team_overlap_guard"
AFTER INSERT OR UPDATE OF "teamId", "userId"
ON "TeamMember"
FOR EACH ROW
EXECUTE FUNCTION sixfl_flag_blocked_team_squad_overlap();
