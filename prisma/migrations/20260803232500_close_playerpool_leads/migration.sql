-- A lead has left the lead pipeline once a PlayerPool profile has been created.
-- Repair older records created by the list-page PlayerPool action before it
-- started closing the source InterestLead.
DO $$
BEGIN
  IF to_regclass('"PlayerPoolProfile"') IS NOT NULL THEN
    UPDATE "InterestLead" AS lead
    SET
      "status" = 'CLOSED',
      "contactedAt" = COALESCE(lead."contactedAt", profile."invitedAt", NOW()),
      "convertedAt" = COALESCE(lead."convertedAt", profile."invitedAt", NOW()),
      "closedAt" = COALESCE(lead."closedAt", profile."invitedAt", NOW()),
      "updatedAt" = NOW()
    FROM "PlayerPoolProfile" AS profile
    WHERE profile."leadId" = lead."id"
      AND lead."status" <> 'CLOSED';
  END IF;
END $$;
