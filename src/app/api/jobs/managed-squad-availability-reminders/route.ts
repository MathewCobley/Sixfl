// ========================================
// File: src/app/api/jobs/managed-squad-availability-reminders/route.ts
// ========================================

import { Prisma, TeamRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import {
  ensureManagedSquadAvailabilityTemplates,
  getManagedSquadAvailabilityReminderMode,
  queueManagedSquadAvailabilityReminder,
} from "@/lib/fixtures/managed-squad-availability-reminders";
import { ensureTeamMemberSquadStatusColumns } from "@/lib/managed-squad/squadStatus";
import { processNotificationQueue } from "@/lib/notifications/processor";
import { prisma } from "@/lib/prisma";
import { backfillTeamMemberProfilesFromProspects } from "@/lib/teamMemberProfileBackfill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UnavailableMemberRow = {
  id: string;
  squadStatus: "INJURED" | "INACTIVE";
};

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function isAuthorised(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;

  const authHeader = request.headers.get("authorization")?.trim();
  return authHeader === `Bearer ${secret}`;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown managed squad availability reminder error";
}

async function runManagedSquadAvailabilityReminderJob() {
  await ensureManagedSquadAvailabilityTemplates();
  await ensureTeamMemberSquadStatusColumns();

  const backfill = await backfillTeamMemberProfilesFromProspects();

  const now = new Date();
  const fixtures = await prisma.fixture.findMany({
    where: {
      status: "SCHEDULED",
      publishedAt: {
        not: null,
      },
      kickoffAt: {
        gt: now,
        lte: addDays(now, 14),
      },
      OR: [
        {
          homeTeam: {
            teamMode: "MANAGED",
          },
        },
        {
          awayTeam: {
            teamMode: "MANAGED",
          },
        },
      ],
    },
    orderBy: [{ kickoffAt: "asc" }],
    select: {
      id: true,
      homeTeamId: true,
      awayTeamId: true,
      homeTeam: {
        select: {
          id: true,
          teamMode: true,
        },
      },
      awayTeam: {
        select: {
          id: true,
          teamMode: true,
        },
      },
    },
  });

  const managedTeamIds = Array.from(
    new Set(
      fixtures
        .flatMap((fixture) => [
          fixture.homeTeam.teamMode === "MANAGED" ? fixture.homeTeamId : null,
          fixture.awayTeam.teamMode === "MANAGED" ? fixture.awayTeamId : null,
        ])
        .filter((teamId): teamId is string => Boolean(teamId)),
    ),
  );

  const members = managedTeamIds.length
    ? await prisma.teamMember.findMany({
        where: {
          teamId: {
            in: managedTeamIds,
          },
          role: {
            in: [TeamRole.PLAYER, TeamRole.VICE_CAPTAIN, TeamRole.BACKUP_PLAYER],
          },
        },
        select: {
          id: true,
          teamId: true,
        },
      })
    : [];

  const memberIds = members.map((member) => member.id);
  const unavailableRows = memberIds.length
    ? await prisma.$queryRaw<UnavailableMemberRow[]>(Prisma.sql`
        SELECT "id", "squadStatus"
        FROM "TeamMember"
        WHERE "id" IN (${Prisma.join(memberIds)})
          AND "squadStatus" IN ('INJURED', 'INACTIVE')
      `)
    : [];
  const unavailableMemberIds = new Set(unavailableRows.map((row) => row.id));
  const activeMembers = members.filter((member) => !unavailableMemberIds.has(member.id));
  const skippedInjuredMembers = unavailableRows.filter(
    (row) => row.squadStatus === "INJURED",
  ).length;
  const skippedInactiveMembers = unavailableRows.filter(
    (row) => row.squadStatus === "INACTIVE",
  ).length;

  const membersByTeamId = new Map<string, typeof activeMembers>();

  for (const member of activeMembers) {
    membersByTeamId.set(member.teamId, [
      ...(membersByTeamId.get(member.teamId) ?? []),
      member,
    ]);
  }

  const summary = {
    scannedFixtures: fixtures.length,
    scannedMembers: members.length,
    skippedInjuredMembers,
    skippedInactiveMembers,
    queuedDispatches: 0,
    alreadySent: 0,
    skipped: 0,
    errors: [] as string[],
    backfill,
    byMode: {
      request: 0,
      chase24h: 0,
      chase72h: 0,
    },
    processedQueue: {
      processed: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
    },
  };

  for (const fixture of fixtures) {
    const fixtureTeamIds = [
      fixture.homeTeam.teamMode === "MANAGED" ? fixture.homeTeamId : null,
      fixture.awayTeam.teamMode === "MANAGED" ? fixture.awayTeamId : null,
    ].filter((teamId): teamId is string => Boolean(teamId));

    for (const teamId of fixtureTeamIds) {
      const teamMembers = membersByTeamId.get(teamId) ?? [];

      for (const member of teamMembers) {
        try {
          const mode = await getManagedSquadAvailabilityReminderMode({
            fixtureId: fixture.id,
            teamMemberId: member.id,
            now,
          });

          if (!mode) {
            summary.skipped += 1;
            continue;
          }

          const result = await queueManagedSquadAvailabilityReminder({
            fixtureId: fixture.id,
            teamId,
            teamMemberId: member.id,
            mode,
          });

          if (result.ok && result.status === "queued") {
            summary.queuedDispatches += result.queued;
            summary.byMode[mode] += result.queued;
            continue;
          }

          if (result.ok && result.status === "already_sent") {
            summary.alreadySent += 1;
            continue;
          }

          summary.skipped += 1;
        } catch (error) {
          summary.skipped += 1;

          if (summary.errors.length < 10) {
            summary.errors.push(`${fixture.id}:${member.id}: ${getErrorMessage(error)}`);
          }
        }
      }
    }
  }

  if (summary.queuedDispatches > 0) {
    const processed = await processNotificationQueue(
      Math.max(summary.queuedDispatches + 10, 25),
    );
    summary.processedQueue = {
      processed: processed.processed,
      sent: processed.sent,
      failed: processed.failed,
      skipped: processed.skipped,
    };
  }

  return summary;
}

export async function GET(request: NextRequest) {
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runManagedSquadAvailabilityReminderJob();
    return NextResponse.json(summary, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Managed squad availability reminder job failed.",
        message: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
