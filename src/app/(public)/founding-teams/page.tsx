// ========================================
// File: src/app/founding-teams/page.tsx
// ========================================

import Link from "next/link";

const foundingBenefits = [
  "Free SIXFL founding team kit",
  "Priority access to launch league spaces",
  "Founding team status in the first SIXFL season",
  "Early access to league updates and launch information",
];

const eligibilityPoints = [
  "Available to a limited number of launch teams only",
  "Applies to selected SIXFL launch leagues",
  "Team must complete registration and secure their league place",
  "Offer is subject to availability and launch conditions",
];

const whyJoinNow = [
  {
    title: "Limited launch places",
    body: "Founding team places are limited. Once they are gone, the offer closes.",
  },
  {
    title: "Build your team identity early",
    body: "Start your SIXFL journey with a proper launch offer and a stronger team identity from day one.",
  },
  {
    title: "Join the league first",
    body: "Be part of the first SIXFL teams helping shape a better standard of 6-a-side football.",
  },
];

export default function FoundingTeamsPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <section className="border-b border-white/10 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.14),transparent_38%),linear-gradient(to_bottom,rgba(255,255,255,0.02),rgba(255,255,255,0))]">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
          <div className="max-w-3xl">
            <div className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">
              SIXFL Launch Offer
            </div>

            <h1 className="mt-6 text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">
              Founding Team Kit Offer
            </h1>

            <p className="mt-6 max-w-2xl text-base leading-7 text-white/70 sm:text-lg">
              To mark the launch of SIXFL, a limited number of founding teams
              will be considered for a free team kit offer as part of our first
              league rollouts.
            </p>

            <p className="mt-4 max-w-2xl text-base leading-7 text-white/70 sm:text-lg">
              It is our way of rewarding the teams who join early and help set
              the standard for a better run, more professional 6-a-side league.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/register-interest?type=team"
                className="inline-flex h-12 items-center justify-center rounded-full bg-emerald-500 px-6 text-sm font-extrabold tracking-wide text-black transition hover:scale-[1.02] hover:bg-emerald-400"
              >
                REGISTER YOUR TEAM
              </Link>

              <Link
                href="/leagues"
                className="inline-flex h-12 items-center justify-center rounded-full border border-white/15 bg-white/5 px-6 text-sm font-bold tracking-wide text-white transition hover:bg-white/10"
              >
                VIEW LEAGUES
              </Link>
            </div>

            <div className="mt-8 flex flex-wrap gap-2">
              <Pill text="Limited launch offer" />
              <Pill text="Founding team status" />
              <Pill text="Selected teams only" />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/30 sm:p-8">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
              What founding teams receive
            </div>

            <h2 className="mt-3 text-3xl font-black tracking-tight">
              A strong launch incentive for early teams
            </h2>

            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/70 sm:text-base">
              Founding teams are the first teams to come into SIXFL as new
              leagues launch. Selected founding teams may receive a free kit
              offer and priority launch communication as part of that early
              group.
            </p>

            <div className="mt-8 grid gap-4">
              {foundingBenefits.map((benefit) => (
                <div
                  key={benefit}
                  className="flex items-start gap-3 rounded-2xl border border-emerald-500/15 bg-emerald-500/10 px-4 py-4"
                >
                  <div className="mt-1 h-2.5 w-2.5 rounded-full bg-emerald-400" />
                  <div className="text-sm leading-6 text-white/85">{benefit}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/30 sm:p-8">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
              Eligibility
            </div>

            <h2 className="mt-3 text-3xl font-black tracking-tight">
              How the offer works
            </h2>

            <div className="mt-6 space-y-4">
              {eligibilityPoints.map((point, index) => (
                <div
                  key={point}
                  className="rounded-2xl border border-white/10 bg-black/30 p-4"
                >
                  <div className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">
                    Step {index + 1}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-white/75">{point}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-5">
              <div className="text-sm font-bold text-white">Important</div>
              <p className="mt-2 text-sm leading-6 text-white/75">
                The founding team kit offer is limited and not guaranteed for
                every enquiry. Teams must register interest early and meet the
                relevant launch criteria for their league.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/30 sm:p-8">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
            Why teams should move early
          </div>

          <h2 className="mt-3 text-3xl font-black tracking-tight">
            Be part of the first SIXFL season
          </h2>

          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {whyJoinNow.map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-white/10 bg-black/30 p-5"
              >
                <h3 className="text-lg font-black tracking-tight text-white">
                  {item.title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-white/70">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-white/10">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="rounded-[32px] border border-emerald-500/20 bg-emerald-500/10 p-8 text-center shadow-2xl shadow-black/30 sm:p-10">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">
              Register early
            </div>

            <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
              Want to be considered as a founding team?
            </h2>

            <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-white/75 sm:text-base">
              Register your team now and tell us a little about your squad,
              preferred area and playing night. We’ll contact you as launch
              plans develop and founding team places are allocated.
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/register-interest?type=team"
                className="inline-flex h-12 items-center justify-center rounded-full bg-emerald-500 px-6 text-sm font-extrabold tracking-wide text-black transition hover:scale-[1.02] hover:bg-emerald-400"
              >
                REGISTER YOUR TEAM
              </Link>

              <Link
                href="/contact"
                className="inline-flex h-12 items-center justify-center rounded-full border border-white/15 bg-black/30 px-6 text-sm font-bold tracking-wide text-white transition hover:bg-white/10"
              >
                ASK A QUESTION
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function Pill({ text }: { text: string }) {
  return (
    <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-bold tracking-[0.14em] text-emerald-300">
      {text}
    </span>
  );
}