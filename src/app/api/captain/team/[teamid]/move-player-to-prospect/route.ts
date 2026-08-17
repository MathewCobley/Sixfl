// ========================================
// File: src/app/api/captain/team/[teamid]/move-player-to-prospect/route.ts
// ========================================

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { moveTeamMemberToProspect } from "@/lib/managed-squad/movePlayerToProspect";
import { sendProspectToPlayerPool } from "@/lib/player-pool/sendProspectToPlayerPool";
import { prisma } from "@/lib/prisma";
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
    const { user } = await requireAdmin();

    const body = (await request.json().catch(() => null)) as MoveBody | null;
    const membershipId = String(body?.membershipId ?? "").trim();

    if (!membershipId) {
      return NextResponse.json({ error: "Missing player id." }, { status: 400 });
    }

    const memberContext = await prisma.teamMember.findFirst({
      where: {
        id: membershipId,
        teamId,
      },
      select: {
        id: true,
        user: {
          select: {
            email: true,
          },
        },
        team: {
          select: {
            league: {
              select: {
                id: true,
              },
            },
          },
        },
      },
    });

    if (!memberContext) {
      return NextResponse.json(
        { error: "Squad member could not be moved to PlayerPool." },
        { status: 404 },
      );
    }

    if (!memberContext.user.email?.trim()) {
      return NextResponse.json(
        {
          error:
            "Add an email address to this player before moving them to PlayerPool.",
        },
        { status: 400 },
      );
    }

    const result = await moveTeamMemberToProspect({
      teamId,
      membershipId,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: "Squad member could not be moved to PlayerPool." },
        { status: 404 },
      );
    }

    const playerPool = await sendProspectToPlayerPool({
      prospectId: result.prospectId,
      requestedLeagueId: memberContext.team.league?.id ?? null,
      createdByUserId: user?.id ?? null,
      origin: "player_pool_profile_invite_from_active_squad",
      originLabel:
        "PlayerPool profile invitation sent while moving a player from an active squad",
    });

    revalidatePath(`/captain/team/${teamId}/squad`);
    revalidatePath(`/captain/team/${teamId}/prospects`);
    revalidatePath(`/admin/teams/${teamId}/squad`);
    revalidatePath("/admin/player-prospects");
    revalidatePath("/admin/player-pool");
    revalidatePath("/admin/messaging");

    return NextResponse.json({
      ok: true,
      prospectId: result.prospectId,
      playerPoolProfileId: playerPool.profileId,
      playerPoolCreated: playerPool.created,
      message: playerPool.message,
    });
  } catch (error) {
    return NextResponse.json({ error: getRouteError(error) }, { status: 500 });
  }
}
