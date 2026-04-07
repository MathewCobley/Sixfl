// ========================================
// File: src/app/captain/team/[teamid]/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Captain Overview | SIXFL",
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

function getFixtureLabel(input: {
  homeTeamName: string;
  awayTeamName: string;
  isHome: boolean;
}) {
  return input.isHome ? `vs ${input.awayTeamName}` : `at ${input.homeTeamName}`;
}

function getResultLabel(goalsFor: number, goalsAgainst: number) {
  if (goalsFor > goalsAgainst) return "Win";
  if (goalsFor < goalsAgainst) return "Loss";
  return "Draw";
}

export default async function CaptainOverviewPage({
  params,
}: {
  params: Promise<{ teamid: string }>;
}) {
  const { teamid } = await params;
  await requireCaptain(teamid);

  const [team, upcomingFixtures, recentResults, activeCaptainCount] =
    await Promise.all([
      prisma.team.findUnique({
        where: { id: teamid },
        select: {
          id: true,
          name: true,
          leagueId: true,
          league: {
            select: {
              id: true,
              name: true,
              season: true,
              venueName: true,
              dayOfWeek: true,
            },
          },
        },
      }),
      prisma.fixture.findMany({
        where: {
          OR: [{ homeTeamId: teamid }, { awayTeamId: teamid }],
          kickoffAt: { gte: new Date() },
          result: null,
          status: "SCHEDULED",
        },
        orderBy: [{ kickoffAt: "asc" }],
        take: 5,
        include: {
          homeTeam: { select: { id: true, name: true } },
          awayTeam: { select: { id: true, name: true } },
          venue: { select: { name: true } },
        },
      }),
      prisma.fixture.findMany({
        where: {
          OR: [{ homeTeamId: teamid }, { awayTeamId: teamid }],
          result: { isNot: null },
        },
        orderBy: [{ kickoffAt: "desc" }],
        take: 5,
        include: {
          homeTeam: { select: { id: true, name: true } },
          awayTeam: { select: { id: true, name: true } },
          result: {
            select: {
              homeScore: true,
              awayScore: true,
              isDisputed: true,
            },
          },
        },
      }),
      prisma.teamMember.count({
        where: {
          teamId: teamid,
          role: "CAPTAIN",
        },
      }),
    ]);

  if (!team) {
    notFound();
  }

  const nextFixture = upcomingFixtures[0] ?? null;

  return (
    <div className="space-y-8">
      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
            Next fixture
          </p>

          <p className="mt-3 text-lg font-semibold text-white">
            {nextFixture
              ? getFixtureLabel({
                  homeTeamName: nextFixture.homeTeam.name,
                  awayTeamName: nextFixture.awayTeam.name,
                  isHome: nextFixture.homeTeamId === teamid,
                })
              : "No upcoming fixture"}
          </p>

          <p className="mt-2 text-sm text-white/60">
            {nextFixture
              ? `${formatDateTime(nextFixture.kickoffAt)} · ${
                  nextFixture.venue?.name ??
                  team.league?.venueName ??
                  "Venue TBC"
                }`
              : "As soon as fixtures are scheduled they will show here."}
          </p>
        </div>

        <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
            Captain records
          </p>

          <p className="mt-3 text-3xl font-semibold text-white">
            {activeCaptainCount}
          </p>

          <p className="mt-2 text-sm text-white/60">
            Active captain membership
            {activeCaptainCount === 1 ? "" : "s"} linked to this team.
          </p>
        </div>

        <div className="rounded-[1.75rem] border border-emerald-400/20 bg-emerald-500/10 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/70">
            Step 2 status
          </p>

          <p className="mt-3 text-lg font-semibold text-white">
            Overview live
          </p>

          <p className="mt-2 text-sm text-emerald-100/75">
            Safe captain dashboard using existing fixtures, results, and team
            membership only.
          </p>
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04]">
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                Upcoming fixtures
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">
                Match schedule
              </h2>
            </div>

            <Link
              href={`/captain/team/${teamid}/fixtures`}
              className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15"
            >
              Open fixtures
            </Link>
          </div>

          <div className="divide-y divide-white/10">
            {upcomingFixtures.length === 0 ? (
              <div className="px-6 py-10 text-sm text-white/55">
                No upcoming fixtures yet.
              </div>
            ) : (
              upcomingFixtures.map((fixture) => {
                const isHome = fixture.homeTeamId === teamid;
                const opponent = isHome
                  ? fixture.awayTeam.name
                  : fixture.homeTeam.name;

                return (
                  <div
                    key={fixture.id}
                    className="flex flex-col gap-3 px-6 py-5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <div className="text-base font-semibold text-white">
                        {isHome ? `vs ${opponent}` : `at ${opponent}`}
                      </div>
                      <div className="mt-1 text-sm text-white/60">
                        {formatDateTime(fixture.kickoffAt)}
                      </div>
                    </div>

                    <div className="text-sm text-white/65 sm:text-right">
                      <div>
                        {fixture.venue?.name ??
                          team.league?.venueName ??
                          "Venue TBC"}
                      </div>
                      <div className="mt-1 text-white/45">
                        {team.league?.dayOfWeek ?? "Night TBC"}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04]">
          <div className="border-b border-white/10 px-6 py-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
              Recent results
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">
              Latest scores
            </h2>
          </div>

          <div className="divide-y divide-white/10">
            {recentResults.length === 0 ? (
              <div className="px-6 py-10 text-sm text-white/55">
                No results recorded yet.
              </div>
            ) : (
              recentResults.map((fixture) => {
                const isHome = fixture.homeTeamId === teamid;
                const opponent = isHome
                  ? fixture.awayTeam.name
                  : fixture.homeTeam.name;
                const goalsFor = isHome
                  ? fixture.result!.homeScore
                  : fixture.result!.awayScore;
                const goalsAgainst = isHome
                  ? fixture.result!.awayScore
                  : fixture.result!.homeScore;
                const resultLabel = getResultLabel(goalsFor, goalsAgainst);

                return (
                  <div key={fixture.id} className="px-6 py-5">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-base font-semibold text-white">
                          {opponent}
                        </div>
                        <div className="mt-1 text-sm text-white/60">
                          {formatDateTime(fixture.kickoffAt)}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-lg font-semibold text-white">
                          {goalsFor} - {goalsAgainst}
                        </div>
                        <div className="mt-1 text-xs uppercase tracking-[0.14em] text-white/45">
                          {resultLabel}
                          {fixture.result?.isDisputed ? " · Disputed" : ""}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>
    </div>
  );
}