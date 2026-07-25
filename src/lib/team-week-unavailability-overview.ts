// ========================================
// File: src/lib/team-week-unavailability-overview.ts
// ========================================

import { prisma } from "@/lib/prisma";
import {
  getWeekStartForDate,
  listUpcomingTeamWeekUnavailability,
  type TeamWeekUnavailabilityAdminRow,
} from "@/lib/team-week-unavailability";

export type TeamWeekUnavailabilityFixture = {
  id: string;
  kickoffAt: Date;
  publishedAt: Date | null;
  homeTeamName: string;
  awayTeamName: string;
};

export type TeamWeekUnavailabilityOverviewRow = TeamWeekUnavailabilityAdminRow & {
  status: "CLEAR" | "DRAFT_CONFLICT" | "PUBLISHED_CONFLICT";
  fixtures: TeamWeekUnavailabilityFixture[];
};

function weekKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

export async function getTeamWeekUnavailabilityOverview(input: {
  from: Date;
  to: Date;
  leagueIds?: string[];
}) {
  const notices = await listUpcomingTeamWeekUnavailability(input);
  const teamIds = Array.from(new Set(notices.map((notice) => notice.teamId)));
  if (teamIds.length === 0) return [] as TeamWeekUnavailabilityOverviewRow[];

  const fixtures = await prisma.fixture.findMany({
    where: {
      kickoffAt: { gte: input.from, lt: input.to },
      status: "SCHEDULED",
      OR: [
        { homeTeamId: { in: teamIds } },
        { awayTeamId: { in: teamIds } },
      ],
    },
    select: {
      id: true,
      kickoffAt: true,
      publishedAt: true,
      homeTeamId: true,
      awayTeamId: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
    orderBy: { kickoffAt: "asc" },
  });

  return notices.map((notice) => {
    const noticeWeekKey = weekKey(notice.weekStart);
    const matchingFixtures = fixtures
      .filter(
        (fixture) =>
          (fixture.homeTeamId === notice.teamId ||
            fixture.awayTeamId === notice.teamId) &&
          weekKey(getWeekStartForDate(fixture.kickoffAt)) === noticeWeekKey,
      )
      .map((fixture) => ({
        id: fixture.id,
        kickoffAt: fixture.kickoffAt,
        publishedAt: fixture.publishedAt,
        homeTeamName: fixture.homeTeam.name,
        awayTeamName: fixture.awayTeam.name,
      }));

    const status = matchingFixtures.some((fixture) => fixture.publishedAt)
      ? "PUBLISHED_CONFLICT"
      : matchingFixtures.length > 0
        ? "DRAFT_CONFLICT"
        : "CLEAR";

    return {
      ...notice,
      status,
      fixtures: matchingFixtures,
    } satisfies TeamWeekUnavailabilityOverviewRow;
  });
}
