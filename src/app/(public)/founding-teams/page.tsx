// ========================================
// File: src/app/(public)/founding-teams/page.tsx
// ========================================

import Link from "next/link";

const foundingBenefits = [
  "Seven complete playing kits: shirts, shorts and socks",
  "Personalised names and unique shirt numbers included",
  "No kit charge and no printing charge",
  "Additional complete kits available for £20 each",
];

const eligibilityPoints = [
  "Available to a limited number of selected launch teams",
  "The team must complete registration and secure its league place",
  "Choose one design and submit seven checked sizes, names and shirt numbers",
  "SIXFL confirms the allocation before the supplier order is placed",
];

const packageDetails = [
  {
    title: "Seven complete kits",
    body: "The offer includes seven shirts, seven pairs of shorts and seven pairs of socks for the team.",
  },
  {
    title: "Personalisation included",
    body: "Each shirt can include a player name and must have a unique squad number. There is no separate printing charge.",
  },
  {
    title: "Additional kits",
    body: "Teams that need more than seven can order additional complete kits for £20 each through the captain dashboard.",
  },
];

export const metadata = {
  title: "Free Founding Team Kit Offer | SIXFL",
  description:
    "Selected SIXFL founding teams can receive seven complete personalised playing kits free of charge.",
};

export default function FoundingTeamsPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <section className="border-b border-white/10 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.16),transparent_38%),linear-gradient(to_bottom,rgba(255,255,255,0.02),rgba(255,255,255,0))]">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
          <div className="max-w-4xl">
            <div className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">
              SIXFL founding team offer
            </div>

            <h1 className="mt-6 text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">
              Seven complete personalised kits, free
            </h1>

            <p className="mt-6 max-w-3xl text-base leading-7 text-white/75 sm:text-lg">
              Selected SIXFL founding teams can receive seven complete playing kits free of charge. Shirts, shorts, socks and personalisation are all included.
            </p>

            <p className="mt-4 max-w-3xl text-base leading-7 text-white/65 sm:text-lg">
              There is no compulsory contribution and no printing charge. Additional complete kits cost £20 each when a team needs more than the included seven.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {[
                ["Included", "7 complete kits"],
                ["Team price", "Free"],
                ["Extra kits", "£20 each"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">
                    {label}
                  </div>
                  <div className="mt-2 text-lg font-black text-white">{value}</div>
                </div>
              ))}
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/register-interest?type=team"
                className="inline-flex h-12 items-center justify-center rounded-full bg-emerald-500 px-6 text-sm font-extrabold tracking-wide text-black transition hover:scale-[1.02] hover:bg-emerald-400"
              >
                REGISTER YOUR TEAM
              </Link>

              <Link
                href="/founding-team-kit-terms"
                className="inline-flex h-12 items-center justify-center rounded-full border border-white/15 bg-white/5 px-6 text-sm font-bold tracking-wide text-white transition hover:bg-white/10"
              >
                VIEW OFFER TERMS
              </Link>
            </div>

            <div className="mt-8 flex flex-wrap gap-2">
              <Pill text="Limited launch offer" />
              <Pill text="Selected teams only" />
              <Pill text="No printing charge" />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/30 sm:p-8">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
              What selected teams receive
            </div>

            <h2 className="mt-3 text-3xl font-black tracking-tight">
              A ready-to-play team kit allocation
            </h2>

            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/70 sm:text-base">
              The offer is a complete seven-player allocation rather than a voucher or discount. The same selected design is ordered for all included kits.
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
              How it works
            </div>

            <h2 className="mt-3 text-3xl font-black tracking-tight">
              From selection to supplier order
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

            <div className="mt-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-5">
              <div className="text-sm font-bold text-white">The included seven are free</div>
              <p className="mt-2 text-sm leading-6 text-white/75">
                SIXFL does not charge the team for the included kits or their personalisation. Only additional kits beyond the allocation are charged at £20 each.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/30 sm:p-8">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
            Offer detail
          </div>
          <h2 className="mt-3 text-3xl font-black tracking-tight">
            Clear before your captain submits
          </h2>

          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {packageDetails.map((item) => (
              <div key={item.title} className="rounded-2xl border border-white/10 bg-black/30 p-5">
                <h3 className="text-lg font-black tracking-tight text-white">{item.title}</h3>
                <p className="mt-3 text-sm leading-6 text-white/70">{item.body}</p>
              </div>
            ))}
          </div>

          <p className="mt-6 text-sm leading-7 text-white/55">
            Replacements and changes requested after the order is locked may be charged separately. Designs and sizes remain subject to supplier availability.
          </p>
        </div>
      </section>

      <section className="border-t border-white/10">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/10 p-8 text-center shadow-2xl shadow-black/30 sm:p-10">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">
              Register early
            </div>

            <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
              Want to be considered for the free kit offer?
            </h2>

            <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-white/75 sm:text-base">
              Register your team and select the free-kit option. Allocations are limited, and registering interest does not guarantee that an offer will be awarded.
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/register-interest?type=team"
                className="inline-flex h-12 items-center justify-center rounded-full bg-emerald-500 px-6 text-sm font-extrabold tracking-wide text-black transition hover:scale-[1.02] hover:bg-emerald-400"
              >
                REGISTER YOUR TEAM
              </Link>

              <Link
                href="/founding-team-kit-terms"
                className="inline-flex h-12 items-center justify-center rounded-full border border-white/15 bg-black/30 px-6 text-sm font-bold tracking-wide text-white transition hover:bg-white/10"
              >
                READ FULL TERMS
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
