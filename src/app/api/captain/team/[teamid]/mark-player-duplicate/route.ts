// ========================================
// File: src/app/api/captain/team/[teamid]/mark-player-duplicate/route.ts
// ========================================

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { moveTeamMemberToProspect } from "@/lib/managed-squad/movePlayerToProspect";
import { requireAdmin } from "@/lib/requireAdmin";

type MoveBody = {
  membershipId?: unknown;
};

function getRouteError(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Something went wrong.";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await params;
  const teamId = teamid;

  try {
    await requireAdmin();

    const body = (await request.json().catch(() => null)) as MoveBody | null;
    const membershipId = String(body?.membershipId ?? "").trim();

    if (!membershipId) {
      return NextResponse.json({ error: "Missing player id." }, { status: 400 });
    }

    const result = await moveTeamMemberToProspect({
      teamId,
      membershipId,
      status: "DUPLICATE",
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: "Squad member could not be marked as a duplicate." },
        { status: 404 },
      );
    }

    revalidatePath(`/captain/team/${teamId}/squad`);
    revalidatePath(`/captain/team/${teamId}/prospects`);
    revalidatePath(`/admin/player-prospects`);

    return NextResponse.json({ ok: true, prospectId: result.prospectId });
  } catch (error) {
    return NextResponse.json({ error: getRouteError(error) }, { status: 500 });
  }
}
