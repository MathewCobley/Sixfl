// ========================================
// File: src/app/admin/fixtures/page.tsx
// If you already moved route groups, this is:
// src/app/(admin)/admin/fixtures/page.tsx
// ========================================

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import FixturesAdminScreen from "@/components/admin/fixtures/FixturesAdminScreen";

function formatKickoffLabel(date: Date | null) {
  if (!date) return null;

  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default async function AdminFixturesPage() {
  await requireAdmin();

  const [leagues, teams, venues, referees, fixtures] = await Promise.all([
    prisma.league.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        season: true,
        slug: true,
      },
    }),

    prisma.team.findMany({
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        leagueId: true,
        league: {
          select: {
            id: true,
            name: true,
            season: true,
          },
        },
      },
    }),

    prisma.venue.findMany({
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
      },
    }),

    prisma.user.findMany({
      where: {
        role: "REFEREE",
      },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
      },
    }),

    prisma.fixture.findMany({
      orderBy: [{ kickoffAt: "asc" }, { round: "asc" }, { position: "asc" }],
      select: {
        id: true,
        leagueId: true,
        homeTeamId: true,
        awayTeamId: true,
        venueId: true,
        refereeId: true,
        round: true,
        position: true,
        pitch: true,
        status: true,
        kickoffAt: true,
        venue: {
          select: {
            id: true,
            name: true,
          },
        },
        referee: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        homeTeam: {
          select: {
            name: true,
          },
        },
        awayTeam: {
          select: {
            name: true,
          },
        },
        result: {
          select: {
            homeScore: true,
            awayScore: true,
          },
        },
      },
    }),
  ]);

  const screenData = {
    leagues,
    teams,
    venues,
    referees,
    fixtures: fixtures.map((fixture) => ({
      id: fixture.id,
      leagueId: fixture.leagueId,
      homeTeamId: fixture.homeTeamId,
      awayTeamId: fixture.awayTeamId,
      venueId: fixture.venueId,
      refereeId: fixture.refereeId,
      homeTeamName: fixture.homeTeam?.name ?? "Unknown home team",
      awayTeamName: fixture.awayTeam?.name ?? "Unknown away team",
      venueName: fixture.venue?.name ?? null,
      refereeName: fixture.referee?.name ?? fixture.referee?.email ?? null,
      kickoffLabel: formatKickoffLabel(fixture.kickoffAt),
      kickoffAtIso: fixture.kickoffAt ? fixture.kickoffAt.toISOString() : null,
      round: fixture.round,
      position: fixture.position,
      pitch: fixture.pitch,
      status: fixture.status,
      homeScore: fixture.result?.homeScore ?? null,
      awayScore: fixture.result?.awayScore ?? null,
    })),
  };

  return (
    <div className="w-full px-4 pb-10 pt-6 sm:px-6 lg:px-8">
      <FixturesAdminScreen {...screenData} />
    </div>
  );
}