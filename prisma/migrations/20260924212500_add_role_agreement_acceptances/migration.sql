CREATE TABLE IF NOT EXISTS "AgreementAcceptance" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "agreementType" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AgreementAcceptance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AgreementAcceptance_userId_agreementType_version_key"
  ON "AgreementAcceptance"("userId","agreementType","version");

CREATE INDEX IF NOT EXISTS "AgreementAcceptance_agreementType_version_acceptedAt_idx"
  ON "AgreementAcceptance"("agreementType","version","acceptedAt");

CREATE INDEX IF NOT EXISTS "AgreementAcceptance_userId_acceptedAt_idx"
  ON "AgreementAcceptance"("userId","acceptedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AgreementAcceptance_userId_fkey'
  ) THEN
    ALTER TABLE "AgreementAcceptance"
      ADD CONSTRAINT "AgreementAcceptance_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
