import { NextResponse } from "next/server";

import { getRefereeNightSummaries } from "@/lib/referee-nights";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  await requireAdmin();

  const nights = await getRefereeNightSummaries();
  const emptyDrafts = nights
    .filter((night) => night.status === "DRAFT" && night.fixtureCount === 0)
    .map((night) => ({
      id: night.id,
      refereeName: night.refereeName,
      refereeEmail: night.refereeEmail,
      leagueName: night.leagueName,
      leagueSeason: night.leagueSeason,
      nightDate: night.nightDate,
      feePence: night.feePence,
      dueToRefereePence: night.dueToRefereePence,
    }));

  return NextResponse.json({ nights: emptyDrafts });
}
