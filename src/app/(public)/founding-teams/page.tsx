// ========================================
// File: src/app/(public)/founding-teams/page.tsx
// ========================================

import Link from "next/link";

const foundingBenefits = [
  "Nine complete playing kits: shirts, shorts and socks",
  "One personalised shirt for each of nine players",
  "£90 total team contribution — £10 per shirt",
  "Priority access to launch league spaces and updates",
];

const eligibilityPoints = [
  "Available to a limited number of selected launch teams",
  "The team must complete registration and secure its league place",
  "Choose one design and submit nine checked sizes and shirt numbers",
  "Pay the compulsory £90 contribution before the supplier order is placed",
];

const packageDetails = [
  {
    title: "Nine complete kits",
    body: "The package includes nine shirts, nine pairs of shorts and nine pairs of socks for the team.",
  },
  {
    title: "Personalised printing",
    body: "Each shirt must have a unique squad number. Player names can also be added and are optional.",
  },
  {
    title: "£90 per team",
    body: "SIXFL subsidises the kit itself. The team pays a compulsory £10 per shirt towards personalised printing.",
  },
];

export const metadata = {
  title: "£90 Founding Team Kit Package | SIXFL",
  description:
    "Selected SIXFL founding teams can receive nine complete personalised playing kits for £90 per team.",
};

export default function FoundingTeamsPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <section className="border-b border-white/10 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.16),transparent_38%),linear-gradient(to_bottom,rgba(255,255,255,0.02),rgba(255,255,255,0))]">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
          <div className="max-w-4xl">
            <div className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">
              SIXFL Launch Package
            </div>

            <h1 className="mt-6 text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">
              Nine personalised team kits for £90
            </h1>

            <p className="mt-6 max-w-3xl text-base leading-7 text-white/75 sm:text-lg">
              Selected SIXFL founding teams can receive nine complete playing kits for a
              compulsory total contribution of £90 — equivalent to £10 per shirt.
            </p>

            <p className="mt-4 max-w-3xl text-base leading-7 text-white/65 sm:text-lg">
              SIXFL subsidises the underlying kit. The team contribution covers the
              personalised printing required for the original nine-shirt order.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {[
                ["Included", "9 shirts, shorts and socks"],
                ["Team price", "£90 total"],
                ["Per player", "£10 per shirt"],
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
                VIEW PACKAGE TERMS
              </Link>
            </div>

            <div className="mt-8 flex flex-wrap gap-2">
              <Pill text="Limited launch package" />
              <Pill text="Selected teams only" />
              <Pill text="£90 shown upfront" />
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
              A heavily subsidised launch package
            </h2>

            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/70 sm:text-base">
              The offer is a complete nine-player package rather than a voucher or cash
              discount. The same selected design is ordered for all nine players.
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

            <div className="mt-6 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-5">
              <div className="text-sm font-bold text-white">The £90 is compulsory</div>
              <p className="mt-2 text-sm leading-6 text-white/75">
                A team cannot receive the package without paying the full £90 contribution.
                Payment is required before SIXFL places the personalised order.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/30 sm:p-8">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
            Package detail
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
            Additional kits, replacements and changes requested after the original order are
            charged separately. Designs and sizes remain subject to supplier availability.
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
              Want to be considered for the £90 package?
            </h2>

            <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-white/75 sm:text-base">
              Register your team and select the kit-package option. Eligibility is limited,
              and registering interest does not guarantee that a package will be allocated.
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
