// ========================================
// File: src/app/captain/team/[teamid]/availability/history/layout.tsx
// ========================================

import type { ReactNode } from "react";

import AvailabilityHistoryNudgePanel from "@/components/captain/AvailabilityHistoryNudgePanel";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

const AVAILABILITY_HISTORY_NUDGE_SOURCE_TYPE =
  "CAPTAIN_AVAILABILITY_HISTORY_NUDGE";

function getNudgeSourceId(teamId: string, teamMemberId: string) {
  return `${teamId}:${teamMemberId}`;
}

export default async function AvailabilityHistoryLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ teamid: string }>;
}) {
  const { teamid } = await params;
  await requireCaptain(teamid);

  const [members, fixtures] = await Promise.all([
    prisma.teamMember.findMany({
      where: { teamId: teamid },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    }),
    prisma.fixture.findMany({
      where: {
        OR: [{ homeTeamId: teamid }, { awayTeamId: teamid }],
        kickoffAt: { lt: new Date() },
      },
      orderBy: [{ kickoffAt: "desc" }],
      take: 20,
      select: {
        availabilities: {
          where: {
            teamMember: { teamId: teamid },
          },
          select: {
            teamMemberId: true,
            response: true,
          },
        },
      },
    }),
  ]);

  const sourceIds = members.map((member) =>
    getNudgeSourceId(teamid, member.id),
  );
  const dispatches = sourceIds.length
    ? await prisma.notificationDispatch.findMany({
        where: {
          sourceType: AVAILABILITY_HISTORY_NUDGE_SOURCE_TYPE,
          sourceId: { in: sourceIds },
        },
        orderBy: [{ createdAt: "desc" }],
        select: {
          sourceId: true,
          status: true,
          createdAt: true,
          processedAt: true,
          sentAt: true,
        },
      })
    : [];

  const nudgeHistory = new Map<
    string,
    {
      lastNudgeAt: Date;
      nudgeStatus: string;
      nudgeCount: number;
    }
  >();

  for (const dispatch of dispatches) {
    if (!dispatch.sourceId) continue;

    const existing = nudgeHistory.get(dispatch.sourceId);
    if (existing) {
      existing.nudgeCount += 1;
      continue;
    }

    nudgeHistory.set(dispatch.sourceId, {
      lastNudgeAt:
        dispatch.sentAt ?? dispatch.processedAt ?? dispatch.createdAt,
      nudgeStatus: dispatch.status,
      nudgeCount: 1,
    });
  }

  const players = members
    .map((member) => {
      const ignoredCount = fixtures.reduce((count, fixture) => {
        const response = fixture.availabilities.find(
          (availability) => availability.teamMemberId === member.id,
        )?.response;

        return response && response !== "NO_RESPONSE" ? count : count + 1;
      }, 0);
      const history = nudgeHistory.get(
        getNudgeSourceId(teamid, member.id),
      );

      return {
        teamMemberId: member.id,
        name: member.user.name || member.user.email || "Unnamed player",
        email: member.user.email?.trim().toLowerCase() ?? null,
        ignoredCount,
        lastNudgeAt: history?.lastNudgeAt.toISOString() ?? null,
        nudgeStatus: history?.nudgeStatus ?? null,
        nudgeCount: history?.nudgeCount ?? 0,
      };
    })
    .filter((player) => player.ignoredCount > 0)
    .sort((a, b) => {
      if (b.ignoredCount !== a.ignoredCount) {
        return b.ignoredCount - a.ignoredCount;
      }

      return a.name.localeCompare(b.name);
    });

  return (
    <>
      <AvailabilityHistoryNudgePanel teamId={teamid} players={players} />
      {children}
    </>
  );
}
