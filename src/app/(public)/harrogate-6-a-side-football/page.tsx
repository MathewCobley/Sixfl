import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import Script from "next/script";

import SixflTvHomepageSection from "@/components/home/SixflTvHomepageSection";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { getLeagueStandings } from "@/lib/standings";
import { LocalSeoLandingPage, localSeoPages } from "../local-seo-pages";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const page = localSeoPages.harrogate;
const HARROGATE_LEAGUE_SLUG = "rossett-mens-tuesday";
const TEAM_PRICE_PENCE = 4000;
const PLAYER_GUIDE_PENCE = 500;

export const metadata: Metadata = {
  title: "Harrogate 6-a-side Football League | Rossett Sports Centre | SIXFL",
  description:
    "Play organised Tuesday 6-a-side football in Harrogate at Rossett Sports Centre. £40 per team, around £5 per player, with live fixtures, results, tables and SIXFL TV.",
  alternates: { canonical: page.canonicalPath },
  openGraph: {
    title: "Harrogate 6-a-side Football League | SIXFL",
    description:
      "Tuesday 6-a-side football at Rossett Sports Centre in Harrogate. See the live league, next fixtures and current table before joining.",
    url: page.canonicalPath,
    type: "website",
  },
};

function formatMoney(amountPence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amountPence / 100);
}

function normaliseImageUrl(value?: string | null) {
  const trimmed = value?.trim();
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
  return formatDateTimeInLondon(date, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatGoalDifference(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function TeamMark({
  name,
  logoUrl,
  size = 36,
}: {
  name: string;
  logoUrl: string | null;
  size?: number;
}) {
  const imageUrl = normaliseImageUrl(logoUrl);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <span
      className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.05] text-[10px] font-black text-white/65"
      style={{ width: size, height: size }}
    >
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt={`${name} badge`}
          fill
          sizes={`${size}px`}
          className="object-contain p-1"
          unoptimized
        />
      ) : (
        initials || "S"
      )}
    </span>
  );
}

function buildJsonLd() {
  const siteUrl = "https://www.sixfl.co.uk";

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SportsActivityLocation",
        "@id": `${siteUrl}${page.canonicalPath}#sports-location`,
        name: "SIXFL Harrogate 6-a-side football",
        url: `${siteUrl}${page.canonicalPath}`,
        sport: "Football",
        address: {
          "@type": "PostalAddress",
          addressLocality: "Harrogate",
          addressCountry: "GB",
        },
      },
      {
        "@type": "FAQPage",
        "@id": `${siteUrl}${page.canonicalPath}#faq`,
        mainEntity: page.faqs.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: faq.answer,
          },
        })),
      },
    ],
  };
}

export default async function HarrogateSixAsideFootballPage() {
  const league = await prisma.league.findFirst({
    where: { slug: HARROGATE_LEAGUE_SLUG, isActive: true },
    select: {
      id: true,
      name: true,
      slug: true,
      season: true,
      venueName: true,
      dayOfWeek: true,
      kickoffInfo: true,
      surface: true,
      description: true,
      heroImageUrl: true,
      badgeUrl: true,
      fixtures: {
        where: { publishedAt: { not: null } },
        orderBy: { kickoffAt: "asc" },
        select: {
          id: true,
          kickoffAt: true,
          status: true,
          homeTeam: {
            select: { id: true, name: true, logoUrl: true },
          },
          awayTeam: {
            select: { id: true, name: true, logoUrl: true },
          },
          result: {
            select: { homeScore: true, awayScore: true },
          },
        },
      },
    },
  });

  if (!league) {
    return <LocalSeoLandingPage page={page} />;
  }

  const standings = await getLeagueStandings(league.id);
  const now = new Date();
  const upcomingFixtures = league.fixtures
    .filter(
      (fixture) =>
        fixture.status === "SCHEDULED" && fixture.kickoffAt.getTime() >= now.getTime(),
    )
    .slice(0, 6);
  const recentResults = league.fixtures
    .filter((fixture) => fixture.status === "COMPLETED" && fixture.result)
    .sort((a, b) => b.kickoffAt.getTime() - a.kickoffAt.getTime())
    .slice(0, 5);
  const heroImageUrl =
    normaliseImageUrl(league.heroImageUrl) || "/venues/rossett_dark_trendy.jpg";
  const badgeUrl = normaliseImageUrl(league.badgeUrl) || "/sixfl-badge.png";
  const tableRows = standings.rows;

  return (
    <main className="min-h-screen bg-black text-white">
      <Script
        id="harrogate-sixfl-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildJsonLd()) }}
      />

      <section className="relative isolate overflow-hidden border-b border-white/10">
        <div className="absolute inset-0">
          <Image
            src={heroImageUrl}
            alt="Rossett Sports Centre Harrogate"
            fill
            priority
            className="object-cover object-center"
            unoptimized
          />
          <div className="absolute inset-0 bg-black/75" />
          <div className="absolute inset-0 bg-gradient-to-r from-black via-black/75 to-black/35" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_15%,rgba(16,185,129,0.24),transparent_32%)]" />
        </div>

        <div className="relative mx-auto grid min-h-[680px] max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:px-8 lg:py-20">
          <div className="max-w-4xl">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex rounded-full border border-emerald-300/25 bg-emerald-400/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.22em] text-emerald-200">
                Live Harrogate league
              </span>
              <span className="inline-flex rounded-full border border-white/10 bg-black/35 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-white/65">
                Tuesday evenings
              </span>
            </div>

            <h1 className="mt-6 text-4xl font-black tracking-tight sm:text-6xl lg:text-7xl">
              Harrogate 6-a-side football.
              <span className="block text-emerald-300">See the league before you join it.</span>
            </h1>

            <p className="mt-6 max-w-3xl text-base leading-8 text-white/75 sm:text-lg">
              Properly organised weekly football at {league.venueName || "Rossett Sports Centre"}, with referees, published fixtures, live results, a real league table and SIXFL TV matchday coverage.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link
                href="/register-interest?area=Harrogate&type=team&night=Tuesday"
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-emerald-300 px-6 text-sm font-black text-black transition hover:bg-emerald-200"
              >
                Join the Harrogate league
              </Link>
              <Link
                href="/register-interest?area=Harrogate&type=player&night=Tuesday"
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/15 bg-white/[0.07] px-6 text-sm font-black text-white transition hover:bg-white/10"
              >
                Join as a player
              </Link>
              <Link
                href={`/leagues/${league.slug}`}
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-sky-300/25 bg-sky-400/10 px-6 text-sm font-black text-sky-100 transition hover:bg-sky-400/15"
              >
                View full live league
              </Link>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-black/55 p-5 shadow-2xl shadow-black/40 backdrop-blur sm:p-6">
            <div className="flex items-center gap-4">
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-emerald-300/20 bg-black/50 p-2">
                <Image
                  src={badgeUrl}
                  alt={`${league.name} badge`}
                  fill
                  sizes="80px"
                  className="object-contain p-2"
                  unoptimized
                />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-300/75">
                  {league.season || "Current season"}
                </p>
                <h2 className="mt-1 text-2xl font-black">{league.name}</h2>
                <p className="mt-1 text-sm text-white/55">
                  {league.venueName || "Rossett Sports Centre"} · Tuesday
                </p>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              {[
                ["Team fee", `${formatMoney(TEAM_PRICE_PENCE)} / week`],
                ["Typical share", `around ${formatMoney(PLAYER_GUIDE_PENCE)} / player`],
                ["Venue", league.venueName || "Rossett Sports Centre"],
                ["Pitch", league.surface || "3G small-sided pitches"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
                    {label}
                  </p>
                  <p className="mt-2 text-sm font-bold text-white sm:text-base">{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-2xl border border-emerald-300/15 bg-emerald-400/[0.07] p-4 text-sm leading-6 text-emerald-50/80">
              <strong className="text-white">What £40 includes:</strong> your match slot, referee, league management, published fixtures, results and table updates.
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="grid gap-5 md:grid-cols-4">
          {[
            ["£40", "per team / per week", "Simple weekly pricing"],
            ["~£5", "per player", "For a typical contributing squad"],
            ["Tuesday", "match night", league.kickoffInfo || "Evening kick-offs"],
            [String(tableRows.length), "teams in the table", "A league you can inspect before joining"],
          ].map(([value, label, note]) => (
            <div key={label} className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
              <p className="text-3xl font-black text-white">{value}</p>
              <p className="mt-1 text-sm font-bold text-emerald-300">{label}</p>
              <p className="mt-3 text-xs leading-5 text-white/45">{note}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.035]">
            <div className="flex flex-col gap-4 border-b border-white/10 p-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-300/75">
                  Live standings
                </p>
                <h2 className="mt-2 text-3xl font-black tracking-tight">Harrogate league table</h2>
                <p className="mt-2 text-sm text-white/50">
                  This is the real current table — not a sample league.
                </p>
              </div>
              <Link
                href={`/leagues/${league.slug}`}
                className="text-sm font-bold text-emerald-300 hover:text-emerald-200"
              >
                Full table & stats →
              </Link>
            </div>

            <div className="overflow-x-auto">
              <div className="min-w-[690px]">
                <div className="grid grid-cols-[54px_minmax(240px,1fr)_52px_52px_52px_52px_68px_68px] gap-2 border-b border-white/10 bg-black/25 px-5 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">
                  <div>Pos</div>
                  <div>Team</div>
                  <div className="text-center">P</div>
                  <div className="text-center">W</div>
                  <div className="text-center">D</div>
                  <div className="text-center">L</div>
                  <div className="text-center">GD</div>
                  <div className="text-center">Pts</div>
                </div>

                <div className="divide-y divide-white/10">
                  {tableRows.map((row, index) => (
                    <div
                      key={row.teamId}
                      className="grid grid-cols-[54px_minmax(240px,1fr)_52px_52px_52px_52px_68px_68px] items-center gap-2 px-5 py-4 text-sm"
                    >
                      <div className="font-black text-white/60">{index + 1}</div>
                      <div className="flex min-w-0 items-center gap-3">
                        <TeamMark name={row.teamName} logoUrl={row.teamLogoUrl} />
                        <span className="truncate font-bold text-white">{row.teamName}</span>
                      </div>
                      <div className="text-center text-white/65">{row.played}</div>
                      <div className="text-center text-white/65">{row.won}</div>
                      <div className="text-center text-white/65">{row.drawn}</div>
                      <div className="text-center text-white/65">{row.lost}</div>
                      <div className="text-center text-white/65">
                        {formatGoalDifference(row.goalDifference)}
                      </div>
                      <div className="text-center font-black text-emerald-300">{row.points}</div>
                    </div>
                  ))}

                  <div className="grid grid-cols-[54px_minmax(240px,1fr)_52px_52px_52px_52px_68px_68px] items-center gap-2 bg-emerald-500/[0.08] px-5 py-4 text-sm">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full border border-emerald-300/30 bg-emerald-400/10 font-black text-emerald-300">
                      +
                    </div>
                    <div>
                      <p className="font-black text-white">Your team could be here</p>
                      <p className="mt-0.5 text-xs text-white/45">Join the Harrogate Tuesday league.</p>
                    </div>
                    <div className="col-span-6 flex justify-end">
                      <Link
                        href="/register-interest?area=Harrogate&type=team&night=Tuesday"
                        className="inline-flex min-h-9 items-center justify-center rounded-full bg-emerald-300 px-4 text-xs font-black text-black hover:bg-emerald-200"
                      >
                        Join this league
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div className="grid gap-6">
            <section className="rounded-[2rem] border border-sky-400/15 bg-sky-500/[0.05] p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-sky-200/70">
                    Match night
                  </p>
                  <h2 className="mt-2 text-2xl font-black">Next fixtures</h2>
                </div>
                <Link
                  href={`/leagues/${league.slug}/fixtures`}
                  className="text-xs font-bold text-sky-200 hover:text-sky-100"
                >
                  View all →
                </Link>
              </div>

              <div className="mt-5 space-y-3">
                {upcomingFixtures.length ? (
                  upcomingFixtures.map((fixture) => (
                    <div key={fixture.id} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/40">
                        {formatFixtureDate(fixture.kickoffAt)}
                      </p>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <TeamMark name={fixture.homeTeam.name} logoUrl={fixture.homeTeam.logoUrl} size={30} />
                          <span className="truncate text-sm font-bold">{fixture.homeTeam.name}</span>
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-[0.14em] text-sky-200/60">v</span>
                        <div className="flex min-w-0 items-center gap-2 text-right">
                          <span className="truncate text-sm font-bold">{fixture.awayTeam.name}</span>
                          <TeamMark name={fixture.awayTeam.name} logoUrl={fixture.awayTeam.logoUrl} size={30} />
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/10 p-5 text-sm text-white/45">
                    The next published Harrogate fixtures will appear here.
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-6">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/45">
                Recent action
              </p>
              <h2 className="mt-2 text-2xl font-black">Latest results</h2>
              <div className="mt-5 space-y-3">
                {recentResults.length ? (
                  recentResults.map((fixture) => (
                    <div key={fixture.id} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/35">
                        {formatResultDate(fixture.kickoffAt)}
                      </p>
                      <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-sm">
                        <span className="truncate font-bold">{fixture.homeTeam.name}</span>
                        <span className="rounded-lg bg-white/10 px-3 py-1 font-black text-white">
                          {fixture.result?.homeScore}–{fixture.result?.awayScore}
                        </span>
                        <span className="truncate text-right font-bold">{fixture.awayTeam.name}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/10 p-5 text-sm text-white/45">
                    Results will appear here as Harrogate match nights are completed.
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>

        <section className="mt-12 overflow-hidden rounded-[2rem] border border-emerald-400/20 bg-[radial-gradient(circle_at_85%_15%,rgba(16,185,129,0.16),transparent_32%),rgba(255,255,255,0.035)]">
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-stretch">
            <div className="relative min-h-[320px] overflow-hidden">
              <Image
                src={heroImageUrl}
                alt={`${league.venueName || "Rossett Sports Centre"} football pitches`}
                fill
                sizes="(max-width: 1024px) 100vw, 45vw"
                className="object-cover"
                unoptimized
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
              <div className="absolute bottom-5 left-5 right-5 rounded-2xl border border-white/10 bg-black/60 p-4 backdrop-blur">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300/75">
                  Harrogate venue
                </p>
                <p className="mt-1 text-xl font-black">{league.venueName || "Rossett Sports Centre"}</p>
              </div>
            </div>

            <div className="p-6 sm:p-8 lg:p-10">
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-300/75">
                Know where you are playing
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
                Tuesday football at Rossett Sports Centre.
              </h2>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-white/65 sm:text-base">
                No vague “Harrogate area” promise. The live SIXFL league is based at Rossett Sports Centre, with published match times and the venue shown before you commit.
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {[
                  ["Night", "Tuesday evenings"],
                  ["Surface", league.surface || "3G small-sided football pitches"],
                  ["Kick-offs", league.kickoffInfo || "Published evening times"],
                  ["Nearby", "Knaresborough · Pannal · Starbeck · Ripon"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">{label}</p>
                    <p className="mt-2 text-sm font-bold text-white/80">{value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  href={`/leagues/${league.slug}/fixtures`}
                  className="inline-flex min-h-11 items-center justify-center rounded-full bg-white px-5 text-sm font-black text-black hover:bg-white/90"
                >
                  See match times
                </Link>
                <Link
                  href="/register-interest?area=Harrogate&type=team&night=Tuesday"
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-emerald-300/25 bg-emerald-400/10 px-5 text-sm font-black text-emerald-100 hover:bg-emerald-400/15"
                >
                  Register a Harrogate team
                </Link>
              </div>
            </div>
          </div>
        </section>

        <SixflTvHomepageSection />

        {page.searchIntentHeading && page.searchIntentCopy?.length ? (
          <section className="mt-12 rounded-[2rem] border border-sky-400/15 bg-sky-500/[0.05] p-6 sm:p-8">
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-sky-200/70">
              Small-sided football in Harrogate
            </p>
            <h2 className="mt-2 text-3xl font-black tracking-tight">{page.searchIntentHeading}</h2>
            <div className="mt-5 max-w-4xl space-y-4 text-sm leading-7 text-white/62">
              {page.searchIntentCopy.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-12 rounded-[2rem] border border-white/10 bg-white/[0.035] p-6 sm:p-8">
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-white/40">FAQ</p>
          <h2 className="mt-2 text-3xl font-black tracking-tight">Harrogate 6-a-side questions</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {page.faqs.map((faq) => (
              <div key={faq.question} className="rounded-2xl border border-white/10 bg-black/25 p-5">
                <h3 className="font-bold text-white">{faq.question}</h3>
                <p className="mt-2 text-sm leading-6 text-white/60">{faq.answer}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12 overflow-hidden rounded-[2rem] border border-emerald-300/20 bg-emerald-400/[0.08] p-7 text-center sm:p-10">
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-300/75">
            Ready to play?
          </p>
          <h2 className="mx-auto mt-3 max-w-3xl text-3xl font-black tracking-tight sm:text-5xl">
            Put your team into the Harrogate league.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-white/65 sm:text-base">
            You have seen the venue, the teams, the table and the fixtures. Register your interest and SIXFL will confirm the current playing opportunity.
          </p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/register-interest?area=Harrogate&type=team&night=Tuesday"
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-emerald-300 px-7 text-sm font-black text-black hover:bg-emerald-200"
            >
              Register my team
            </Link>
            <Link
              href="/register-interest?area=Harrogate&type=player&night=Tuesday"
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/15 bg-black/20 px-7 text-sm font-black text-white hover:bg-black/30"
            >
              I’m looking for a team
            </Link>
          </div>
        </section>
      </section>
    </main>
  );
}
