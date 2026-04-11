// ========================================
// File: src/app/(public)/teams/[id]/page.tsx
// ========================================

import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// ========================================
// Types
// ========================================

type PageProps = {
  params: Promise<{ id: string }>;
};

type TableRow = {
  team: {
    id: string;
    name: string;
    logoUrl: string | null;
  };
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
};

type Outcome = "WIN" | "DRAW" | "LOSS";

// ========================================
// Helpers
// ========================================

function normaliseLogoUrl(value?: string | null) {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("/")
  ) {
    return trimmed;
  }

  return `/${trimmed}`;
}

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatPreferredNight(value?: string | null) {
  if (!value) return "TBC";
  if (value === "ANY") return "Any night";
  return value.charAt(0) + value.slice(1).toLowerCase();
}

function formatGoalDifference(value: number) {
  return value > 0 ? `+${value}` : `${value}`;
}

function formatFixtureDateTime(value: Date) {
  return formatDateTimeInLondon(value, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatFixtureDate(value: Date) {
  return formatDateTimeInLondon(value, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function getOutcome(goalsFor: number, goalsAgainst: number): Outcome {
  if (goalsFor > goalsAgainst) return "WIN";
  if (goalsFor < goalsAgainst) return "LOSS";
  return "DRAW";
}

function getOutcomeLabel(outcome: Outcome) {
  switch (outcome) {
    case "WIN":
      return "Win";
    case "DRAW":
      return "Draw";
    case "LOSS":
      return "Loss";
  }
}

function getOutcomeClasses(outcome: Outcome) {
  switch (outcome) {
    case "WIN":
      return "border-emerald-400/30 bg-emerald-500/10 text-emerald-200";
    case "DRAW":
      return "border-amber-400/30 bg-amber-500/10 text-amber-100";
    case "LOSS":
      return "border-red-400/30 bg-red-500/10 text-red-100";
  }
}

function isTeamFixture(
  fixture: {
    homeTeam: { id: string };
    awayTeam: { id: string };
  },
  teamId: string,
) {
  return fixture.homeTeam.id === teamId || fixture.awayTeam.id === teamId;
}

function getOpponent(
  fixture: {
    homeTeam: { id: string; name: string; logoUrl: string | null };
    awayTeam: { id: string; name: string; logoUrl: string | null };
  },
  teamId: string,
) {
  return fixture.homeTeam.id === teamId ? fixture.awayTeam : fixture.homeTeam;
}

function getFixtureLabel(input: {
  teamName: string;
  homeTeamName: string;
  awayTeamName: string;
}) {
  return `${input.homeTeamName} vs ${input.awayTeamName}`;
}

function buildLeagueTable(
  teams: Array<{
    id: string;
    name: string;
    logoUrl: string | null;
  }>,
  fixtures: Array<{
    homeTeam: { id: string; name: string; logoUrl: string | null };
    awayTeam: { id: string; name: string; logoUrl: string | null };
    result: { homeScore: number; awayScore: number } | null;
    status: string;
  }>,
): TableRow[] {
  const rows = new Map<string, TableRow>();

  for (const team of teams) {
    rows.set(team.id, {
      team,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
    });
  }

  for (const fixture of fixtures) {
    if (fixture.status !== "COMPLETED" || !fixture.result) continue;

    const home = rows.get(fixture.homeTeam.id);
    const away = rows.get(fixture.awayTeam.id);

    if (!home || !away) continue;

    const { homeScore, awayScore } = fixture.result;

    home.played += 1;
    away.played += 1;

    home.goalsFor += homeScore;
    home.goalsAgainst += awayScore;

    away.goalsFor += awayScore;
    away.goalsAgainst += homeScore;

    if (homeScore > awayScore) {
      home.wins += 1;
      away.losses += 1;
      home.points += 3;
    } else if (awayScore > homeScore) {
      away.wins += 1;
      home.losses += 1;
      away.points += 3;
    } else {
      home.draws += 1;
      away.draws += 1;
      home.points += 1;
      away.points += 1;
    }
  }

  const table = Array.from(rows.values()).map((row) => ({
    ...row,
    goalDifference: row.goalsFor - row.goalsAgainst,
  }));

  table.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDifference !== a.goalDifference) {
      return b.goalDifference - a.goalDifference;
    }
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.team.name.localeCompare(b.team.name);
  });

  return table;
}

// ========================================
// Page
// ========================================

export default async function TeamPage({ params }: PageProps) {
  const { id } = await params;

  const team = await prisma.team.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      logoUrl: true,
      league: {
        select: {
          id: true,
          name: true,
          slug: true,
          season: true,
          badgeUrl: true,
          heroImageUrl: true,
          venueName: true,
          area: true,
          dayOfWeek: true,
          teams: {
            orderBy: {
              name: "asc",
            },
            select: {
              id: true,
              name: true,
              logoUrl: true,
            },
          },
          fixtures: {
            where: {
              publishedAt: {
                not: null,
              },
            },
            orderBy: [{ kickoffAt: "asc" }],
            select: {
              id: true,
              kickoffAt: true,
              status: true,
              round: true,
              pitch: true,
              venue: {
                select: {
                  name: true,
                },
              },
              homeTeam: {
                select: {
                  id: true,
                  name: true,
                  logoUrl: true,
                },
              },
              awayTeam: {
                select: {
                  id: true,
                  name: true,
                  logoUrl: true,
                },
              },
              result: {
                select: {
                  homeScore: true,
                  awayScore: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!team) {
    notFound();
  }

  const teamLogo = normaliseLogoUrl(team.logoUrl);
  const leagueHero =
    normaliseLogoUrl(team.league?.heroImageUrl) ||
    "/venues/rossett_dark_trendy.jpg";
  const leagueBadge =
    normaliseLogoUrl(team.league?.badgeUrl) || "/sixfl-badge.png";

  if (!team.league) {
    return (
      <div className="min-h-screen bg-black text-white">
        <section className="relative isolate overflow-hidden border-b border-white/10">
          <Image
            src={leagueHero}
            alt=""
            fill
            priority
            className="object-cover object-center"
          />
          <div className="absolute inset-0 bg-black/80" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/90 via-black/65 to-black" />

          <div className="relative mx-auto max-w-[1400px] px-6 py-16 sm:px-10 sm:py-20">
            <div className="text-sm text-white/60">
              <Link href="/leagues" className="hover:text-white">
                Leagues
              </Link>
              <span> / </span>
              <span className="text-white/80">{team.name}</span>
            </div>

            <div className="mt-8 flex flex-col gap-8 lg:flex-row lg:items-center">
              <div className="relative flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-[2rem] border border-white/10 bg-white/5">
                {teamLogo ? (
                  <Image
                    src={teamLogo}
                    alt={team.name}
                    fill
                    className="object-contain p-3"
                    unoptimized
                  />
                ) : (
                  <span className="text-4xl font-black text-white/60">
                    {getInitials(team.name)}
                  </span>
                )}
              </div>

              <div className="max-w-3xl">
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-emerald-400">
                  SIXFL Team
                </p>
                <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">
                  {team.name}
                </h1>
                <p className="mt-5 max-w-2xl text-base leading-7 text-white/75 sm:text-lg">
                  This team page will show fixtures, results and league context
                  once the team is assigned to an active league.
                </p>

                <div className="mt-8 flex flex-wrap gap-4">
                  <Link
                    href="/leagues"
                    className="rounded-xl bg-emerald-500 px-6 py-3 font-semibold text-black transition hover:bg-emerald-400"
                  >
                    Browse leagues
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1400px] px-6 py-10 sm:px-10 lg:py-14">
          <div className="rounded-[2rem] border border-dashed border-white/10 bg-white/[0.03] p-8 text-white/60">
            This team is not currently linked to a public league.
          </div>
        </section>
      </div>
    );
  }

  const nightLabel = formatPreferredNight(team.league.dayOfWeek);
  const venueLabel = team.league.venueName || team.league.area || "Venue TBC";

  const leagueFixtures = team.league.fixtures;
  const upcomingFixtures = leagueFixtures.filter(
    (fixture) =>
      fixture.status === "SCHEDULED" && isTeamFixture(fixture, team.id),
  );

  const recentResults = leagueFixtures
    .filter(
      (fixture) =>
        fixture.status === "COMPLETED" &&
        fixture.result &&
        isTeamFixture(fixture, team.id),
    )
    .sort(
      (a, b) =>
        new Date(b.kickoffAt).getTime() - new Date(a.kickoffAt).getTime(),
    );

  const leagueTable = buildLeagueTable(team.league.teams, leagueFixtures);
  const teamRow = leagueTable.find((row) => row.team.id === team.id) ?? null;
  const position = teamRow
    ? leagueTable.findIndex((row) => row.team.id === team.id) + 1
    : null;

  const nextFixture = upcomingFixtures[0] ?? null;

  const recentForm = recentResults.slice(0, 5).map((fixture) => {
    const isHome = fixture.homeTeam.id === team.id;
    const goalsFor = isHome
      ? fixture.result!.homeScore
      : fixture.result!.awayScore;
    const goalsAgainst = isHome
      ? fixture.result!.awayScore
      : fixture.result!.homeScore;

    return getOutcome(goalsFor, goalsAgainst);
  });

  const leaguePreviewRows =
    position && position > 5
      ? [...leagueTable.slice(0, 5), teamRow!]
      : leagueTable.slice(0, 6);

  return (
    <div className="min-h-screen bg-black text-white">
      {/* ======================================== */}
      {/* HERO */}
      {/* ======================================== */}

      <section className="relative isolate overflow-hidden border-b border-white/10">
        <Image
          src={leagueHero}
          alt=""
          fill
          priority
          className="object-cover object-center"
        />

        <div className="absolute inset-0 bg-black/75" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/90 via-black/60 to-black" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.16),transparent_35%)]" />

        <div className="relative mx-auto max-w-[1400px] px-6 py-16 sm:px-10 sm:py-20">
          <div className="text-sm text-white/60">
            <Link href="/leagues" className="hover:text-white">
              Leagues
            </Link>
            <span> / </span>
            <Link
              href={`/leagues/${team.league.slug}`}
              className="hover:text-white"
            >
              {team.league.name}
            </Link>
            <span> / </span>
            <span className="text-white/80">{team.name}</span>
          </div>

          <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1.2fr)_380px] xl:items-end">
            <div className="max-w-5xl">
              <div className="flex flex-wrap items-center gap-6">
                <div className="relative">
                  <div className="absolute inset-0 rounded-[2rem] bg-emerald-500/15 blur-2xl" />
                  <div className="relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-[2rem] border border-emerald-400/20 bg-black/55 p-3 shadow-[0_24px_55px_rgba(0,0,0,0.45)] sm:h-32 sm:w-32">
                    <Image
                      src={leagueBadge}
                      alt={`${team.league.name} badge`}
                      fill
                      sizes="128px"
                      className="object-contain p-2"
                      unoptimized
                    />
                  </div>
                </div>

                <div>
                  <div className="inline-flex items-center rounded-full border border-emerald-400/20 bg-emerald-500/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.28em] text-emerald-300 sm:text-xs">
                    SIXFL Team
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2.5 text-sm text-white/65">
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                      {team.league.season || "Current season"}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                      {nightLabel}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                      {venueLabel}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-center">
                <div className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/5 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
                  {teamLogo ? (
                    <Image
                      src={teamLogo}
                      alt={team.name}
                      fill
                      className="object-contain p-2.5"
                      unoptimized
                    />
                  ) : (
                    <span className="text-3xl font-black text-white/60">
                      {getInitials(team.name)}
                    </span>
                  )}
                </div>

                <div className="min-w-0">
                  <h1 className="text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">
                    {team.name}
                  </h1>

                  <p className="mt-4 max-w-3xl text-base leading-7 text-white/80 sm:text-lg">
                    Playing in{" "}
                    <span className="font-semibold text-white">
                      {team.league.name}
                    </span>{" "}
                    — {nightLabel} nights at {venueLabel}.
                  </p>
                </div>
              </div>

              <div className="mt-8 flex flex-wrap gap-4">
                <Link
                  href={`/leagues/${team.league.slug}`}
                  className="rounded-xl bg-emerald-500 px-6 py-3 font-semibold text-black transition hover:bg-emerald-400"
                >
                  View league
                </Link>

                <Link
                  href={`/leagues/${team.league.slug}/fixtures`}
                  className="rounded-xl border border-white/15 bg-white/5 px-6 py-3 font-semibold text-white transition hover:bg-white/10"
                >
                  View fixtures
                </Link>

                <Link
                  href="/leagues"
                  className="rounded-xl border border-white/15 bg-white/5 px-6 py-3 font-semibold text-white transition hover:bg-white/10"
                >
                  All leagues
                </Link>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-2">
              <div className="rounded-3xl border border-white/10 bg-black/35 p-5 backdrop-blur-md">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">
                  League position
                </div>
                <div className="mt-3 text-3xl font-black text-white">
                  {position ? `#${position}` : "—"}
                </div>
                <div className="mt-2 text-sm text-white/60">
                  {team.league.teams.length} team
                  {team.league.teams.length === 1 ? "" : "s"} in the division
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-black/35 p-5 backdrop-blur-md">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">
                  Points
                </div>
                <div className="mt-3 text-3xl font-black text-white">
                  {teamRow?.points ?? 0}
                </div>
                <div className="mt-2 text-sm text-white/60">
                  Played {teamRow?.played ?? 0} matches
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-black/35 p-5 backdrop-blur-md">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">
                  Goal difference
                </div>
                <div className="mt-3 text-3xl font-black text-white">
                  {formatGoalDifference(teamRow?.goalDifference ?? 0)}
                </div>
                <div className="mt-2 text-sm text-white/60">
                  GF {teamRow?.goalsFor ?? 0} · GA {teamRow?.goalsAgainst ?? 0}
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-black/35 p-5 backdrop-blur-md">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">
                  Next fixture
                </div>
                <div className="mt-3 text-base font-bold text-white">
                  {nextFixture
                    ? formatFixtureDateTime(nextFixture.kickoffAt)
                    : "No fixture scheduled"}
                </div>
                <div className="mt-2 text-sm text-white/60">
                  {nextFixture
                    ? getOpponent(nextFixture, team.id).name
                    : "Check back after fixtures are published"}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ======================================== */}
      {/* CONTENT */}
      {/* ======================================== */}

      <section className="mx-auto max-w-[1400px] space-y-8 px-6 py-10 sm:px-10 lg:py-14">
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
          {/* Upcoming Fixtures */}
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.04]">
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-400">
                  Fixtures
                </p>
                <h2 className="mt-2 text-2xl font-bold text-white">
                  Upcoming matches
                </h2>
              </div>

              <Link
                href={`/leagues/${team.league.slug}/fixtures`}
                className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15"
              >
                Full schedule
              </Link>
            </div>

            <div className="divide-y divide-white/10">
              {upcomingFixtures.length === 0 ? (
                <div className="px-6 py-10 text-sm text-white/55">
                  No upcoming fixtures published yet.
                </div>
              ) : (
                upcomingFixtures.slice(0, 6).map((fixture) => {
                  const opponent = getOpponent(fixture, team.id);
                  const opponentLogo = normaliseLogoUrl(opponent.logoUrl);
                  const fixtureLabel = getFixtureLabel({
                    teamName: team.name,
                    homeTeamName: fixture.homeTeam.name,
                    awayTeamName: fixture.awayTeam.name,
                  });

                  return (
                    <div
                      key={fixture.id}
                      className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-center lg:justify-between"
                    >
                      <div className="flex min-w-0 items-center gap-4">
                        <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
                          {opponentLogo ? (
                            <Image
                              src={opponentLogo}
                              alt={`${opponent.name} badge`}
                              fill
                              sizes="56px"
                              className="object-contain p-2"
                              unoptimized
                            />
                          ) : (
                            <span className="text-base font-black text-white/60">
                              {getInitials(opponent.name)}
                            </span>
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="text-lg font-semibold leading-6 text-white">
                            {opponent.name}
                          </div>
                          <div className="mt-1 text-sm leading-6 text-white/55">
                            {fixtureLabel}
                          </div>
                          <div className="mt-1 text-sm text-white/45">
                            {fixture.round ? `Week ${fixture.round} · ` : ""}
                            {fixture.pitch ? `${fixture.pitch} · ` : ""}
                            {fixture.venue?.name ?? venueLabel}
                          </div>
                        </div>
                      </div>

                      <div className="text-sm text-white/60 lg:text-right">
                        <div className="font-medium text-white/80">
                          {formatFixtureDateTime(fixture.kickoffAt)}
                        </div>
                        <div className="mt-1">{nightLabel}</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Recent Results */}
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.04]">
            <div className="border-b border-white/10 px-6 py-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-400">
                Results
              </p>
              <h2 className="mt-2 text-2xl font-bold text-white">
                Recent scores
              </h2>
            </div>

            <div className="divide-y divide-white/10">
              {recentResults.length === 0 ? (
                <div className="px-6 py-10 text-sm text-white/55">
                  No completed results yet.
                </div>
              ) : (
                recentResults.slice(0, 6).map((fixture) => {
                  const isHome = fixture.homeTeam.id === team.id;
                  const opponent = getOpponent(fixture, team.id);
                  const opponentLogo = normaliseLogoUrl(opponent.logoUrl);
                  const goalsFor = isHome
                    ? fixture.result!.homeScore
                    : fixture.result!.awayScore;
                  const goalsAgainst = isHome
                    ? fixture.result!.awayScore
                    : fixture.result!.homeScore;
                  const outcome = getOutcome(goalsFor, goalsAgainst);

                  return (
                    <div
                      key={fixture.id}
                      className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-center lg:justify-between"
                    >
                      <div className="flex min-w-0 items-center gap-4">
                        <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
                          {opponentLogo ? (
                            <Image
                              src={opponentLogo}
                              alt={`${opponent.name} badge`}
                              fill
                              sizes="56px"
                              className="object-contain p-2"
                              unoptimized
                            />
                          ) : (
                            <span className="text-base font-black text-white/60">
                              {getInitials(opponent.name)}
                            </span>
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="text-lg font-semibold leading-6 text-white">
                            {opponent.name}
                          </div>
                          <div className="mt-1 text-sm text-white/55">
                            {formatFixtureDate(fixture.kickoffAt)}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 lg:justify-end">
                        <span className="inline-flex min-w-[92px] items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-lg font-black tracking-tight text-white">
                          {goalsFor} - {goalsAgainst}
                        </span>

                        <span
                          className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] ${getOutcomeClasses(
                            outcome,
                          )}`}
                        >
                          {getOutcomeLabel(outcome)}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-8 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          {/* Season Snapshot */}
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 sm:p-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-400">
              Team snapshot
            </p>

            <h2 className="mt-3 text-2xl font-bold text-white">
              Season overview
            </h2>

            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/70">
              Current league performance, recent form and season totals for{" "}
              {team.name}.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="rounded-3xl border border-white/10 bg-black/30 p-5">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
                  Record
                </div>
                <div className="mt-3 text-3xl font-black text-white">
                  {teamRow
                    ? `${teamRow.wins}-${teamRow.draws}-${teamRow.losses}`
                    : "0-0-0"}
                </div>
                <div className="mt-2 text-sm text-white/60">
                  W-D-L across the league season
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-black/30 p-5">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
                  Goals
                </div>
                <div className="mt-3 text-3xl font-black text-white">
                  {teamRow?.goalsFor ?? 0}
                  <span className="ml-2 text-lg font-semibold text-white/50">
                    for
                  </span>
                </div>
                <div className="mt-2 text-sm text-white/60">
                  {teamRow?.goalsAgainst ?? 0} conceded
                </div>
              </div>
            </div>

            <div className="mt-8 rounded-3xl border border-white/10 bg-black/30 p-5">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
                Recent form
              </div>

              {recentForm.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {recentForm.map((outcome, index) => (
                    <span
                      key={`${outcome}-${index}`}
                      className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl border text-sm font-black ${getOutcomeClasses(
                        outcome,
                      )}`}
                    >
                      {outcome === "WIN" ? "W" : outcome === "DRAW" ? "D" : "L"}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="mt-4 text-sm text-white/55">
                  Form will appear once results are recorded.
                </div>
              )}
            </div>
          </div>

          {/* League Context */}
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.04]">
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-400">
                  League context
                </p>
                <h2 className="mt-2 text-2xl font-bold text-white">
                  Table snapshot
                </h2>
              </div>

              <Link
                href={`/leagues/${team.league.slug}#table`}
                className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15"
              >
                Full table
              </Link>
            </div>

            <div className="overflow-x-auto">
              <div className="min-w-[760px]">
                <div className="grid grid-cols-[64px_minmax(220px,1.8fr)_72px_72px_72px_72px_84px_84px_92px] gap-4 border-b border-white/10 bg-white/[0.02] px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
                  <div>Pos</div>
                  <div>Team</div>
                  <div className="text-center">P</div>
                  <div className="text-center">W</div>
                  <div className="text-center">D</div>
                  <div className="text-center">L</div>
                  <div className="text-center">GD</div>
                  <div className="text-center">GF</div>
                  <div className="text-center">Pts</div>
                </div>

                <div className="divide-y divide-white/10">
                  {leaguePreviewRows.map((row) => {
                    const rowLogo = normaliseLogoUrl(row.team.logoUrl);
                    const isCurrentTeam = row.team.id === team.id;
                    const rowPosition =
                      leagueTable.findIndex(
                        (entry) => entry.team.id === row.team.id,
                      ) + 1;

                    return (
                      <div
                        key={row.team.id}
                        className={`grid grid-cols-[64px_minmax(220px,1.8fr)_72px_72px_72px_72px_84px_84px_92px] items-center gap-4 px-6 py-4 ${
                          isCurrentTeam ? "bg-emerald-500/[0.06]" : "bg-black/20"
                        }`}
                      >
                        <div>
                          <div
                            className={`flex h-10 w-10 items-center justify-center rounded-2xl border text-sm font-black ${
                              isCurrentTeam
                                ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
                                : "border-white/10 bg-white/[0.04] text-white/70"
                            }`}
                          >
                            {rowPosition}
                          </div>
                        </div>

                        <div className="flex min-w-0 items-center gap-4">
                          <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
                            {rowLogo ? (
                              <Image
                                src={rowLogo}
                                alt={`${row.team.name} badge`}
                                fill
                                sizes="48px"
                                className="object-contain p-1.5"
                                unoptimized
                              />
                            ) : (
                              <span className="text-sm font-black text-white/60">
                                {getInitials(row.team.name)}
                              </span>
                            )}
                          </div>

                          <div className="min-w-0">
                            <div
                              className={`font-semibold leading-5 ${
                                isCurrentTeam ? "text-emerald-100" : "text-white"
                              }`}
                            >
                              {row.team.name}
                            </div>
                          </div>
                        </div>

                        <div className="text-center font-medium text-white/80">
                          {row.played}
                        </div>
                        <div className="text-center font-medium text-white/80">
                          {row.wins}
                        </div>
                        <div className="text-center font-medium text-white/80">
                          {row.draws}
                        </div>
                        <div className="text-center font-medium text-white/80">
                          {row.losses}
                        </div>
                        <div className="text-center font-medium text-white/80">
                          {formatGoalDifference(row.goalDifference)}
                        </div>
                        <div className="text-center font-medium text-white/80">
                          {row.goalsFor}
                        </div>
                        <div className="text-center text-base font-black text-white">
                          {row.points}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}