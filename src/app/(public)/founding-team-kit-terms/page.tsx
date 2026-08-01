// ========================================
// File: src/app/(public)/founding-team-kit-terms/page.tsx
// ========================================

import Link from "next/link";

const terms = [
  {
    title: "1. Who can receive the package",
    body: "The Founding Team Kit Package is available only to teams expressly selected by SIXFL for a participating launch league. Registering interest does not guarantee eligibility. The team must complete registration, secure its league place and meet any deadline supplied by SIXFL.",
  },
  {
    title: "2. What is included",
    body: "The package contains nine complete playing kits: nine shirts, nine pairs of shorts and nine pairs of socks. One design is selected for the whole team, subject to supplier availability.",
  },
  {
    title: "3. Price and payment",
    body: "The total compulsory contribution is £90 per team, equivalent to £10 for each of the nine shirts. SIXFL subsidises the underlying kit; the team contribution covers the compulsory personalised shirt printing. Payment must be received before SIXFL places the order with the supplier.",
  },
  {
    title: "4. Personalisation",
    body: "Every shirt must have a unique squad number from 1 to 99. A player name may also be added but is optional. The £90 contribution covers the printing details submitted for the original nine-shirt order.",
  },
  {
    title: "5. Captain approval",
    body: "The captain is responsible for checking the selected design, all kit sizes, names and shirt numbers before submitting the order. Submitting the order confirms that the details are correct and that the captain accepts these terms and the £90 compulsory contribution.",
  },
  {
    title: "6. Changes and personalised items",
    body: "Changes cannot normally be made once personalised production has started. SIXFL is not responsible for errors supplied or approved by the captain. This does not affect rights relating to items that are faulty, incorrectly produced or not as described.",
  },
  {
    title: "7. Availability and alternatives",
    body: "Designs, colours and sizes remain subject to supplier availability. If a selected design becomes unavailable, SIXFL will offer a reasonable alternative for the captain to approve before ordering.",
  },
  {
    title: "8. Additional and replacement items",
    body: "The package covers nine kits only. Additional shirts, shorts or socks, later replacements and changes requested after the original order are charged separately at the price confirmed by SIXFL.",
  },
  {
    title: "9. Withdrawal, transfer and cash value",
    body: "The package has no cash alternative and cannot be transferred to another team without SIXFL approval. SIXFL may withdraw an unplaced package where a team does not secure its league place, misses the order or payment deadline, withdraws from the league or provides incomplete order details.",
  },
  {
    title: "10. Production and delivery",
    body: "Any production or delivery date is an estimate and may be affected by supplier availability, printing or shipping. SIXFL will update the captain if there is a material delay.",
  },
  {
    title: "11. Earlier offers",
    body: "These terms apply to Founding Team Kit Package offers made on or after 1 August 2026. Any earlier written offer is governed by the wording issued to that team at the time unless SIXFL and the captain agree otherwise in writing.",
  },
];

export const metadata = {
  title: "Founding Team Kit Package Terms | SIXFL",
  description:
    "Terms for the SIXFL £90 Founding Team Kit Package, including nine personalised playing kits.",
};

export default function FoundingTeamKitTermsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <section className="overflow-hidden rounded-3xl border border-emerald-400/20 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.17),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.025))] p-6 sm:p-8 lg:p-10">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-300">
          SIXFL kit package
        </p>
        <h1 className="mt-4 text-4xl font-black tracking-tight text-white sm:text-5xl">
          Founding Team Kit Package Terms
        </h1>
        <p className="mt-5 max-w-3xl text-base leading-7 text-white/70 sm:text-lg">
          Nine complete personalised playing kits for a compulsory total contribution of
          £90 per team — £10 per shirt.
        </p>

        <div className="mt-7 grid gap-3 sm:grid-cols-3">
          {[
            ["Package", "9 complete kits"],
            ["Team contribution", "£90 total"],
            ["Equivalent", "£10 per shirt"],
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

      <section className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-6 sm:p-8">
        <h2 className="text-2xl font-black text-white">Before submitting an order</h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-white/75 sm:text-base">
          Check every size, name and number carefully. The £90 contribution must be paid
          before SIXFL sends the personalised order to the supplier.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/founding-teams"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-emerald-500 px-5 text-sm font-black text-black transition hover:bg-emerald-400"
          >
            View the package
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
        Version 1.0 · Effective for offers made on or after 1 August 2026 · Last updated 1 August 2026
      </p>
    </div>
  );
}
