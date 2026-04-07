// ========================================
// File: src/app/captain/team/[teamid]/fixtures/page.tsx
// ========================================

import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Captain Fixtures | SIXFL",
};

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function getResultLabel(goalsFor: number, goalsAgainst: number) {
  if (goalsFor > goalsAgainst) return "Win";
  if (goalsFor < goalsAgainst) return "Loss";
  return "Draw";
}

export default async function CaptainFixturesPage({
  params,
}: {
  params: Promise<{ teamid: string }>;
}) {
  const { teamid } = await params;
  await requireCaptain(teamid);

  const [team, fixtures] = await Promise.all([
    prisma.team.findUnique({
      where: { id: teamid },
      select: {
        id: true,
        name: true,
        league: {
          select: {
            id: true,
            name: true,
            season: true,
            venueName: true,
          },
        },
      },
    }),
    prisma.fixture.findMany({
      where: {
        OR: [{ homeTeamId: teamid }, { awayTeamId: teamid }],
      },
      orderBy: [{ kickoffAt: "asc" }],
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
            name: true,
          },
        },
        result: {
          select: {
            homeScore: true,
            awayScore: true,
            isDisputed: true,
          },
        },
      },
    }),
  ]);

  if (!team) {
    notFound();
  }

  const now = new Date();

  const upcomingFixtures = fixtures.filter((fixture) => fixture.kickoffAt >= now);
  const pastFixtures = fixtures.filter((fixture) => fixture.kickoffAt < now);

  return (
    <div className="space-y-8">
      <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
          Captain Fixtures
        </p>

        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
          {team.name} fixtures
        </h1>

        <p className="mt-3 text-sm text-white/60">
          {team.league?.name ?? "No league assigned"}
          {team.league?.season ? ` · ${team.league.season}` : ""}
        </p>
      </section>

      <section className="rounded-[2rem] border border-white/10 bg-white/[0.04]">
        <div className="border-b border-white/10 px-6 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
            Upcoming
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">
            Scheduled matches
          </h2>
        </div>

        <div className="divide-y divide-white/10">
          {upcomingFixtures.length === 0 ? (
            <div className="px-6 py-10 text-sm text-white/55">
              No upcoming fixtures scheduled yet.
            </div>
          ) : (
            upcomingFixtures.map((fixture) => {
              const isHome = fixture.homeTeamId === teamid;
              const opponent = isHome ? fixture.awayTeam.name : fixture.homeTeam.name;

              return (
                <div
                  key={fixture.id}
                  className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div>
                    <div className="text-base font-semibold text-white">
                      {isHome ? `vs ${opponent}` : `at ${opponent}`}
                    </div>

                    <div className="mt-1 text-sm text-white/60">
                      {formatDateTime(fixture.kickoffAt)}
                    </div>
                  </div>

                  <div className="text-sm text-white/65 lg:text-right">
                    <div>
                      {fixture.venue?.name ?? team.league?.venueName ?? "Venue TBC"}
                    </div>
                    <div className="mt-1 text-white/45">
                      {isHome ? "Home" : "Away"}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      <section className="rounded-[2rem] border border-white/10 bg-white/[0.04]">
        <div className="border-b border-white/10 px-6 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
            Results
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">
            Played matches
          </h2>
        </div>

        <div className="divide-y divide-white/10">
          {pastFixtures.length === 0 ? (
            <div className="px-6 py-10 text-sm text-white/55">
              No played fixtures yet.
            </div>
          ) : (
            pastFixtures
              .slice()
              .reverse()
              .map((fixture) => {
                const isHome = fixture.homeTeamId === teamid;
                const opponent = isHome ? fixture.awayTeam.name : fixture.homeTeam.name;

                const goalsFor = fixture.result
                  ? isHome
                    ? fixture.result.homeScore
                    : fixture.result.awayScore
                  : null;

                const goalsAgainst = fixture.result
                  ? isHome
                    ? fixture.result.awayScore
                    : fixture.result.homeScore
                  : null;

                return (
                  <div
                    key={fixture.id}
                    className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div>
                      <div className="text-base font-semibold text-white">
                        {isHome ? `vs ${opponent}` : `at ${opponent}`}
                      </div>

                      <div className="mt-1 text-sm text-white/60">
                        {formatDateTime(fixture.kickoffAt)}
                      </div>
                    </div>

                    <div className="text-sm lg:text-right">
                      {fixture.result ? (
                        <>
                          <div className="text-lg font-semibold text-white">
                            {goalsFor} - {goalsAgainst}
                          </div>
                          <div className="mt-1 text-xs uppercase tracking-[0.14em] text-white/45">
                            {getResultLabel(goalsFor ?? 0, goalsAgainst ?? 0)}
                            {fixture.result.isDisputed ? " · Disputed" : ""}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-sm font-medium text-white/75">
                            No score recorded
                          </div>
                          <div className="mt-1 text-xs uppercase tracking-[0.14em] text-white/35">
                            Awaiting result
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
          )}
        </div>
      </section>
    </div>
  );
}