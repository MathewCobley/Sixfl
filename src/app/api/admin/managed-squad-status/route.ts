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
  return error instanceof Error && error.message ? error.message : "Could not update squad status.";
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const teamId = request.nextUrl.searchParams.get("teamId")?.trim() ?? "";
    if (!teamId) {
      return NextResponse.json({ error: "teamId is required" }, { status: 400 });
    }

    const statusMap = await getTeamMemberSquadStatusMap(teamId);

    return NextResponse.json({
      members: Array.from(statusMap.values()).map((row) => ({
        id: row.id,
        squadStatus: row.squadStatus,
        squadStatusUpdatedAt: row.squadStatusUpdatedAt?.toISOString() ?? null,
        squadStatusNote: row.squadStatusNote,
      })),
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
      return NextResponse.json({ error: "teamId and membershipId are required" }, { status: 400 });
    }

    const updated = await setTeamMemberSquadStatus({
      teamId,
      membershipId,
      status: squadStatus,
      note,
    });

    if (!updated) {
      return NextResponse.json({ error: "Squad member was not found" }, { status: 404 });
    }

    revalidatePath(`/admin/teams/${teamId}`);
    revalidatePath(`/admin/teams/${teamId}/squad`);
    revalidatePath(`/captain/team/${teamId}`);
    revalidatePath(`/captain/team/${teamId}/squad`);
    revalidatePath(`/captain/team/${teamId}/captain-squad`);

    return NextResponse.json({ ok: true, squadStatus });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
