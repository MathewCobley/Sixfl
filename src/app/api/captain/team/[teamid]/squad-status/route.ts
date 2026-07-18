// ========================================
// File: src/app/api/captain/team/[teamid]/squad-status/route.ts
// ========================================

import { NextResponse } from "next/server";

import { getTeamMemberSquadStatusMap } from "@/lib/managed-squad/squadStatus";
import { requireCaptain } from "@/lib/requireCaptain";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await params;
  await requireCaptain(teamid);

  const statusMap = await getTeamMemberSquadStatusMap(teamid);

  return NextResponse.json({
    members: Array.from(statusMap.values()).map((member) => ({
      id: member.id,
      squadStatus: member.squadStatus,
      squadStatusUpdatedAt: member.squadStatusUpdatedAt?.toISOString() ?? null,
      squadStatusNote: member.squadStatusNote,
    })),
  });
}
