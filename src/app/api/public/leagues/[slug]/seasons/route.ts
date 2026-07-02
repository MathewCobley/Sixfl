// ========================================
// File: src/app/api/public/leagues/[slug]/seasons/route.ts
// ========================================

import { NextResponse } from "next/server";

import { getPublicCompetitionSeasonsByLeagueSlug } from "@/lib/league-competitions";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const data = await getPublicCompetitionSeasonsByLeagueSlug(slug);

  if (!data) {
    return NextResponse.json({ seasons: [] });
  }

  return NextResponse.json(data);
}
