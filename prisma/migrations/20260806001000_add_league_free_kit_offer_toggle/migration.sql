ALTER TABLE "League"
ADD COLUMN IF NOT EXISTS "freeKitOfferEnabled" BOOLEAN NOT NULL DEFAULT TRUE;

CREATE OR REPLACE FUNCTION enforce_league_free_kit_offer()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."wantsFreeKit" = TRUE
     AND NEW."leagueId" IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM "League" league
       WHERE league."id" = NEW."leagueId"
         AND COALESCE(league."freeKitOfferEnabled", TRUE) = FALSE
     )
     AND NOT EXISTS (
       SELECT 1
       FROM "TeamKitOrder" kit_order
       WHERE kit_order."teamId" = NEW."id"
     )
  THEN
    NEW."wantsFreeKit" := FALSE;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_league_free_kit_offer_on_team ON "Team";
CREATE TRIGGER enforce_league_free_kit_offer_on_team
BEFORE INSERT OR UPDATE OF "wantsFreeKit", "leagueId" ON "Team"
FOR EACH ROW
EXECUTE FUNCTION enforce_league_free_kit_offer();
