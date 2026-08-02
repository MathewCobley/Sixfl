import { NextResponse } from "next/server";

import { getSquadMemberCreationDetailsMap } from "@/lib/admin/squadMemberCreationDetails";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await params;
  const access = await requireCaptain(teamid);

  if (!access.isAdmin) {
    return NextResponse.json(
      { error: "Only SIXFL admins can view squad creation details." },
      { status: 403 },
    );
  }

  const team = await prisma.team.findUnique({
    where: { id: teamid },
    select: {
      id: true,
      members: {
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          role: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
    },
  });

  if (!team) {
    return NextResponse.json({ error: "Team not found." }, { status: 404 });
  }

  const detailsMap = await getSquadMemberCreationDetailsMap({
    teamId: team.id,
    members: team.members,
  });

  return NextResponse.json({
    details: Object.fromEntries(detailsMap.entries()),
  });
}
