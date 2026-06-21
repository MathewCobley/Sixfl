// ========================================
// File: src/app/api/captain/team/[teamid]/send-player-login-link/route.ts
// ========================================

import { NextResponse } from "next/server";

import { sendDashboardLoginEmail } from "@/lib/auth/sendDashboardLoginEmail";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

export const dynamic = "force-dynamic";

function getPlayerDisplayName(input: { name: string | null; email: string | null }) {
  return input.name?.trim() || input.email?.trim() || "Player";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await params;
  await requireCaptain(teamid);

  const body = (await request.json().catch(() => null)) as {
    membershipId?: string;
  } | null;
  const membershipId = body?.membershipId?.trim() ?? "";

  if (!teamid?.trim() || !membershipId) {
    return NextResponse.json(
      { error: "Missing team or player." },
      { status: 400 },
    );
  }

  const membership = await prisma.teamMember.findFirst({
    where: {
      id: membershipId,
      teamId: teamid,
    },
    select: {
      id: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      team: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!membership) {
    return NextResponse.json(
      { error: "Player not found in this squad." },
      { status: 404 },
    );
  }

  const email = membership.user.email?.trim().toLowerCase() ?? "";

  if (!email) {
    return NextResponse.json(
      { error: "This player does not have an email address saved." },
      { status: 400 },
    );
  }

  await sendDashboardLoginEmail({
    email,
    displayName: getPlayerDisplayName(membership.user),
    teamName: membership.team.name,
    callbackPath: `/player/team/${teamid}`,
  });

  return NextResponse.json({
    ok: true,
    message: `Dashboard sign-in email sent to ${email}.`,
  });
}
