-- Add in-app portal conversations for team chat and captain/player private messaging.
CREATE TYPE "PortalConversationType" AS ENUM ('TEAM', 'CAPTAIN_PLAYER', 'SIXFL');
CREATE TYPE "PortalMessageSenderRole" AS ENUM ('ADMIN', 'CAPTAIN', 'PLAYER', 'SYSTEM');

CREATE TABLE "PortalConversation" (
  "id" TEXT NOT NULL,
  "conversationKey" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "type" "PortalConversationType" NOT NULL,
  "participantUserId" TEXT,
  "title" TEXT,
  "lastMessagePreview" TEXT,
  "latestMessageAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PortalConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PortalMessage" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "senderUserId" TEXT,
  "senderRole" "PortalMessageSenderRole" NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "editedAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "PortalMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PortalConversationRead" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PortalConversationRead_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PortalConversation_conversationKey_key" ON "PortalConversation"("conversationKey");
CREATE INDEX "PortalConversation_teamId_type_idx" ON "PortalConversation"("teamId", "type");
CREATE INDEX "PortalConversation_participantUserId_idx" ON "PortalConversation"("participantUserId");
CREATE INDEX "PortalConversation_latestMessageAt_idx" ON "PortalConversation"("latestMessageAt");

CREATE INDEX "PortalMessage_conversationId_createdAt_idx" ON "PortalMessage"("conversationId", "createdAt");
CREATE INDEX "PortalMessage_senderUserId_createdAt_idx" ON "PortalMessage"("senderUserId", "createdAt");

CREATE UNIQUE INDEX "PortalConversationRead_conversationId_userId_key" ON "PortalConversationRead"("conversationId", "userId");
CREATE INDEX "PortalConversationRead_userId_lastReadAt_idx" ON "PortalConversationRead"("userId", "lastReadAt");

ALTER TABLE "PortalConversation"
  ADD CONSTRAINT "PortalConversation_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PortalConversation"
  ADD CONSTRAINT "PortalConversation_participantUserId_fkey"
  FOREIGN KEY ("participantUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PortalMessage"
  ADD CONSTRAINT "PortalMessage_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "PortalConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PortalMessage"
  ADD CONSTRAINT "PortalMessage_senderUserId_fkey"
  FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PortalConversationRead"
  ADD CONSTRAINT "PortalConversationRead_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "PortalConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PortalConversationRead"
  ADD CONSTRAINT "PortalConversationRead_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
