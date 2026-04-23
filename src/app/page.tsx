// ========================================
// File: src/app/page.tsx
// ========================================

import Link from "next/link";

const launchAreas = ["York", "Leeds", "Harrogate", "Ripon"];

const leagueTypes = ["MEN’S LEAGUES", "WOMEN’S LEAGUES", "YOUTH LEAGUES"];

const whySixflPoints = [
  {
    title: "Proper weekly structure",
    desc: "Fixed match nights, organised fixtures and a league setup teams can actually rely on.",
  },
  {
    title: "Built for captains",
    desc: "Cleaner communication, smoother admin and a better experience than chasing everything in group chats.",
  },
  {
    title: "More professional matchdays",
    desc: "Fully qualified referees, clear scheduling and a stronger standard of league management from day one.",
  },
];

const joinSteps = [
  {
    number: "01",
    title: "Choose your route",
    desc: "Register as a team, player or referee depending on how you want to get involved.",
  },
  {
    number: "02",
    title: "Tell us your area",
    desc: "Let us know where you want to play so we can match you to the right launch area.",
  },
  {
    number: "03",
    title: "Get confirmed",
    desc: "We review your details, confirm availability and contact you with the next steps.",
  },
];

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-black text-white">
      {/* Background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(16,185,129,0.16),transparent_24%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_18%,rgba(16,185,129,0.10),transparent_18%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.08),transparent_28%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.04),transparent_20%,rgba(0,0,0,0.7))]" />
        <div className="absolute inset-0 opacity-[0.08] bg-[linear-gradient(90deg,rgba(255,255,255,0.10)_1px,transparent_1px)] [background-size:56px_56px]" />
        <div className="absolute inset-0 opacity-[0.06] bg-[linear-gradient(0deg,rgba(255,255,255,0.10)_1px,transparent_1px)] [background-size:56px_56px]" />
      </div>

      {/* Hero spotlight */}
      <div className="pointer-events-none absolute left-1/2 top-24 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-[120px]" />

      <main className="relative mx-auto max-w-6xl px-4 pb-20 pt-0">
        {/* HERO */}
        <section className="grid gap-10 pt-6 lg:grid-cols-12 lg:items-start">
          {/* LEFT */}
          <div className="lg:col-span-7">
            <h1 className="text-balance text-5xl font-extrabold leading-[0.95] tracking-tight sm:text-6xl">
              6-A-SIDE.
              <br />
              <span className="text-white">DONE</span>{" "}
              <span className="text-emerald-500 drop-shadow-[0_0_30px_rgba(16,185,129,0.6)] motion-safe:animate-pulse">
                PROPERLY.
              </span>
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-7 text-white/70 sm:text-lg">
              Weekly 6-a-side leagues with proper fixtures, live tables and a
              cleaner experience for captains, players and referees.
            </p>

            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/55 sm:text-base">
              Launching men’s, women’s and youth leagues across selected areas.
              Register early to secure updates and first access when places open.
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

            {/* HERO CTA */}
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                href="/register-interest?type=team"
                className="inline-flex h-11 items-center justify-center rounded-full bg-emerald-500 px-5 text-[13px] font-extrabold tracking-wide text-black transition hover:scale-[1.02] hover:bg-emerald-400"
              >
                REGISTER YOUR TEAM
              </Link>

              <Link
                href="/register-interest?type=player"
                className="inline-flex h-11 items-center justify-center rounded-full border border-white/10 bg-white/5 px-5 text-[13px] font-extrabold tracking-wide text-white transition hover:bg-white/10"
              >
                JOIN AS A PLAYER
              </Link>
            </div>

            <div className="mt-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-4 text-sm text-white/80">
              Looking for a league near you? Explore our{" "}
              <Link
                href="/leagues/rossett-mens-tuesday"
                className="font-semibold text-emerald-300 underline underline-offset-4 transition hover:text-emerald-200"
              >
                Harrogate 6 a side football league
              </Link>{" "}
              at Rossett Sports Centre, with live fixtures, results and league table updates.
            </div>
          </div>

          {/* RIGHT FUNNEL PANEL */}
          <div className="lg:col-span-5">
            <div className="lg:sticky lg:top-24">
              <div className="rounded-[28px] border border-white/10 bg-white/[0.06] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-bold tracking-[0.24em] text-white/65">
                    JOIN SIXFL
                  </div>

                  <div className="rounded-full border border-white/10 bg-black/40 px-3 py-1 text-[10px] font-bold tracking-[0.18em] text-white/45">
                    EARLY ACCESS
                  </div>
                </div>

                <h2 className="mt-5 text-2xl font-black tracking-tight text-white">
                  Choose your route in.
                </h2>

                <p className="mt-2 text-sm leading-7 text-white/60">
                  Team captains, players, parents, coaches and referees can all
                  register interest for the first SIXFL launch.
                </p>

                <div className="mt-6 grid gap-3">
                  <FunnelCard
                    title="I have a team"
                    desc="Register a men’s, women’s or youth team for early launch access."
                    href="/register-interest?type=team"
                    cta="Register your team"
                    featured
                  />

                  <FunnelCard
                    title="I need a team"
                    desc="Join the player list and hear when squads or leagues need players."
                    href="/register-interest?type=player"
                    cta="Join as player"
                  />

                  <FunnelCard
                    title="I can referee"
                    desc="Register interest to referee in SIXFL leagues from launch."
                    href="/register-interest?type=referee"
                    cta="Referee interest"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* STRIP */}
        <section className="mt-10">
          <div className="grid gap-3 rounded-[28px] border border-white/10 bg-white/[0.05] p-4 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl md:grid-cols-4">
            <StripItem label="FOUNDING SEASON" value="Now Forming" />
            <StripItem label="LEAGUE TYPES" value="Men’s / Women’s / Youth" />
            <StripItem label="TEAM SPACES" value="12 Per League" />
            <StripItem label="LAUNCH FOCUS" value="North Yorkshire" />
          </div>
        </section>

        {/* WHY SIXFL */}
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

        {/* HOW JOINING WORKS */}
        <section id="how-it-works" className="mt-16">
          <div className="rounded-[32px] border border-white/10 bg-white/[0.05] p-6 shadow-[0_24px_90px_rgba(0,0,0,0.38)] backdrop-blur-xl sm:p-8">
            <div className="mb-6 max-w-3xl">
              <div className="text-[11px] font-bold tracking-[0.24em] text-emerald-300">
                HOW JOINING WORKS
              </div>
              <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
                Getting started with SIXFL is simple.
              </h2>
              <p className="mt-3 text-sm leading-7 text-white/65 sm:text-base">
                Whether you already have a team, need a team, or want to
                referee, the process is straightforward. Register your interest,
                tell us your area, and we will guide you through the next steps.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {joinSteps.map((step) => (
                <StepCard
                  key={step.number}
                  number={step.number}
                  title={step.title}
                  desc={step.desc}
                />
              ))}
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link
                href="/register-interest?type=team"
                className="inline-flex h-12 items-center justify-center rounded-full bg-emerald-500 px-6 text-sm font-extrabold tracking-wide text-black transition hover:scale-[1.02] hover:bg-emerald-400"
              >
                REGISTER YOUR TEAM
              </Link>

              <Link
                href="/register-interest?type=player"
                className="inline-flex h-12 items-center justify-center rounded-full border border-white/10 bg-white/5 px-6 text-sm font-extrabold tracking-wide text-white transition hover:bg-white/10"
              >
                JOIN AS A PLAYER
              </Link>

              <Link
                href="/faq"
                className="inline-flex h-12 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-6 text-sm font-extrabold tracking-wide text-emerald-300 transition hover:bg-emerald-500/15"
              >
                READ FAQS
              </Link>
            </div>
          </div>
        </section>

        {/* FOUNDING TEAMS */}
        <section id="founding-teams" className="mt-16">
          <div className="rounded-[32px] border border-emerald-500/20 bg-emerald-500/[0.08] p-6 shadow-[0_24px_90px_rgba(0,0,0,0.38)] backdrop-blur-xl sm:p-8">
            <div className="grid gap-8 lg:grid-cols-12 lg:items-center">
              <div className="lg:col-span-7">
                <div className="text-[11px] font-bold tracking-[0.24em] text-emerald-300">
                  FOUNDING TEAM OFFER
                </div>
                <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
                  Early teams may be considered for a free SIXFL kit.
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-white/75 sm:text-base">
                  To mark the launch of SIXFL, a limited number of founding
                  teams may qualify for a free team kit offer. Register early to
                  be considered and to get priority launch updates as the first
                  leagues take shape.
                </p>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <BenefitPill text="Limited launch offer" />
                  <BenefitPill text="Priority launch updates" />
                  <BenefitPill text="Early league access" />
                  <BenefitPill text="Founding team status" />
                </div>

                <div className="mt-6 text-xs font-bold tracking-[0.16em] text-white/55">
                  SELECTED TEAMS ONLY • SUBJECT TO AVAILABILITY • LAUNCH LEAGUES
                </div>
              </div>

              <div className="lg:col-span-5">
                <div className="rounded-[24px] border border-white/10 bg-black/35 p-5">
                  <div className="text-[11px] font-bold tracking-[0.2em] text-emerald-300">
                    TEAM CAPTAINS
                  </div>
                  <div className="mt-2 text-xl font-black text-white">
                    Want to know more about the founding team offer?
                  </div>
                  <p className="mt-2 text-sm leading-6 text-white/65">
                    See how the offer works, who it is for, and how to register
                    your team for early consideration.
                  </p>

                  <div className="mt-5 grid gap-3">
                    <Link
                      href="/register-interest?type=team"
                      className="inline-flex h-12 items-center justify-center rounded-full bg-emerald-500 px-6 text-sm font-extrabold tracking-wide text-black transition hover:scale-[1.02] hover:bg-emerald-400"
                    >
                      REGISTER YOUR TEAM
                    </Link>

                    <Link
                      href="/founding-teams"
                      className="inline-flex h-12 items-center justify-center rounded-full border border-white/15 bg-white/5 px-6 text-sm font-bold tracking-wide text-white transition hover:bg-white/10"
                    >
                      LEARN ABOUT THE OFFER
                    </Link>

                    <div className="rounded-full border border-white/10 bg-white/5 px-4 py-3 text-center text-xs font-bold tracking-[0.14em] text-white/80">
                      EARLY TEAMS MAY QUALIFY FOR A FREE KIT
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* WAITLIST CTA */}
        <section id="lead-capture" className="mt-16">
          <div className="rounded-[32px] border border-emerald-500/20 bg-emerald-500/[0.08] p-6 shadow-[0_24px_90px_rgba(0,0,0,0.38)] backdrop-blur-xl sm:p-8">
            <div className="grid gap-8 lg:grid-cols-12 lg:items-center">
              <div className="lg:col-span-7">
                <div className="text-[11px] font-bold tracking-[0.24em] text-emerald-300">
                  PLAYERS • REFEREES • YOUTH INTEREST
                </div>
                <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
                  Not a team captain? Start here.
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-white/70 sm:text-base">
                  Players, referees, parents and youth organisers can register
                  interest here and we’ll guide you to the right route as SIXFL
                  launches in your area.
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

              <div className="lg:col-span-5">
                <div className="rounded-[24px] border border-white/10 bg-black/35 p-5">
                  <div className="text-sm font-bold text-white">
                    Choose the route that fits you best.
                  </div>
                  <p className="mt-2 text-sm leading-6 text-white/60">
                    Team captains, players and referees can all register
                    interest in a few quick steps.
                  </p>

                  <div className="mt-5 grid gap-3">
                    <Link
                      href="/register-interest?type=team"
                      className="inline-flex h-12 items-center justify-center rounded-full bg-emerald-500 px-6 text-sm font-extrabold tracking-wide text-black transition hover:scale-[1.02] hover:bg-emerald-400"
                    >
                      REGISTER YOUR TEAM
                    </Link>

                    <Link
                      href="/register-interest?type=player"
                      className="inline-flex h-12 items-center justify-center rounded-full border border-white/10 bg-white/5 px-6 text-sm font-extrabold tracking-wide text-white transition hover:bg-white/10"
                    >
                      JOIN AS A PLAYER
                    </Link>

                    <Link
                      href="/register-interest?type=referee"
                      className="inline-flex h-12 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-6 text-sm font-extrabold tracking-wide text-emerald-300 transition hover:bg-emerald-500/15"
                    >
                      REFEREE FOR SIXFL
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
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
      <div className="text-[10px] font-bold tracking-[0.18em] text-white/45">
        {label}
      </div>
      <div className="mt-2 text-2xl font-black tracking-tight text-white">
        {value}
      </div>
    </div>
  );
}

function PathwayCard({
  title,
  desc,
}: {
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6 shadow-[0_18px_60px_rgba(0,0,0,0.28)] backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/[0.07]">
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

function StepCard({
  number,
  title,
  desc,
}: {
  number: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6 shadow-[0_18px_60px_rgba(0,0,0,0.22)] backdrop-blur">
      <div className="text-[11px] font-bold tracking-[0.24em] text-emerald-400">
        {number}
      </div>
      <div className="mt-3 text-xl font-black tracking-tight text-white">
        {title}
      </div>
      <div className="mt-3 text-sm leading-7 text-white/60">{desc}</div>
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
