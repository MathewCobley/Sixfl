// ========================================
// File: src/app/api/auth/check-email/route.ts
// ========================================

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getCaptainLoginContext,
  getPendingCaptainContext,
} from "@/lib/auth/pendingCaptain";

async function getPendingSquadActivationContext(email: string) {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail) return null;

  const prospect = await prisma.teamPlayerProspect.findFirst({
    where: {
      email: normalizedEmail,
      status: "ACTIVE_SQUAD",
    },
    select: {
      id: true,
      firstName: true,
      team: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });

  if (!prospect?.team) return null;

  return {
    prospectId: prospect.id,
    firstName: prospect.firstName,
    teamId: prospect.team.id,
    teamName: prospect.team.name,
  };
}

export async function POST(req: Request) {
  const { email } = await req.json();
  const normalizedEmail = String(email ?? "").toLowerCase().trim();

  if (!normalizedEmail) {
    return NextResponse.json({
      exists: false,
      pendingCaptain: false,
      pendingSquadActivation: false,
      hasTeamAccess: false,
      hasPlayerOrCaptainAccess: false,
      canChooseLoginArea: false,
      canLogin: false,
      claimCode: null,
      teamName: null,
      userRole: null,
      isReferee: false,
    });
  }

  const [user, pendingCaptain, captainLoginContext, pendingSquadActivation] = await Promise.all([
    prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        role: true,
        _count: {
          select: {
            teamMembers: true,
          },
        },
      },
    }),
    getPendingCaptainContext(normalizedEmail),
    getCaptainLoginContext(normalizedEmail),
    getPendingSquadActivationContext(normalizedEmail),
  ]);

  const hasTeamAccess = (user?._count.teamMembers ?? 0) > 0;
  const hasPlayerOrCaptainAccess = hasTeamAccess || Boolean(captainLoginContext || pendingCaptain || pendingSquadActivation);
  const isReferee = user?.role === "REFEREE";

  return NextResponse.json({
    exists: !!user,
    pendingCaptain: !!pendingCaptain,
    pendingSquadActivation: !!pendingSquadActivation,
    hasTeamAccess,
    hasPlayerOrCaptainAccess,
    canChooseLoginArea: isReferee && hasPlayerOrCaptainAccess,
    canLogin: !!user || !!pendingCaptain || !!captainLoginContext || !!pendingSquadActivation,
    claimCode: pendingCaptain?.claimCode ?? null,
    teamName:
      pendingCaptain?.teamName ??
      captainLoginContext?.teamName ??
      pendingSquadActivation?.teamName ??
      null,
    userRole: user?.role ?? null,
    isReferee,
  });
}
