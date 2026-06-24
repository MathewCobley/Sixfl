-- ========================================
-- Migration: add captain onboarding tracking
-- ========================================
-- Additive only. This keeps live team data intact.

ALTER TABLE "Team"
  ADD COLUMN IF NOT EXISTS "captainAgreementAcceptedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "captainAgreementAcceptedById" TEXT,
  ADD COLUMN IF NOT EXISTS "onboardingCompletedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "onboardingWelcomeEmailSentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "onboardingFirstFixtureEmailSentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "onboardingPostFirstMatchEmailSentAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Team_captainAgreementAcceptedAt_idx"
  ON "Team"("captainAgreementAcceptedAt");

CREATE INDEX IF NOT EXISTS "Team_onboardingCompletedAt_idx"
  ON "Team"("onboardingCompletedAt");

INSERT INTO "NotificationTemplate" (
  "id",
  "key",
  "name",
  "description",
  "kind",
  "channel",
  "audience",
  "subject",
  "body",
  "ctaLabel",
  "ctaUrlKey",
  "isActive",
  "createdAt",
  "updatedAt"
)
VALUES
  (
    'captain-onboarding-welcome',
    'captain-onboarding-welcome',
    'Captain onboarding welcome',
    'Short welcome email for newly linked SIXFL captains.',
    'TRANSACTIONAL',
    'EMAIL',
    'TEAM',
    'Welcome to SIXFL - complete your team setup',
    'Hi {{captainName}},\n\nWelcome to SIXFL. Your team is now set up.\n\nPlease log in to your captain area and complete the team setup checklist before your first fixture. It only takes a few minutes and covers your squad, availability, payments and matchday responsibilities.\n\nThanks,\nSIXFL',
    'Open captain area',
    'captainDashboardUrl',
    true,
    NOW(),
    NOW()
  ),
  (
    'captain-first-fixture-reminder',
    'captain-first-fixture-reminder',
    'Captain first fixture reminder',
    'Short reminder before a team plays its first SIXFL fixture.',
    'TRANSACTIONAL',
    'EMAIL',
    'TEAM',
    'Your first SIXFL fixture is coming up',
    'Hi {{captainName}},\n\nYour first SIXFL fixture is coming up. Please confirm availability, check your squad details and make sure payment arrangements are sorted before matchday.\n\nYou can use the captain checklist and guide in your dashboard if you need a reminder.\n\nThanks,\nSIXFL',
    'Open captain area',
    'captainDashboardUrl',
    true,
    NOW(),
    NOW()
  ),
  (
    'captain-post-first-match',
    'captain-post-first-match',
    'Captain post first match',
    'Short follow-up email after a team has played its first match.',
    'TRANSACTIONAL',
    'EMAIL',
    'TEAM',
    'Thanks for your first SIXFL game',
    'Hi {{captainName}},\n\nHope you enjoyed your first SIXFL game.\n\nYour captain area is where you can find fixtures, squad details, payments, results and support. The Captain Guide is also there if you need a quick reminder of weekly responsibilities.\n\nThanks,\nSIXFL',
    'Open captain area',
    'captainDashboardUrl',
    true,
    NOW(),
    NOW()
  )
ON CONFLICT ("key") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "kind" = EXCLUDED."kind",
  "channel" = EXCLUDED."channel",
  "audience" = EXCLUDED."audience",
  "subject" = EXCLUDED."subject",
  "body" = EXCLUDED."body",
  "ctaLabel" = EXCLUDED."ctaLabel",
  "ctaUrlKey" = EXCLUDED."ctaUrlKey",
  "isActive" = EXCLUDED."isActive",
  "updatedAt" = NOW();
