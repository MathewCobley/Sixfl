// ========================================
// File: src/app/leagues/page.tsx
// ========================================

// ========================================
// Imports
// ========================================

import Image from "next/image";
import { LeagueType, PreferredNight } from "@prisma/client";
import TrackedLink from "@/components/analytics/TrackedLink";
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

// ========================================
// Page
// ========================================

export default async function LeaguesPage() {
  const leaguesFromDb = await prisma.league.findMany({
    where: {
      isActive: true,
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
  });

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
        teams: league._count.teams,
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
                  Active leagues
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
                  Teams entered
                </div>
                <div className="mt-2 text-3xl font-black text-white">
                  {leagues.reduce((sum, league) => sum + league.teams, 0)}
                </div>
                <div className="mt-1 text-sm text-white/55">
                  across all leagues
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">
                  Match nights
                </div>
                <div className="mt-2 text-3xl font-black text-white">
                  {
                    new Set(
                      leagues
                        .map((league) => league.night)
                        .filter((night) => night && night !== "TBC"),
                    ).size
                  }
                </div>
                <div className="mt-1 text-sm text-white/55">
                  weekly options
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        {leagues.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-10 text-center">
            <p className="text-lg font-semibold text-white">
              No active leagues are live yet.
            </p>
            <p className="mt-2 text-sm text-white/60">
              Check back soon for new SIXFL league launches.
            </p>
          </div>
        ) : (
          <div className="grid justify-items-center gap-6 md:grid-cols-2 xl:grid-cols-3">
            {leagues.map((league) => {
              const spacesLeft =
                league.capacity !== null
                  ? Math.max(league.capacity - league.teams, 0)
                  : null;

              return (
                <div
                  key={league.id}
                  className={`group relative flex h-full w-full max-w-[380px] flex-col overflow-hidden rounded-3xl border border-white/10 bg-black transition duration-300 ${league.border} hover:-translate-y-1 hover:bg-white/[0.02] hover:shadow-[0_18px_60px_rgba(0,0,0,0.55)]`}
                >
                  <div className="absolute inset-0">
                    {league.hero ? (
                      <Image
                        src={league.hero}
                        alt={league.name}
                        fill
                        className="object-cover opacity-40 transition duration-500 group-hover:scale-105"
                      />
                    ) : null}

                    <div className="absolute inset-0 bg-black/72" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/75 to-black/20" />
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.05),transparent_40%)]" />
                  </div>

                  <div className="relative flex h-full flex-col gap-6 p-6">
                    <div className="flex items-start gap-5">
                      <div className="shrink-0 rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur">
                        <Image
                          src={league.badge || DEFAULT_BADGE}
                          alt={`${league.location} ${league.night} ${league.type} badge`}
                          width={84}
                          height={84}
                          className="h-[72px] w-[72px] object-contain"
                          priority={league.location === "Harrogate"}
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <h2 className="text-2xl font-extrabold tracking-tight text-white">
                          {league.location}
                        </h2>

                        <p className="mt-1 text-sm text-white/60">
                          {league.venue}
                        </p>

                        <div className="mt-3 flex flex-wrap gap-2 text-xs">
                          <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-white/85">
                            {league.night}
                          </span>
                          <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-white/85">
                            {league.type}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-black/40 p-4 backdrop-blur">
                      <p
                        className={`text-xs font-semibold uppercase tracking-[0.18em] ${league.accent}`}
                      >
                        League
                      </p>

                      <p className="mt-2 text-lg font-bold text-white">
                        {league.name}
                      </p>

                      <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                        <span className="text-white/70">
                          {league.teams} teams entered
                        </span>

                        <span className={`font-semibold ${league.accent}`}>
                          {spacesLeft !== null
                            ? `${spacesLeft} spaces left`
                            : "Now forming"}
                        </span>
                      </div>
                    </div>

                    <TrackedLink
                      href={league.href}
                      eventName="register_team_click"
                      eventProps={{
                        leagueId: league.id,
                        leagueName: league.name,
                        slug: league.slug,
                        location: league.location,
                        night: league.night,
                        leagueType: league.type,
                        venue: league.venue,
                      }}
                      className={`mt-auto inline-flex h-12 items-center justify-center rounded-full px-6 text-sm font-extrabold uppercase tracking-wide text-black shadow-lg transition duration-200 hover:scale-[1.02] ${league.button}`}
                    >
                      View league
                    </TrackedLink>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}