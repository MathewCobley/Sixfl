// ========================================
// File: src/app/api/cron/notifications/route.ts
// ========================================

import { NextRequest, NextResponse } from "next/server";
import { runCaptainOnboardingEmailJob } from "@/lib/captain/onboarding-emails";
import { processNotificationQueue } from "@/lib/notifications/processor";
import { queueDueRefereeNightConfirmationChasers } from "@/lib/referee-night-confirmations";
import { queueDueRefereeNightReminderEmails } from "@/lib/referee-night-emails";

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

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const onboarding = await runCaptainOnboardingEmailJob();
    const refereeNights = await queueDueRefereeNightReminderEmails();
    const refereeConfirmations = await queueDueRefereeNightConfirmationChasers();
    const queuedDispatches = onboarding.queuedDispatches + refereeNights.queued + refereeConfirmations.queued;
    const result = await processNotificationQueue(
      Math.max(25, queuedDispatches + 25),
    );

    return NextResponse.json({
      ok: true,
      onboarding,
      refereeNights,
      refereeConfirmations,
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
