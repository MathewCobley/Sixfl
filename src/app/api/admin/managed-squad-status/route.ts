// ========================================
// File: src/app/api/admin/managed-squad-status/route.ts
// ========================================

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import {
  getTeamMemberSquadStatusMap,
  setTeamMemberSquadStatus,
  type TeamMemberSquadStatus,
} from "@/lib/managed-squad/squadStatus";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function parseStatus(value: unknown): TeamMemberSquadStatus {
  return clean(value).toUpperCase() === "INJURED" ? "INJURED" : "ACTIVE";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : "Could not update squad status.";
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const teamId = request.nextUrl.searchParams.get("teamId")?.trim() ?? "";
    if (!teamId) {
      return NextResponse.json({ error: "teamId is required" }, { status: 400 });
    }

    const [statusMap, members] = await Promise.all([
      getTeamMemberSquadStatusMap(teamId),
      prisma.teamMember.findMany({
        where: { teamId },
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          role: true,
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      }),
    ]);

    return NextResponse.json({
      members: members.map((member) => {
        const status = statusMap.get(member.id);

        return {
          id: member.id,
          name: member.user.name,
          email: member.user.email,
          role: member.role,
          squadStatus: status?.squadStatus ?? "ACTIVE",
          squadStatusUpdatedAt:
            status?.squadStatusUpdatedAt?.toISOString() ?? null,
          squadStatusNote: status?.squadStatusNote ?? null,
        };
      }),
    });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();

    const body = (await request.json().catch(() => null)) as {
      teamId?: string;
      membershipId?: string;
      squadStatus?: string;
      note?: string | null;
    } | null;

    const teamId = clean(body?.teamId);
    const membershipId = clean(body?.membershipId);
    const squadStatus = parseStatus(body?.squadStatus);
    const note = clean(body?.note) || null;

    if (!teamId || !membershipId) {
      return NextResponse.json(
        { error: "teamId and membershipId are required" },
        { status: 400 },
      );
    }

    const updated = await setTeamMemberSquadStatus({
      teamId,
      membershipId,
      status: squadStatus,
      note,
    });

    if (!updated) {
      return NextResponse.json(
        { error: "Squad member was not found" },
        { status: 404 },
      );
    }

    revalidatePath(`/admin/teams/${teamId}`);
    revalidatePath(`/admin/teams/${teamId}/squad`);
    revalidatePath(`/captain/team/${teamId}`);
    revalidatePath(`/captain/team/${teamId}/squad`);
    revalidatePath(`/captain/team/${teamId}/captain-squad`);
    revalidatePath(`/captain/team/${teamId}/availability`);
    revalidatePath(`/admin/teams/${teamId}/availability`);

    return NextResponse.json({ ok: true, squadStatus });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
