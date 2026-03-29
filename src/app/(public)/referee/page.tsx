// src/app/referee/page.tsx

import Link from "next/link";
import { requireReferee } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

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

export default async function RefereePage() {
  const { user } = await requireReferee();

  const fixtures = await prisma.fixture.findMany({
    where: {
      refereeId: user.id,
    },
    orderBy: [{ kickoffAt: "asc" }],
    include: {
      league: {
        select: {
          id: true,
          name: true,
          season: true,
        },
      },
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
      result: {
        select: {
          id: true,
          homeScore: true,
          awayScore: true,
          enteredAt: true,
          isDisputed: true,
        },
      },
    },
  });

  const groups = new Map<string, typeof fixtures>();

  for (const fixture of fixtures) {
    const key = fixture.kickoffAt.toISOString().slice(0, 10);
    const arr = groups.get(key) ?? [];
    arr.push(fixture);
    groups.set(key, arr);
  }

  const dates = Array.from(groups.keys()).sort();

  return (
    <div className="space-y-6 p-6">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <h1 className="text-2xl font-semibold text-white">Referee Dashboard</h1>
        <p className="mt-2 text-sm text-white/70">
          Fixtures assigned to you appear here. Enter results after each match.
        </p>
      </div>

      {fixtures.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/70">
          No fixtures are currently assigned to you.
        </div>
      ) : (
        <div className="space-y-4">
          {dates.map((dateKey) => {
            const dayFixtures = groups.get(dateKey)!;
            const dayLabel = formatDate(new Date(`${dateKey}T00:00:00`));

            return (
              <div
                key={dateKey}
                className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]"
              >
                <div className="border-b border-white/10 bg-black/20 px-4 py-3 text-sm font-medium text-white">
                  {dayLabel}
                </div>

                <ul className="divide-y divide-white/10">
                  {dayFixtures.map((fixture) => (
                    <li key={fixture.id} className="p-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-white/60">
                            <span>{formatTime(fixture.kickoffAt)}</span>

                            {fixture.league ? (
                              <>
                                <span>•</span>
                                <span>
                                  {fixture.league.name}
                                  {fixture.league.season
                                    ? ` — ${fixture.league.season}`
                                    : ""}
                                </span>
                              </>
                            ) : null}

                            {fixture.venue?.name ? (
                              <>
                                <span>•</span>
                                <span>{fixture.venue.name}</span>
                              </>
                            ) : null}

                            {fixture.round ? (
                              <>
                                <span>•</span>
                                <span>Round {fixture.round}</span>
                              </>
                            ) : null}
                          </div>

                          <div className="text-base text-white">
                            <span className="font-semibold">
                              {fixture.homeTeam.name}
                            </span>{" "}
                            <span className="text-white/50">vs</span>{" "}
                            <span className="font-semibold">
                              {fixture.awayTeam.name}
                            </span>
                          </div>

                          <div className="text-sm text-white/70">
                            {fixture.result ? (
                              <>
                                Result entered: {fixture.result.homeScore}-
                                {fixture.result.awayScore}
                                {fixture.result.isDisputed
                                  ? " • Disputed"
                                  : ""}
                              </>
                            ) : (
                              <>No result entered yet</>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Link
                            href={`/referee/fixture/${fixture.id}`}
                            className="rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-4 py-2 text-sm text-emerald-300 hover:bg-emerald-500/20"
                          >
                            {fixture.result ? "View / Edit Result" : "Enter Result"}
                          </Link>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}