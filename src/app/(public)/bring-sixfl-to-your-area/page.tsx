// ========================================
// File: src/app/(public)/bring-sixfl-to-your-area/page.tsx
// ========================================

import type { Metadata } from "next";
import Link from "next/link";

import { submitExpansionLeadAction } from "./actions";

export const metadata: Metadata = {
  title: "Bring SIXFL to Your Area | Earn a Launch Commission",
  description:
    "Help SIXFL launch a new six-a-side league and earn 10% of qualifying team fees collected during its first 12 months, capped at £2,500 per league.",
};

const inputClassName =
  "h-12 w-full rounded-2xl border border-white/10 bg-black/45 px-4 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/10";
const textareaClassName =
  "min-h-28 w-full resize-y rounded-2xl border border-white/10 bg-black/45 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-white/30 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/10";

function getErrorMessage(error?: string) {
  if (error === "area") return "Please tell us which town or area you are proposing.";
  if (error === "league-type") return "Please choose a valid league type.";
  if (error === "name") return "Please enter your name.";
  if (error === "email") return "Please enter your email address.";
  if (error === "email-format") return "Please enter a valid email address.";
  if (error === "terms") {
    return "Please confirm that you understand how the launch commission works.";
  }
  return "";
}

const steps = [
  {
    number: "01",
    title: "Submit the opportunity",
    text: "Tell us about the town, possible venue, likely playing nights and any teams you already know.",
  },
  {
    number: "02",
    title: "SIXFL assesses it",
    text: "We check existing coverage, venue viability, realistic demand and whether the area fits our expansion plans.",
  },
  {
    number: "03",
    title: "We agree your launch role",
    text: "Before qualifying work begins, we confirm your responsibilities and commission terms in writing.",
  },
  {
    number: "04",
    title: "Help us launch",
    text: "You complete the agreed introductions or recruitment work. SIXFL builds and operates the league and pays commission on qualifying team fees.",
  },
];

const sixflResponsibilities = [
  "League ownership and brand",
  "Pricing and team payments",
  "Fixtures, tables and results",
  "Rules and discipline",
  "Website and team accounts",
  "Core communications",
  "Referee and matchnight standards",
  "Final launch decisions",
];

const partnerContributions = [
  "Identify a promising town or area",
  "Find a realistic venue or pitch contact",
  "Introduce SIXFL to venue management",
  "Connect us with genuine local teams",
  "Help create initial local awareness",
  "Complete the work agreed with SIXFL",
];

const commissionExamples = [
  { teams: 6, revenue: "£11,520", commission: "£1,152" },
  { teams: 8, revenue: "£15,360", commission: "£1,536" },
  { teams: 10, revenue: "£19,200", commission: "£1,920" },
  { teams: 12, revenue: "£23,040", commission: "£2,304" },
];

const commissionTerms = [
  {
    title: "Qualifying team fees",
    text: "Commission is calculated on standard weekly team fees actually paid for the approved league.",
  },
  {
    title: "12-month limit",
    text: "Commission runs from the first paid matchnight and ends after 12 months, or earlier when the £2,500 cap is reached.",
  },
  {
    title: "Payments",
    text: "Commission is paid quarterly in arrears. The first payment is released after three paid matchnights and is then backdated to the first paid matchnight.",
  },
  {
    title: "Excluded amounts",
    text: "VAT, refunds, credits, chargebacks, kits, fines, late-payment charges, sponsorship and unrelated income do not count.",
  },
  {
    title: "One cap per league",
    text: "The £2,500 maximum is one commission pool for the approved league. If more than one partner helps, the agreed shares come from that same pool.",
  },
  {
    title: "Separate rewards",
    text: "Teams covered by the launch commission do not also receive the standard team-referral reward unless SIXFL agrees this separately in writing.",
  },
  {
    title: "Future leagues",
    text: "A second league in the same town or at the same venue is a separate opportunity and is not automatically included.",
  },
  {
    title: "Ongoing local work",
    text: "Any paid matchnight or local coordinator role after launch is a separate agreement with its own responsibilities and payment.",
  },
];

export default async function BringSixflToYourAreaPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const error = getErrorMessage(resolvedSearchParams.error);

  return (
    <div className="min-h-screen overflow-hidden bg-black text-white">
      <section className="relative border-b border-white/10">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-48 top-16 h-96 w-96 rounded-full bg-emerald-500/15 blur-3xl" />
          <div className="absolute -right-48 bottom-0 h-96 w-96 rounded-full bg-sky-500/10 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <div className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
            <div>
              <div className="inline-flex rounded-full border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-emerald-300">
                Bring SIXFL to your area
              </div>

              <h1 className="mt-6 max-w-4xl text-4xl font-black tracking-tight sm:text-6xl lg:text-7xl">
                Spot the opportunity.
                <span className="block text-emerald-400">Help us launch it.</span>
              </h1>

              <p className="mt-6 max-w-3xl text-base leading-8 text-white/70 sm:text-xl">
                Use your local knowledge and contacts to help SIXFL find a venue
                and opening teams. Approved launch partners earn 10% of
                qualifying team fees collected during the league&apos;s first 12
                months, capped at £2,500 per league.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a
                  href="#apply"
                  className="inline-flex h-12 items-center justify-center rounded-full bg-emerald-500 px-6 text-sm font-extrabold text-black transition hover:-translate-y-0.5 hover:bg-emerald-400"
                >
                  Tell us about an area
                </a>
                <a
                  href="#commission"
                  className="inline-flex h-12 items-center justify-center rounded-full border border-white/10 bg-white/5 px-6 text-sm font-bold text-white transition hover:bg-white/10"
                >
                  See the commission
                </a>
              </div>
            </div>

            <aside className="rounded-[2rem] border border-emerald-400/20 bg-emerald-500/[0.07] p-6 shadow-2xl shadow-black/40 sm:p-8">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">
                Launch partner commission
              </p>
              <h2 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">
                Earn 10% of the league&apos;s qualifying team fees.
              </h2>
              <p className="mt-4 text-sm leading-7 text-white/70">
                The commission runs for the first 12 months from the first paid
                matchnight and is capped at £2,500 in total for each approved
                league.
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                {[
                  "10% of qualifying fees",
                  "First 12 months",
                  "£2,500 maximum",
                  "Based on fees collected",
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm font-semibold text-white/85"
                  >
                    <span className="text-emerald-300">✓</span>
                    {item}
                  </div>
                ))}
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section
        id="how-it-works"
        className="border-b border-white/10 bg-white/[0.02]"
      >
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-300">
              How it works
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">
              Local knowledge, backed by the SIXFL system.
            </h2>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {steps.map((item) => (
              <article
                key={item.number}
                className="rounded-3xl border border-white/10 bg-black/30 p-6"
              >
                <div className="text-sm font-black tracking-[0.16em] text-emerald-300">
                  {item.number}
                </div>
                <h3 className="mt-4 text-xl font-extrabold text-white">
                  {item.title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-white/60">
                  {item.text}
                </p>
              </article>
            ))}
          </div>

          <div className="mt-8 rounded-3xl border border-amber-300/20 bg-amber-300/[0.06] p-5 text-sm leading-6 text-amber-50/80 sm:p-6">
            <strong className="text-amber-100">Approval comes first:</strong>{" "}
            SIXFL must approve the opportunity and agree your role and qualifying
            work in writing before commission-earning work begins.
          </div>
        </div>
      </section>

      <section id="commission" className="scroll-mt-24 border-b border-white/10">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="max-w-4xl">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-300">
              The commission
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">
              10% for the first year, up to £2,500.
            </h2>
            <p className="mt-5 max-w-3xl text-sm leading-7 text-white/65 sm:text-base">
              Commission rises with the number of paying teams and paid match
              weeks. It ends at the earlier of 12 months from the first paid
              matchnight or £2,500 of total commission paid.
            </p>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            <article className="rounded-[2rem] border border-emerald-400/25 bg-emerald-500/[0.08] p-6 sm:p-8">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">
                Worked example
              </p>
              <h3 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">
                A 12-team league over 48 paid weeks
              </h3>

              <div className="mt-7 space-y-4">
                <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4 text-sm text-white/65">
                  <span>12 teams × £40 qualifying fee × 48 weeks</span>
                  <strong className="text-white">£23,040</strong>
                </div>
                <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4 text-sm text-white/65">
                  <span>Launch commission at 10%</span>
                  <strong className="text-2xl text-emerald-300">£2,304</strong>
                </div>
                <div className="flex items-center justify-between gap-4 text-sm text-white/65">
                  <span>Maximum commission per league</span>
                  <strong className="text-white">£2,500</strong>
                </div>
              </div>

              <p className="mt-6 text-xs leading-5 text-white/45">
                This is a worked example using £40 of qualifying weekly team fees per team. Actual
                commission depends on qualifying fees actually collected and may
                be lower.
              </p>
            </article>

            <article className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-6 sm:p-8">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-300">
                48-week examples
              </p>
              <h3 className="mt-3 text-2xl font-black tracking-tight">
                What different league sizes could produce
              </h3>
              <p className="mt-3 text-sm leading-6 text-white/55">
                These examples also assume £40 of qualifying weekly team fees is
                collected per team for every listed week.
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {commissionExamples.map((item) => (
                  <div
                    key={item.teams}
                    className="rounded-2xl border border-white/10 bg-black/25 p-4"
                  >
                    <div className="text-sm font-bold text-white">
                      {item.teams} paying teams
                    </div>
                    <div className="mt-2 text-xs text-white/45">
                      Qualifying revenue: {item.revenue}
                    </div>
                    <div className="mt-3 text-xl font-black text-emerald-300">
                      {item.commission} commission
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </div>

          <div className="mt-10">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-white/45">
              Commission terms at a glance
            </p>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {commissionTerms.map((item) => (
                <article
                  key={item.title}
                  className="rounded-3xl border border-white/10 bg-black/25 p-5 sm:p-6"
                >
                  <h3 className="font-extrabold text-white">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-white/55">
                    {item.text}
                  </p>
                </article>
              ))}
            </div>
          </div>

          <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.035] p-5 text-xs leading-6 text-white/50 sm:p-6">
            The written launch-partner agreement for an approved opportunity
            confirms the qualifying work, any shared commission split and the
            final payment details. The standard calculation is 10% of qualifying
            weekly team fees actually collected, excluding VAT and the other
            excluded amounts listed above.
          </div>
        </div>
      </section>

      <section className="border-b border-white/10 bg-white/[0.02]">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="grid gap-6 lg:grid-cols-2">
            <article className="rounded-[2rem] border border-emerald-400/20 bg-emerald-500/[0.06] p-6 sm:p-8">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">
                SIXFL handles
              </p>
              <h2 className="mt-3 text-2xl font-black tracking-tight">
                The league, technology and customer relationship.
              </h2>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {sixflResponsibilities.map((item) => (
                  <div
                    key={item}
                    className="flex gap-2 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white/75"
                  >
                    <span className="text-emerald-300">✓</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-[2rem] border border-sky-400/20 bg-sky-500/[0.05] p-6 sm:p-8">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-300">
                You may help with
              </p>
              <h2 className="mt-3 text-2xl font-black tracking-tight">
                The local introductions that make a launch possible.
              </h2>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {partnerContributions.map((item) => (
                  <div
                    key={item}
                    className="flex gap-2 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white/75"
                  >
                    <span className="text-sky-300">→</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
              <p className="mt-6 text-sm leading-6 text-white/55">
                Where a local matchnight coordinator is needed after launch,
                SIXFL may offer a separate paid role with clearly agreed
                responsibilities.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section
        id="apply"
        className="scroll-mt-24 border-b border-white/10"
      >
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="grid gap-10 lg:grid-cols-[0.75fr_1.25fr] lg:items-start">
            <div className="lg:sticky lg:top-24">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-300">
                Submit an opportunity
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">
                Where should SIXFL launch next?
              </h2>
              <p className="mt-5 text-sm leading-7 text-white/65 sm:text-base">
                Useful local information matters more than a polished proposal.
                Tell us what you genuinely know about the area, pitches and
                possible teams. It is fine if some details are still uncertain.
              </p>

              <div className="mt-7 space-y-3 text-sm text-white/65">
                {[
                  "Share the area and local opportunity",
                  "SIXFL reviews venue and team potential",
                  "Approved opportunities receive a written launch plan",
                  "Earn 10% for up to 12 months, capped at £2,500",
                ].map((item) => (
                  <div key={item} className="flex gap-3">
                    <span className="text-emerald-300">✓</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-2xl shadow-black/35 sm:p-8">
              <div className="border-b border-white/10 pb-6">
                <h3 className="text-2xl font-black tracking-tight">
                  New area application
                </h3>
                <p className="mt-2 text-sm leading-6 text-white/55">
                  Required fields are marked with an asterisk.
                </p>
              </div>

              {error ? (
                <div className="mt-6 rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                  {error}
                </div>
              ) : null}

              <form action={submitExpansionLeadAction} className="mt-6 space-y-8">
                <div className="absolute left-[-10000px] top-auto h-px w-px overflow-hidden">
                  <label>
                    Company
                    <input name="company" tabIndex={-1} autoComplete="off" />
                  </label>
                </div>

                <fieldset className="space-y-5">
                  <legend className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">
                    1. The area and venue
                  </legend>

                  <div>
                    <label htmlFor="area" className="mb-2 block text-sm font-bold">
                      Town or area *
                    </label>
                    <input
                      id="area"
                      name="area"
                      required
                      maxLength={120}
                      placeholder="e.g. Selby"
                      className={inputClassName}
                    />
                  </div>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                      <label htmlFor="postcode" className="mb-2 block text-sm font-bold">
                        Postcode or postcode area
                      </label>
                      <input
                        id="postcode"
                        name="postcode"
                        maxLength={20}
                        placeholder="e.g. YO8"
                        className={inputClassName}
                      />
                    </div>

                    <div>
                      <label htmlFor="leagueType" className="mb-2 block text-sm font-bold">
                        Likely league type
                      </label>
                      <select id="leagueType" name="leagueType" className={inputClassName}>
                        <option value="">Not sure yet</option>
                        <option value="MENS">Men&apos;s league</option>
                        <option value="WOMENS">Women&apos;s league</option>
                        <option value="YOUTH">Youth league</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 text-sm font-bold">Possible playing nights</div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {[
                        ["MONDAY", "Monday"],
                        ["TUESDAY", "Tuesday"],
                        ["WEDNESDAY", "Wednesday"],
                        ["THURSDAY", "Thursday"],
                        ["FRIDAY", "Friday"],
                        ["SATURDAY", "Saturday"],
                        ["SUNDAY", "Sunday"],
                        ["ANY", "Any / not sure"],
                      ].map(([value, label]) => (
                        <label
                          key={value}
                          className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 text-xs font-semibold text-white/70 transition hover:border-emerald-400/30 hover:text-white"
                        >
                          <input
                            type="checkbox"
                            name="preferredNights"
                            value={value}
                            className="h-4 w-4 accent-emerald-500"
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label htmlFor="venueName" className="mb-2 block text-sm font-bold">
                      Possible venue
                    </label>
                    <input
                      id="venueName"
                      name="venueName"
                      maxLength={180}
                      placeholder="Venue name, sports centre or pitch"
                      className={inputClassName}
                    />
                  </div>

                  <div>
                    <label htmlFor="venueDetails" className="mb-2 block text-sm font-bold">
                      What do you know about the venue or pitches?
                    </label>
                    <textarea
                      id="venueDetails"
                      name="venueDetails"
                      maxLength={2_000}
                      placeholder="For example: number of pitches, likely availability, who manages it, or whether you already have a contact."
                      className={textareaClassName}
                    />
                  </div>
                </fieldset>

                <fieldset className="space-y-5 border-t border-white/10 pt-7">
                  <legend className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">
                    2. Teams and your involvement
                  </legend>

                  <div>
                    <label htmlFor="estimatedTeams" className="mb-2 block text-sm font-bold">
                      How many teams might you already be able to reach?
                    </label>
                    <select id="estimatedTeams" name="estimatedTeams" className={inputClassName}>
                      <option value="">Not sure yet</option>
                      <option value="1-3">1–3 teams</option>
                      <option value="4-6">4–6 teams</option>
                      <option value="7-9">7–9 teams</option>
                      <option value="10+">10 or more teams</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="teamConnections" className="mb-2 block text-sm font-bold">
                      Tell us about any team or football connections
                    </label>
                    <textarea
                      id="teamConnections"
                      name="teamConnections"
                      maxLength={2_000}
                      placeholder="Which teams, captains, clubs or local football groups could you genuinely contact?"
                      className={textareaClassName}
                    />
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    {[
                      [
                        "canIntroduceVenue",
                        "I can introduce SIXFL to a venue",
                        "You know the venue manager or can make a genuine introduction.",
                      ],
                      [
                        "canHelpRecruit",
                        "I can help recruit opening teams",
                        "You can contact local teams and explain the SIXFL offer.",
                      ],
                      [
                        "wantsOngoingRole",
                        "I may want to stay involved",
                        "A separate paid local role may be discussed where needed.",
                      ],
                    ].map(([name, title, description]) => (
                      <label
                        key={name}
                        className="flex cursor-pointer gap-3 rounded-2xl border border-white/10 bg-black/25 p-4 transition hover:border-white/20 hover:bg-white/[0.04]"
                      >
                        <input
                          type="checkbox"
                          name={name}
                          value="true"
                          className="mt-1 h-4 w-4 shrink-0 accent-emerald-500"
                        />
                        <span>
                          <span className="block text-sm font-bold">{title}</span>
                          <span className="mt-1 block text-xs leading-5 text-white/50">
                            {description}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>

                  <div>
                    <label htmlFor="experience" className="mb-2 block text-sm font-bold">
                      Relevant experience
                    </label>
                    <textarea
                      id="experience"
                      name="experience"
                      maxLength={2_000}
                      placeholder="Football, community organising, venues, sales, events or anything else that may help."
                      className={textareaClassName}
                    />
                  </div>
                </fieldset>

                <fieldset className="space-y-5 border-t border-white/10 pt-7">
                  <legend className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">
                    3. Your details
                  </legend>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                      <label htmlFor="contactName" className="mb-2 block text-sm font-bold">
                        Your name *
                      </label>
                      <input
                        id="contactName"
                        name="contactName"
                        required
                        maxLength={120}
                        autoComplete="name"
                        placeholder="Full name"
                        className={inputClassName}
                      />
                    </div>
                    <div>
                      <label htmlFor="phone" className="mb-2 block text-sm font-bold">
                        Phone number
                      </label>
                      <input
                        id="phone"
                        name="phone"
                        type="tel"
                        maxLength={50}
                        autoComplete="tel"
                        placeholder="Best contact number"
                        className={inputClassName}
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="email" className="mb-2 block text-sm font-bold">
                      Email address *
                    </label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      required
                      maxLength={254}
                      autoComplete="email"
                      placeholder="you@example.com"
                      className={inputClassName}
                    />
                  </div>

                  <div>
                    <label htmlFor="additionalNotes" className="mb-2 block text-sm font-bold">
                      Anything else we should know?
                    </label>
                    <textarea
                      id="additionalNotes"
                      name="additionalNotes"
                      maxLength={2_000}
                      placeholder="Add any other useful details about the area or opportunity."
                      className={textareaClassName}
                    />
                  </div>

                  <label className="flex cursor-pointer gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.07] p-4">
                    <input
                      type="checkbox"
                      name="termsAccepted"
                      value="true"
                      required
                      className="mt-1 h-4 w-4 shrink-0 accent-emerald-500"
                    />
                    <span className="text-xs leading-5 text-white/65">
                      I understand that the standard launch commission is 10% of
                      qualifying weekly team fees actually collected during the
                      approved league&apos;s first 12 months, capped at £2,500 per
                      league. SIXFL must approve the opportunity and agree my role,
                      qualifying work and payment terms in writing before
                      commission-earning work begins. *
                    </span>
                  </label>

                  <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-xs leading-5 text-white/50">
                    We will use these details only to assess and contact you about
                    this expansion opportunity.
                  </div>

                  <button
                    type="submit"
                    className="h-12 w-full rounded-full bg-emerald-500 text-sm font-extrabold text-black transition hover:bg-emerald-400"
                  >
                    Send opportunity
                  </button>
                </fieldset>
              </form>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-white/10 bg-white/[0.02]">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="text-center">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-300">
              Common questions
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">
              Clear from the start.
            </h2>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {[
              {
                question: "What would my role be?",
                answer:
                  "You help with the part of the launch agreed with SIXFL, such as introducing a venue or connecting opening teams. SIXFL builds and operates the league.",
              },
              {
                question: "How much could I earn?",
                answer:
                  "The standard commission is 10% of qualifying weekly team fees actually collected during the first 12 months, capped at £2,500 per approved league. A 12-team league paying £40 for 48 weeks would produce £2,304 commission.",
              },
              {
                question: "What counts as qualifying revenue?",
                answer:
                  "Standard weekly team fees actually paid for the approved league, excluding VAT, refunds, credits, chargebacks, kits, fines, late-payment charges, sponsorship and unrelated income.",
              },
              {
                question: "When would I be paid?",
                answer:
                  "Payments are made quarterly in arrears. The first payment is released once the league has completed three paid matchnights and is then backdated to the first paid matchnight.",
              },
              {
                question: "What happens if two people help?",
                answer:
                  "There is one £2,500 commission cap for the league. Any split between launch partners is agreed in writing before qualifying work begins.",
              },
              {
                question: "Can I also claim a team-referral reward?",
                answer:
                  "The normal team-referral reward is not added for teams already covered by your launch commission unless SIXFL approves both rewards separately in writing.",
              },
              {
                question: "What experience is useful?",
                answer:
                  "Local knowledge, genuine venue or team connections and the ability to follow through are most valuable. Football, community, events or sales experience can also help.",
              },
              {
                question: "Can I submit more than one area?",
                answer:
                  "Yes. Submit each distinct opportunity separately. A later second league in the same town or venue also needs its own approval and agreement.",
              },
            ].map((item) => (
              <article
                key={item.question}
                className="rounded-3xl border border-white/10 bg-white/[0.035] p-6"
              >
                <h3 className="text-lg font-extrabold">{item.question}</h3>
                <p className="mt-3 text-sm leading-6 text-white/60">
                  {item.answer}
                </p>
              </article>
            ))}
          </div>

          <div className="mt-10 text-center text-sm text-white/55">
            Need to ask something first?{" "}
            <Link
              href="/contact"
              className="font-bold text-emerald-300 transition hover:text-emerald-200"
            >
              Contact SIXFL
            </Link>
            .
          </div>
        </div>
      </section>
    </div>
  );
}
