// ========================================
// File: src/app/api/admin/competitions/route.ts
// ========================================

import { NextResponse } from "next/server";

import { getCompetitionOptions } from "@/lib/league-season-teams";
import { requireAdmin } from "@/lib/requireAdmin";

export async function GET() {
  await requireAdmin();

  const competitions = await getCompetitionOptions();

  return NextResponse.json({ competitions });
}
