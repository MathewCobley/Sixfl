-- Preserve an immutable history whenever a player is added to a squad, moved
-- between team records, has their role changed, or is removed.  This is a
-- database trigger rather than a UI-only log so raw SQL repairs and merge tools
-- are covered as well.

CREATE TABLE IF NOT EXISTS "TeamMemberAuditLog" (
  "id" BIGSERIAL NOT NULL,
  "operation" TEXT NOT NULL,
  "teamMemberId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "oldTeamId" TEXT,
  "newTeamId" TEXT,
  "oldRole" TEXT,
  "newRole" TEXT,
  "actorUserId" TEXT,
  "actorEmail" TEXT,
  "applicationName" TEXT,
  "transactionId" BIGINT NOT NULL DEFAULT txid_current(),
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TeamMemberAuditLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TeamMemberAuditLog_operation_check"
    CHECK ("operation" IN ('INSERT', 'UPDATE', 'DELETE'))
);

CREATE INDEX IF NOT EXISTS "TeamMemberAuditLog_user_changedAt_idx"
  ON "TeamMemberAuditLog"("userId", "changedAt" DESC);

CREATE INDEX IF NOT EXISTS "TeamMemberAuditLog_member_changedAt_idx"
  ON "TeamMemberAuditLog"("teamMemberId", "changedAt" DESC);

CREATE INDEX IF NOT EXISTS "TeamMemberAuditLog_oldTeam_changedAt_idx"
  ON "TeamMemberAuditLog"("oldTeamId", "changedAt" DESC);

CREATE INDEX IF NOT EXISTS "TeamMemberAuditLog_newTeam_changedAt_idx"
  ON "TeamMemberAuditLog"("newTeamId", "changedAt" DESC);

CREATE OR REPLACE FUNCTION "sixfl_audit_team_member_change"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  audit_actor_user_id TEXT;
  audit_actor_email TEXT;
BEGIN
  audit_actor_user_id := NULLIF(current_setting('sixfl.actor_user_id', true), '');
  audit_actor_email := NULLIF(current_setting('sixfl.actor_email', true), '');

  IF TG_OP = 'INSERT' THEN
    INSERT INTO "TeamMemberAuditLog" (
      "operation",
      "teamMemberId",
      "userId",
      "oldTeamId",
      "newTeamId",
      "oldRole",
      "newRole",
      "actorUserId",
      "actorEmail",
      "applicationName",
      "transactionId",
      "changedAt"
    ) VALUES (
      'INSERT',
      NEW."id",
      NEW."userId",
      NULL,
      NEW."teamId",
      NULL,
      NEW."role"::text,
      audit_actor_user_id,
      audit_actor_email,
      NULLIF(current_setting('application_name', true), ''),
      txid_current(),
      CURRENT_TIMESTAMP
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW."userId" IS DISTINCT FROM OLD."userId"
       OR NEW."teamId" IS DISTINCT FROM OLD."teamId"
       OR NEW."role" IS DISTINCT FROM OLD."role" THEN
      INSERT INTO "TeamMemberAuditLog" (
        "operation",
        "teamMemberId",
        "userId",
        "oldTeamId",
        "newTeamId",
        "oldRole",
        "newRole",
        "actorUserId",
        "actorEmail",
        "applicationName",
        "transactionId",
        "changedAt"
      ) VALUES (
        'UPDATE',
        NEW."id",
        NEW."userId",
        OLD."teamId",
        NEW."teamId",
        OLD."role"::text,
        NEW."role"::text,
        audit_actor_user_id,
        audit_actor_email,
        NULLIF(current_setting('application_name', true), ''),
        txid_current(),
        CURRENT_TIMESTAMP
      );
    END IF;
    RETURN NEW;
  ELSE
    INSERT INTO "TeamMemberAuditLog" (
      "operation",
      "teamMemberId",
      "userId",
      "oldTeamId",
      "newTeamId",
      "oldRole",
      "newRole",
      "actorUserId",
      "actorEmail",
      "applicationName",
      "transactionId",
      "changedAt"
    ) VALUES (
      'DELETE',
      OLD."id",
      OLD."userId",
      OLD."teamId",
      NULL,
      OLD."role"::text,
      NULL,
      audit_actor_user_id,
      audit_actor_email,
      NULLIF(current_setting('application_name', true), ''),
      txid_current(),
      CURRENT_TIMESTAMP
    );
    RETURN OLD;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS "TeamMember_audit_change" ON "TeamMember";

CREATE TRIGGER "TeamMember_audit_change"
AFTER INSERT OR UPDATE OR DELETE ON "TeamMember"
FOR EACH ROW
EXECUTE FUNCTION "sixfl_audit_team_member_change"();
