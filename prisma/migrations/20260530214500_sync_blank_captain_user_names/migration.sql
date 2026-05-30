-- Keep captain user names in sync when SIXFL already knows the team contact name.
-- This is deliberately conservative: it only fills blank User.name values and never overwrites an existing name.

CREATE OR REPLACE FUNCTION sync_blank_captain_user_name_from_team_contact()
RETURNS trigger AS $$
BEGIN
  IF NEW.role = 'CAPTAIN' THEN
    UPDATE "User" AS u
    SET name = NULLIF(BTRIM(t."contactName"), '')
    FROM "Team" AS t
    WHERE u.id = NEW."userId"
      AND t.id = NEW."teamId"
      AND NULLIF(BTRIM(t."contactName"), '') IS NOT NULL
      AND NULLIF(BTRIM(COALESCE(u.name, '')), '') IS NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_blank_captain_user_name_from_team_contact_trigger ON "TeamMember";

CREATE TRIGGER sync_blank_captain_user_name_from_team_contact_trigger
AFTER INSERT OR UPDATE OF role ON "TeamMember"
FOR EACH ROW
EXECUTE FUNCTION sync_blank_captain_user_name_from_team_contact();
