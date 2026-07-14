-- Move prospects who have declined / said no out of the team-level active pipeline.
-- They remain in the global prospect records as dead prospects with their notes/history intact.

UPDATE "TeamPlayerProspect"
SET "teamId" = NULL,
    "updatedAt" = NOW()
WHERE "teamId" IS NOT NULL
  AND "status" IN ('DECLINED', 'CLOSED');

CREATE OR REPLACE FUNCTION detach_dead_team_player_prospect()
RETURNS trigger AS $$
BEGIN
  IF NEW."status" IN ('DECLINED', 'CLOSED') THEN
    NEW."teamId" := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "TeamPlayerProspect_detach_dead_status" ON "TeamPlayerProspect";

CREATE TRIGGER "TeamPlayerProspect_detach_dead_status"
BEFORE INSERT OR UPDATE OF "status" ON "TeamPlayerProspect"
FOR EACH ROW
EXECUTE FUNCTION detach_dead_team_player_prospect();
