// ========================================
// File: src/app/api/cron/notifications/route.ts
// ========================================

import { NextRequest, NextResponse } from "next/server";
import { runCaptainOnboardingEmailJob } from "@/lib/captain/onboarding-emails";
import { repairUpcomingAiPredictionIntegrity } from "@/lib/fixtures/aiPredictionIntegrity";
import { runFixtureConfirmationEmailJob } from "@/lib/fixtures/confirmation-emails";
import { runFixtureConfirmationReminderJob } from "@/lib/fixtures/confirmation-reminder-job";
import { backfillUpcomingFixtureConfirmationWarningEmails } from "@/lib/fixtures/confirmation-warning-emails";
import { reconcilePendingLastMinuteReplacements } from "@/lib/fixtures/last-minute-replacement-resolution";
import { processNotificationQueue } from "@/lib/notifications/processor";
import { chargeDueMatchdayAutoPayments } from "@/lib/payments/team-autopay";
import { queueDueRefereeNightConfirmationChasers } from "@/lib/referee-night-confirmations";
import { queueDueRefereeNightReminderEmails } from "@/lib/referee-night-emails";
import { syncPublishedFixtureRefereeNightAssignmentsAndRecalculate } from "@/lib/referee-night-assignment-sync";
import { prisma } from "@/lib/prisma";
import { queueMissingReferralRecordedEmails } from "@/lib/team-referral-notifications";

export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest) {
  const configuredSecret = process.env.CRON_SECRET?.trim();

  if (!configuredSecret) {
    return true;
  }

  const authHeader = request.headers.get("authorization")?.trim();
  const bearerSecret = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;
  const headerSecret = request.headers.get("x-cron-secret")?.trim();

  return bearerSecret === configuredSecret || headerSecret === configuredSecret;
}

async function syncUpcomingRefereeAssignmentsForConfirmations() {
  const now = new Date();
  const dueBy = new Date(now.getTime() + 73 * 60 * 60 * 1000);
  const fixtures = await prisma.fixture.findMany({
    where: {
      publishedAt: { not: null },
      refereeId: { not: null },
      status: { not: "CANCELLED" },
      kickoffAt: { gte: now, lte: dueBy },
    },
    orderBy: { kickoffAt: "asc" },
    take: 200,
    select: { id: true },
  });

  if (fixtures.length === 0) return { syncedFixtures: 0, affectedNights: 0 };

  const affectedNightIds = await syncPublishedFixtureRefereeNightAssignmentsAndRecalculate({
    fixtureIds: fixtures.map((fixture) => fixture.id),
  });

  return { syncedFixtures: fixtures.length, affectedNights: affectedNightIds.length };
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const onboarding = await runCaptainOnboardingEmailJob();
    const fixtureConfirmations = await runFixtureConfirmationReminderJob();
    const fixtureConfirmationEmails = await runFixtureConfirmationEmailJob();
    const fixtureConfirmationWarnings =
      await backfillUpcomingFixtureConfirmationWarningEmails();
    const aiPredictionIntegrity = await repairUpcomingAiPredictionIntegrity();
    const lastMinuteReplacements = await reconcilePendingLastMinuteReplacements();
    const refereeAssignmentSync = await syncUpcomingRefereeAssignmentsForConfirmations();
    const refereeNights = await queueDueRefereeNightReminderEmails();
    const refereeConfirmations = await queueDueRefereeNightConfirmationChasers();
    const referralEmails = await queueMissingReferralRecordedEmails();
    const queuedDispatches =
      onboarding.queuedDispatches +
      fixtureConfirmations.queued +
      fixtureConfirmationEmails.queued +
      fixtureConfirmationWarnings.queued +
      refereeNights.queued +
      refereeConfirmations.queued +
      referralEmails.queued;
    const result = await processNotificationQueue(
      Math.max(25, queuedDispatches + 25),
    );

    // Railway already calls this protected GET route on its cron schedule. Run
    // saved-card collection here as part of the same matchday job so no separate
    // POST-only admin endpoint or second Railway service is required.
    const matchdayAutoPayResults = await chargeDueMatchdayAutoPayments();
    const matchdayAutoPay = {
      total: matchdayAutoPayResults.length,
      paid: matchdayAutoPayResults.filter((item) => item.status === "paid").length,
      failed: matchdayAutoPayResults.filter((item) => item.status === "failed").length,
      requiresAction: matchdayAutoPayResults.filter(
        (item) => item.status === "requires_action",
      ).length,
      skipped: matchdayAutoPayResults.filter((item) => item.status === "skipped").length,
    };

    return NextResponse.json({
      ok: true,
      onboarding,
      fixtureConfirmations,
      fixtureConfirmationEmails,
      fixtureConfirmationWarnings,
      aiPredictionIntegrity,
      lastMinuteReplacements,
      refereeAssignmentSync,
      refereeNights,
      refereeConfirmations,
      referralEmails,
      matchdayAutoPay,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Notification cron processing failed.",
      },
      { status: 500 },
    );
  }
}
