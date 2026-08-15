// ========================================
// File: src/app/(public)/page.tsx
// ========================================

import Link from "next/link";

import HomepageAiPredictorSection, {
  type PredictorSampleTeamLogos,
} from "@/components/home/HomepageAiPredictorSection";
import HomepageLeagueDirectory from "@/components/home/HomepageLeagueDirectory";
import SixflTvHomepageSection from "@/components/home/SixflTvHomepageSection";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "SIXFL | North Yorkshire 6-a-side football leagues",
  description:
    "Find live SIXFL 6-a-side leagues and new leagues forming across North Yorkshire. View fixtures and tables or register as a team, player or referee.",
};

const generalRegisterLink = "/register-interest";
const generalTeamLink = "/register-interest?type=team";
const generalPlayerLink = "/register-interest?type=player";
const generalRefereeLink = "/register-interest?type=referee";
const predictorHomeTeamName = "Six Offenders";
const predictorAwayTeamName = "Crescent United";

const whySixflPoints = [
  {
    title: "Reliable weekly fixtures",
    desc: "Check schedules, venues and kick-off details before match night, with league information kept in one place.",
  },
  {
    title: "Clear league updates",
    desc: "Fixtures, results and tables are kept up to date so teams and players can follow the season easily.",
  },
  {
    title: "Welcoming match nights",
    desc: "Organised 6-a-side football for teams, individual players and referees across local launch areas.",
  },
];

const joinRoutes = [
  {
    title: "I have a team",
    desc: "Enter an existing team into a live or upcoming SIXFL league.",
    href: generalTeamLink,
    cta: "Register team",
  },
  {
    title: "I need a team",
    desc: "Join the player list and hear from teams looking for extra players.",
    href: generalPlayerLink,
    cta: "Join as player",
  },
  {
    title: "I can referee",
    desc: "Register referee interest for current and upcoming SIXFL match nights.",
    href: generalRefereeLink,
    cta: "Referee interest",
  },
];

function normaliseTeamName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

async function getPredictorSampleTeamLogos(): Promise<PredictorSampleTeamLogos> {
  try {
    const teams = await prisma.team.findMany({
      where: { name: { in: [predictorHomeTeamName, predictorAwayTeamName] } },
      select: { name: true, logoUrl: true },
    });

    const homeTeam = teams.find(
      (team) =>
        normaliseTeamName(team.name) === normaliseTeamName(predictorHomeTeamName),
    );
    const awayTeam = teams.find(
      (team) =>
        normaliseTeamName(team.name) === normaliseTeamName(predictorAwayTeamName),
    );

    return {
      homeLogoUrl: homeTeam?.logoUrl ?? null,
      awayLogoUrl: awayTeam?.logoUrl ?? null,
    };
  } catch {
    return { homeLogoUrl: null, awayLogoUrl: null };
  }
}

export default async function HomePage() {
  const predictorSampleTeamLogos = await getPredictorSampleTeamLogos();

  return (
    <div className="relative min-h-screen overflow-hidden bg-black text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_8%,rgba(16,185,129,0.18),transparent_24%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_12%,rgba(14,165,233,0.13),transparent_22%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.08),transparent_28%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.04),transparent_20%,rgba(0,0,0,0.78))]" />
        <div className="absolute inset-0 opacity-[0.08] bg-[linear-gradient(90deg,rgba(255,255,255,0.10)_1px,transparent_1px)] [background-size:56px_56px]" />
        <div className="absolute inset-0 opacity-[0.06] bg-[linear-gradient(0deg,rgba(255,255,255,0.10)_1px,transparent_1px)] [background-size:56px_56px]" />
      </div>

      <div className="pointer-events-none absolute left-1/2 top-20 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-[130px]" />

      <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-4 sm:px-6 sm:pb-20 sm:pt-6 lg:px-8">
        <section
          className="rounded-[1.5rem] border border-white/10 bg-white/[0.045] p-4 shadow-[0_28px_100px_rgba(0,0,0,0.48)] backdrop-blur-xl sm:rounded-[2rem] sm:p-8 lg:p-10"
          data-testid="homepage-hero"
        >
          <div className="max-w-5xl text-left">
            <div className="inline-flex max-w-full rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-center text-[10px] font-extrabold uppercase leading-5 tracking-[0.14em] text-emerald-300 sm:px-4 sm:text-xs sm:tracking-[0.22em]">
              Live leagues • New leagues forming across North Yorkshire
            </div>

            <h1 className="mt-6 max-w-4xl text-balance text-4xl font-extrabold leading-[0.98] tracking-tight sm:text-6xl sm:leading-[0.95] lg:text-7xl">
              Local 6-a-side football.
              <br />
              <span className="text-emerald-500 drop-shadow-[0_0_30px_rgba(16,185,129,0.55)]">
                Find your league — or help build the next one.
              </span>
            </h1>

            <p className="mt-6 max-w-3xl text-base leading-8 text-white/72 sm:text-lg">
              See the leagues already playing, then find the SIXFL launches currently recruiting teams and individual players. New areas appear here as soon as they start building.
            </p>

            <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <Link
                href="#live-leagues"
                className="inline-flex h-12 w-full items-center justify-center rounded-full bg-emerald-500 px-6 text-center text-sm font-extrabold tracking-wide text-black transition hover:scale-[1.02] hover:bg-emerald-400 sm:w-auto"
              >
                VIEW LIVE LEAGUES
              </Link>

              <Link
                href="#forming-leagues"
                className="inline-flex h-12 w-full items-center justify-center rounded-full border border-sky-400/35 bg-sky-400/10 px-6 text-center text-sm font-extrabold tracking-wide text-sky-100 transition hover:bg-sky-400/15 sm:w-auto"
              >
                NEW LEAGUES FORMING
              </Link>

              <Link
                href={generalRegisterLink}
                className="inline-flex h-12 w-full items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-6 text-center text-sm font-extrabold tracking-wide text-white/80 transition hover:bg-white/[0.08] sm:w-auto"
              >
                REGISTER
              </Link>
            </div>
          </div>

          <HomepageLeagueDirectory />
        </section>

        <SixflTvHomepageSection />
        <HomepageAiPredictorSection teamLogos={predictorSampleTeamLogos} />

        <section id="why-sixfl" className="mt-12 lg:mt-16">
          <div className="mb-6">
            <div className="text-[11px] font-bold tracking-[0.24em] text-white/60">
              WHY SIXFL
            </div>
            <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              Local 6-a-side made easier to follow.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/60 sm:text-base">
              From fixtures and results to registrations and league tables, SIXFL keeps the important details easy to find.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {whySixflPoints.map((point) => (
              <PathwayCard
                key={point.title}
                title={point.title}
                desc={point.desc}
              />
            ))}
          </div>
        </section>

        <section id="join-sixfl" className="mt-12 lg:mt-16">
          <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-5 shadow-[0_24px_90px_rgba(0,0,0,0.38)] backdrop-blur-xl sm:p-8">
            <div className="grid gap-8 lg:grid-cols-12 lg:items-center">
              <div className="lg:col-span-7">
                <div className="text-[11px] font-bold tracking-[0.24em] text-emerald-300">
                  JOIN SIXFL
                </div>
                <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
                  Your area can be the next SIXFL league.
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-white/70 sm:text-base">
                  Choose a live league, register for one that is forming now, or tell us where you want SIXFL to launch next. Teams, individual players and referees can all register interest.
                </p>

                <div className="mt-6 flex flex-wrap gap-3">
                  <Link
                    href="/bring-sixfl-to-your-area"
                    className="inline-flex min-h-11 items-center justify-center rounded-full border border-emerald-400/25 bg-emerald-500/10 px-5 text-sm font-black text-emerald-100 transition hover:bg-emerald-500/15"
                  >
                    Bring SIXFL to your area
                  </Link>
                  <Link
                    href={generalRegisterLink}
                    className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-black/25 px-5 text-sm font-black text-white/80 transition hover:bg-black/40"
                  >
                    See all registration options
                  </Link>
                </div>
              </div>

              <div className="grid gap-3 lg:col-span-5">
                {joinRoutes.map((route, index) => (
                  <FunnelCard
                    key={route.title}
                    title={route.title}
                    desc={route.desc}
                    href={route.href}
                    cta={route.cta}
                    featured={index === 0}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function FunnelCard({
  title,
  desc,
  href,
  cta,
  featured = false,
}: {
  title: string;
  desc: string;
  href: string;
  cta: string;
  featured?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`block rounded-2xl border p-4 transition ${
        featured
          ? "border-emerald-500/30 bg-emerald-500/[0.08] hover:bg-emerald-500/[0.12]"
          : "border-white/10 bg-black/40 hover:border-emerald-500/30 hover:bg-black/50"
      }`}
    >
      <div className="text-sm font-bold text-white">{title}</div>
      <div className="mt-1 text-sm text-white/60">{desc}</div>
      <div className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-emerald-400">
        {cta} →
      </div>
    </Link>
  );
}

function PathwayCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.28)] backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/[0.07] sm:p-6">
      <div className="text-[11px] font-bold tracking-[0.24em] text-white/55">
        SIXFL BENEFIT
      </div>
      <div className="mt-2 text-2xl font-black tracking-tight text-white">
        {title}
      </div>
      <div className="mt-3 text-sm leading-7 text-white/60">{desc}</div>
      <div className="mt-6 h-px w-full bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent" />
    </div>
  );
}
