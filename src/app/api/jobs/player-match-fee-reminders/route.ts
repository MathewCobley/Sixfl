// ========================================
// File: src/app/api/jobs/player-match-fee-reminders/route.ts
// ========================================

import { NextRequest, NextResponse } from "next/server";

import { processNotificationQueue } from "@/lib/notifications/processor";
import { queueDuePlayerMatchFeeReminders } from "@/lib/payments/player-match-fees";
import { queueOutstandingTemporaryPlayerMatchFeeRequests } from "@/lib/payments/temporary-player-match-fee-requests";
import { runSafePlayerDataHealthCleanup } from "@/lib/players/player-data-health-safe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorised(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;

  const authHeader = request.headers.get("authorization")?.trim();
  return authHeader === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let playerDataHealth: Awaited<ReturnType<typeof runSafePlayerDataHealthCleanup>> | null = null;
  let playerDataHealthError: string | null = null;

  try {
    playerDataHealth = await runSafePlayerDataHealthCleanup({ source: "MONTHLY" });
  } catch (error) {
    playerDataHealthError = error instanceof Error ? error.message : String(error);
    console.error("Monthly player data health cleanup failed", error);
  }

  const temporaryPlayerRequests =
    await queueOutstandingTemporaryPlayerMatchFeeRequests();
  const queued = await queueDuePlayerMatchFeeReminders();
  const totalQueued = temporaryPlayerRequests.queued + queued.queued;
  const processed = totalQueued > 0
    ? await processNotificationQueue(Math.max(totalQueued + 10, 25))
    : { processed: 0, sent: 0, failed: 0, skipped: 0, items: [] };

  return NextResponse.json({
    ok: true,
    ...queued,
    temporaryPlayerRequests,
    playerDataHealth,
    playerDataHealthError,
    processedQueue: {
      processed: processed.processed,
      sent: processed.sent,
      failed: processed.failed,
      skipped: processed.skipped,
    },
  });
}
