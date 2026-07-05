-- Allow a player prospect YES/NO response to be recorded without a specific team.
ALTER TABLE "PlayerInterestResponse"
  ALTER COLUMN "teamId" DROP NOT NULL;
