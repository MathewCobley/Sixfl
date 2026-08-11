// ========================================
// File: src/app/(public)/founding-team-kit-terms/page.tsx
// ========================================

import Link from "next/link";

const terms = [
  {
    title: "1. Who can receive the offer",
    body: "The Founding Team Kit Offer is available only to teams expressly selected by SIXFL for a participating launch league. Registering interest does not guarantee eligibility. The team must complete registration and secure its league place. The free kit entitlement becomes claimable only after the team has played three SIXFL league fixtures and the corresponding fixture charges for those three matches have been paid in full.",
  },
  {
    title: "2. Claim deadline",
    body: "Once the team becomes eligible after its third paid match, the free kit order must be claimed and submitted within 60 days. The 60-day period starts on the date the third qualifying fixture charge is paid in full. If the team does not submit its free kit order within that period, the unclaimed offer expires unless SIXFL agrees otherwise in writing.",
  },
  {
    title: "3. What is included",
    body: "The offer contains seven complete playing kits: seven shirts, seven pairs of shorts and seven pairs of socks. One design is selected for the whole team, subject to supplier availability.",
  },
  {
    title: "4. Price",
    body: "The seven included kits are supplied free of charge. Personalised names and shirt numbers are included and there is no compulsory printing contribution.",
  },
  {
    title: "5. Personalisation",
    body: "Every shirt must have a unique squad number from 1 to 99. A player name may also be added but is optional. The submitted personalisation is included in the free seven-kit allocation.",
  },
  {
    title: "6. Captain approval",
    body: "The captain is responsible for checking the selected design, all kit sizes, names and shirt numbers before submitting the order. Submitting confirms that the supplied details are correct and that the captain accepts these terms.",
  },
  {
    title: "7. Changes and personalised items",
    body: "Changes cannot normally be made once personalised production has started. SIXFL is not responsible for errors supplied or approved by the captain. This does not affect rights relating to items that are faulty, incorrectly produced or not as described.",
  },
  {
    title: "8. Availability and alternatives",
    body: "Designs, colours and sizes remain subject to supplier availability. If a selected design becomes unavailable, SIXFL will offer a reasonable alternative for the captain to approve before ordering.",
  },
  {
    title: "9. Additional and replacement items",
    body: "The free offer covers seven complete kits. Additional complete kits cost £20 each. Later replacements and changes requested after the original order may be charged separately at the price confirmed by SIXFL.",
  },
  {
    title: "10. Withdrawal, expiry, transfer and cash value",
    body: "The offer has no cash alternative and cannot be transferred to another team without SIXFL approval. SIXFL may withdraw an unplaced allocation where a team does not secure its league place, does not complete and pay for the three qualifying matches, misses the 60-day claim deadline, withdraws from the league or provides incomplete order details.",
  },
  {
    title: "11. Production and delivery",
    body: "Any production or delivery date is an estimate and may be affected by supplier availability, personalisation or shipping. SIXFL will update the captain if there is a material delay.",
  },
];

export const metadata = {
  title: "Founding Team Kit Offer Terms | SIXFL",
  description:
    "Terms for the SIXFL founding-team offer of seven complete personalised playing kits free of charge after three paid matches, with a 60-day claim period.",
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
          Seven complete personalised playing kits free of charge after three paid matches. Once eligible, the offer must be claimed within 60 days.
        </p>

        <div className="mt-7 grid gap-3 sm:grid-cols-4">
          {[
            ["Included", "7 complete kits"],
            ["Team price", "Free"],
            ["Eligible after", "3 paid matches"],
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
        {terms.map((term) => (
          <article key={term.title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
            <h2 className="text-lg font-black text-white">{term.title}</h2>
            <p className="mt-2 text-sm leading-7 text-white/70 sm:text-base">{term.body}</p>
          </article>
        ))}
      </section>

      <section className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-6 sm:p-8">
        <h2 className="text-2xl font-black text-white">Before submitting an order</h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-white/75 sm:text-base">
          Check that your team has completed three paid SIXFL matches and is still within its 60-day claim period. Then check every design, size, name and number carefully before submitting the order.
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
        Version 2.1 · Last updated 11 August 2026
      </p>
    </div>
  );
}
