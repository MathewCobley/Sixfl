ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "broadcastCode" TEXT;

UPDATE "Team"
SET "broadcastCode" = CASE
  WHEN LENGTH(REGEXP_REPLACE(UPPER("name"), '[^A-Z0-9]', '', 'g')) >= 3
    THEN LEFT(REGEXP_REPLACE(UPPER("name"), '[^A-Z0-9]', '', 'g'), 3)
  ELSE RPAD(LEFT(REGEXP_REPLACE(UPPER("name"), '[^A-Z0-9]', '', 'g'), 3), 3, 'X')
END
WHERE "broadcastCode" IS NULL OR BTRIM("broadcastCode") = '';
