-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'REFEREE', 'ADMIN');

-- CreateEnum
CREATE TYPE "TeamRole" AS ENUM ('CAPTAIN', 'MANAGER', 'PLAYER', 'COACH');

-- CreateEnum
CREATE TYPE "FixtureStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'POSTPONED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TemplateAudience" AS ENUM ('LEAD', 'TEAM', 'PLAYER', 'REFEREE', 'GENERAL');

-- CreateEnum
CREATE TYPE "InterestType" AS ENUM ('TEAM', 'PLAYER', 'REFEREE');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'CLOSED');

-- CreateEnum
CREATE TYPE "LeagueType" AS ENUM ('MENS', 'WOMENS', 'YOUTH');

-- CreateEnum
CREATE TYPE "PreferredNight" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY', 'ANY');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "NotificationAudience" AS ENUM ('LEAD', 'TEAM', 'PLAYER', 'REFEREE', 'USER', 'GENERAL');

-- CreateEnum
CREATE TYPE "NotificationTemplateKind" AS ENUM ('TRANSACTIONAL', 'CAMPAIGN');

-- CreateEnum
CREATE TYPE "NotificationRecipientSourceType" AS ENUM ('LEAD', 'TEAM', 'PLAYER', 'REFEREE', 'USER', 'GENERAL');

-- CreateEnum
CREATE TYPE "NotificationDispatchStatus" AS ENUM ('QUEUED', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "NotificationAttemptStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('SMS', 'EMAIL');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "MessageThreadStatus" AS ENUM ('OPEN', 'ARCHIVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "MessageParticipantRole" AS ENUM ('ADMIN', 'CAPTAIN', 'CONTACT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "InboxAlertStatus" AS ENUM ('PENDING', 'SENT', 'READ', 'DISMISSED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "createdFromLeadId" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "League" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "season" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "slug" TEXT NOT NULL,
    "area" TEXT,
    "dayOfWeek" "PreferredNight",
    "leagueType" "LeagueType",
    "venueName" TEXT,
    "kickoffInfo" TEXT,
    "format" TEXT,
    "surface" TEXT,
    "description" TEXT,
    "heroImageUrl" TEXT,
    "badgeUrl" TEXT,
    "ctaText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "League_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Venue" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "postcode" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "claimCode" TEXT NOT NULL,
    "logoUrl" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "secondaryContactName" TEXT,
    "secondaryContactEmail" TEXT,
    "secondaryContactPhone" TEXT,
    "latestKickoffTime" TEXT,
    "createdByUserId" TEXT,
    "leagueId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "role" "TeamRole" NOT NULL DEFAULT 'MANAGER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fixture" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "homeTeamId" TEXT NOT NULL,
    "awayTeamId" TEXT NOT NULL,
    "venueId" TEXT,
    "kickoffAt" TIMESTAMP(3) NOT NULL,
    "round" INTEGER,
    "position" INTEGER,
    "pitch" TEXT,
    "status" "FixtureStatus" NOT NULL DEFAULT 'SCHEDULED',
    "refereeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fixture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchResult" (
    "id" TEXT NOT NULL,
    "fixtureId" TEXT NOT NULL,
    "homeScore" INTEGER NOT NULL,
    "awayScore" INTEGER NOT NULL,
    "enteredByUserId" TEXT,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isDisputed" BOOLEAN NOT NULL DEFAULT false,
    "disputeNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterestLead" (
    "id" TEXT NOT NULL,
    "interestType" "InterestType" NOT NULL,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "contactName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "teamName" TEXT,
    "area" TEXT,
    "leagueType" "LeagueType",
    "message" TEXT,
    "source" TEXT,
    "wantsFreeKit" BOOLEAN NOT NULL DEFAULT false,
    "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
    "leagueId" TEXT,
    "contactedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "convertedAt" TIMESTAMP(3),
    "convertedTeamId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterestLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterestLeadPreferredNight" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "night" "PreferredNight" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterestLeadPreferredNight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterestLeadEmail" (
    "id" TEXT NOT NULL,
    "interestLeadId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sentTo" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterestLeadEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "audience" "TemplateAudience" NOT NULL,
    "interestType" "InterestType",
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "ctaLabel" TEXT,
    "ctaUrlKey" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationRecipient" (
    "id" TEXT NOT NULL,
    "sourceType" "NotificationRecipientSourceType" NOT NULL,
    "sourceId" TEXT,
    "audience" "NotificationAudience" NOT NULL,
    "displayName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "emailNormalized" TEXT,
    "phoneNormalized" TEXT,
    "marketingEmailOptIn" BOOLEAN NOT NULL DEFAULT false,
    "marketingSmsOptIn" BOOLEAN NOT NULL DEFAULT false,
    "transactionalEmailOptIn" BOOLEAN NOT NULL DEFAULT true,
    "transactionalSmsOptIn" BOOLEAN NOT NULL DEFAULT true,
    "isSuppressed" BOOLEAN NOT NULL DEFAULT false,
    "suppressionReason" TEXT,
    "metadata" JSONB,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "timezone" TEXT,
    "quietHoursStart" TEXT,
    "quietHoursEnd" TEXT,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "smsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "urgentSmsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "marketingEmailEnabled" BOOLEAN NOT NULL DEFAULT false,
    "marketingSmsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "kind" "NotificationTemplateKind" NOT NULL DEFAULT 'TRANSACTIONAL',
    "channel" "NotificationChannel" NOT NULL,
    "audience" "NotificationAudience" NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "ctaLabel" TEXT,
    "ctaUrlKey" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDispatch" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "templateId" TEXT,
    "channel" "NotificationChannel" NOT NULL,
    "audience" "NotificationAudience" NOT NULL,
    "status" "NotificationDispatchStatus" NOT NULL DEFAULT 'QUEUED',
    "isTransactional" BOOLEAN NOT NULL DEFAULT true,
    "subject" TEXT,
    "bodyText" TEXT NOT NULL,
    "bodyHtml" TEXT,
    "provider" TEXT,
    "providerMessageId" TEXT,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "variables" JSONB,
    "metadata" JSONB,
    "scheduledFor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationAttempt" (
    "id" TEXT NOT NULL,
    "dispatchId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "NotificationAttemptStatus" NOT NULL DEFAULT 'PENDING',
    "requestPayload" JSONB,
    "responsePayload" JSONB,
    "errorMessage" TEXT,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageThread" (
    "id" TEXT NOT NULL,
    "channel" "MessageChannel" NOT NULL DEFAULT 'SMS',
    "status" "MessageThreadStatus" NOT NULL DEFAULT 'OPEN',
    "recipientId" TEXT,
    "teamId" TEXT,
    "leagueId" TEXT,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "phoneNormalized" TEXT,
    "contactEmail" TEXT,
    "emailNormalized" TEXT,
    "replyAddress" TEXT,
    "lastMessagePreview" TEXT,
    "assignedToUserId" TEXT,
    "latestMessageAt" TIMESTAMP(3),
    "latestInboundAt" TIMESTAMP(3),
    "latestOutboundAt" TIMESTAMP(3),
    "unreadForAdminCount" INTEGER NOT NULL DEFAULT 0,
    "unreadForCaptainCount" INTEGER NOT NULL DEFAULT 0,
    "lastInboundMessageId" TEXT,
    "lastOutboundMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageEntry" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "channel" "MessageChannel" NOT NULL DEFAULT 'SMS',
    "direction" "MessageDirection" NOT NULL,
    "participantRole" "MessageParticipantRole" NOT NULL DEFAULT 'CONTACT',
    "body" TEXT NOT NULL,
    "subject" TEXT,
    "textBody" TEXT,
    "htmlBody" TEXT,
    "fromNumber" TEXT,
    "toNumber" TEXT,
    "fromEmail" TEXT,
    "toEmail" TEXT,
    "provider" TEXT,
    "providerMessageId" TEXT,
    "providerStatus" TEXT,
    "twilioMessageSid" TEXT,
    "twilioAccountSid" TEXT,
    "twilioPayload" JSONB,
    "resendEmailId" TEXT,
    "resendPayload" JSONB,
    "internetMessageId" TEXT,
    "inReplyTo" TEXT,
    "referencesHeader" TEXT,
    "notificationDispatchId" TEXT,
    "createdByUserId" TEXT,
    "sentAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboxAlert" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "status" "InboxAlertStatus" NOT NULL DEFAULT 'PENDING',
    "type" TEXT NOT NULL,
    "sentToEmail" TEXT,
    "emailedAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InboxAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "League_slug_key" ON "League"("slug");

-- CreateIndex
CREATE INDEX "League_isActive_idx" ON "League"("isActive");

-- CreateIndex
CREATE INDEX "League_area_idx" ON "League"("area");

-- CreateIndex
CREATE INDEX "League_dayOfWeek_idx" ON "League"("dayOfWeek");

-- CreateIndex
CREATE INDEX "League_leagueType_idx" ON "League"("leagueType");

-- CreateIndex
CREATE UNIQUE INDEX "League_name_season_key" ON "League"("name", "season");

-- CreateIndex
CREATE UNIQUE INDEX "Team_claimCode_key" ON "Team"("claimCode");

-- CreateIndex
CREATE INDEX "Team_leagueId_idx" ON "Team"("leagueId");

-- CreateIndex
CREATE INDEX "Team_createdByUserId_idx" ON "Team"("createdByUserId");

-- CreateIndex
CREATE INDEX "Team_contactEmail_idx" ON "Team"("contactEmail");

-- CreateIndex
CREATE INDEX "Team_contactPhone_idx" ON "Team"("contactPhone");

-- CreateIndex
CREATE UNIQUE INDEX "Team_name_leagueId_key" ON "Team"("name", "leagueId");

-- CreateIndex
CREATE INDEX "TeamMember_teamId_idx" ON "TeamMember"("teamId");

-- CreateIndex
CREATE INDEX "TeamMember_userId_idx" ON "TeamMember"("userId");

-- CreateIndex
CREATE INDEX "TeamMember_role_idx" ON "TeamMember"("role");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMember_userId_teamId_key" ON "TeamMember"("userId", "teamId");

-- CreateIndex
CREATE INDEX "Fixture_leagueId_kickoffAt_idx" ON "Fixture"("leagueId", "kickoffAt");

-- CreateIndex
CREATE INDEX "Fixture_leagueId_round_idx" ON "Fixture"("leagueId", "round");

-- CreateIndex
CREATE INDEX "Fixture_homeTeamId_idx" ON "Fixture"("homeTeamId");

-- CreateIndex
CREATE INDEX "Fixture_awayTeamId_idx" ON "Fixture"("awayTeamId");

-- CreateIndex
CREATE INDEX "Fixture_refereeId_idx" ON "Fixture"("refereeId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchResult_fixtureId_key" ON "MatchResult"("fixtureId");

-- CreateIndex
CREATE INDEX "MatchResult_fixtureId_idx" ON "MatchResult"("fixtureId");

-- CreateIndex
CREATE UNIQUE INDEX "InterestLead_convertedTeamId_key" ON "InterestLead"("convertedTeamId");

-- CreateIndex
CREATE INDEX "InterestLead_interestType_idx" ON "InterestLead"("interestType");

-- CreateIndex
CREATE INDEX "InterestLead_status_idx" ON "InterestLead"("status");

-- CreateIndex
CREATE INDEX "InterestLead_area_idx" ON "InterestLead"("area");

-- CreateIndex
CREATE INDEX "InterestLead_leagueType_idx" ON "InterestLead"("leagueType");

-- CreateIndex
CREATE INDEX "InterestLead_createdAt_idx" ON "InterestLead"("createdAt");

-- CreateIndex
CREATE INDEX "InterestLead_leagueId_idx" ON "InterestLead"("leagueId");

-- CreateIndex
CREATE INDEX "InterestLeadPreferredNight_leadId_idx" ON "InterestLeadPreferredNight"("leadId");

-- CreateIndex
CREATE INDEX "InterestLeadPreferredNight_night_idx" ON "InterestLeadPreferredNight"("night");

-- CreateIndex
CREATE UNIQUE INDEX "InterestLeadPreferredNight_leadId_night_key" ON "InterestLeadPreferredNight"("leadId", "night");

-- CreateIndex
CREATE INDEX "InterestLeadEmail_interestLeadId_idx" ON "InterestLeadEmail"("interestLeadId");

-- CreateIndex
CREATE INDEX "InterestLeadEmail_sentAt_idx" ON "InterestLeadEmail"("sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplate_key_key" ON "EmailTemplate"("key");

-- CreateIndex
CREATE INDEX "EmailTemplate_audience_idx" ON "EmailTemplate"("audience");

-- CreateIndex
CREATE INDEX "EmailTemplate_interestType_idx" ON "EmailTemplate"("interestType");

-- CreateIndex
CREATE INDEX "EmailTemplate_isActive_idx" ON "EmailTemplate"("isActive");

-- CreateIndex
CREATE INDEX "NotificationRecipient_audience_idx" ON "NotificationRecipient"("audience");

-- CreateIndex
CREATE INDEX "NotificationRecipient_emailNormalized_idx" ON "NotificationRecipient"("emailNormalized");

-- CreateIndex
CREATE INDEX "NotificationRecipient_phoneNormalized_idx" ON "NotificationRecipient"("phoneNormalized");

-- CreateIndex
CREATE INDEX "NotificationRecipient_isSuppressed_idx" ON "NotificationRecipient"("isSuppressed");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationRecipient_sourceType_sourceId_key" ON "NotificationRecipient"("sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_recipientId_key" ON "NotificationPreference"("recipientId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationTemplate_key_key" ON "NotificationTemplate"("key");

-- CreateIndex
CREATE INDEX "NotificationTemplate_channel_idx" ON "NotificationTemplate"("channel");

-- CreateIndex
CREATE INDEX "NotificationTemplate_audience_idx" ON "NotificationTemplate"("audience");

-- CreateIndex
CREATE INDEX "NotificationTemplate_kind_idx" ON "NotificationTemplate"("kind");

-- CreateIndex
CREATE INDEX "NotificationTemplate_isActive_idx" ON "NotificationTemplate"("isActive");

-- CreateIndex
CREATE INDEX "NotificationDispatch_recipientId_idx" ON "NotificationDispatch"("recipientId");

-- CreateIndex
CREATE INDEX "NotificationDispatch_templateId_idx" ON "NotificationDispatch"("templateId");

-- CreateIndex
CREATE INDEX "NotificationDispatch_channel_status_idx" ON "NotificationDispatch"("channel", "status");

-- CreateIndex
CREATE INDEX "NotificationDispatch_scheduledFor_status_idx" ON "NotificationDispatch"("scheduledFor", "status");

-- CreateIndex
CREATE INDEX "NotificationDispatch_sourceType_sourceId_idx" ON "NotificationDispatch"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "NotificationDispatch_createdByUserId_idx" ON "NotificationDispatch"("createdByUserId");

-- CreateIndex
CREATE INDEX "NotificationAttempt_dispatchId_idx" ON "NotificationAttempt"("dispatchId");

-- CreateIndex
CREATE INDEX "NotificationAttempt_status_idx" ON "NotificationAttempt"("status");

-- CreateIndex
CREATE INDEX "NotificationAttempt_attemptedAt_idx" ON "NotificationAttempt"("attemptedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MessageThread_replyAddress_key" ON "MessageThread"("replyAddress");

-- CreateIndex
CREATE INDEX "MessageThread_recipientId_idx" ON "MessageThread"("recipientId");

-- CreateIndex
CREATE INDEX "MessageThread_teamId_idx" ON "MessageThread"("teamId");

-- CreateIndex
CREATE INDEX "MessageThread_leagueId_idx" ON "MessageThread"("leagueId");

-- CreateIndex
CREATE INDEX "MessageThread_assignedToUserId_idx" ON "MessageThread"("assignedToUserId");

-- CreateIndex
CREATE INDEX "MessageThread_phoneNormalized_idx" ON "MessageThread"("phoneNormalized");

-- CreateIndex
CREATE INDEX "MessageThread_emailNormalized_idx" ON "MessageThread"("emailNormalized");

-- CreateIndex
CREATE INDEX "MessageThread_status_latestMessageAt_idx" ON "MessageThread"("status", "latestMessageAt");

-- CreateIndex
CREATE INDEX "MessageThread_status_latestInboundAt_idx" ON "MessageThread"("status", "latestInboundAt");

-- CreateIndex
CREATE INDEX "MessageThread_unreadForAdminCount_latestInboundAt_idx" ON "MessageThread"("unreadForAdminCount", "latestInboundAt");

-- CreateIndex
CREATE INDEX "MessageThread_sourceType_sourceId_idx" ON "MessageThread"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "MessageEntry_threadId_createdAt_idx" ON "MessageEntry"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "MessageEntry_channel_createdAt_idx" ON "MessageEntry"("channel", "createdAt");

-- CreateIndex
CREATE INDEX "MessageEntry_direction_createdAt_idx" ON "MessageEntry"("direction", "createdAt");

-- CreateIndex
CREATE INDEX "MessageEntry_participantRole_createdAt_idx" ON "MessageEntry"("participantRole", "createdAt");

-- CreateIndex
CREATE INDEX "MessageEntry_providerMessageId_idx" ON "MessageEntry"("providerMessageId");

-- CreateIndex
CREATE INDEX "MessageEntry_twilioMessageSid_idx" ON "MessageEntry"("twilioMessageSid");

-- CreateIndex
CREATE INDEX "MessageEntry_resendEmailId_idx" ON "MessageEntry"("resendEmailId");

-- CreateIndex
CREATE INDEX "MessageEntry_internetMessageId_idx" ON "MessageEntry"("internetMessageId");

-- CreateIndex
CREATE INDEX "MessageEntry_fromEmail_idx" ON "MessageEntry"("fromEmail");

-- CreateIndex
CREATE INDEX "MessageEntry_toEmail_idx" ON "MessageEntry"("toEmail");

-- CreateIndex
CREATE INDEX "MessageEntry_notificationDispatchId_idx" ON "MessageEntry"("notificationDispatchId");

-- CreateIndex
CREATE INDEX "MessageEntry_createdByUserId_idx" ON "MessageEntry"("createdByUserId");

-- CreateIndex
CREATE INDEX "MessageEntry_receivedAt_idx" ON "MessageEntry"("receivedAt");

-- CreateIndex
CREATE INDEX "MessageEntry_sentAt_idx" ON "MessageEntry"("sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "InboxAlert_messageId_key" ON "InboxAlert"("messageId");

-- CreateIndex
CREATE INDEX "InboxAlert_status_createdAt_idx" ON "InboxAlert"("status", "createdAt");

-- CreateIndex
CREATE INDEX "InboxAlert_threadId_idx" ON "InboxAlert"("threadId");

-- CreateIndex
CREATE INDEX "InboxAlert_type_status_idx" ON "InboxAlert"("type", "status");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fixture" ADD CONSTRAINT "Fixture_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fixture" ADD CONSTRAINT "Fixture_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fixture" ADD CONSTRAINT "Fixture_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fixture" ADD CONSTRAINT "Fixture_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fixture" ADD CONSTRAINT "Fixture_refereeId_fkey" FOREIGN KEY ("refereeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchResult" ADD CONSTRAINT "MatchResult_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "Fixture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchResult" ADD CONSTRAINT "MatchResult_enteredByUserId_fkey" FOREIGN KEY ("enteredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterestLead" ADD CONSTRAINT "InterestLead_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterestLead" ADD CONSTRAINT "InterestLead_convertedTeamId_fkey" FOREIGN KEY ("convertedTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterestLeadPreferredNight" ADD CONSTRAINT "InterestLeadPreferredNight_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "InterestLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterestLeadEmail" ADD CONSTRAINT "InterestLeadEmail_interestLeadId_fkey" FOREIGN KEY ("interestLeadId") REFERENCES "InterestLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "NotificationRecipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDispatch" ADD CONSTRAINT "NotificationDispatch_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "NotificationRecipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDispatch" ADD CONSTRAINT "NotificationDispatch_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "NotificationTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationAttempt" ADD CONSTRAINT "NotificationAttempt_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "NotificationDispatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageThread" ADD CONSTRAINT "MessageThread_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "NotificationRecipient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageThread" ADD CONSTRAINT "MessageThread_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageThread" ADD CONSTRAINT "MessageThread_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageThread" ADD CONSTRAINT "MessageThread_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageEntry" ADD CONSTRAINT "MessageEntry_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "MessageThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageEntry" ADD CONSTRAINT "MessageEntry_notificationDispatchId_fkey" FOREIGN KEY ("notificationDispatchId") REFERENCES "NotificationDispatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageEntry" ADD CONSTRAINT "MessageEntry_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxAlert" ADD CONSTRAINT "InboxAlert_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "MessageThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxAlert" ADD CONSTRAINT "InboxAlert_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "MessageEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
