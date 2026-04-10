
// ========================================
// File: src/app/(public)/leagues/[slug]/page.tsx
// ========================================

import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createLeagueInterestLeadAction } from "./actions";
import { formatDateTimeInLondon } from "@/lib/datetime/london";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  params: Promise<{
    slug: string;
  }>;
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

function formatPreferredNight(value?: string | null) {
  if (!value) return null;
  if (value === "ANY") return "Any night";

  return value.charAt(0) + value.slice(1).toLowerCase();
}

function formatLeagueType(value?: string | null) {
  if (!value) return null;

  switch (value) {
    case "MENS":
      return "Men's";
    case "WOMENS":
      return "Women's";
    case "YOUTH":
      return "Youth";
    default:
      return value;
  }
}

function formatLeagueTypeCompact(value?: string | null) {
  if (!value) return null;

  switch (value) {
    case "MENS":
      return "Mens";
    case "WOMENS":
      return "Womens";
    case "YOUTH":
      return "Youth";
    default:
      return value;
  }
}

function getInitials(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (!parts.length) return "?";

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

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

function formatFixtureDate(date: Date) {
  return formatDateTimeInLondon(date, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatResultDate(date: Date) {
  return new Date(date).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatGoalDifference(value: number) {
  return value > 0 ? `+${value}` : `${value}`;
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

export default async function LeagueLandingPage({ params }: PageProps) {
  const { slug } = await params;

  const league = await prisma.league.findFirst({
    where: {
      slug,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      slug: true,
      season: true,
      area: true,
      dayOfWeek: true,
      leagueType: true,
      venueName: true,
      kickoffInfo: true,
      format: true,
      surface: true,
      description: true,
      heroImageUrl: true,
      badgeUrl: true,
      ctaText: true,
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
        orderBy: {
          kickoffAt: "asc",
        },
        select: {
          id: true,
          kickoffAt: true,
          status: true,
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
  });

  if (!league) {
    notFound();
  }

  const nightLabel = formatPreferredNight(league.dayOfWeek);
  const leagueTypeLabel = formatLeagueType(league.leagueType);
  const leagueTypeCompact = formatLeagueTypeCompact(league.leagueType);

  const heroEyebrow = [league.area?.trim(), nightLabel, leagueTypeCompact]
    .filter(Boolean)
    .join(" ");

  const heroMeta = [
    league.season,
    league.venueName,
    `${league.teams.length} team${league.teams.length === 1 ? "" : "s"}`,
  ].filter(Boolean);

  const heroImageUrl =
    normaliseLogoUrl(league.heroImageUrl) || "/venues/rossett_dark_trendy.jpg";
  const leagueBadge =
    normaliseLogoUrl(league.badgeUrl) || "/sixfl-badge.png";

  const introText =
    league.description?.trim() ||
    `6-a-side football. Done properly. Register your interest now for ${league.name}.`;

  const detailCards = [
    {
      label: "Format",
      value: league.format || leagueTypeLabel || "6-a-side",
    },
    {
      label: "Night",
      value: nightLabel || "TBC",
    },
    {
      label: "Venue",
      value: league.venueName || league.area || "TBC",
    },
    {
      label: "Season",
      value: league.season || "Launching soon",
    },
    {
      label: "Kick-off",
      value: league.kickoffInfo || "TBC",
    },
    {
      label: "Surface",
      value: league.surface || "TBC",
    },
  ];

  const featurePills = [
    "Fixed weekly fixtures",
    "Qualified referees",
    "Live tables & stats",
  ];

  const upcomingFixtures = league.fixtures.filter(
    (fixture) => fixture.status === "SCHEDULED",
  );

  const recentResults = league.fixtures
    .filter((fixture) => fixture.status === "COMPLETED" && fixture.result)
    .sort(
      (a, b) =>
        new Date(b.kickoffAt).getTime() - new Date(a.kickoffAt).getTime(),
    );

  const completedFixtures = league.fixtures.filter(
    (fixture) => fixture.status === "COMPLETED" && fixture.result,
  );

  const leagueTable = buildLeagueTable(league.teams, league.fixtures);

  return (
    <div className="min-h-screen bg-black text-white">
      <section className="relative isolate min-h-[76vh] overflow-hidden rounded-3xl border border-white/10">
        <div className="absolute inset-0">
          <Image
            src={heroImageUrl}
            alt={league.name}
            fill
            priority
            className="object-cover object-center"
          />
          <div className="absolute inset-0 bg-black/75" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/85 via-black/55 to-black" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.22),transparent_35%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.04),transparent_25%,transparent_75%,rgba(255,255,255,0.04))]" />
        </div>

        <div className="relative mx-auto flex min-h-[76vh] max-w-6xl items-center px-6 py-16 sm:px-10 sm:py-24 lg:py-28">
          <div className="w-full rounded-[2rem] border border-white/10 bg-black/25 p-6 backdrop-blur-[3px] sm:p-8 lg:p-10">
            <div className="grid gap-8 xl:grid-cols-[1.2fr_0.8fr] xl:items-end">
              <div className="max-w-4xl">
                <div className="flex flex-wrap items-center gap-6 lg:gap-7">
                  <div className="relative">
                    <div className="absolute inset-0 rounded-[2rem] bg-emerald-500/15 blur-2xl" />
                    <div className="relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-[2rem] border border-emerald-400/20 bg-black/55 p-3 shadow-[0_24px_55px_rgba(0,0,0,0.45)] sm:h-36 sm:w-36">
                      <Image
                        src={leagueBadge}
                        alt={`${league.name} badge`}
                        fill
                        sizes="144px"
                        className="object-contain p-2.5"
                        unoptimized
                      />
                    </div>
                  </div>

                  <div className="min-w-0">
                    <div className="inline-flex items-center rounded-full border border-emerald-400/20 bg-emerald-500/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.28em] text-emerald-300 shadow-[0_0_24px_rgba(16,185,129,0.12)] sm:text-xs">
                      {heroEyebrow || "SIXFL League"}
                    </div>

                    {heroMeta.length > 0 ? (
                      <div className="mt-4 flex flex-wrap items-center gap-2.5 text-sm text-white/65">
                        {heroMeta.map((item) => (
                          <span
                            key={item}
                            className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5"
                          >
                            {item}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>

                <h1 className="mt-8 text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">
                  {league.name}
                </h1>

                <p className="mt-5 max-w-2xl text-base leading-7 text-white/80 sm:text-lg">
                  {introText}
                </p>

                <div className="mt-8 flex flex-wrap gap-3 text-sm text-white/80">
                  {featurePills.map((pill) => (
                    <span
                      key={pill}
                      className="rounded-full border border-white/10 bg-white/10 px-4 py-2 backdrop-blur"
                    >
                      {pill}
                    </span>
                  ))}
                </div>

                <div className="mt-8 flex flex-wrap gap-4">
                  <a
                    href="#register"
                    className="rounded-xl bg-emerald-500 px-6 py-3 font-semibold text-black transition hover:bg-emerald-400"
                  >
                    {league.ctaText?.trim() || "Register your interest"}
                  </a>

                  <a
                    href="#table"
                    className="rounded-xl border border-white/15 bg-white/5 px-6 py-3 font-semibold text-white transition hover:bg-white/10"
                  >
                    View league table
                  </a>

                  <Link
                    href={`/leagues/${league.slug}/fixtures`}
                    className="rounded-xl bg-white px-6 py-3 font-semibold text-black transition hover:bg-white/90"
                  >
                    View Fixtures
                  </Link>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-2">
                <div className="rounded-3xl border border-white/10 bg-black/35 p-5 backdrop-blur-md">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">
                    Teams
                  </div>
                  <div className="mt-2 text-3xl font-black">
                    {league.teams.length}
                  </div>
                  <div className="mt-1 text-sm text-white/60">
                    clubs currently shown
                  </div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-black/35 p-5 backdrop-blur-md">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">
                    Match night
                  </div>
                  <div className="mt-2 text-xl font-bold">
                    {nightLabel || "TBC"}
                  </div>
                  <div className="mt-1 text-sm text-white/60">
                    {league.venueName || league.area || "Venue to be confirmed"}
                  </div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-black/35 p-5 backdrop-blur-md">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">
                    Upcoming
                  </div>
                  <div className="mt-2 text-3xl font-black">
                    {upcomingFixtures.length}
                  </div>
                  <div className="mt-1 text-sm text-white/60">
                    scheduled fixtures
                  </div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-black/35 p-5 backdrop-blur-md">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">
                    Results
                  </div>
                  <div className="mt-2 text-3xl font-black">
                    {completedFixtures.length}
                  </div>
                  <div className="mt-1 text-sm text-white/60">
                    completed matches
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        id="details"
        className="mx-auto max-w-6xl border-x border-b border-white/10 bg-[#05070a]"
      >
        <div className="px-6 pt-10 sm:px-10 lg:pt-16">
          <div
            id="table"
            className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.03] shadow-[0_0_0_1px_rgba(255,255,255,0.02)]"
          >
            <div className="border-b border-white/10 px-6 py-6 sm:px-8">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-400">
                Standings
              </p>
              <h2 className="mt-3 text-2xl font-bold sm:text-3xl">
                League table
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60 sm:text-base">
                Full standings with team names, goals scored, goals conceded and
                goal difference.
              </p>
            </div>

            {leagueTable.length > 0 ? (
              <>
                <div className="hidden grid-cols-[72px_minmax(260px,1.9fr)_72px_72px_72px_72px_84px_84px_84px_92px] gap-4 border-b border-white/10 bg-white/[0.02] px-8 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-white/45 lg:grid">
                  <div>Pos</div>
                  <div>Team</div>
                  <div className="text-center">P</div>
                  <div className="text-center">W</div>
                  <div className="text-center">D</div>
                  <div className="text-center">L</div>
                  <div className="text-center">GF</div>
                  <div className="text-center">GA</div>
                  <div className="text-center">GD</div>
                  <div className="text-center">Pts</div>
                </div>

                <div className="divide-y divide-white/10">
                  {leagueTable.map((row, index) => {
                    const logoUrl = normaliseLogoUrl(row.team.logoUrl);
                    const isTop = index === 0;

                    const mobileTopStats = [
                      { label: "P", value: row.played },
                      { label: "W", value: row.wins },
                      { label: "D", value: row.draws },
                      { label: "L", value: row.losses },
                    ];

                    const mobileBottomStats = [
                      { label: "GF", value: row.goalsFor },
                      { label: "GA", value: row.goalsAgainst },
                      {
                        label: "GD",
                        value: formatGoalDifference(row.goalDifference),
                      },
                      { label: "PTS", value: row.points },
                    ];

                    return (
                      <div
                        key={row.team.id}
                        className="bg-black/20 px-4 py-5 sm:px-6 lg:px-8"
                      >
                        <div className="lg:hidden">
                          <div className="flex items-start gap-4">
                            <div
                              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-sm font-black ${
                                isTop
                                  ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
                                  : "border-white/10 bg-white/[0.04] text-white/70"
                              }`}
                            >
                              {index + 1}
                            </div>

                            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
                              {logoUrl ? (
                                <Image
                                  src={logoUrl}
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

                            <div className="min-w-0 flex-1">
                              <Link
                                href={`/teams/${row.team.id}`}
                                className="block truncate text-base font-semibold text-white hover:text-emerald-400"
                              >
                                {row.team.name}
                              </Link>

                              <div className="mt-3 grid grid-cols-4 gap-2">
                                {mobileTopStats.map((stat) => (
                                  <div
                                    key={`${row.team.id}-${stat.label}`}
                                    className="rounded-2xl border border-white/10 bg-white/[0.04] px-2 py-2 text-center"
                                  >
                                    <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
                                      {stat.label}
                                    </div>
                                    <div className="mt-1 text-sm font-bold text-white">
                                      {stat.value}
                                    </div>
                                  </div>
                                ))}
                              </div>

                              <div className="mt-2 grid grid-cols-4 gap-2">
                                {mobileBottomStats.map((stat) => (
                                  <div
                                    key={`${row.team.id}-${stat.label}`}
                                    className="rounded-2xl border border-white/10 bg-white/[0.04] px-2 py-2 text-center"
                                  >
                                    <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
                                      {stat.label}
                                    </div>
                                    <div className="mt-1 text-sm font-bold text-white">
                                      {stat.value}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="hidden grid-cols-[72px_minmax(260px,1.9fr)_72px_72px_72px_72px_84px_84px_84px_92px] items-center gap-4 lg:grid">
                          <div>
                            <div
                              className={`flex h-11 w-11 items-center justify-center rounded-2xl border text-sm font-black ${
                                isTop
                                  ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
                                  : "border-white/10 bg-white/[0.04] text-white/70"
                              }`}
                            >
                              {index + 1}
                            </div>
                          </div>

                          <div className="flex min-w-0 items-center gap-4">
                            <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
                              {logoUrl ? (
                                <Image
                                  src={logoUrl}
                                  alt={`${row.team.name} badge`}
                                  fill
                                  sizes="56px"
                                  className="object-contain p-2"
                                  unoptimized
                                />
                              ) : (
                                <span className="text-base font-black text-white/60">
                                  {getInitials(row.team.name)}
                                </span>
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <Link
                                href={`/teams/${row.team.id}`}
                                className="block min-w-0 truncate font-semibold text-white transition hover:text-emerald-400"
                              >
                                {row.team.name}
                              </Link>
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
                            {row.goalsFor}
                          </div>
                          <div className="text-center font-medium text-white/80">
                            {row.goalsAgainst}
                          </div>
                          <div className="text-center font-medium text-white/80">
                            {formatGoalDifference(row.goalDifference)}
                          </div>
                          <div className="text-center text-base font-black text-white">
                            {row.points}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="px-6 py-8 text-white/60 sm:px-8">
                The league table will appear here once results have been
                entered.
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-8 px-6 pb-10 pt-8 sm:px-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-10 lg:pb-16 lg:pt-10">
          <div className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] sm:p-8">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-400">
                League Details
              </p>

              <h2 className="mt-3 text-2xl font-bold sm:text-3xl">
                A better way to play local 6-a-side football
              </h2>

              <p className="mt-4 max-w-2xl text-white/70">
                {league.description?.trim() ||
                  "This league is designed for teams who want consistency, quality, and a better match-night experience. No chaos. No mess. Just properly organised football."}
              </p>

              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                {detailCards.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-2xl border border-white/10 bg-black/30 p-4"
                  >
                    <div className="text-sm font-semibold text-emerald-400">
                      {item.label}
                    </div>
                    <div className="mt-1 text-white/85">{item.value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                <div className="text-sm font-semibold text-emerald-400">
                  Reliable
                </div>
                <p className="mt-2 text-sm leading-6 text-white/70">
                  Fixed weekly match nights and properly managed league
                  operations.
                </p>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                <div className="text-sm font-semibold text-emerald-400">
                  Competitive
                </div>
                <p className="mt-2 text-sm leading-6 text-white/70">
                  Quality local football with structure, standards and a proper
                  league feel.
                </p>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                <div className="text-sm font-semibold text-emerald-400">
                  Professional
                </div>
                <p className="mt-2 text-sm leading-6 text-white/70">
                  Referees, fixtures, tables and stats handled the right way.
                </p>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] sm:p-8">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-400">
                    Fixtures
                  </p>
                  <h2 className="mt-3 text-2xl font-bold sm:text-3xl">
                    Upcoming matches
                  </h2>
                </div>
              </div>

              {upcomingFixtures.length > 0 ? (
                <div className="mt-8 space-y-3">
                  {upcomingFixtures.map((fixture) => {
                    const homeLogoUrl = normaliseLogoUrl(
                      fixture.homeTeam.logoUrl,
                    );
                    const awayLogoUrl = normaliseLogoUrl(
                      fixture.awayTeam.logoUrl,
                    );

                    return (
                      <div
                        key={fixture.id}
                        className="rounded-3xl border border-white/10 bg-black/30 p-4 sm:p-5"
                      >
                        <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-center">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">
                              {homeLogoUrl ? (
                                <Image
                                  src={homeLogoUrl}
                                  alt={`${fixture.homeTeam.name} badge`}
                                  fill
                                  sizes="48px"
                                  className="object-contain p-1.5"
                                  unoptimized
                                />
                              ) : (
                                <span className="text-sm font-black text-white/60">
                                  {getInitials(fixture.homeTeam.name)}
                                </span>
                              )}
                            </div>

                            <Link
                              href={`/teams/${fixture.homeTeam.id}`}
                              className="block min-w-0 truncate font-semibold text-white hover:text-emerald-400"
                            >
                              {fixture.homeTeam.name}
                            </Link>
                          </div>

                          <div className="text-center">
                            <span className="inline-flex rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-bold uppercase tracking-[0.18em] text-white/50">
                              vs
                            </span>
                          </div>

                          <div className="flex min-w-0 items-center justify-end gap-3 text-right">
                            <Link
                              href={`/teams/${fixture.awayTeam.id}`}
                              className="block min-w-0 truncate font-semibold text-white hover:text-emerald-400"
                            >
                              {fixture.awayTeam.name}
                            </Link>

                            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">
                              {awayLogoUrl ? (
                                <Image
                                  src={awayLogoUrl}
                                  alt={`${fixture.awayTeam.name} badge`}
                                  fill
                                  sizes="48px"
                                  className="object-contain p-1.5"
                                  unoptimized
                                />
                              ) : (
                                <span className="text-sm font-black text-white/60">
                                  {getInitials(fixture.awayTeam.name)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 text-center text-sm text-white/50 md:text-right">
                          {formatFixtureDate(fixture.kickoffAt)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-8 rounded-3xl border border-dashed border-white/10 bg-black/20 p-6 text-white/60">
                  Fixtures will appear here once the schedule is published.
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] sm:p-8">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-400">
                    Results
                  </p>
                  <h2 className="mt-3 text-2xl font-bold sm:text-3xl">
                    Recent results
                  </h2>
                </div>
              </div>

              {recentResults.length > 0 ? (
                <div className="mt-8 space-y-3">
                  {recentResults.slice(0, 8).map((fixture) => {
                    const homeLogoUrl = normaliseLogoUrl(
                      fixture.homeTeam.logoUrl,
                    );
                    const awayLogoUrl = normaliseLogoUrl(
                      fixture.awayTeam.logoUrl,
                    );

                    return (
                      <div
                        key={fixture.id}
                        className="rounded-3xl border border-white/10 bg-black/30 p-4 sm:p-5"
                      >
                        <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-center">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">
                              {homeLogoUrl ? (
                                <Image
                                  src={homeLogoUrl}
                                  alt={`${fixture.homeTeam.name} badge`}
                                  fill
                                  sizes="48px"
                                  className="object-contain p-1.5"
                                  unoptimized
                                />
                              ) : (
                                <span className="text-sm font-black text-white/60">
                                  {getInitials(fixture.homeTeam.name)}
                                </span>
                              )}
                            </div>

                            <Link
                              href={`/teams/${fixture.homeTeam.id}`}
                              className="block min-w-0 truncate font-semibold text-white hover:text-emerald-400"
                            >
                              {fixture.homeTeam.name}
                            </Link>
                          </div>

                          <div className="text-center">
                            <span className="inline-flex min-w-[88px] items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-lg font-black tracking-tight text-white">
                              {fixture.result?.homeScore} -{" "}
                              {fixture.result?.awayScore}
                            </span>
                          </div>

                          <div className="flex min-w-0 items-center justify-end gap-3 text-right">
                            <Link
                              href={`/teams/${fixture.awayTeam.id}`}
                              className="block min-w-0 truncate font-semibold text-white hover:text-emerald-400"
                            >
                              {fixture.awayTeam.name}
                            </Link>

                            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">
                              {awayLogoUrl ? (
                                <Image
                                  src={awayLogoUrl}
                                  alt={`${fixture.awayTeam.name} badge`}
                                  fill
                                  sizes="48px"
                                  className="object-contain p-1.5"
                                  unoptimized
                                />
                              ) : (
                                <span className="text-sm font-black text-white/60">
                                  {getInitials(fixture.awayTeam.name)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 text-center text-sm text-white/50 md:text-right">
                          {formatResultDate(fixture.kickoffAt)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-8 rounded-3xl border border-dashed border-white/10 bg-black/20 p-6 text-white/60">
                  Results will appear here once matches have been played.
                </div>
              )}
            </div>

            <div
              id="teams"
              className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] sm:p-8"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-400">
                    Teams
                  </p>
                  <h2 className="mt-3 text-2xl font-bold sm:text-3xl">
                    Clubs in this league
                  </h2>
                </div>

                <div className="text-sm text-white/55">
                  {league.teams.length} team
                  {league.teams.length === 1 ? "" : "s"}
                </div>
              </div>

              {league.teams.length > 0 ? (
                <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                  {league.teams.map((team) => {
                    const teamLogoUrl = normaliseLogoUrl(team.logoUrl);

                    return (
                      <div
                        key={team.id}
                        className="group rounded-3xl border border-white/10 bg-black/30 p-5 transition duration-200 hover:-translate-y-1 hover:border-emerald-400/30 hover:bg-black/40"
                      >
                        <div className="flex flex-col items-center text-center">
                          <div className="relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
                            {teamLogoUrl ? (
                              <Image
                                src={teamLogoUrl}
                                alt={`${team.name} badge`}
                                fill
                                sizes="112px"
                                className="object-contain p-2"
                                unoptimized
                              />
                            ) : (
                              <span className="text-2xl font-black text-white/60">
                                {getInitials(team.name)}
                              </span>
                            )}
                          </div>

                          <div className="mt-4 flex min-h-[3.5rem] items-center justify-center text-center text-sm font-semibold leading-6 text-white sm:text-base">
                            {team.name}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-8 rounded-3xl border border-dashed border-white/10 bg-black/20 p-6 text-white/60">
                  Teams will appear here as they are added to this league.
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div
              id="register"
              className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl backdrop-blur sm:p-8"
            >
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-400">
                Join This League
              </p>

              <h2 className="mt-3 text-2xl font-bold">
                Register your interest
              </h2>

              <p className="mt-3 text-white/70">
                Tell us a little about your team and we&apos;ll be in touch
                about {league.name}.
              </p>

              <form
                action={createLeagueInterestLeadAction}
                className="mt-6 space-y-4"
              >
                <input type="hidden" name="leagueId" value={league.id} />
                <input
                  type="hidden"
                  name="area"
                  value={league.area || league.venueName || ""}
                />
                <input
                  type="hidden"
                  name="source"
                  value={`league-page-${league.slug}`}
                />

                <div>
                  <label className="mb-2 block text-sm font-medium text-white/85">
                    Your name
                  </label>
                  <input
                    name="contactName"
                    type="text"
                    required
                    placeholder="Your full name"
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none transition placeholder:text-white/35 focus:border-emerald-400"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-white/85">
                    Email
                  </label>
                  <input
                    name="email"
                    type="email"
                    required
                    placeholder="you@example.com"
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none transition placeholder:text-white/35 focus:border-emerald-400"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-white/85">
                    Phone
                  </label>
                  <input
                    name="phone"
                    type="text"
                    placeholder="Optional"
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none transition placeholder:text-white/35 focus:border-emerald-400"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-white/85">
                    Team name
                  </label>
                  <input
                    name="teamName"
                    type="text"
                    placeholder="Optional"
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none transition placeholder:text-white/35 focus:border-emerald-400"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-white/85">
                    Message
                  </label>
                  <textarea
                    name="message"
                    rows={4}
                    placeholder="Anything you'd like to tell us"
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none transition placeholder:text-white/35 focus:border-emerald-400"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full rounded-xl bg-emerald-500 px-5 py-3 font-semibold text-black transition hover:bg-emerald-400"
                >
                  {league.ctaText?.trim() || "Register your interest"}
                </button>
              </form>

              <p className="mt-4 text-sm text-white/50">
                We&apos;ll use these details to contact you about this specific
                league.
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] sm:p-8">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-400">
                Team Entry
              </p>

              <h2 className="mt-3 text-2xl font-bold">Simple weekly pricing</h2>

              <div className="mt-5 rounded-3xl border border-white/10 bg-black/30 p-5">
                <div className="text-4xl font-black tracking-tight text-white">
                  £40
                  <span className="ml-2 text-lg font-semibold text-white/60">
                    per team / week
                  </span>
                </div>

                <p className="mt-3 text-sm leading-6 text-white/65">
                  A properly run league with reliable weekly fixtures, qualified
                  referees, tables, results and a stronger match-night
                  experience.
                </p>
              </div>

              <div className="mt-5 space-y-3 text-sm text-white/70">
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  Fixed weekly fixtures
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  Managed league operations
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  Results, standings and proper structure
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-400">
                Snapshot
              </p>

              <div className="mt-5 space-y-4 text-sm text-white/70">
                <div className="flex items-center justify-between gap-4">
                  <span>League</span>
                  <span className="text-right font-medium text-white">
                    {league.name}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span>Night</span>
                  <span className="text-right font-medium text-white">
                    {nightLabel || "TBC"}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span>Venue</span>
                  <span className="text-right font-medium text-white">
                    {league.venueName || league.area || "TBC"}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span>Teams</span>
                  <span className="text-right font-medium text-white">
                    {league.teams.length}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span>Completed fixtures</span>
                  <span className="text-right font-medium text-white">
                    {completedFixtures.length}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
