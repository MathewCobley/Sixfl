// ========================================
// File: src/app/(public)/leagues/northallerton-mens-wednesday/page.tsx
// ========================================

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Northallerton Wednesday 6-a-side football league | SIXFL",
  description:
    "Register your team for the new SIXFL Wednesday 6-a-side football league in Northallerton. Recruiting teams, players and referees now.",
};

const teamInterestHref =
  "/register-interest?type=team&area=Northallerton&night=Wednesday";
const playerInterestHref =
  "/register-interest?type=player&area=Northallerton&night=Wednesday";
const refereeInterestHref =
  "/register-interest?type=referee&area=Northallerton&night=Wednesday";

const launchStats = [
  { label: "Area", value: "Northallerton" },
  { label: "Night", value: "Wednesday" },
  { label: "Format", value: "6-a-side" },
  { label: "Status", value: "Recruiting now" },
];

const sellingPoints = [
  {
    title: "Built before it launches",
    body: "We only start once there are enough committed teams, so the league feels organised from week one instead of rushed together.",
  },
  {
    title: "Reliable weekly fixtures",
    body: "Clear communication, confirmed teams and a proper match-night setup help reduce gaps, confusion and last-minute problems.",
  },
  {
    title: "Cleaner captain experience",
    body: "Captains get a more professional league setup with clear next steps, fixtures, results and updates handled properly.",
  },
];

const joinSteps = [
  {
    number: "01",
    title: "Register your team",
    body: "Leave your captain details, team name and interest in the Northallerton Wednesday league.",
  },
  {
    number: "02",
    title: "We build the league list",
    body: "We speak to local teams, players and referees, then keep interested captains updated as the launch group fills.",
  },
  {
    number: "03",
    title: "Launch when ready",
    body: "Once enough committed teams are ready, we confirm venue details, start date, fixtures and captain next steps.",
  },
];

const faqs = [
  {
    question: "Is the Northallerton league live yet?",
    answer:
      "It is currently recruiting. Teams can register now and will be contacted as the launch group builds.",
  },
  {
    question: "Do we need to pay now?",
    answer:
      "No. This is an interest registration stage. We will confirm costs, start date and match-night details before asking teams to commit.",
  },
  {
    question: "Can individual players register?",
    answer:
      "Yes. Players without a team can join the player list and we can use that interest to help form or support squads.",
  },
  {
    question: "Can referees register?",
    answer:
      "Yes. Referees can register interest for Northallerton and future SIXFL areas.",
  },
];

export default function NorthallertonMensWednesdayLeaguePage() {
  return (
    <div className="min-h-screen overflow-hidden bg-black text-white">
      <main className="relative mx-auto max-w-7xl px-4 pb-20 pt-8 sm:px-6 lg:px-8">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-0 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-emerald-500/15 blur-[130px]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(16,185,129,0.18),transparent_28%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_18%,rgba(255,255,255,0.09),transparent_22%)]" />
          <div className="absolute inset-0 opacity-[0.08] bg-[linear-gradient(90deg,rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:64px_64px]" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/20 to-black" />
        </div>

        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/"
            className="inline-flex h-10 items-center rounded-full border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            ← Back to SIXFL
          </Link>

          <Link
            href={teamInterestHref}
            className="inline-flex h-10 items-center rounded-full bg-emerald-500 px-4 text-sm font-extrabold text-black transition hover:bg-emerald-400"
          >
            Register team
          </Link>
        </div>

        <section className="grid gap-8 rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-[0_28px_100px_rgba(0,0,0,0.48)] backdrop-blur-xl sm:p-8 lg:grid-cols-12 lg:items-center lg:p-10">
          <div className="lg:col-span-7">
            <div className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-[11px] font-extrabold uppercase tracking-[0.24em] text-emerald-300">
              New league forming • Northallerton Wednesdays
            </div>

            <h1 className="mt-6 max-w-4xl text-balance text-5xl font-black leading-[0.95] tracking-tight sm:text-6xl lg:text-7xl">
              Northallerton 6-a-side football league.
            </h1>

            <p className="mt-6 max-w-2xl text-base leading-8 text-white/72 sm:text-lg">
              SIXFL is recruiting teams for a new Wednesday night 6-a-side
              football league in Northallerton. Register your team now and we
              will keep you updated as the launch group builds.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href={teamInterestHref}
                className="inline-flex h-12 items-center justify-center rounded-full bg-emerald-500 px-6 text-sm font-extrabold tracking-wide text-black transition hover:scale-[1.02] hover:bg-emerald-400"
              >
                REGISTER YOUR TEAM
              </Link>

              <Link
                href={playerInterestHref}
                className="inline-flex h-12 items-center justify-center rounded-full border border-white/10 bg-white/5 px-6 text-sm font-extrabold tracking-wide text-white transition hover:bg-white/10"
              >
                JOIN AS A PLAYER
              </Link>
            </div>

            <p className="mt-5 text-sm font-medium text-white/50">
              No payment now • No commitment today • Register interest first
            </p>
          </div>

          <div className="lg:col-span-5">
            <div className="rounded-[2rem] border border-emerald-500/20 bg-black/45 p-5 shadow-[0_22px_70px_rgba(0,0,0,0.38)] sm:p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/45">
                    Launch status
                  </div>
                  <div className="mt-2 text-2xl font-black text-white">
                    Recruiting now
                  </div>
                </div>
                <div className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300">
                  Teams wanted
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {launchStats.map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-2xl border border-white/10 bg-white/[0.045] p-4"
                  >
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
                      {stat.label}
                    </div>
                    <div className="mt-2 text-lg font-black text-white">
                      {stat.value}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm leading-6 text-white/68">
                The aim is to create a proper SIXFL launch group first: local
                teams, captains, players and referees who are ready before a
                start date is confirmed.
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-4 md:grid-cols-3">
          {sellingPoints.map((point) => (
            <article
              key={point.title}
              className="rounded-3xl border border-white/10 bg-white/[0.045] p-6 shadow-[0_18px_70px_rgba(0,0,0,0.3)] backdrop-blur"
            >
              <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-300">
                SIXFL
              </div>
              <h2 className="mt-3 text-xl font-black tracking-tight text-white">
                {point.title}
              </h2>
              <p className="mt-3 text-sm leading-7 text-white/62">
                {point.body}
              </p>
            </article>
          ))}
        </section>

        <section className="mt-8 grid gap-8 lg:grid-cols-12">
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-6 shadow-[0_24px_90px_rgba(0,0,0,0.36)] backdrop-blur-xl sm:p-8 lg:col-span-7">
            <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-emerald-300">
              How it works
            </div>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
              Register first. Launch properly.
            </h2>

            <div className="mt-7 grid gap-4">
              {joinSteps.map((step) => (
                <div
                  key={step.number}
                  className="grid gap-4 rounded-3xl border border-white/10 bg-black/30 p-5 sm:grid-cols-[72px_1fr] sm:items-start"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-500/25 bg-emerald-500/10 text-lg font-black text-emerald-300">
                    {step.number}
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white">
                      {step.title}
                    </h3>
                    <p className="mt-2 text-sm leading-7 text-white/62">
                      {step.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <aside
            id="register"
            className="rounded-[2rem] border border-emerald-500/20 bg-emerald-500/[0.08] p-6 shadow-[0_24px_90px_rgba(0,0,0,0.36)] backdrop-blur-xl sm:p-8 lg:col-span-5"
          >
            <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-emerald-300">
              Choose your route
            </div>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-white">
              Join the Northallerton launch list.
            </h2>
            <p className="mt-3 text-sm leading-7 text-white/70">
              Team captains are the priority, but individual players and referees
              can register too. Every enquiry is tagged for Northallerton
              Wednesday so it can be chased properly.
            </p>

            <div className="mt-6 grid gap-3">
              <FunnelLink
                href={teamInterestHref}
                title="I have a team"
                body="Register your captain details and team name."
                cta="Register team"
                featured
              />
              <FunnelLink
                href={playerInterestHref}
                title="I need a team"
                body="Join the player list for Northallerton."
                cta="Join as player"
              />
              <FunnelLink
                href={refereeInterestHref}
                title="I can referee"
                body="Register referee interest for launch nights."
                cta="Referee interest"
              />
            </div>
          </aside>
        </section>

        <section className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.045] p-6 shadow-[0_24px_90px_rgba(0,0,0,0.34)] backdrop-blur-xl sm:p-8">
          <div className="grid gap-8 lg:grid-cols-12 lg:items-start">
            <div className="lg:col-span-5">
              <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-emerald-300">
                FAQ
              </div>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
                Northallerton launch questions.
              </h2>
              <p className="mt-3 text-sm leading-7 text-white/62">
                Keep the message simple while recruiting: no fake start date, no
                payment pressure, and clear next steps for each lead type.
              </p>
            </div>

            <div className="grid gap-3 lg:col-span-7">
              {faqs.map((faq) => (
                <div
                  key={faq.question}
                  className="rounded-3xl border border-white/10 bg-black/28 p-5"
                >
                  <h3 className="text-base font-black text-white">
                    {faq.question}
                  </h3>
                  <p className="mt-2 text-sm leading-7 text-white/62">
                    {faq.answer}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function FunnelLink({
  href,
  title,
  body,
  cta,
  featured = false,
}: {
  href: string;
  title: string;
  body: string;
  cta: string;
  featured?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`block rounded-3xl border p-5 transition hover:-translate-y-0.5 ${
        featured
          ? "border-emerald-500/35 bg-emerald-500/12 hover:bg-emerald-500/[0.16]"
          : "border-white/10 bg-black/28 hover:border-emerald-500/30 hover:bg-black/40"
      }`}
    >
      <div className="text-lg font-black text-white">{title}</div>
      <p className="mt-1 text-sm leading-6 text-white/62">{body}</p>
      <div className="mt-4 text-xs font-black uppercase tracking-[0.18em] text-emerald-300">
        {cta} →
      </div>
    </Link>
  );
}
