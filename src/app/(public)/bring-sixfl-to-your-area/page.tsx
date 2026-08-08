// ========================================
// File: src/app/(public)/bring-sixfl-to-your-area/page.tsx
// ========================================

import type { Metadata } from "next";
import Link from "next/link";

import { submitExpansionLeadAction } from "./actions";

export const metadata: Metadata = {
  title: "Bring SIXFL to Your Area | SIXFL",
  description:
    "Help SIXFL identify a new league opportunity, venue and opening teams in your area. Approved launch partners can earn an agreed commission when a league successfully launches.",
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
    return "Please confirm that you understand how commission eligibility works.";
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
    title: "We agree a launch plan",
    text: "Before commission-earning work begins, we confirm your role, the qualifying milestones and the payment available.",
  },
  {
    number: "04",
    title: "Help us launch",
    text: "You make the agreed introductions or recruit teams. SIXFL owns and operates the league and pays when the conditions are met.",
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
  "Complete only the work agreed with SIXFL",
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
                Know a town that needs a properly run six-a-side league? Help
                SIXFL identify the venue and opening teams. When an approved
                opportunity launches and the agreed conditions are met, you can
                earn a commission.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a
                  href="#apply"
                  className="inline-flex h-12 items-center justify-center rounded-full bg-emerald-500 px-6 text-sm font-extrabold text-black transition hover:-translate-y-0.5 hover:bg-emerald-400"
                >
                  Tell us about an area
                </a>
                <a
                  href="#how-it-works"
                  className="inline-flex h-12 items-center justify-center rounded-full border border-white/10 bg-white/5 px-6 text-sm font-bold text-white transition hover:bg-white/10"
                >
                  See how it works
                </a>
              </div>
            </div>

            <aside className="rounded-[2rem] border border-emerald-400/20 bg-emerald-500/[0.07] p-6 shadow-2xl shadow-black/40 sm:p-8">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">
                SIXFL stays in control
              </p>
              <h2 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">
                A launch-partner opportunity, not a franchise.
              </h2>
              <p className="mt-4 text-sm leading-7 text-white/70">
                SIXFL creates, owns and operates every league. You can help us
                find the local opportunity, make introductions and recruit the
                first teams. We agree the role, qualifying conditions and
                commission in writing before any commission-earning work begins.
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                {[
                  "SIXFL owns the league",
                  "SIXFL controls pricing",
                  "SIXFL manages payments",
                  "You earn an agreed reward",
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
            <strong className="text-amber-100">Important:</strong> simply naming
            a town does not qualify for payment. An area is not reserved, and no
            commission is due unless SIXFL approves the opportunity and agrees
            the terms with you in writing before the relevant work begins.
          </div>
        </div>
      </section>

      <section className="border-b border-white/10">
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
                A separate paid local coordinator role may be discussed after
                launch where SIXFL needs one. It is not automatic and does not
                change ownership of the league.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section id="apply" className="scroll-mt-24 border-b border-white/10 bg-white/[0.02]">
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
                  "No fee to submit an opportunity",
                  "No obligation to continue",
                  "No area is reserved by submitting",
                  "Commission is agreed before qualifying work",
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
                        <option value="MENS">Men’s league</option>
                        <option value="WOMENS">Women’s league</option>
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
                      I understand that submitting an area does not reserve it or
                      create a right to commission. Any role, qualifying conditions
                      and commission must be approved and agreed in writing by
                      SIXFL before commission-earning work begins. *
                    </span>
                  </label>

                  <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-xs leading-5 text-white/50">
                    We will use these details to assess and contact you about this
                    expansion opportunity. This form does not add you to a general
                    marketing list.
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

      <section className="border-b border-white/10">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
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
                question: "Would I own or run the league?",
                answer:
                  "No. SIXFL owns and operates the league. You may help with an agreed part of the launch, and a separate local coordination role can be discussed later where needed.",
              },
              {
                question: "Is commission automatic when I submit an area?",
                answer:
                  "No. We first assess the opportunity. Commission only applies where SIXFL agrees the role, milestones and payment with you in writing before the relevant work starts.",
              },
              {
                question: "Do I need football-management experience?",
                answer:
                  "Not necessarily. Reliable local knowledge, genuine venue or team connections and the ability to follow through are often more valuable.",
              },
              {
                question: "Can I submit more than one area?",
                answer:
                  "Yes. Please submit a separate form for each distinct opportunity so we can assess and track them properly.",
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
