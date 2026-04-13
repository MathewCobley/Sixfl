// ========================================
// File: src/app/api/jobs/fixture-confirmation-reminders/route.ts
// ========================================

import { FixtureCaptainConfirmationStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { queueFixtureConfirmationSmsReminder } from "@/lib/fixtures/confirmation-reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

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

  const now = new Date();

  const windows = [
    {
      mode: "auto72h" as const,
      start: addMinutes(addHours(now, 72), -30),
      end: addMinutes(addHours(now, 72), 30),
    },
    {
      mode: "auto24h" as const,
      start: addMinutes(addHours(now, 24), -30),
      end: addMinutes(addHours(now, 24), 30),
    },
  ];

  const minStart = windows.reduce(
    (lowest, window) => (window.start < lowest ? window.start : lowest),
    windows[0].start,
  );

  const maxEnd = windows.reduce(
    (highest, window) => (window.end > highest ? window.end : highest),
    windows[0].end,
  );

  const fixtures = await prisma.fixture.findMany({
    where: {
      status: "SCHEDULED",
      kickoffAt: {
        gte: minStart,
        lte: maxEnd,
      },
    },
    select: {
      id: true,
      kickoffAt: true,
      homeTeamId: true,
      awayTeamId: true,
      captainConfirmations: {
        select: {
          teamId: true,
          status: true,
          lastChasedAt: true,
        },
      },
    },
    orderBy: {
      kickoffAt: "asc",
    },
  });

  const summary = {
    scannedFixtures: fixtures.length,
    queued: 0,
    alreadySent: 0,
    skipped: 0,
    byMode: {
      auto72h: 0,
      auto24h: 0,
    },
  };

  for (const fixture of fixtures) {
    for (const window of windows) {
      if (fixture.kickoffAt < window.start || fixture.kickoffAt > window.end) {
        continue;
      }

      for (const teamId of [fixture.homeTeamId, fixture.awayTeamId]) {
        const confirmation =
          fixture.captainConfirmations.find((item) => item.teamId === teamId) ??
          null;

        if (
          confirmation?.status === FixtureCaptainConfirmationStatus.CONFIRMED ||
          confirmation?.status === FixtureCaptainConfirmationStatus.ISSUE_RAISED
        ) {
          summary.skipped += 1;
          continue;
        }

        const result = await queueFixtureConfirmationSmsReminder({
          fixtureId: fixture.id,
          teamId,
          mode: window.mode,
        });

        if (result.ok && result.status === "queued") {
          summary.queued += 1;
          summary.byMode[window.mode] += 1;
          continue;
        }

        if (result.ok && result.status === "already_sent") {
          summary.alreadySent += 1;
          continue;
        }

        summary.skipped += 1;
      }
    }
  }

  return NextResponse.json(summary, { status: 200 });
}