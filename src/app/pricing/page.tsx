// ========================================
// File: src/app/pricing/page.tsx
// ========================================

import Link from "next/link";

const included = [
  "Refereed matches every week",
  "Reliable fixtures and kick-off times",
  "Live league tables and results",
  "Professional league administration",
  "Quality venues",
  "Built for captains and organised teams",
];

const faqs = [
  {
    question: "How much does it cost?",
    answer:
      "SIXFL leagues are priced at £40 per team per week.",
  },
  {
    question: "How much is that per player?",
    answer:
      "For most squads, it works out at around £5 per player per match depending on how many players contribute each week.",
  },
  {
    question: "Do individual players need to pay separately?",
    answer:
      "No. The team pays the weekly match fee, and captains can organise player contributions however they like.",
  },
  {
    question: "What does the weekly fee include?",
    answer:
      "Your weekly fee covers your match slot, referee, league management, fixtures, results and league table updates.",
  },
];

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <section className="border-b border-white/10">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="max-w-3xl">
            <div className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
              Pricing
            </div>

            <h1 className="mt-6 text-4xl font-black tracking-tight sm:text-5xl">
              Simple pricing.
              <span className="block text-emerald-400">No surprises.</span>
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-7 text-white/70 sm:text-lg">
              Straightforward weekly pricing for teams who want properly run
              6-a-side football.
            </p>
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
          <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/30 sm:p-8">
              <div className="flex flex-col gap-6">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">
                    Team entry
                  </p>

                  <div className="mt-4 flex items-end gap-3">
                    <span className="text-5xl font-black tracking-tight sm:text-6xl">
                      £40
                    </span>
                    <span className="pb-2 text-base text-white/70">
                      per team / per week
                    </span>
                  </div>

                  <p className="mt-4 text-sm text-emerald-300 sm:text-base">
                    Around £5 per player per match for most squads.
                  </p>
                </div>

                <div className="h-px bg-white/10" />

                <div>
                  <h2 className="text-lg font-bold sm:text-xl">
                    What’s included
                  </h2>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {included.map((item) => (
                      <div
                        key={item}
                        className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/30 p-4"
                      >
                        <div className="mt-1 h-2.5 w-2.5 rounded-full bg-emerald-400" />
                        <p className="text-sm leading-6 text-white/85">{item}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="h-px bg-white/10" />

                <div className="flex flex-col gap-3 sm:flex-row">
                  <Link
                    href="/register-team"
                    className="inline-flex h-12 items-center justify-center rounded-full bg-emerald-500 px-6 text-sm font-extrabold tracking-wide text-black transition hover:bg-emerald-400"
                  >
                    REGISTER YOUR TEAM
                  </Link>

                  <Link
                    href="/join"
                    className="inline-flex h-12 items-center justify-center rounded-full border border-white/15 bg-white/5 px-6 text-sm font-bold tracking-wide text-white transition hover:bg-white/10"
                  >
                    JOIN AS A PLAYER
                  </Link>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-6">
              <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/10 p-6 sm:p-7">
                <h2 className="text-xl font-black tracking-tight">
                  Launch areas
                </h2>

                <p className="mt-3 text-sm leading-6 text-white/75">
                  We’re building SIXFL for organised, competitive teams in:
                </p>

                <div className="mt-5 flex flex-wrap gap-3">
                  {["York", "Leeds", "Harrogate", "Ripon"].map((area) => (
                    <span
                      key={area}
                      className="rounded-full border border-emerald-400/20 bg-black/30 px-4 py-2 text-sm font-semibold text-emerald-200"
                    >
                      {area}
                    </span>
                  ))}
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 sm:p-7">
                <h2 className="text-xl font-black tracking-tight">
                  Why teams choose SIXFL
                </h2>

                <div className="mt-5 space-y-4">
                  <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                    <h3 className="font-semibold text-white">
                      Better organised match nights
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-white/70">
                      Fixed scheduling, proper communication and league admin
                      teams can actually rely on.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                    <h3 className="font-semibold text-white">
                      Professional matchday experience
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-white/70">
                      Refereed games, clear structure and a stronger standard
                      than casual pay-and-play setups.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                    <h3 className="font-semibold text-white">
                      Built for captains
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-white/70">
                      Less chasing people in group chats. More clarity, better
                      admin and a more reliable league experience.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-white/10">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">
              FAQ
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
              Common questions
            </h2>
          </div>

          <div className="mt-8 grid gap-4">
            {faqs.map((item) => (
              <div
                key={item.question}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:p-6"
              >
                <h3 className="text-base font-bold sm:text-lg">
                  {item.question}
                </h3>
                <p className="mt-2 text-sm leading-6 text-white/70 sm:text-base">
                  {item.answer}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-white/10 bg-gradient-to-b from-emerald-500/10 to-transparent">
        <div className="mx-auto max-w-5xl px-4 py-16 text-center sm:px-6 lg:px-8 lg:py-20">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">
            Ready to join?
          </p>

          <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">
            Register your team and get started.
          </h2>

          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-white/70 sm:text-lg">
            Get your team into the SIXFL launch pipeline and we’ll keep you
            updated as leagues open in your area.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/register-team"
              className="inline-flex h-12 items-center justify-center rounded-full bg-emerald-500 px-6 text-sm font-extrabold tracking-wide text-black transition hover:bg-emerald-400"
            >
              REGISTER YOUR TEAM
            </Link>

            <Link
              href="/contact"
              className="inline-flex h-12 items-center justify-center rounded-full border border-white/15 bg-white/5 px-6 text-sm font-bold tracking-wide text-white transition hover:bg-white/10"
            >
              ASK A QUESTION
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}