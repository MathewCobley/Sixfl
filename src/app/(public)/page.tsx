// ========================================
// File: src/app/(public)/page.tsx
// ========================================

import Link from "next/link";

export const metadata = {
  title: "SIXFL | Harrogate & Northallerton 6-a-side football leagues",
  description:
    "Join SIXFL 6-a-side football leagues in Harrogate and Northallerton. View the live Harrogate Tuesday league at Rossett Sports Centre or register your team for the Northallerton Wednesday launch league.",
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
    eyebrow: "LIVE LEAGUE",
    title: "Harrogate Tuesday league",
    status: "Live now",
    body: "View fixtures, results, teams and league table updates for the SIXFL Harrogate league at Rossett Sports Centre.",
    primaryLabel: "View Harrogate league",
    primaryHref: harrogateLeagueLink,
    secondaryLabel: "Register interest",
    secondaryHref: generalTeamLink,
    featured: true,
  },
  {
    eyebrow: "NEW LEAGUE FORMING",
    title: "Northallerton Wednesday league",
    status: "Recruiting now",
    body: "Register your team for the new Wednesday night 6-a-side launch league in Northallerton. Teams, players and referees wanted.",
    primaryLabel: "View Northallerton launch",
    primaryHref: northallertonLeagueLink,
    secondaryLabel: "Register team",
    secondaryHref: northallertonTeamLink,
    featured: false,
  },
];

const homeStats = [
  { label: "Live league", value: "Harrogate" },
  { label: "Launch area", value: "Northallerton" },
  { label: "Format", value: "6-a-side" },
  { label: "Built for", value: "Captains" },
];

const whySixflPoints = [
  {
    title: "Reliable weekly fixtures",
    desc: "We build leagues properly so teams are not left with gaps, poor communication or unreliable opposition.",
  },
  {
    title: "Built for captains",
    desc: "Cleaner communication, smoother admin and a better experience than chasing everything in group chats.",
  },
  {
    title: "Proper match nights",
    desc: "Qualified referees, clear scheduling and stronger league management from day one.",
  },
];

const joinRoutes = [
  {
    title: "I have a team",
    desc: "Register a team for Northallerton or future SIXFL league launches.",
    href: generalTeamLink,
    cta: "Register team",
  },
  {
    title: "I need a team",
    desc: "Join the player list and hear when teams need extra players.",
    href: generalPlayerLink,
    cta: "Join as player",
  },
  {
    title: "I can referee",
    desc: "Register referee interest for live leagues and launch areas.",
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

      <main className="relative mx-auto max-w-6xl px-4 pb-20 pt-6 sm:px-6 lg:px-8">
        <section className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-[0_28px_100px_rgba(0,0,0,0.48)] backdrop-blur-xl sm:p-8 lg:p-10">
          <div className="mx-auto max-w-4xl text-center">
            <div className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-extrabold uppercase tracking-[0.22em] text-emerald-300">
              Harrogate live now • Northallerton recruiting now
            </div>

            <h1 className="mt-6 text-balance text-5xl font-extrabold leading-[0.95] tracking-tight sm:text-6xl lg:text-7xl">
              6-a-side football in Harrogate and Northallerton.
              <br />
              <span className="text-emerald-500 drop-shadow-[0_0_30px_rgba(16,185,129,0.55)]">
                Done properly.
              </span>
            </h1>

            <p className="mx-auto mt-6 max-w-3xl text-base leading-8 text-white/72 sm:text-lg">
              Play in the live Harrogate Tuesday league at Rossett Sports Centre,
              or register your team for the new Northallerton Wednesday launch
              league.
            </p>

            <div className="mt-5 flex flex-wrap justify-center gap-x-4 gap-y-2 text-[11px] font-bold tracking-[0.18em] text-emerald-300/90">
              {leagueTypes.map((type, index) => (
                <span key={type} className="inline-flex items-center">
                  {type}
                  {index < leagueTypes.length - 1 && (
                    <span className="ml-4 text-white/25">•</span>
                  )}
                </span>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href={harrogateLeagueLink}
                className="inline-flex h-12 items-center justify-center rounded-full bg-emerald-500 px-6 text-sm font-extrabold tracking-wide text-black transition hover:scale-[1.02] hover:bg-emerald-400"
              >
                VIEW HARROGATE LEAGUE
              </Link>

              <Link
                href={northallertonLeagueLink}
                className="inline-flex h-12 items-center justify-center rounded-full border border-emerald-500/25 bg-emerald-500/10 px-6 text-sm font-extrabold tracking-wide text-emerald-300 transition hover:bg-emerald-500/15"
              >
                JOIN NORTHALLERTON LAUNCH
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
          <div className="grid gap-3 rounded-3xl border border-white/10 bg-white/[0.05] p-4 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl md:grid-cols-4">
            {homeStats.map((stat) => (
              <StripItem key={stat.label} label={stat.label} value={stat.value} />
            ))}
          </div>
        </section>

        <section className="mt-16 grid gap-6 lg:grid-cols-2">
          <HarrogatePanel />
          <NorthallertonPanel />
        </section>

        <section id="why-sixfl" className="mt-16">
          <div className="mb-6">
            <div className="text-[11px] font-bold tracking-[0.24em] text-white/60">
              WHY SIXFL
            </div>
            <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              Built for a better league experience.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/60 sm:text-base">
              SIXFL is designed to feel more organised, more modern and more
              professional than the typical weekly 6-a-side setup.
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

        <section id="join-sixfl" className="mt-16">
          <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-6 shadow-[0_24px_90px_rgba(0,0,0,0.38)] backdrop-blur-xl sm:p-8">
            <div className="grid gap-8 lg:grid-cols-12 lg:items-center">
              <div className="lg:col-span-7">
                <div className="text-[11px] font-bold tracking-[0.24em] text-emerald-300">
                  TEAMS • PLAYERS • REFEREES
                </div>
                <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
                  Choose the route that fits you best.
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-white/70 sm:text-base">
                  Team captains, players and referees can all register interest.
                  Harrogate shows the live league, while Northallerton is the
                  next launch area being built.
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
      className={`rounded-[1.75rem] border p-6 shadow-[0_20px_80px_rgba(0,0,0,0.35)] ${
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
          className="inline-flex h-11 items-center justify-center rounded-full bg-emerald-500 px-5 text-sm font-extrabold tracking-wide text-black transition hover:scale-[1.02] hover:bg-emerald-400"
        >
          {primaryLabel}
        </Link>
        <Link
          href={secondaryHref}
          className="inline-flex h-11 items-center justify-center rounded-full border border-white/10 bg-white/5 px-5 text-sm font-extrabold tracking-wide text-white transition hover:bg-white/10"
        >
          {secondaryLabel}
        </Link>
      </div>
    </article>
  );
}

function HarrogatePanel() {
  return (
    <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/[0.08] p-6 shadow-[0_24px_90px_rgba(0,0,0,0.38)] backdrop-blur-xl sm:p-8">
      <div className="text-[11px] font-bold tracking-[0.24em] text-emerald-300">
        LIVE SIXFL LEAGUE
      </div>
      <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
        Harrogate Tuesday league at Rossett Sports Centre.
      </h2>
      <p className="mt-3 text-sm leading-7 text-white/70 sm:text-base">
        The Harrogate league gives new teams proof that SIXFL is already active:
        fixtures, results, teams and league table updates are live on the public
        league page.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <BenefitPill text="Live fixtures" />
        <BenefitPill text="League table" />
        <BenefitPill text="Results updates" />
        <BenefitPill text="Rossett Sports Centre" />
      </div>
      <Link
        href={harrogateLeagueLink}
        className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-full bg-emerald-500 px-6 text-sm font-extrabold tracking-wide text-black transition hover:scale-[1.02] hover:bg-emerald-400 sm:w-auto"
      >
        VIEW HARROGATE LEAGUE
      </Link>
    </div>
  );
}

function NorthallertonPanel() {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-6 shadow-[0_24px_90px_rgba(0,0,0,0.38)] backdrop-blur-xl sm:p-8">
      <div className="text-[11px] font-bold tracking-[0.24em] text-white/55">
        NEW LAUNCH AREA
      </div>
      <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
        Northallerton Wednesday league recruiting now.
      </h2>
      <p className="mt-3 text-sm leading-7 text-white/65 sm:text-base">
        SIXFL is building a new Wednesday night league in Northallerton. Teams,
        players and referees can register now before the start date is confirmed.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <BenefitPill text="No payment today" />
        <BenefitPill text="Teams wanted" />
        <BenefitPill text="Wednesday launch" />
        <BenefitPill text="Priority updates" />
      </div>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Link
          href={northallertonLeagueLink}
          className="inline-flex h-12 items-center justify-center rounded-full border border-white/15 bg-white/5 px-6 text-sm font-extrabold tracking-wide text-white transition hover:bg-white/10"
        >
          VIEW LAUNCH PAGE
        </Link>
        <Link
          href={northallertonTeamLink}
          className="inline-flex h-12 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-6 text-sm font-extrabold tracking-wide text-emerald-300 transition hover:bg-emerald-500/15"
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
    <div className="rounded-2xl border border-white/10 bg-black/35 px-4 py-5">
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">
        {label}
      </div>
      <div className="mt-2 text-2xl font-black tracking-tight text-white">
        {value}
      </div>
    </div>
  );
}

function PathwayCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-6 shadow-[0_18px_60px_rgba(0,0,0,0.28)] backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/[0.07]">
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
