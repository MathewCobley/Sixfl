-- Player referral codes and £75 team referral rewards.
CREATE TABLE IF NOT EXISTS "TeamReferralCode" (
  "userId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TeamReferralCode_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "TeamReferralCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "TeamReferralCode_code_key" ON "TeamReferralCode"("code");

CREATE TABLE IF NOT EXISTS "TeamReferral" (
  "id" TEXT NOT NULL,
  "referrerUserId" TEXT NOT NULL,
  "interestLeadId" TEXT NOT NULL,
  "rewardPence" INTEGER NOT NULL DEFAULT 7500,
  "requiredMatches" INTEGER NOT NULL DEFAULT 3,
  "paidAt" TIMESTAMP(3),
  "paidByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TeamReferral_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TeamReferral_referrerUserId_fkey" FOREIGN KEY ("referrerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TeamReferral_interestLeadId_fkey" FOREIGN KEY ("interestLeadId") REFERENCES "InterestLead"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TeamReferral_paidByUserId_fkey" FOREIGN KEY ("paidByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "TeamReferral_interestLeadId_key" ON "TeamReferral"("interestLeadId");
CREATE INDEX IF NOT EXISTS "TeamReferral_referrerUserId_idx" ON "TeamReferral"("referrerUserId");
CREATE INDEX IF NOT EXISTS "TeamReferral_paidAt_idx" ON "TeamReferral"("paidAt");
