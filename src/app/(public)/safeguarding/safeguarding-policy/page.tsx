// ========================================
// File: src/app/(public)/safeguarding/safeguarding-policy/page.tsx
// ========================================

import Link from "next/link";

const documentDetails = [
  { label: "Policy", value: "Safeguarding Policy" },
  { label: "Version", value: "1.0" },
  { label: "Status", value: "Active" },
  { label: "Last updated", value: "2 July 2026" },
  { label: "Next review", value: "2 July 2027" },
  { label: "Policy owner", value: "SIXFL Safeguarding" },
  { label: "Applies to", value: "All SIXFL participants, officials and attendees" },
];

const policySections = [
  {
    title: "1. Purpose",
    body: [
      "The purpose of this policy is to set out SIXFL’s commitment to safeguarding and promoting the welfare of children, young people, adults at risk and all participants involved in our football leagues and events.",
      "SIXFL believes football should be safe, enjoyable and inclusive. Everyone has the right to participate in sport free from abuse, bullying, harassment, discrimination or unsafe conduct.",
    ],
  },
  {
    title: "2. Scope",
    body: [
      "This policy applies to all SIXFL activities, including leagues, fixtures, events, communications, online interactions and any associated activity involving SIXFL participants or representatives.",
      "It applies to players, parents, carers, team managers, referees, volunteers, spectators, venue staff, league organisers and any person connected with SIXFL activities.",
    ],
  },
  {
    title: "3. Our safeguarding commitment",
    body: [
      "SIXFL will work to create an environment where people feel safe, respected and able to speak up if something is wrong.",
      "We recognise that some people may be more vulnerable to harm or may need additional support to raise concerns, including children, young people, disabled people, neurodivergent people and adults with care or support needs.",
    ],
  },
  {
    title: "4. Responsibility",
    body: [
      "Safeguarding is everyone’s responsibility. League organisers, referees, team representatives and volunteers must act appropriately, respond to concerns seriously and report safeguarding concerns without delay.",
      "Participants and spectators are expected to behave respectfully and help maintain a safe football environment for everyone involved.",
    ],
  },
  {
    title: "5. Reporting concerns",
    body: [
      "Any safeguarding concern relating to SIXFL should be reported as soon as possible. Concerns may include abuse, bullying, harassment, discrimination, unsafe behaviour, poor conduct or anything that makes a participant feel unsafe or uncomfortable.",
      "Where appropriate, SIXFL may share information with relevant safeguarding, welfare, venue or governing bodies to help protect those involved.",
    ],
  },
  {
    title: "6. Review of this policy",
    body: [
      "This policy will be reviewed at least annually, or sooner if there is a significant change in SIXFL activity, safeguarding practice, legal requirements or relevant guidance.",
    ],
  },
];

export default function SafeguardingPolicy() {
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
                Safeguarding Policy
              </h1>

              <p className="mt-5 text-lg leading-8 text-white/75 sm:text-xl">
                SIXFL is committed to safeguarding and promoting the welfare of
                children, young people, adults at risk and everyone who takes
                part in, supports or attends our leagues.
              </p>

              <div className="mt-8 rounded-3xl border border-emerald-400/25 bg-emerald-400/10 p-6">
                <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-300">
                  Policy statement
                </p>
                <p className="mt-3 leading-7 text-white/80">
                  SIXFL will take safeguarding concerns seriously and respond
                  proportionately to protect participants, maintain safe football
                  environments and promote respectful conduct across our leagues.
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
          {policySections.map((section) => (
            <article
              key={section.title}
              className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/20 md:p-8"
            >
              <h2 className="text-2xl font-bold text-white">{section.title}</h2>
              <div className="mt-4 space-y-4 text-white/75">
                {section.body.map((paragraph) => (
                  <p key={paragraph} className="leading-7">
                    {paragraph}
                  </p>
                ))}
              </div>
            </article>
          ))}
        </div>

        <div className="mt-10 rounded-3xl border border-emerald-400/30 bg-emerald-400/10 p-6">
          <h2 className="text-xl font-bold text-white">Report a concern</h2>
          <p className="mt-3 text-sm leading-6 text-white/75">
            If you have a safeguarding concern relating to SIXFL leagues,
            contact us as soon as possible.
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
