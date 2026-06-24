-- ========================================
-- Migration: mark existing captain onboarding emails handled
-- ========================================
-- Existing teams should see the dashboard checklist, but this prevents the new
-- onboarding email sequence from suddenly sending to every current team.
-- New teams created after this migration will keep these fields NULL until the
-- onboarding email job queues the relevant email.

UPDATE "Team"
SET
  "onboardingWelcomeEmailSentAt" = COALESCE("onboardingWelcomeEmailSentAt", NOW()),
  "onboardingFirstFixtureEmailSentAt" = COALESCE("onboardingFirstFixtureEmailSentAt", NOW()),
  "onboardingPostFirstMatchEmailSentAt" = COALESCE("onboardingPostFirstMatchEmailSentAt", NOW())
WHERE "onboardingWelcomeEmailSentAt" IS NULL
   OR "onboardingFirstFixtureEmailSentAt" IS NULL
   OR "onboardingPostFirstMatchEmailSentAt" IS NULL;
