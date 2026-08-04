-- Private, shareable SIXFL player codes and fixture-only temporary players.
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "playerCode" TEXT;

UPDATE "User"
SET "playerCode" = 'SIX-' || UPPER(SUBSTR(REPLACE(gen_random_uuid()::text, '-', ''), 1, 8))
WHERE "playerCode" IS NULL;

ALTER TABLE "User"
ALTER COLUMN "playerCode" SET DEFAULT ('SIX-' || UPPER(SUBSTR(REPLACE(gen_random_uuid()::text, '-', ''), 1, 8))),
ALTER COLUMN "playerCode" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "User_playerCode_key" ON "User"("playerCode");

ALTER TABLE "PlayerMatchFee"
ADD COLUMN IF NOT EXISTS "temporaryUserId" TEXT;

ALTER TABLE "PlayerMatchFee"
ADD CONSTRAINT "PlayerMatchFee_temporaryUserId_fkey"
FOREIGN KEY ("temporaryUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "PlayerMatchFee_fixtureId_temporaryUserId_key"
ON "PlayerMatchFee"("fixtureId", "temporaryUserId");

CREATE INDEX IF NOT EXISTS "PlayerMatchFee_temporaryUserId_idx"
ON "PlayerMatchFee"("temporaryUserId");
