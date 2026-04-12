// ========================================
// File: src/app/captain/team/[teamid]/fixtures/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import { formatDateTimeInLondon } from "@/lib/datetime/london";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Captain Fixtures | SIXFL",
};

function formatDateTime(value: Date) {
  return formatDateTimeInLondon(value, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getFixtureSummary(input: {
  homeTeamName: string;
  awayTeamName: string;
}) {
  return `${input.homeTeamName} vs ${input.awayTeamName}`;
}

function getCaptainFixtureLabel(input: {
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

function getCountdownLabel(kickoffAt: Date) {
  const now = new Date();
  const diffMs = kickoffAt.getTime() - now.getTime();

  if (diffMs <= 0) return "Kick-off time reached";

  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays >= 2) return `${diffDays} days to go`;
  if (diffHours >= 24) return "Tomorrow";
  if (diffHours >= 1) {
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} to go`;
  }

  return "Today";
}

function getConfirmationUrgency(kickoffAt: Date) {
  const now = new Date();
  const diffMs = kickoffAt.getTime() - now.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffHours <= 24) {
    return {
      label: "Urgent confirmation needed",
      className:
        "border-amber-400/20 bg-amber-500/10 text-amber-100/75",
    };
  }

  if (diffHours <= 72) {
    return {
      label: "Please confirm this fixture",
      className:
        "border-emerald-400/20 bg-emerald-500/10 text-emerald-100/75",
    };
  }

  return {
    label: "Confirmation window open",
    className: "border-white/10 bg-white/5 text-white/70",
  };
}

export default async function CaptainFixturesPage({
  params,
}: {
  params: Promise<{ teamid: string }>;
}) {
  const { teamid } = await params;
  await requireCaptain(teamid);

  const [team, upcomingFixtures, recentResults] = await Promise.all([
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
      },
      orderBy: [{ kickoffAt: "asc" }],
      take: 12,
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
      take: 6,
      include: {
        homeTeam: { select: { id: true, name: true } },
        awayTeam: { select: { id: true, name: true } },
        result: {
          include: {
            teamMetadata: true,
          },
        },
      },
    }),
  ]);

  if (!team) {
    notFound();
  }

  const nextFixture = upcomingFixtures[0] ?? null;

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[2rem] border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
        <div className="grid gap-8 px-6 py-6 lg:grid-cols-[1.15fr_0.85fr] lg:px-8 lg:py-8">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
              Fixture confirmation
            </p>

            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              {nextFixture
                ? getFixtureSummary({
                    homeTeamName: nextFixture.homeTeam.name,
                    awayTeamName: nextFixture.awayTeam.name,
                  })
                : "No upcoming fixture"}
            </h2>

            <p className="mt-3 max-w-2xl text-sm text-white/70 sm:text-base">
              {nextFixture
                ? `${formatDateTime(nextFixture.kickoffAt)} · ${
                    nextFixture.venue?.name ??
                    team.league?.venueName ??
                    "Venue TBC"
                  }`
                : "Your next match will appear here as soon as it is scheduled."}
            </p>

            {nextFixture ? (
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-100">
                  Awaiting confirmation
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
                  {getCountdownLabel(nextFixture.kickoffAt)}
                </span>
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                disabled
                className="inline-flex cursor-not-allowed items-center rounded-full border border-emerald-400/20 bg-emerald-500/10 px-5 py-3 text-sm font-medium text-emerald-100/70"
              >
                Confirm fixture
              </button>

              <button
                type="button"
                disabled
                className="inline-flex cursor-not-allowed items-center rounded-full border border-white/10 bg-black/20 px-5 py-3 text-sm font-medium text-white/60"
              >
                Raise an issue
              </button>
            </div>

            <p className="mt-4 text-sm text-white/50">
              These actions are now positioned in the captain flow and ready to
              be wired into the fixture confirmation backend.
            </p>
          </div>

          <div className="space-y-3">
            <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                Before matchday
              </p>

              <div className="mt-4 space-y-3 text-sm text-white/70">
                <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                  Confirm your team can fulfil the fixture
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                  Chase any missing player replies
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                  Raise issues early if availability or attendance is a problem
                </div>
              </div>
            </div>

            {nextFixture ? (
              <div
                className={`rounded-[1.5rem] border p-5 ${getConfirmationUrgency(nextFixture.kickoffAt).className}`}
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">
                  Current focus
                </p>
                <p className="mt-3 text-lg font-semibold text-white">
                  {getConfirmationUrgency(nextFixture.kickoffAt).label}
                </p>
                <p className="mt-2 text-sm">
                  Keep this confirmed early so the fixture is settled well before
                  kick-off.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04]">
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                Upcoming fixtures
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">
                Match list
              </h2>
            </div>

            <Link
              href={`/captain/team/${teamid}`}
              className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm font-medium text-white/80 transition hover:border-emerald-400/30 hover:bg-emerald-500/10 hover:text-white"
            >
              Back to overview
            </Link>
          </div>

          <div className="divide-y divide-white/10">
            {upcomingFixtures.length === 0 ? (
              <div className="px-6 py-10 text-sm text-white/55">
                No upcoming fixtures yet.
              </div>
            ) : (
              upcomingFixtures.map((fixture, index) => {
                const isHome = fixture.homeTeamId === teamid;

                return (
                  <div
                    key={fixture.id}
                    className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-base font-semibold text-white">
                          {getCaptainFixtureLabel({
                            homeTeamName: fixture.homeTeam.name,
                            awayTeamName: fixture.awayTeam.name,
                            isHome,
                          })}
                        </div>

                        {index === 0 ? (
                          <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-100">
                            Next up
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-1 text-sm text-white/60">
                        {formatDateTime(fixture.kickoffAt)}
                      </div>

                      <div className="mt-2 text-sm text-white/50">
                        {fixture.venue?.name ??
                          team.league?.venueName ??
                          "Venue TBC"}
                      </div>
                    </div>

                    <div className="flex flex-col items-start gap-2 lg:items-end">
                      <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-100">
                        Awaiting confirmation
                      </span>
                      <span className="text-xs uppercase tracking-[0.14em] text-white/45">
                        {getCountdownLabel(fixture.kickoffAt)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="space-y-6">
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
                  const teamMeta = fixture.result!.teamMetadata.find(
                    (item) => item.teamId === teamid,
                  );

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
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        {(teamMeta?.goalsRecorded ?? 0) < goalsFor ? (
                          <span className="rounded-full bg-amber-500/15 px-3 py-1 text-amber-200">
                            Needs scorers
                          </span>
                        ) : null}
                        {!teamMeta?.playerOfMatchName ? (
                          <span className="rounded-full bg-amber-500/15 px-3 py-1 text-amber-200">
                            Needs POM
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
              What is coming next
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">
              Captain confirmation flow
            </h2>

            <div className="mt-4 space-y-3 text-sm text-white/65">
              <p>
                The next step is to wire this page into persistent fixture
                confirmation states:
              </p>
              <ul className="space-y-2 pl-5 text-white/60">
                <li>Awaiting confirmation</li>
                <li>Confirmed</li>
                <li>Issue raised</li>
                <li>Overdue</li>
              </ul>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}