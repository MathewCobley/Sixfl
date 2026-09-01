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
import {
  queueMissingReferralRecordedEmails,
  queueReadyReferralPayoutEmails,
} from "@/lib/team-referral-notifications";

export const dynamic = "force-dynamic";

type FailedCronStep = {
  step: string;
  error: string;
};

type CronStepResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

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

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error || "Unknown cron error");
}

async function runCronStep<T>(
  step: string,
  failures: FailedCronStep[],
  work: () => Promise<T>,
): Promise<CronStepResult<T>> {
  try {
    const value = await work();
    return { ok: true, value };
  } catch (error) {
    const message = getErrorMessage(error);
    console.error(`[notifications-cron] ${step} failed`, error);
    failures.push({ step, error: message });
    return { ok: false, error: message };
  }
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

function summariseAutoPay(
  results: Awaited<ReturnType<typeof chargeDueMatchdayAutoPayments>>,
) {
  return {
    total: results.length,
    paid: results.filter((item) => item.status === "paid").length,
    failed: results.filter((item) => item.status === "failed").length,
    requiresAction: results.filter((item) => item.status === "requires_action").length,
    skipped: results.filter((item) => item.status === "skipped").length,
  };
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const failures: FailedCronStep[] = [];

  // Critical safety rule: always try to drain notifications that are already
  // queued BEFORE running any reminder/reconciliation job. An unrelated failing
  // raw query must never strand SMS/email delivery again.
  const existingQueue = await runCronStep(
    "process-existing-notification-queue",
    failures,
    () => processNotificationQueue(100),
  );

  const onboarding = await runCronStep(
    "captain-onboarding",
    failures,
    runCaptainOnboardingEmailJob,
  );
  const fixtureConfirmations = await runCronStep(
    "fixture-confirmation-reminders",
    failures,
    runFixtureConfirmationReminderJob,
  );
  const fixtureConfirmationEmails = await runCronStep(
    "fixture-confirmation-emails",
    failures,
    runFixtureConfirmationEmailJob,
  );
  const fixtureConfirmationWarnings = await runCronStep(
    "fixture-confirmation-warnings",
    failures,
    backfillUpcomingFixtureConfirmationWarningEmails,
  );
  const aiPredictionIntegrity = await runCronStep(
    "ai-prediction-integrity",
    failures,
    repairUpcomingAiPredictionIntegrity,
  );
  const lastMinuteReplacements = await runCronStep(
    "last-minute-replacement-reconciliation",
    failures,
    reconcilePendingLastMinuteReplacements,
  );
  const refereeAssignmentSync = await runCronStep(
    "referee-assignment-sync",
    failures,
    syncUpcomingRefereeAssignmentsForConfirmations,
  );
  const refereeNights = await runCronStep(
    "referee-night-reminders",
    failures,
    queueDueRefereeNightReminderEmails,
  );
  const refereeConfirmations = await runCronStep(
    "referee-confirmation-chasers",
    failures,
    queueDueRefereeNightConfirmationChasers,
  );
  const referralEmails = await runCronStep(
    "referral-recorded-emails",
    failures,
    queueMissingReferralRecordedEmails,
  );
  const referralPayoutEmails = await runCronStep(
    "referral-payout-emails",
    failures,
    queueReadyReferralPayoutEmails,
  );

  // Drain again so anything successfully queued by the steps above is sent in
  // the same cron run even if a different step failed.
  const generatedQueue = await runCronStep(
    "process-new-notification-queue",
    failures,
    () => processNotificationQueue(200),
  );

  const autoPayResults = await runCronStep(
    "matchday-autopay",
    failures,
    chargeDueMatchdayAutoPayments,
  );
  const matchdayAutoPay = autoPayResults.ok
    ? summariseAutoPay(autoPayResults.value)
    : autoPayResults;

  const response = {
    ok: failures.length === 0,
    diagnosis:
      failures.length === 0
        ? "All notification cron steps completed."
        : `Cron completed with ${failures.length} failed step${failures.length === 1 ? "" : "s"}. See failedSteps for the exact component.`,
    failedSteps: failures,
    existingQueue,
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
    referralPayoutEmails,
    generatedQueue,
    matchdayAutoPay,
  };

  // Keep a failed HTTP status so Railway correctly flags a partial cron failure,
  // but only after already-queued messages and all independent steps have had a
  // chance to run.
  return NextResponse.json(response, { status: failures.length === 0 ? 200 : 500 });
}
