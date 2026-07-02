// ========================================
// File: src/app/(public)/safeguarding/code-of-conduct/page.tsx
// ========================================

import Link from "next/link";

const documentDetails = [
  { label: "Document", value: "Code of Conduct" },
  { label: "Version", value: "1.0" },
  { label: "Status", value: "Active" },
  { label: "Last updated", value: "2 July 2026" },
  { label: "Next review", value: "2 July 2027" },
  { label: "Owner", value: "SIXFL Safeguarding" },
  { label: "Applies to", value: "All SIXFL participants, officials and attendees" },
];

const conductSections = [
  {
    title: "1. Purpose",
    body: [
      "This Code of Conduct sets out the standards of behaviour expected from everyone involved in SIXFL leagues, fixtures, events and associated communications.",
      "It supports SIXFL’s commitment to safe, respectful, inclusive and well-organised football.",
    ],
  },
  {
    title: "2. Respect for others",
    body: [
      "All participants must treat others with dignity, fairness and respect at all times. This includes players, referees, league organisers, spectators, parents, carers, volunteers and venue staff.",
      "Discrimination, abusive language, harassment, bullying, intimidation or threatening behaviour will not be tolerated within SIXFL leagues.",
    ],
  },
  {
    title: "3. Player conduct",
    list: [
      "Play fairly and respect the rules of the game.",
      "Accept the decisions of referees and match officials.",
      "Show respect to opponents before, during and after matches.",
      "Avoid aggressive, dangerous or unsporting behaviour.",
      "Encourage teammates and promote a positive team environment.",
    ],
  },
  {
    title: "4. Team responsibility",
    body: [
      "Team captains and organisers are responsible for helping ensure their players and supporters behave appropriately.",
      "Teams must help create a safe and welcoming football environment and cooperate with league organisers, referees and venue staff where required.",
    ],
  },
  {
    title: "5. Spectator behaviour",
    list: [
      "Support players in a positive and respectful way.",
      "Avoid abusive language, intimidation or aggressive behaviour.",
      "Respect referees, match officials, opponents and venue staff.",
      "Help maintain a safe environment for children, young people, adults and disabled participants.",
    ],
  },
  {
    title: "6. Safeguarding",
    body: [
      "SIXFL takes safeguarding seriously. All participants share responsibility for ensuring people feel safe, respected and supported while taking part in football.",
      "Any safeguarding, welfare or behaviour concern should be reported to SIXFL as soon as possible.",
    ],
  },
  {
    title: "7. Breaches of this code",
    body: [
      "Failure to follow this Code of Conduct may result in action by SIXFL. This could include warnings, match suspensions, removal from venues, exclusion from league participation or referral to appropriate bodies where required.",
    ],
  },
];

export default function CodeOfConductPage() {
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
                Code of Conduct
              </h1>

              <p className="mt-5 text-lg leading-8 text-white/75 sm:text-xl">
                This Code of Conduct explains the behaviour expected from
                players, teams, spectators, referees and everyone involved in
                SIXFL leagues.
              </p>

              <div className="mt-8 rounded-3xl border border-emerald-400/25 bg-emerald-400/10 p-6">
                <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-300">
                  Conduct statement
                </p>
                <p className="mt-3 leading-7 text-white/80">
                  SIXFL expects everyone to help create a positive, fair and
                  respectful football environment. Poor conduct may result in
                  action where necessary to protect participants and the league.
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
          {conductSections.map((section) => (
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
            If you have concerns regarding behaviour within a SIXFL league,
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
