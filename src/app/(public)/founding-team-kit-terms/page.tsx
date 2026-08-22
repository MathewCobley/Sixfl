// ========================================
// File: src/app/(public)/founding-team-kit-terms/page.tsx
// ========================================

import Link from "next/link";

import {
  KIT_OFFER_TERMS_EFFECTIVE_DATE,
  KIT_OFFER_TERMS_VERSION,
  kitOfferTermsSections,
} from "@/lib/kits/terms";

export const metadata = {
  title: "Founding Team Kit Offer Terms | SIXFL",
  description:
    "Terms for the SIXFL founding-team offer of seven complete personalised playing kits free of charge after three paid matches, including paid additional-kit orders.",
};

export default function FoundingTeamKitTermsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <section className="overflow-hidden rounded-3xl border border-emerald-400/20 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.17),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.025))] p-6 sm:p-8 lg:p-10">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-300">
          SIXFL founding team offer
        </p>
        <h1 className="mt-4 text-4xl font-black tracking-tight text-white sm:text-5xl">
          Free Team Kit Offer Terms
        </h1>
        <p className="mt-5 max-w-3xl text-base leading-7 text-white/70 sm:text-lg">
          Seven complete personalised playing kits free of charge after three paid matches. Paid additional kits are handled separately from league participation.
        </p>

        <div className="mt-7 grid gap-3 sm:grid-cols-4">
          {[
            ["Included", "7 complete kits"],
            ["Team price", "Free"],
            ["Extra kits", "£20 each"],
            ["Claim within", "60 days"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">
                {label}
              </div>
              <div className="mt-2 text-lg font-black text-white">{value}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        {kitOfferTermsSections.map((term) => (
          <article key={term.title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
            <h2 className="text-lg font-black text-white">{term.title}</h2>
            <div className="mt-2 space-y-2 text-sm leading-7 text-white/70 sm:text-base">
              {term.points.map((point) => (
                <p key={point}>{point}</p>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-6 sm:p-8">
        <h2 className="text-2xl font-black text-white">Before submitting an order</h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-white/75 sm:text-base">
          Check every design, size, name and number carefully. New kit submissions record the version of these terms accepted by the captain at the time of submission.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/founding-teams"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-emerald-500 px-5 text-sm font-black text-black transition hover:bg-emerald-400"
          >
            View the offer
          </Link>
          <Link
            href="/contact"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/15 bg-black/25 px-5 text-sm font-bold text-white transition hover:bg-white/10"
          >
            Ask SIXFL
          </Link>
        </div>
      </section>

      <p className="text-xs leading-6 text-white/40">
        Version {KIT_OFFER_TERMS_VERSION} · Effective {KIT_OFFER_TERMS_EFFECTIVE_DATE}
      </p>
    </div>
  );
}
