// ========================================
// File: src/app/api/admin/teams/[teamId]/latest-availability/route.ts
// ========================================

import { FixtureStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

function formatFixtureDate(value: Date) {
  return formatDateTimeInLondon(value, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getFixtureLabel(input: {
  homeTeamName: string;
  awayTeamName: string;
  kickoffAt: Date;
}) {
  return `${input.homeTeamName} vs ${input.awayTeamName} · ${formatFixtureDate(input.kickoffAt)}`;
}

function getResponseLabel(response?: string | null) {
  switch (response) {
    case "AVAILABLE":
      return "Available";
    case "MAYBE":
      return "Maybe";
    case "UNAVAILABLE":
      return "Unavailable";
    default:
      return "No response";
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  await requireAdmin();

  const { teamId } = await params;

  const fixture = await prisma.fixture.findFirst({
    where: {
      OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
      kickoffAt: { gte: new Date() },
      status: { in: [FixtureStatus.SCHEDULED, FixtureStatus.POSTPONED] },
    },
    orderBy: [{ kickoffAt: "asc" }],
    select: {
      id: true,
      kickoffAt: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
  });

  if (!fixture) {
    return NextResponse.json({
      fixture: null,
      availabilityByRecipientValue: {},
      counts: {
        available: 0,
        maybe: 0,
        unavailable: 0,
        noResponse: 0,
      },
    });
  }

  const members = await prisma.teamMember.findMany({
    where: { teamId },
    select: {
      id: true,
      fixtureAvailabilities: {
        where: { fixtureId: fixture.id },
        select: {
          response: true,
          note: true,
          respondedAt: true,
        },
        take: 1,
      },
    },
  });

  const counts = {
    available: 0,
    maybe: 0,
    unavailable: 0,
    noResponse: 0,
  };

  const availabilityByRecipientValue = Object.fromEntries(
    members.map((member) => {
      const availability = member.fixtureAvailabilities[0] ?? null;
      const response = availability?.response ?? "NO_RESPONSE";

      if (response === "AVAILABLE") counts.available += 1;
      else if (response === "MAYBE") counts.maybe += 1;
      else if (response === "UNAVAILABLE") counts.unavailable += 1;
      else counts.noResponse += 1;

      return [
        `teamMember:${member.id}`,
        {
          response,
          label: getResponseLabel(response),
          note: availability?.note ?? null,
          respondedAt: availability?.respondedAt?.toISOString() ?? null,
        },
      ];
    }),
  );

  return NextResponse.json({
    fixture: {
      id: fixture.id,
      label: getFixtureLabel({
        homeTeamName: fixture.homeTeam.name,
        awayTeamName: fixture.awayTeam.name,
        kickoffAt: fixture.kickoffAt,
      }),
    },
    availabilityByRecipientValue,
    counts,
  });
}
