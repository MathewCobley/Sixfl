CREATE TABLE IF NOT EXISTS "SignInLinkActivity" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "emailNormalized" TEXT NOT NULL,
  "userNameSnapshot" TEXT,
  "accountTypeSnapshot" TEXT,
  "teamIdSnapshot" TEXT,
  "teamNameSnapshot" TEXT,
  "callbackUrl" TEXT,
  "linkHost" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  "usedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "failureReason" TEXT,
  "providerMessageId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SignInLinkActivity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SignInLinkActivity_email_requested_idx"
  ON "SignInLinkActivity" ("emailNormalized", "requestedAt" DESC);

CREATE INDEX IF NOT EXISTS "SignInLinkActivity_user_requested_idx"
  ON "SignInLinkActivity" ("userId", "requestedAt" DESC);

CREATE INDEX IF NOT EXISTS "SignInLinkActivity_requested_idx"
  ON "SignInLinkActivity" ("requestedAt" DESC);

CREATE INDEX IF NOT EXISTS "SignInLinkActivity_used_idx"
  ON "SignInLinkActivity" ("usedAt");
