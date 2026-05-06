// ========================================
// File: src/app/api/captain/team/[teamId]/move-managed-player/route.ts
// ========================================

import { NextResponse } from "next/server";
import { Prisma, TeamRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type MoveType = "squad" | "prospect";

type MoveBody = {
  type?: unknown;
  itemId?: unknown;
  targetTeamId?: unknown;
};

type PrismaClientLike = typeof prisma | Prisma.TransactionClient;

function getString(value: unknown) {
  const parsed = String(value ?? "").trim();
  return parsed || null;
}

function getMoveType(value: unknown): MoveType | null {
  const parsed = getString(value);

  if (parsed === "squad" || parsed === "prospect") {
    return parsed;
  }

  return null;
}

function getRouteError(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Something went wrong.";
}

async function getTargetTeams(sourceTeamId: string) {
  return prisma.team.findMany({
    where: {
      id: {
        not: sourceTeamId,
      },
      teamMode: "MANAGED",
    },
    orderBy: [{ league: { name: "asc" } }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      league: {
        select: {
          name: true,
          season: true,
        },
      },
    },
  });
}

async function getLinkedSourceProspectId(input: {
  client: PrismaClientLike;
  membershipId: string;
}) {
  try {
    const rows = await input.client.$queryRaw<Array<{ sourceProspectId: string | null }>>`
      SELECT "sourceProspectId"
      FROM "TeamMemberProfile"
      WHERE "teamMemberId" = ${input.membershipId}
      LIMIT 1
    `;

    return rows[0]?.sourceProspectId ?? null;
  } catch {
    return null;
  }
}

async function moveLinkedProspectForSquadMember(input: {
  client: PrismaClientLike;
  membershipId: string;
  sourceTeamId: string;
  targetTeamId: string;
}) {
  const sourceProspectId = await getLinkedSourceProspectId({
    client: input.client,
    membershipId: input.membershipId,
  });

  if (!sourceProspectId) return false;

  const result = await input.client.teamPlayerProspect.updateMany({
    where: {
      id: sourceProspectId,
      teamId: input.sourceTeamId,
    },
    data: {
      teamId: input.targetTeamId,
    },
  });

  return result.count > 0;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const { teamId } = await params;

  try {
    await requireCaptain(teamId);

    const url = new URL(request.url);
    const type = getMoveType(url.searchParams.get("type"));

    if (!type) {
      return NextResponse.json(
        { error: "Move type must be squad or prospect." },
        { status: 400 },
      );
    }

    const sourceTeam = await prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true, teamMode: true },
    });

    if (!sourceTeam) {
      return NextResponse.json({ error: "Team not found." }, { status: 404 });
    }

    const targetTeams = await getTargetTeams(teamId);

    return NextResponse.json({
      targetTeams,
      items: [],
    });
  } catch (error) {
    return NextResponse.json({ error: getRouteError(error) }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const { teamId } = await params;

  try {
    await requireCaptain(teamId);

    const body = (await request.json().catch(() => null)) as MoveBody | null;
    const type = getMoveType(body?.type);
    const itemId = getString(body?.itemId);
    const targetTeamId = getString(body?.targetTeamId);

    if (!type) {
      return NextResponse.json(
        { error: "Move type must be squad or prospect." },
        { status: 400 },
      );
    }

    if (!itemId) {
      return NextResponse.json({ error: "Missing player id." }, { status: 400 });
    }

    if (!targetTeamId) {
      return NextResponse.json({ error: "Missing destination team." }, { status: 400 });
    }

    if (targetTeamId === teamId) {
      return NextResponse.json(
        { error: "Choose a different destination team." },
        { status: 400 },
      );
    }

    const targetTeam = await prisma.team.findFirst({
      where: {
        id: targetTeamId,
        teamMode: "MANAGED",
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!targetTeam) {
      return NextResponse.json(
        { error: "Destination managed team not found." },
        { status: 404 },
      );
    }

    if (type === "prospect") {
      const prospect = await prisma.teamPlayerProspect.findFirst({
        where: {
          id: itemId,
          teamId,
        },
        select: {
          id: true,
        },
      });

      if (!prospect) {
        return NextResponse.json({ error: "Prospect not found." }, { status: 404 });
      }

      await prisma.teamPlayerProspect.update({
        where: { id: prospect.id },
        data: { teamId: targetTeam.id },
      });

      return NextResponse.json({ ok: true, moved: true });
    }

    const membership = await prisma.teamMember.findFirst({
      where: {
        id: itemId,
        teamId,
      },
      select: {
        id: true,
        userId: true,
        role: true,
      },
    });

    if (!membership) {
      return NextResponse.json({ error: "Squad member not found." }, { status: 404 });
    }

    const existingTargetMembership = await prisma.teamMember.findFirst({
      where: {
        userId: membership.userId,
        teamId: targetTeam.id,
      },
      select: {
        id: true,
      },
    });

    if (existingTargetMembership) {
      return NextResponse.json(
        { error: "This player is already in the destination squad." },
        { status: 409 },
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.teamMember.update({
        where: { id: membership.id },
        data: {
          teamId: targetTeam.id,
          role: membership.role === TeamRole.CAPTAIN ? TeamRole.PLAYER : membership.role,
        },
      });

      const linkedProspectMoved = await moveLinkedProspectForSquadMember({
        client: tx,
        membershipId: membership.id,
        sourceTeamId: teamId,
        targetTeamId: targetTeam.id,
      });

      return { linkedProspectMoved };
    });

    return NextResponse.json({ ok: true, moved: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: getRouteError(error) }, { status: 500 });
  }
}
