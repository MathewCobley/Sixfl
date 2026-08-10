-- Keep recruitment state aligned with the canonical live squad identity.
--
-- Safety rules:
-- - email alone is NOT treated as proof that two differently named people are
--   the same player (shared family/contact emails are possible)
-- - only same-name records are reconciled automatically
-- - same-team prospects become ACTIVE_SQUAD
-- - unassigned prospects become DUPLICATE once that verified person has joined
-- - deliberately assigned prospects/requests for another team are left alone,
--   because SIXFL permits legitimate multi-team participation
-- - history is retained; nothing is deleted

CREATE OR REPLACE FUNCTION sixfl_normalise_player_identity_name(value TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT BTRIM(
    REGEXP_REPLACE(
      REGEXP_REPLACE(LOWER(COALESCE(value, '')), '[^a-z0-9]+', ' ', 'g'),
      '[[:space:]]+',
      ' ',
      'g'
    )
  );
$$;

CREATE OR REPLACE FUNCTION sixfl_reconcile_player_recruitment_on_squad_join()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  player_email TEXT;
  player_name TEXT;
BEGIN
  SELECT LOWER(BTRIM(u."email")), sixfl_normalise_player_identity_name(u."name")
  INTO player_email, player_name
  FROM "User" u
  WHERE u."id" = NEW."userId";

  IF player_email IS NULL OR player_email = '' OR player_name = '' THEN
    RETURN NEW;
  END IF;

  -- The prospect that represents this same player on this same team is now an
  -- active squad record, not a live recruitment prospect.
  UPDATE "TeamPlayerProspect" prospect
  SET
    "status" = 'ACTIVE_SQUAD',
    "notes" = CASE
      WHEN COALESCE(BTRIM(prospect."notes"), '') = ''
        THEN 'Player data health: player is now an active member of this squad.'
      WHEN prospect."notes" NOT ILIKE '%Player data health:%'
        THEN prospect."notes" || E'\nPlayer data health: player is now an active member of this squad.'
      ELSE prospect."notes"
    END,
    "updatedAt" = NOW()
  WHERE prospect."teamId" = NEW."teamId"
    AND prospect."email" IS NOT NULL
    AND LOWER(BTRIM(prospect."email")) = player_email
    AND sixfl_normalise_player_identity_name(
      CONCAT_WS(' ', prospect."firstName", prospect."lastName")
    ) = player_name
    AND prospect."status" <> 'ACTIVE_SQUAD';

  -- An unassigned copy of the same verified person is stale once that person
  -- has a real squad membership. Keep the row for audit but close its live
  -- recruitment state.
  UPDATE "TeamPlayerProspect" prospect
  SET
    "status" = 'DUPLICATE',
    "notes" = CASE
      WHEN COALESCE(BTRIM(prospect."notes"), '') = ''
        THEN 'Player data health: unassigned recruitment record closed because this player is already in a SIXFL squad.'
      WHEN prospect."notes" NOT ILIKE '%Player data health:%'
        THEN prospect."notes" || E'\nPlayer data health: unassigned recruitment record closed because this player is already in a SIXFL squad.'
      ELSE prospect."notes"
    END,
    "updatedAt" = NOW()
  WHERE prospect."teamId" IS NULL
    AND prospect."email" IS NOT NULL
    AND LOWER(BTRIM(prospect."email")) = player_email
    AND sixfl_normalise_player_identity_name(
      CONCAT_WS(' ', prospect."firstName", prospect."lastName")
    ) = player_name
    AND prospect."status" NOT IN ('DECLINED', 'DUPLICATE');

  -- PlayerPool is a recruitment state. When the verified person joins a squad,
  -- matching PlayerPool profiles become joined. The historical profile remains.
  UPDATE "PlayerPoolProfile" profile
  SET "status" = 'JOINED', "updatedAt" = NOW()
  WHERE profile."status" <> 'JOINED'
    AND EXISTS (
      SELECT 1
      FROM "TeamPlayerProspect" prospect
      WHERE prospect."id" = profile."prospectId"
        AND prospect."email" IS NOT NULL
        AND LOWER(BTRIM(prospect."email")) = player_email
        AND sixfl_normalise_player_identity_name(
          CONCAT_WS(' ', prospect."firstName", prospect."lastName")
        ) = player_name
    );

  -- Only resolve an introduction automatically when it is for the team the
  -- player has actually joined. Requests for another team remain visible for
  -- review because the player may intentionally play for more than one team.
  UPDATE "PlayerPoolIntroductionRequest" request
  SET
    "status" = 'JOINED',
    "resolvedAt" = COALESCE(request."resolvedAt", NOW()),
    "updatedAt" = NOW()
  WHERE request."teamId" = NEW."teamId"
    AND request."status" IN ('REQUESTED', 'INTRODUCED')
    AND EXISTS (
      SELECT 1
      FROM "PlayerPoolProfile" profile
      JOIN "TeamPlayerProspect" prospect ON prospect."id" = profile."prospectId"
      WHERE profile."id" = request."profileId"
        AND prospect."email" IS NOT NULL
        AND LOWER(BTRIM(prospect."email")) = player_email
        AND sixfl_normalise_player_identity_name(
          CONCAT_WS(' ', prospect."firstName", prospect."lastName")
        ) = player_name
    );

  -- Close only a player lead whose saved contact name also matches the active
  -- player's identity. Shared-email leads for somebody else are left untouched.
  UPDATE "InterestLead" lead
  SET
    "status" = 'CLOSED'::"LeadStatus",
    "closedAt" = COALESCE(lead."closedAt", NOW()),
    "updatedAt" = NOW()
  WHERE lead."interestType" = 'PLAYER'::"InterestType"
    AND lead."email" IS NOT NULL
    AND LOWER(BTRIM(lead."email")) = player_email
    AND sixfl_normalise_player_identity_name(lead."contactName") = player_name
    AND lead."status" <> 'CLOSED'::"LeadStatus";

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "TeamMember_reconcile_player_recruitment" ON "TeamMember";

CREATE TRIGGER "TeamMember_reconcile_player_recruitment"
AFTER INSERT OR UPDATE OF "userId", "teamId" ON "TeamMember"
FOR EACH ROW
EXECUTE FUNCTION sixfl_reconcile_player_recruitment_on_squad_join();
