// ========================================
// File: src/app/api/captain/team/[teamid]/prospects/[prospectId]/unassign/route.ts
// ========================================

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function routeError(error: unknown) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "Something went wrong.";
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ teamid: string; prospectId: string }> },
) {
  const { teamid, prospectId } = await params;

  try {
    const access = await requireCaptain(teamid);

    if (!access.isAdmin) {
      return NextResponse.json(
        { error: "Only SIXFL admins can move a team prospect into the main prospects pool." },
        { status: 403 },
      );
    }

    const prospect = await prisma.teamPlayerProspect.findFirst({
      where: {
        id: prospectId,
        teamId: teamid,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!prospect) {
      return NextResponse.json({ error: "Prospect not found." }, { status: 404 });
    }

    await prisma.teamPlayerProspect.update({
      where: { id: prospect.id },
      data: {
        teamId: null,
        status: prospect.status === "ACTIVE_SQUAD" ? "CONTACTED" : prospect.status,
      },
    });

    revalidatePath("/admin/player-prospects");
    revalidatePath(`/admin/teams/${teamid}/prospects`);
    revalidatePath(`/captain/team/${teamid}/prospects`);
    revalidatePath(`/captain/team/${teamid}/squad`);

    return NextResponse.json({ ok: true, moved: true });
  } catch (error) {
    return NextResponse.json({ error: routeError(error) }, { status: 500 });
  }
}
