// ========================================
// File: src/lib/fixtures/confirmation-reminder-job.ts
// ========================================

import { FixtureCaptainConfirmationStatus } from "@prisma/client";

import {
  queueFixtureConfirmationSmsReminder,
  type FixtureConfirmationReminderMode,
} from "@/lib/fixtures/confirmation-reminders";
import { prisma } from "@/lib/prisma";

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function getReminderMode(input: {
  kickoffAt: Date;
  urgentCutoff: Date;
}): FixtureConfirmationReminderMode {
  return input.kickoffAt <= input.urgentCutoff ? "auto24h" : "auto72h";
}

export async function runFixtureConfirmationReminderJob() {
  const now = new Date();
  const urgentCutoff = addMinutes(addHours(now, 24), 30);
  const standardCutoff = addMinutes(addHours(now, 72), 30);

  const fixtures = await prisma.fixture.findMany({
    where: {
      publishedAt: { not: null },
      status: "SCHEDULED",
      kickoffAt: {
        gt: now,
        lte: standardCutoff,
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
    take: 250,
  });

  const skippedByReason: Record<string, number> = {};
  const summary = {
    scannedFixtures: fixtures.length,
    scannedTeamFixtures: 0,
    queued: 0,
    alreadySent: 0,
    skipped: 0,
    byMode: {
      auto72h: 0,
      auto24h: 0,
    },
    skippedByReason,
  };

  for (const fixture of fixtures) {
    const mode = getReminderMode({ kickoffAt: fixture.kickoffAt, urgentCutoff });

    for (const teamId of [fixture.homeTeamId, fixture.awayTeamId]) {
      summary.scannedTeamFixtures += 1;

      const confirmation =
        fixture.captainConfirmations.find((item) => item.teamId === teamId) ??
        null;

      if (
        confirmation?.status === FixtureCaptainConfirmationStatus.CONFIRMED ||
        confirmation?.status === FixtureCaptainConfirmationStatus.ISSUE_RAISED
      ) {
        summary.skipped += 1;
        skippedByReason[confirmation.status] = (skippedByReason[confirmation.status] ?? 0) + 1;
        continue;
      }

      const result = await queueFixtureConfirmationSmsReminder({
        fixtureId: fixture.id,
        teamId,
        mode,
      });

      if (result.ok && result.status === "queued") {
        summary.queued += 1;
        summary.byMode[mode] += 1;
        continue;
      }

      if (result.ok && result.status === "already_sent") {
        summary.alreadySent += 1;
        continue;
      }

      summary.skipped += 1;
      const reason = result.status;
      skippedByReason[reason] = (skippedByReason[reason] ?? 0) + 1;
    }
  }

  return summary;
}
