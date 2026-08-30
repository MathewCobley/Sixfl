CREATE TABLE IF NOT EXISTS "AuthenticatedReturnVisit" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "emailNormalized" TEXT,
  "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthenticatedReturnVisit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AuthenticatedReturnVisit_user_observed_idx"
  ON "AuthenticatedReturnVisit" ("userId", "observedAt" DESC);

CREATE INDEX IF NOT EXISTS "AuthenticatedReturnVisit_email_observed_idx"
  ON "AuthenticatedReturnVisit" ("emailNormalized", "observedAt" DESC);
