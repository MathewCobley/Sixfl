// ========================================
// File: src/app/(public)/safeguarding/reporting-concerns/page.tsx
// ========================================

import Link from "next/link";

const documentDetails = [
  { label: "Document", value: "Reporting Safeguarding Concerns" },
  { label: "Version", value: "1.0" },
  { label: "Status", value: "Active" },
  { label: "Last updated", value: "2 July 2026" },
  { label: "Next review", value: "2 July 2027" },
  { label: "Owner", value: "SIXFL Safeguarding" },
  { label: "Applies to", value: "All SIXFL participants, officials and attendees" },
];

const reportingSections = [
  {
    title: "1. Purpose",
    body: [
      "This document explains how safeguarding, welfare and behaviour concerns relating to SIXFL should be reported and how those concerns will be handled.",
      "SIXFL takes concerns seriously and encourages concerns to be raised as soon as possible so that appropriate action can be considered.",
    ],
  },
  {
    title: "2. Why reporting concerns matters",
    body: [
      "Reporting concerns helps ensure that appropriate action can be taken to protect participants and maintain a safe football environment.",
      "A concern does not need to be proved before it is reported. If someone feels unsafe, uncomfortable or worried about another person’s welfare, it should be raised.",
    ],
  },
  {
    title: "3. What should be reported",
    list: [
      "Bullying, harassment or discriminatory behaviour.",
      "Abusive language, intimidation or threatening behaviour.",
      "Unsafe conduct by players, spectators, officials or venue users.",
      "Concerns about the welfare of a child, young person, adult at risk or disabled participant.",
      "Any behaviour that makes someone feel unsafe, targeted or uncomfortable.",
    ],
  },
  {
    title: "4. How to report a concern",
    body: [
      "Safeguarding concerns can be reported directly to SIXFL by email. Please provide as much detail as possible, including the nature of the concern, where it occurred, who was involved and whether anyone is at immediate risk.",
      "Concerns may be raised by the person affected, a parent, carer, player, team representative, referee, spectator, venue staff member or any other person who has witnessed or become aware of the issue.",
    ],
  },
  {
    title: "5. Confidentiality and information sharing",
    body: [
      "SIXFL will treat safeguarding concerns with sensitivity and respect. Information will only be shared where necessary to consider the concern, protect those involved or meet safeguarding, welfare, legal or governing-body responsibilities.",
    ],
  },
  {
    title: "6. Immediate danger",
    body: [
      "If a child, adult or participant is in immediate danger, contact emergency services or the appropriate authorities immediately before contacting SIXFL.",
    ],
  },
];

export default function ReportingConcernsPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <section className="border-b border-white/10 bg-gradient-to-b from-emerald-950/40 via-black to-black">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="grid gap-10 lg:grid-cols-[1fr_380px] lg:items-start">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-emerald-400">
                SIXFL Safeguarding
              </p>

              <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">
                Reporting Safeguarding Concerns
              </h1>

              <p className="mt-5 text-lg leading-8 text-white/75 sm:text-xl">
                If you have concerns about the safety, welfare or treatment of a
                participant, we encourage you to report it as soon as possible.
              </p>

              <div className="mt-8 rounded-3xl border border-emerald-400/25 bg-emerald-400/10 p-6">
                <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-300">
                  Reporting statement
                </p>
                <p className="mt-3 leading-7 text-white/80">
                  Concerns do not need to be proved before they are reported.
                  SIXFL will consider concerns carefully and take proportionate
                  steps where needed to protect participants and maintain a safe
                  football environment.
                </p>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/20">
              <h2 className="text-xl font-bold text-white">Document control</h2>
              <dl className="mt-5 divide-y divide-white/10">
                {documentDetails.map((detail) => (
                  <div
                    key={detail.label}
                    className="grid grid-cols-[130px_1fr] gap-4 py-3 text-sm"
                  >
                    <dt className="font-semibold text-white/55">{detail.label}</dt>
                    <dd className="font-semibold text-white/90">{detail.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="space-y-6">
          {reportingSections.map((section) => (
            <article
              key={section.title}
              className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/20 md:p-8"
            >
              <h2 className="text-2xl font-bold text-white">{section.title}</h2>

              {section.body && (
                <div className="mt-4 space-y-4 text-white/75">
                  {section.body.map((paragraph) => (
                    <p key={paragraph} className="leading-7">
                      {paragraph}
                    </p>
                  ))}
                </div>
              )}

              {section.list && (
                <ul className="mt-4 list-disc space-y-2 pl-6 leading-7 text-white/75">
                  {section.list.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>

        <div className="mt-10 rounded-3xl border border-emerald-400/30 bg-emerald-400/10 p-6">
          <h2 className="text-xl font-bold text-white">Report a concern</h2>
          <p className="mt-3 text-sm leading-6 text-white/75">
            Email SIXFL with what happened, when it happened, who was involved
            and whether anyone is at immediate risk.
          </p>
          <a
            href="mailto:hello@sixfl.co.uk"
            className="mt-5 inline-flex rounded-full bg-emerald-400 px-5 py-3 text-sm font-black text-black transition hover:bg-emerald-300"
          >
            hello@sixfl.co.uk
          </a>
        </div>

        <div className="mt-10 border-t border-white/10 pt-6">
          <Link
            href="/safeguarding"
            className="font-semibold text-emerald-400 transition hover:text-emerald-300"
          >
            ← Back to Safeguarding
          </Link>
        </div>
      </section>
    </main>
  );
}
