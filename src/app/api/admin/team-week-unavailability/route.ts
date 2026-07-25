// ========================================
// File: src/app/api/admin/team-week-unavailability/route.ts
// ========================================

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/requireAdmin";
import {
  addWeeks,
  getCurrentWeekStart,
} from "@/lib/team-week-unavailability";
import { getTeamWeekUnavailabilityOverview } from "@/lib/team-week-unavailability-overview";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  await requireAdmin();

  const from = getCurrentWeekStart();
  const to = addWeeks(from, 20);
  const notices = await getTeamWeekUnavailabilityOverview({ from, to });

  return NextResponse.json(
    {
      notices: notices.map((notice) => ({
        id: notice.id,
        teamId: notice.teamId,
        teamName: notice.teamName,
        leagueName: notice.leagueName,
        leagueSeason: notice.leagueSeason,
        divisionName: notice.divisionName,
        weekStart: notice.weekStart.toISOString(),
        note: notice.note,
        updatedAt: notice.updatedAt.toISOString(),
        status: notice.status,
        fixtures: notice.fixtures.map((fixture) => ({
          id: fixture.id,
          kickoffAt: fixture.kickoffAt.toISOString(),
          publishedAt: fixture.publishedAt?.toISOString() ?? null,
          homeTeamName: fixture.homeTeamName,
          awayTeamName: fixture.awayTeamName,
        })),
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
