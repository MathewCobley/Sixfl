// ========================================
// File: src/app/api/admin/team/[teamid]/squad-login-status/route.ts
// ========================================

import { NextResponse } from "next/server";

import { getSquadLoginStatuses } from "@/lib/admin/squadLoginStatus";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamid: string }> },
) {
  await requireAdmin();

  const { teamid } = await params;

  return NextResponse.json({
    items: await getSquadLoginStatuses(teamid),
  });
}
