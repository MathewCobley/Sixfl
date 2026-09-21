ALTER TYPE "PortalConversationType" ADD VALUE IF NOT EXISTS 'REGULARS';
ALTER TYPE "PortalConversationType" ADD VALUE IF NOT EXISTS 'SELECTED_GROUP';

ALTER TABLE "TeamMember"
  ADD COLUMN "isRegular" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "PortalConversationMember" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PortalConversationMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PortalConversationMember_conversationId_userId_key"
  ON "PortalConversationMember"("conversationId", "userId");

CREATE INDEX "PortalConversationMember_userId_conversationId_idx"
  ON "PortalConversationMember"("userId", "conversationId");

ALTER TABLE "PortalConversationMember"
  ADD CONSTRAINT "PortalConversationMember_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "PortalConversation"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PortalConversationMember"
  ADD CONSTRAINT "PortalConversationMember_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
