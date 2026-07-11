-- Store the free-kit choice on the team itself.
ALTER TABLE "Team"
ADD COLUMN IF NOT EXISTS "wantsFreeKit" BOOLEAN NOT NULL DEFAULT false;

-- Backfill converted teams using the exact lead-to-team relationship.
UPDATE "Team" AS team
SET "wantsFreeKit" = lead."wantsFreeKit"
FROM "InterestLead" AS lead
WHERE lead."convertedTeamId" = team."id"
  AND team."wantsFreeKit" IS DISTINCT FROM lead."wantsFreeKit";

-- Keep the Team value synchronized whenever a team lead is converted or edited.
CREATE OR REPLACE FUNCTION sync_team_free_kit_from_lead()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."interestType" = 'TEAM'
     AND NEW."convertedTeamId" IS NOT NULL THEN
    UPDATE "Team"
    SET "wantsFreeKit" = NEW."wantsFreeKit"
    WHERE "id" = NEW."convertedTeamId";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "InterestLead_sync_team_free_kit" ON "InterestLead";

CREATE TRIGGER "InterestLead_sync_team_free_kit"
AFTER INSERT OR UPDATE OF "convertedTeamId", "wantsFreeKit"
ON "InterestLead"
FOR EACH ROW
EXECUTE FUNCTION sync_team_free_kit_from_lead();
