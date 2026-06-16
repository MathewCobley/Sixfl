// ========================================
// File: src/app/(public)/page.tsx
// ========================================

import Link from "next/link";

export const metadata = {
  title: "SIXFL | Harrogate & Northallerton 6-a-side football leagues",
  description:
    "Find local SIXFL 6-a-side football leagues in Harrogate and Northallerton. View fixtures, results and tables, or register interest as a team, player or referee.",
};

const harrogateLeagueLink = "/leagues/rossett-mens-tuesday";
const northallertonLeagueLink = "/leagues/northallerton-mens-wednesday";
const northallertonTeamLink =
  "/register-interest?type=team&area=Northallerton&night=Wednesday";
const northallertonPlayerLink =
  "/register-interest?type=player&area=Northallerton&night=Wednesday";
const northallertonRefereeLink =
  "/register-interest?type=referee&area=Northallerton&night=Wednesday";
const generalTeamLink = "/register-interest?type=team";
const generalPlayerLink = "/register-interest?type=player";
const generalRefereeLink = "/register-interest?type=referee";

const leagueTypes = ["MEN’S LEAGUES", "WOMEN’S LEAGUES", "YOUTH LEAGUES"];

const areaCards = [
  {
    eyebrow: "LIVE HARROGATE LEAGUE",
    title: "Harrogate Tuesday 6-a-side",
    status: "Fixtures live",
    body: "See upcoming fixtures, recent results, teams and the current league table for the Tuesday 6-a-side league at Rossett Sports Centre.",
    primaryLabel: "View league",
    primaryHref: harrogateLeagueLink,
    secondaryLabel: "Register interest",
    secondaryHref: generalTeamLink,
    featured: true,
  },
  {
    eyebrow: "NORTHALLERTON LAUNCH",
    title: "Northallerton Wednesday 6-a-side",
    status: "Registrations open",
    body: "Northallerton team entries are open for the upcoming Wednesday night 6-a-side league. Individual players and referees can also register interest.",
    primaryLabel: "View launch page",
    primaryHref: northallertonLeagueLink,
    secondaryLabel: "Register team",
    secondaryHref: northallertonTeamLink,
    featured: false,
  },
];

const homeStats = [
  { label: "Live fixtures", value: "Harrogate" },
  { label: "New league", value: "Northallerton" },
  { label: "Format", value: "6-a-side" },
  { label: "Open to", value: "Teams & players" },
];

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

const launchAreas = ["Harrogate", "Northallerton", "Ripon", "York", "Leeds"];

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-black text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_8%,rgba(16,185,129,0.18),transparent_24%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_12%,rgba(16,185,129,0.12),transparent_22%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.08),transparent_28%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.04),transparent_20%,rgba(0,0,0,0.78))]" />
        <div className="absolute inset-0 opacity-[0.08] bg-[linear-gradient(90deg,rgba(255,255,255,0.10)_1px,transparent_1px)] [background-size:56px_56px]" />
        <div className="absolute inset-0 opacity-[0.06] bg-[linear-gradient(0deg,rgba(255,255,255,0.10)_1px,transparent_1px)] [background-size:56px_56px]" />
      </div>

      <div className="pointer-events-none absolute left-1/2 top-20 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-[130px]" />

      <main className="relative mx-auto max-w-6xl px-4 pb-16 pt-4 sm:px-6 sm:pb-20 sm:pt-6 lg:px-8">
        <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.045] p-4 shadow-[0_28px_100px_rgba(0,0,0,0.48)] backdrop-blur-xl sm:rounded-[2rem] sm:p-8 lg:p-10">
          <div className="max-w-5xl text-left">
            <div className="inline-flex max-w-full rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-center text-[10px] font-extrabold uppercase leading-5 tracking-[0.14em] text-emerald-300 sm:px-4 sm:text-xs sm:tracking-[0.22em]">
              Harrogate live now • Northallerton registrations open
            </div>

            <h1 className="mt-6 max-w-4xl text-balance text-4xl font-extrabold leading-[0.98] tracking-tight sm:text-6xl sm:leading-[0.95] lg:text-7xl">
              Local 6-a-side football in Harrogate and Northallerton.
              <br />
              <span className="text-emerald-500 drop-shadow-[0_0_30px_rgba(16,185,129,0.55)]">
                Easy to join. Easy to follow.
              </span>
            </h1>

            <p className="mt-6 max-w-3xl text-base leading-8 text-white/72 sm:text-lg">
              Find a local SIXFL league, check live fixtures and tables, or
              register interest for an upcoming launch as a team, player or
              referee.
            </p>

            <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-[11px] font-bold tracking-[0.18em] text-emerald-300/90">
              {leagueTypes.map((type, index) => (
                <span key={type} className="inline-flex items-center">
                  {type}
                  {index < leagueTypes.length - 1 && (
                    <span className="ml-4 text-white/25">•</span>
                  )}
                </span>
              ))}
            </div>

            <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <Link
                href={harrogateLeagueLink}
                className="inline-flex h-12 w-full items-center justify-center rounded-full bg-emerald-500 px-6 text-center text-sm font-extrabold tracking-wide text-black transition hover:scale-[1.02] hover:bg-emerald-400 sm:w-auto"
              >
                VIEW HARROGATE LEAGUE
              </Link>

              <Link
                href={northallertonLeagueLink}
                className="inline-flex h-12 w-full items-center justify-center rounded-full border border-emerald-500/25 bg-emerald-500/10 px-6 text-center text-sm font-extrabold tracking-wide text-emerald-300 transition hover:bg-emerald-500/15 sm:w-auto"
              >
                REGISTER INTEREST
              </Link>
            </div>
          </div>

          <div className="mt-10 grid gap-4 lg:grid-cols-2">
            {areaCards.map((area) => (
              <AreaCard key={area.title} {...area} />
            ))}
          </div>
        </section>

        <section className="mt-10">
          <div className="grid grid-cols-2 gap-3 rounded-3xl border border-white/10 bg-white/[0.05] p-3 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-4 md:grid-cols-4">
            {homeStats.map((stat) => (
              <StripItem key={stat.label} label={stat.label} value={stat.value} />
            ))}
          </div>
        </section>

        <section className="mt-12 grid gap-6 lg:mt-16 lg:grid-cols-2">
          <HarrogatePanel />
          <NorthallertonPanel />
        </section>

        <section id="why-sixfl" className="mt-12 lg:mt-16">
          <div className="mb-6">
            <div className="text-[11px] font-bold tracking-[0.24em] text-white/60">
              WHY SIXFL
            </div>
            <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              Local 6-a-side made easier to follow.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/60 sm:text-base">
              From fixtures and results to registrations and league tables,
              SIXFL keeps the important details easy to find.
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
                  JOIN A LEAGUE
                </div>
                <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
                  Get involved with SIXFL.
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-white/70 sm:text-base">
                  Teams, individual players and referees can register interest
                  for live leagues and new launch areas. Harrogate is live now,
                  and Northallerton registrations are open.
                </p>

                <div className="mt-5 flex flex-wrap gap-2">
                  {launchAreas.map((area) => (
                    <span
                      key={area}
                      className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-[11px] font-bold text-white/80"
                    >
                      {area}
                    </span>
                  ))}
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
      </main>
    </div>
  );
}

function AreaCard({
  eyebrow,
  title,
  status,
  body,
  primaryLabel,
  primaryHref,
  secondaryLabel,
  secondaryHref,
  featured,
}: {
  eyebrow: string;
  title: string;
  status: string;
  body: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel: string;
  secondaryHref: string;
  featured: boolean;
}) {
  return (
    <article
      className={`rounded-[1.5rem] border p-4 shadow-[0_20px_80px_rgba(0,0,0,0.35)] sm:rounded-[1.75rem] sm:p-6 ${
        featured
          ? "border-emerald-500/25 bg-emerald-500/[0.08]"
          : "border-white/10 bg-black/35"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/55">
          {eyebrow}
        </div>
        <div
          className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${
            featured
              ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
              : "border-white/10 bg-white/5 text-white/75"
          }`}
        >
          {status}
        </div>
      </div>

      <h2 className="mt-5 text-2xl font-black tracking-tight text-white sm:text-3xl">
        {title}
      </h2>
      <p className="mt-3 text-sm leading-7 text-white/66 sm:text-base">
        {body}
      </p>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Link
          href={primaryHref}
          className="inline-flex h-11 w-full items-center justify-center rounded-full bg-emerald-500 px-5 text-center text-sm font-extrabold tracking-wide text-black transition hover:scale-[1.02] hover:bg-emerald-400 sm:w-auto"
        >
          {primaryLabel}
        </Link>
        <Link
          href={secondaryHref}
          className="inline-flex h-11 w-full items-center justify-center rounded-full border border-white/10 bg-white/5 px-5 text-center text-sm font-extrabold tracking-wide text-white transition hover:bg-white/10 sm:w-auto"
        >
          {secondaryLabel}
        </Link>
      </div>
    </article>
  );
}

function HarrogatePanel() {
  return (
    <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/[0.08] p-5 shadow-[0_24px_90px_rgba(0,0,0,0.38)] backdrop-blur-xl sm:p-8">
      <div className="text-[11px] font-bold tracking-[0.24em] text-emerald-300">
        HARROGATE LEAGUE LIVE
      </div>
      <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
        Harrogate Tuesday 6-a-side at Rossett Sports Centre.
      </h2>
      <p className="mt-3 text-sm leading-7 text-white/70 sm:text-base">
        Follow the public league page for upcoming fixtures, recent results,
        participating teams and the current table.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <BenefitPill text="Fixtures & kick-offs" />
        <BenefitPill text="League table" />
        <BenefitPill text="Results" />
        <BenefitPill text="Rossett Sports Centre" />
      </div>
      <Link
        href={harrogateLeagueLink}
        className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-full bg-emerald-500 px-6 text-center text-sm font-extrabold tracking-wide text-black transition hover:scale-[1.02] hover:bg-emerald-400 sm:w-auto"
      >
        VIEW HARROGATE LEAGUE
      </Link>
    </div>
  );
}

function NorthallertonPanel() {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-5 shadow-[0_24px_90px_rgba(0,0,0,0.38)] backdrop-blur-xl sm:p-8">
      <div className="text-[11px] font-bold tracking-[0.24em] text-white/55">
        NORTHALLERTON REGISTRATIONS OPEN
      </div>
      <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
        Northallerton Wednesday 6-a-side recruiting now.
      </h2>
      <p className="mt-3 text-sm leading-7 text-white/65 sm:text-base">
        Register interest for the upcoming Wednesday night league in
        Northallerton. Team entries, individual players and referees are
        welcome.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <BenefitPill text="Free to register" />
        <BenefitPill text="Team entries open" />
        <BenefitPill text="Wednesday nights" />
        <BenefitPill text="Player/referee interest" />
      </div>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Link
          href={northallertonLeagueLink}
          className="inline-flex h-12 w-full items-center justify-center rounded-full border border-white/15 bg-white/5 px-6 text-center text-sm font-extrabold tracking-wide text-white transition hover:bg-white/10 sm:w-auto"
        >
          VIEW LAUNCH PAGE
        </Link>
        <Link
          href={northallertonTeamLink}
          className="inline-flex h-12 w-full items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-6 text-center text-sm font-extrabold tracking-wide text-emerald-300 transition hover:bg-emerald-500/15 sm:w-auto"
        >
          REGISTER TEAM
        </Link>
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

function StripItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/35 px-3 py-4 sm:px-4 sm:py-5">
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45 sm:tracking-[0.18em]">
        {label}
      </div>
      <div className="mt-2 text-xl font-black tracking-tight text-white sm:text-2xl">
        {value}
      </div>
    </div>
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

function BenefitPill({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-semibold text-white/85">
      ✓ {text}
    </div>
  );
}
