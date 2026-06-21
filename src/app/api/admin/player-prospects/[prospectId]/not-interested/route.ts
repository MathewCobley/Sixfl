// ========================================
// File: src/app/api/admin/player-prospects/[prospectId]/not-interested/route.ts
// ========================================

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function routeError(error: unknown) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "Something went wrong.";
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ prospectId: string }> },
) {
  const { prospectId } = await params;

  try {
    await requireAdmin();

    const prospect = await prisma.teamPlayerProspect.findUnique({
      where: { id: prospectId },
      select: { id: true, teamId: true },
    });

    if (!prospect) {
      return NextResponse.json({ error: "Prospect not found." }, { status: 404 });
    }

    await prisma.teamPlayerProspect.update({
      where: { id: prospect.id },
      data: { status: "DECLINED" },
    });

    revalidatePath("/admin/player-prospects");

    if (prospect.teamId) {
      revalidatePath(`/admin/teams/${prospect.teamId}/prospects`);
      revalidatePath(`/captain/team/${prospect.teamId}/prospects`);
      revalidatePath(`/captain/team/${prospect.teamId}/squad`);
    }

    return NextResponse.json({ ok: true, status: "DECLINED" });
  } catch (error) {
    return NextResponse.json({ error: routeError(error) }, { status: 500 });
  }
}
