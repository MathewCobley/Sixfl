// ========================================
// File: src/app/api/captain/team/[teamId]/prospects/[prospectId]/route.ts
// ========================================

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

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ teamId: string; prospectId: string }> },
) {
  const { teamId, prospectId } = await params;

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
