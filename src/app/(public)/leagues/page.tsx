// ========================================
// File: src/app/leagues/page.tsx
// ========================================

// ========================================
// Imports
// ========================================

import Image from "next/image";
import { LeagueType, PreferredNight, Prisma } from "@prisma/client";
import TrackedLink from "@/components/analytics/TrackedLink";
import { getCurrentLeagueIds } from "@/lib/current-leagues";
import { prisma } from "@/lib/prisma";

// ========================================
// Rendering
// ========================================

export const dynamic = "force-dynamic";
export const revalidate = 0;

// ========================================
// Types
// ========================================

type LeagueCard = {
  id: string;
  name: string;
  slug: string;
  location: string;
  night: string;
  type: string;
  venue: string;
  badge: string | null;
  hero: string | null;
  teams: number;
  capacity: number | null;
  href: string;
  accent: string;
  button: string;
  border: string;
};

type LeagueTeamCountRow = {
  leagueId: string;
  teamCount: number;
};

// ========================================
// Constants
// ========================================

const DAY_ORDER: Record<PreferredNight, number> = {
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
  SUNDAY: 7,
  ANY: 8,
};

const DEFAULT_BADGE = "/sixfl-badge.png";

// ========================================
// Helpers
// ========================================

function formatLeagueType(value: LeagueType | null) {
  switch (value) {
    case "MENS":
      return "Men's League";
    case "WOMENS":
      return "Women's League";
    case "YOUTH":
      return "Youth League";
    default:
      return "League";
  }
}

function formatPreferredNight(value: PreferredNight | null) {
  switch (value) {
    case "MONDAY":
      return "Monday";
    case "TUESDAY":
      return "Tuesday";
    case "WEDNESDAY":
      return "Wednesday";
    case "THURSDAY":
      return "Thursday";
    case "FRIDAY":
      return "Friday";
    case "SATURDAY":
      return "Saturday";
    case "SUNDAY":
      return "Sunday";
    case "ANY":
      return "Any night";
    default:
      return "TBC";
  }
}

function getLeagueTheme(leagueType: LeagueType | null) {
  switch (leagueType) {
    case "WOMENS":
      return {
        accent: "text-purple-400",
        button: "bg-purple-500 hover:bg-purple-400",
        border: "hover:border-purple-400/40",
      };
    case "YOUTH":
      return {
        accent: "text-sky-400",
        button: "bg-sky-500 hover:bg-sky-400",
        border: "hover:border-sky-400/40",
      };
    case "MENS":
    default:
      return {
        accent: "text-emerald-400",
        button: "bg-emerald-500 hover:bg-emerald-400",
        border: "hover:border-emerald-400/40",
      };
  }
}

function normaliseImage(value?: string | null) {
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

function sortLeagues(a: LeagueCard, b: LeagueCard) {
  const dayA = Object.entries(DAY_ORDER).find(
    ([key]) => formatPreferredNight(key as PreferredNight) === a.night,
  );
  const dayB = Object.entries(DAY_ORDER).find(
    ([key]) => formatPreferredNight(key as PreferredNight) === b.night,
  );

  const dayOrderA = dayA ? DAY_ORDER[dayA[0] as PreferredNight] : 999;
  const dayOrderB = dayB ? DAY_ORDER[dayB[0] as PreferredNight] : 999;

  if (dayOrderA !== dayOrderB) {
    return dayOrderA - dayOrderB;
  }

  return a.location.localeCompare(b.location);
}

async function getCurrentSeasonTeamCounts(leagueIds: string[]) {
  if (leagueIds.length === 0) return new Map<string, number>();

  const rows = await prisma.$queryRaw<LeagueTeamCountRow[]>(Prisma.sql`
    SELECT
      membership."leagueId" AS "leagueId",
      COUNT(DISTINCT membership."teamId")::int AS "teamCount"
    FROM (
      SELECT season_team."leagueId", season_team."teamId"
      FROM "LeagueSeasonTeam" season_team
      WHERE season_team."isActive" = true
        AND season_team."leagueId" IN (${Prisma.join(leagueIds)})

      UNION

      SELECT team."leagueId", team."id" AS "teamId"
      FROM "Team" team
      WHERE team."leagueId" IN (${Prisma.join(leagueIds)})
    ) membership
    GROUP BY membership."leagueId"
  `);

  return new Map(rows.map((row) => [row.leagueId, Number(row.teamCount)]));
}

// ========================================
// Page
// ========================================

export default async function LeaguesPage() {
  const currentLeagueIds = await getCurrentLeagueIds();

  const leaguesFromDb = currentLeagueIds.length
    ? await prisma.league.findMany({
        where: {
          id: {
            in: currentLeagueIds,
          },
        },
        select: {
          id: true,
          name: true,
          slug: true,
          area: true,
          dayOfWeek: true,
          leagueType: true,
          venueName: true,
          heroImageUrl: true,
          badgeUrl: true,
          _count: {
            select: {
              teams: true,
            },
          },
        },
      })
    : [];

  const seasonTeamCounts = await getCurrentSeasonTeamCounts(currentLeagueIds);

  const leagues: LeagueCard[] = leaguesFromDb
    .map((league) => {
      const theme = getLeagueTheme(league.leagueType);

      return {
        id: league.id,
        name: league.name,
        slug: league.slug,
        location: league.area || "Yorkshire",
        night: formatPreferredNight(league.dayOfWeek),
        type: formatLeagueType(league.leagueType),
        venue: league.venueName || "Venue TBC",
        badge: normaliseImage(league.badgeUrl) || DEFAULT_BADGE,
        hero: normaliseImage(league.heroImageUrl),
        teams: seasonTeamCounts.get(league.id) ?? league._count.teams,
        capacity: null,
        href: `/leagues/${league.slug}`,
        accent: theme.accent,
        button: theme.button,
        border: theme.border,
      };
    })
    .sort(sortLeagues);

  return (
    <main className="min-h-screen bg-black text-white">
      <section className="relative isolate overflow-hidden border-b border-white/10 bg-gradient-to-b from-emerald-950/30 via-black to-black">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.16),transparent_34%)]" />
        <div className="absolute inset-x-0 top-0 h-px bg-white/10" />

        <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-emerald-400">
                SIXFL Leagues
              </p>

              <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">
                Find your league.
              </h1>

              <p className="mt-4 max-w-2xl text-lg leading-8 text-white/70">
                Premium 6-a-side football leagues across Yorkshire. Choose your
                location, pick your night, and register your team into a league
                that actually feels properly run.
              </p>

              <div className="mt-8 flex flex-wrap gap-3 text-sm text-white/80">
                <span className="rounded-full border border-white/10 bg-white/10 px-4 py-2 backdrop-blur">
                  Fixed weekly fixtures
                </span>
                <span className="rounded-full border border-white/10 bg-white/10 px-4 py-2 backdrop-blur">
                  Qualified referees
                </span>
                <span className="rounded-full border border-white/10 bg-white/10 px-4 py-2 backdrop-blur">
                  Live tables &amp; stats
                </span>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">
                  Current leagues
                </div>
                <div className="mt-2 text-3xl font-black text-white">
                  {leagues.length}
                </div>
                <div className="mt-1 text-sm text-white/55">
                  available now
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">
                  Weekly football
                </div>
                <div className="mt-2 text-3xl font-black text-white">6v6</div>
                <div className="mt-1 text-sm text-white/55">
                  small-sided football
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">
                  Format
                </div>
                <div className="mt-2 text-3xl font-black text-white">Live</div>
                <div className="mt-1 text-sm text-white/55">
                  tables &amp; results
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-emerald-400">
              Current seasons
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
              Leagues open now
            </h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-white/60">
            Previous seasons are kept in each league’s season archive so old tables and results can still be viewed.
          </p>
        </div>

        {leagues.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] p-8 text-white/65">
            No current leagues are listed yet.
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {leagues.map((league) => (
              <TrackedLink
                key={league.id}
                href={league.href}
                eventName="league_card_click"
                eventProps={{ league: league.slug }}
                className={`group overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] transition hover:bg-white/[0.07] ${league.border}`}
              >
                <div className="relative h-44 overflow-hidden bg-white/[0.04]">
                  {league.hero ? (
                    <Image
                      src={league.hero}
                      alt=""
                      fill
                      sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw"
                      className="object-cover opacity-75 transition duration-500 group-hover:scale-105 group-hover:opacity-90"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.20),transparent_38%)]" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
                  <div className="absolute bottom-4 left-4 flex items-center gap-3">
                    <div className="relative h-14 w-14 overflow-hidden rounded-2xl border border-white/10 bg-black/50 p-2">
                      {league.badge ? (
                        <Image src={league.badge} alt="" fill className="object-contain p-2" />
                      ) : null}
                    </div>
                    <div>
                      <div className={`text-xs font-bold uppercase tracking-[0.18em] ${league.accent}`}>
                        {league.location}
                      </div>
                      <div className="text-sm font-semibold text-white/80">{league.night}</div>
                    </div>
                  </div>
                </div>

                <div className="p-6">
                  <div className={`text-xs font-bold uppercase tracking-[0.18em] ${league.accent}`}>
                    {league.type}
                  </div>
                  <h3 className="mt-2 text-2xl font-black tracking-tight text-white">
                    {league.name}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-white/65">
                    {league.venue} · {league.teams} team{league.teams === 1 ? "" : "s"}
                  </p>

                  <div className={`mt-5 inline-flex rounded-full px-5 py-3 text-sm font-black text-black transition ${league.button}`}>
                    View league
                  </div>
                </div>
              </TrackedLink>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
