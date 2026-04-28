// ========================================
// File: src/app/api/jobs/managed-squad-availability-reminders/route.ts
// ========================================

import { TeamRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import {
  ensureManagedSquadAvailabilityTemplates,
  getManagedSquadAvailabilityReminderMode,
  queueManagedSquadAvailabilityReminder,
} from "@/lib/fixtures/managed-squad-availability-reminders";
import { processNotificationQueue } from "@/lib/notifications/processor";
import { prisma } from "@/lib/prisma";
import { backfillTeamMemberProfilesFromProspects } from "@/lib/teamMemberProfileBackfill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
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

  await ensureManagedSquadAvailabilityTemplates();

  const backfill = await backfillTeamMemberProfilesFromProspects();

  const now = new Date();
  const fixtures = await prisma.fixture.findMany({
    where: {
      status: "SCHEDULED",
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
      fixtures.flatMap((fixture) => [
        fixture.homeTeam.teamMode === "MANAGED" ? fixture.homeTeamId : null,
        fixture.awayTeam.teamMode === "MANAGED" ? fixture.awayTeamId : null,
      ]).filter((teamId): teamId is string => Boolean(teamId)),
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

  const membersByTeamId = new Map<string, typeof members>();

  for (const member of members) {
    membersByTeamId.set(member.teamId, [
      ...(membersByTeamId.get(member.teamId) ?? []),
      member,
    ]);
  }

  const summary = {
    scannedFixtures: fixtures.length,
    scannedMembers: members.length,
    queuedDispatches: 0,
    alreadySent: 0,
    skipped: 0,
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
      }
    }
  }

  if (summary.queuedDispatches > 0) {
    const processed = await processNotificationQueue(Math.max(summary.queuedDispatches + 10, 25));
    summary.processedQueue = {
      processed: processed.processed,
      sent: processed.sent,
      failed: processed.failed,
      skipped: processed.skipped,
    };
  }

  return NextResponse.json(summary, { status: 200 });
}
