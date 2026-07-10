// ========================================
// File: src/lib/fixtures/confirmation-reminder-job.ts
// ========================================

import { FixtureCaptainConfirmationStatus } from "@prisma/client";

import { queueFixtureConfirmationSmsReminder } from "@/lib/fixtures/confirmation-reminders";
import { prisma } from "@/lib/prisma";

type AutoFixtureConfirmationReminderMode = "auto72h" | "auto24h";

type FixtureConfirmationSkipReason =
  | "fixture_not_found"
  | "team_not_in_fixture"
  | "not_available"
  | "confirmed"
  | "issue_raised"
  | "no_phone"
  | "template_missing"
  | "skipped";

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function getReminderMode(input: {
  kickoffAt: Date;
  urgentCutoff: Date;
}): AutoFixtureConfirmationReminderMode {
  return input.kickoffAt <= input.urgentCutoff ? "auto24h" : "auto72h";
}

function incrementModeCount(
  byMode: Record<AutoFixtureConfirmationReminderMode, number>,
  mode: AutoFixtureConfirmationReminderMode,
) {
  if (mode === "auto24h") {
    byMode.auto24h += 1;
    return;
  }

  byMode.auto72h += 1;
}

function getSkippedConfirmationNote(input: {
  reason: FixtureConfirmationSkipReason;
  mode: AutoFixtureConfirmationReminderMode;
}) {
  const prefix = input.mode === "auto24h" ? "Automatic 24h confirmation chase" : "Automatic 72h confirmation chase";

  switch (input.reason) {
    case "no_phone":
      return `${prefix} not sent: no usable captain/team mobile number was found.`;
    case "template_missing":
      return `${prefix} not sent: SMS template is missing or inactive.`;
    case "not_available":
      return `${prefix} not sent: fixture was not available for confirmation when the job ran.`;
    case "team_not_in_fixture":
      return `${prefix} not sent: selected team was not attached to this fixture.`;
    case "fixture_not_found":
      return `${prefix} not sent: fixture could not be found.`;
    case "confirmed":
      return `${prefix} skipped: fixture was already confirmed.`;
    case "issue_raised":
      return `${prefix} skipped: captain had already raised an issue.`;
    default:
      return `${prefix} not sent: notification provider or queue skipped it.`;
  }
}

async function recordSkippedConfirmationReason(input: {
  fixtureId: string;
  teamId: string;
  reason: FixtureConfirmationSkipReason;
  mode: AutoFixtureConfirmationReminderMode;
}) {
  if (input.reason === "confirmed" || input.reason === "issue_raised") return;

  await prisma.fixtureCaptainConfirmation.upsert({
    where: {
      fixtureId_teamId: {
        fixtureId: input.fixtureId,
        teamId: input.teamId,
      },
    },
    update: {
      note: getSkippedConfirmationNote({ reason: input.reason, mode: input.mode }),
    },
    create: {
      fixtureId: input.fixtureId,
      teamId: input.teamId,
      status: FixtureCaptainConfirmationStatus.PENDING,
      note: getSkippedConfirmationNote({ reason: input.reason, mode: input.mode }),
    },
  });
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
  const byMode: Record<AutoFixtureConfirmationReminderMode, number> = {
    auto72h: 0,
    auto24h: 0,
  };
  const summary = {
    scannedFixtures: fixtures.length,
    scannedTeamFixtures: 0,
    queued: 0,
    alreadySent: 0,
    skipped: 0,
    byMode,
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
        incrementModeCount(summary.byMode, mode);
        continue;
      }

      if (result.ok && result.status === "already_sent") {
        summary.alreadySent += 1;
        continue;
      }

      summary.skipped += 1;
      const reason = result.status;
      skippedByReason[reason] = (skippedByReason[reason] ?? 0) + 1;

      await recordSkippedConfirmationReason({
        fixtureId: fixture.id,
        teamId,
        reason,
        mode,
      });
    }
  }

  return summary;
}
