// ========================================
// File: src/app/api/jobs/fixture-confirmation-reminders/route.ts
// ========================================

import { NextRequest, NextResponse } from "next/server";

import { runFixtureConfirmationReminderJob } from "@/lib/fixtures/confirmation-reminder-job";

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

  const summary = await runFixtureConfirmationReminderJob();

  return NextResponse.json(summary, { status: 200 });
}
