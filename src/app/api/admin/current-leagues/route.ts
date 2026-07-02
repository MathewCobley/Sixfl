// ========================================
// File: src/app/api/admin/current-leagues/route.ts
// ========================================

import { NextResponse } from "next/server";

import { getCurrentLeagueOptions } from "@/lib/current-leagues";
import { requireAdmin } from "@/lib/requireAdmin";

export async function GET(request: Request) {
  await requireAdmin();

  const url = new URL(request.url);
  const includeLeagueId = url.searchParams.get("include");
  const leagues = await getCurrentLeagueOptions(includeLeagueId);

  return NextResponse.json({ leagues });
}
