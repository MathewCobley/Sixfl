// ========================================
// File: src/app/api/captain/team/[teamid]/prospects/[prospectId]/route.ts
// ========================================

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getRouteError(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Something went wrong.";
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ teamid: string; prospectId: string }> },
) {
  const { teamid, prospectId } = await params;
  const teamId = teamid;

  try {
    const access = await requireCaptain(teamId);

    if (!access.isAdmin) {
      return NextResponse.json(
        { error: "Only SIXFL admins can return pending players to prospects." },
        { status: 403 },
      );
    }

    const prospect = await prisma.teamPlayerProspect.findFirst({
      where: {
        id: prospectId,
        teamId,
        status: "ACTIVE_SQUAD",
      },
      select: {
        id: true,
      },
    });

    if (!prospect) {
      return NextResponse.json(
        { error: "Pending activation prospect not found." },
        { status: 404 },
      );
    }

    await prisma.teamPlayerProspect.update({
      where: { id: prospect.id },
      data: {
        teamId: null,
        status: "CONTACTED",
      },
    });

    revalidatePath(`/captain/team/${teamId}`);
    revalidatePath(`/captain/team/${teamId}/squad`);
    revalidatePath(`/captain/team/${teamId}/prospects`);
    revalidatePath(`/captain/team/${teamId}/captain-squad`);
    revalidatePath("/admin/player-prospects");

    return NextResponse.json({ ok: true, returned: true });
  } catch (error) {
    return NextResponse.json({ error: getRouteError(error) }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ teamid: string; prospectId: string }> },
) {
  const { teamid, prospectId } = await params;
  const teamId = teamid;

  try {
    await requireCaptain(teamId);

    const prospect = await prisma.teamPlayerProspect.findFirst({
      where: {
        id: prospectId,
        teamId,
      },
      select: {
        id: true,
      },
    });

    if (!prospect) {
      return NextResponse.json({ error: "Prospect not found." }, { status: 404 });
    }

    await prisma.teamPlayerProspect.delete({
      where: { id: prospect.id },
    });

    return NextResponse.json({ ok: true, deleted: true });
  } catch (error) {
    return NextResponse.json({ error: getRouteError(error) }, { status: 500 });
  }
}
