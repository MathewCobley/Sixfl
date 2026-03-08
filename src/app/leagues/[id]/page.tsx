// src/app/leagues/[id]/page.tsx

import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getLeagueTable } from "@/lib/leagueTableTemp";

function formatDate(d: Date) {
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatTime(d: Date) {
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function LeaguePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const league = await prisma.league.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      season: true,
      isActive: true,
    },
  });

  if (!league) {
    notFound();
  }

  const [table, upcomingFixtures, recentResults] = await Promise.all([
    getLeagueTable(id),

    prisma.fixture.findMany({
      where: {
        leagueId: id,
        status: {
          in: ["SCHEDULED", "POSTPONED"],
        },
      },
      orderBy: [{ kickoffAt: "asc" }],
      take: 10,
      include: {
        homeTeam: {
          select: {
            id: true,
            name: true,
          },
        },
        awayTeam: {
          select: {
            id: true,
            name: true,
          },
        },
        venue: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    }),

    prisma.fixture.findMany({
      where: {
        leagueId: id,
        status: "COMPLETED",
        result: {
          isNot: null,
        },
      },
      orderBy: [{ kickoffAt: "desc" }],
      take: 10,
      include: {
        homeTeam: {
          select: {
            id: true,
            name: true,
          },
        },
        awayTeam: {
          select: {
            id: true,
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

  return (
    <div className="space-y-8 p-6">
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            {league.name}
          </h1>

          {league.season ? (
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
              {league.season}
            </span>
          ) : null}

          <span
            className={`rounded-full px-3 py-1 text-xs ${
              league.isActive
                ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                : "border border-white/10 bg-white/5 text-white/60"
            }`}
          >
            {league.isActive ? "Active" : "Inactive"}
          </span>
        </div>

        <p className="mt-3 text-sm text-white/70">
          Live standings, upcoming fixtures, and latest results for this SIXFL
          league.
        </p>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-white">League Table</h2>
          <div className="text-xs text-white/50">
            Sorted by points, goal difference, goals for
          </div>
        </div>

        {table.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/70">
            No completed results yet, so the table is still empty.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-white/60">
                  <th className="px-3 py-3">#</th>
                  <th className="px-3 py-3">Team</th>
                  <th className="px-3 py-3">P</th>
                  <th className="px-3 py-3">W</th>
                  <th className="px-3 py-3">D</th>
                  <th className="px-3 py-3">L</th>
                  <th className="px-3 py-3">GF</th>
                  <th className="px-3 py-3">GA</th>
                  <th className="px-3 py-3">GD</th>
                  <th className="px-3 py-3">PTS</th>
                </tr>
              </thead>
              <tbody>
                {table.map((row, index) => (
                  <tr
                    key={row.teamId}
                    className="border-b border-white/5 text-white/90"
                  >
                    <td className="px-3 py-3 text-white/60">{index + 1}</td>
                    <td className="px-3 py-3 font-medium">{row.teamName}</td>
                    <td className="px-3 py-3">{row.played}</td>
                    <td className="px-3 py-3">{row.won}</td>
                    <td className="px-3 py-3">{row.drawn}</td>
                    <td className="px-3 py-3">{row.lost}</td>
                    <td className="px-3 py-3">{row.goalsFor}</td>
                    <td className="px-3 py-3">{row.goalsAgainst}</td>
                    <td className="px-3 py-3">
                      {row.goalDifference > 0 ? "+" : ""}
                      {row.goalDifference}
                    </td>
                    <td className="px-3 py-3 font-semibold text-emerald-300">
                      {row.points}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <h2 className="mb-4 text-xl font-semibold text-white">
            Upcoming Fixtures
          </h2>

          {upcomingFixtures.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/70">
              No upcoming fixtures scheduled.
            </div>
          ) : (
            <div className="space-y-3">
              {upcomingFixtures.map((fixture) => (
                <div
                  key={fixture.id}
                  className="rounded-xl border border-white/10 bg-black/20 p-4"
                >
                  <div className="text-xs text-white/60">
                    {formatDate(fixture.kickoffAt)} •{" "}
                    {formatTime(fixture.kickoffAt)}
                    {fixture.round ? ` • Round ${fixture.round}` : ""}
                    {fixture.venue?.name ? ` • ${fixture.venue.name}` : ""}
                  </div>

                  <div className="mt-2 text-sm text-white">
                    <span className="font-medium">{fixture.homeTeam.name}</span>{" "}
                    <span className="text-white/50">vs</span>{" "}
                    <span className="font-medium">{fixture.awayTeam.name}</span>
                  </div>

                  <div className="mt-2 text-xs text-white/50">
                    Status: {fixture.status}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <h2 className="mb-4 text-xl font-semibold text-white">
            Latest Results
          </h2>

          {recentResults.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/70">
              No results recorded yet.
            </div>
          ) : (
            <div className="space-y-3">
              {recentResults.map((fixture) => (
                <div
                  key={fixture.id}
                  className="rounded-xl border border-white/10 bg-black/20 p-4"
                >
                  <div className="text-xs text-white/60">
                    {formatDate(fixture.kickoffAt)} •{" "}
                    {formatTime(fixture.kickoffAt)}
                    {fixture.round ? ` • Round ${fixture.round}` : ""}
                  </div>

                  <div className="mt-2 text-sm text-white">
                    <span className="font-medium">{fixture.homeTeam.name}</span>{" "}
                    <span className="mx-2 inline-flex rounded-lg border border-white/10 bg-white/5 px-2 py-1 font-semibold">
                      {fixture.result?.homeScore} - {fixture.result?.awayScore}
                    </span>
                    <span className="font-medium">{fixture.awayTeam.name}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}