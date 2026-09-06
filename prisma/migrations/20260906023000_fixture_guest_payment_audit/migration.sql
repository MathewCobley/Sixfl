CREATE TABLE "FixtureGuestPaymentAudit" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "approvalId" TEXT NOT NULL REFERENCES "FixtureGuestApproval"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "playerMatchFeeId" TEXT NOT NULL UNIQUE REFERENCES "PlayerMatchFee"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "approvalRevision" INTEGER NOT NULL,
  "amountPence" INTEGER NOT NULL CHECK ("amountPence" >= 0 AND "amountPence" <= 10000),
  "createdByUserId" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "createdByName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "FixtureGuestPaymentAudit_approvalId_idx" ON "FixtureGuestPaymentAudit"("approvalId");
