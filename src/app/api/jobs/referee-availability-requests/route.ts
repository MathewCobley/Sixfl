// ========================================
// File: src/app/api/jobs/referee-availability-requests/route.ts
// ========================================

import { NextRequest, NextResponse } from "next/server";

import {
  getNextMonthKey,
  queueMonthlyRefereeAvailabilityRequests,
} from "@/lib/referee-availability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorised(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;

  const authHeader = request.headers.get("authorization")?.trim();
  return authHeader === `Bearer ${secret}`;
}

function getUkDateParts(value: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const map = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(map.get("year")),
    month: Number(map.get("month")),
    day: Number(map.get("day")),
  };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown referee availability request error";
}

export async function GET(request: NextRequest) {
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requestUrl = new URL(request.url);
  const force = requestUrl.searchParams.get("force") === "1";
  const targetMonth = requestUrl.searchParams.get("month") || getNextMonthKey();
  const ukDate = getUkDateParts(new Date());

  if (ukDate.day !== 20 && !force) {
    return NextResponse.json({
      skipped: true,
      reason: "Referee availability requests only run automatically on the 20th of the month.",
      ukDate,
      targetMonth,
    });
  }

  try {
    const summary = await queueMonthlyRefereeAvailabilityRequests({
      monthKey: targetMonth,
      force,
    });

    return NextResponse.json(summary, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Referee availability request job failed.",
        message: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
