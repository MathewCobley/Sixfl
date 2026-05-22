// ========================================
// File: src/app/api/captain/team/[teamid]/fixture/[fixtureid]/availability/route.ts
// ========================================

import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamid: string; fixtureid: string }> },
) {
  const { teamid, fixtureid } = await params;

  await requireCaptain(teamid);

  const fixture = await prisma.fixture.findFirst({
    where: {
      id: fixtureid,
      OR: [{ homeTeamId: teamid }, { awayTeamId: teamid }],
    },
    select: {
      id: true,
      availabilities: {
        where: {
          teamMember: {
            teamId: teamid,
          },
        },
        select: {
          teamMemberId: true,
          response: true,
          note: true,
          respondedAt: true,
        },
      },
    },
  });

  if (!fixture) {
    return NextResponse.json({ error: "Fixture not found" }, { status: 404 });
  }

  return NextResponse.json({
    fixtureId: fixture.id,
    availabilities: fixture.availabilities.map((availability) => ({
      teamMemberId: availability.teamMemberId,
      response: availability.response,
      note: availability.note,
      respondedAt: availability.respondedAt?.toISOString() ?? null,
    })),
  });
}
