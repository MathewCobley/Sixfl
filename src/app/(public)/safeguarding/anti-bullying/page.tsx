// ========================================
// File: src/app/(public)/safeguarding/anti-bullying/page.tsx
// ========================================

import Link from "next/link";

const policySections = [
  {
    title: "1. Our commitment",
    body: [
      "SIXFL believes that football should be safe, welcoming and enjoyable for everyone. Bullying, harassment, intimidation or discriminatory behaviour is not acceptable in our leagues, events, communications or associated activities.",
      "This policy applies to everyone involved with SIXFL, including children, young people, adults, disabled people, players, parents, carers, team managers, referees, volunteers, spectators, venue staff and league organisers.",
    ],
  },
  {
    title: "2. What bullying means",
    body: [
      "Bullying is behaviour by an individual or group that hurts, targets, excludes, humiliates, threatens or intimidates another person. It may be repeated, but a single serious incident can also be treated as bullying or unacceptable conduct.",
      "Bullying can happen in person, during matches, around venues, in team communications, by phone, by message or online through social media and group chats.",
    ],
  },
  {
    title: "3. Who may be affected",
    body: [
      "Anyone can experience bullying. SIXFL recognises that some people may be at greater risk of being targeted, including children, young people, disabled people, neurodivergent people, adults with care or support needs, and people targeted because of their appearance, ability, background, race, religion, sex, sexuality, gender identity or any other personal characteristic.",
      "Concerns will be taken seriously whether they are raised by the person affected or by someone else who has witnessed or become aware of the behaviour.",
    ],
  },
  {
    title: "4. Reporting concerns",
    body: [
      "Bullying concerns should be reported to SIXFL as soon as possible. Reports may be made by a player, parent, carer, team representative, referee, spectator, venue staff member or any other person involved in our activities.",
      "We will listen, consider the concern carefully and take proportionate steps to protect people and support a safe football environment.",
    ],
  },
  {
    title: "5. Action we may take",
    body: [
      "Where bullying or unacceptable behaviour is identified, SIXFL may take action including warnings, matchday sanctions, removal from venues, suspension from league activities, exclusion from future SIXFL events, or referral to appropriate safeguarding, welfare, venue or governing bodies where required.",
    ],
  },
];

const bullyingExamples = [
  "Name-calling, insults, repeated teasing or abusive language.",
  "Threatening, intimidating or humiliating another person.",
  "Physical aggression or unwanted physical contact.",
  "Deliberately excluding someone from a team, group or activity.",
  "Spreading rumours or encouraging others to isolate someone.",
  "Mocking a person’s appearance, ability, disability, background or identity.",
  "Discriminatory comments, gestures or behaviour.",
  "Sending abusive messages or using social media to target someone.",
];

const expectations = [
  "Treat others with dignity, fairness and respect.",
  "Challenge or report bullying rather than ignoring it.",
  "Think carefully before posting in team chats or on social media.",
  "Support people who may need help to speak up or understand what has happened.",
];

export default function AntiBullyingPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <section className="border-b border-white/10 bg-gradient-to-b from-emerald-950/40 via-black to-black">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-emerald-400">
              SIXFL Safeguarding
            </p>

            <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">
              Anti-Bullying Policy
            </h1>

            <p className="mt-5 text-lg leading-8 text-white/75 sm:text-xl">
              Everyone involved in SIXFL deserves to feel safe, respected and
              included. This policy applies to children, young people, adults,
              disabled people and anyone who takes part in, supports or attends
              our leagues.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-5">
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-300">
                Safe
              </p>
              <p className="mt-2 text-sm leading-6 text-white/75">
                We act where behaviour makes someone feel unsafe, targeted or
                intimidated.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-300">
                Inclusive
              </p>
              <p className="mt-2 text-sm leading-6 text-white/75">
                Our expectations apply to all people, not only children and
                young people.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-300">
                Reported
              </p>
              <p className="mt-2 text-sm leading-6 text-white/75">
                Concerns can be raised by the person affected or by someone who
                witnesses bullying.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="grid gap-8 lg:grid-cols-[1fr_360px] lg:items-start">
          <div className="space-y-6">
            {policySections.map((section) => (
              <article
                key={section.title}
                className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/20 md:p-8"
              >
                <h2 className="text-2xl font-bold text-white">
                  {section.title}
                </h2>

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

          <aside className="space-y-6 lg:sticky lg:top-24">
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
              <h2 className="text-xl font-bold text-white">
                Examples of bullying
              </h2>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-white/75">
                {bullyingExamples.map((example) => (
                  <li key={example} className="flex gap-3">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                    <span>{example}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
              <h2 className="text-xl font-bold text-white">
                What we expect
              </h2>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-white/75">
                {expectations.map((item) => (
                  <li key={item} className="flex gap-3">
                    <span className="mt-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-xs font-black text-emerald-300">
                      ✓
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-3xl border border-emerald-400/30 bg-emerald-400/10 p-6">
              <h2 className="text-xl font-bold text-white">Report a concern</h2>
              <p className="mt-3 text-sm leading-6 text-white/75">
                If you need to report a bullying concern relating to SIXFL,
                please contact us. Include what happened, when it happened, who
                was involved and whether anyone is at immediate risk.
              </p>
              <a
                href="mailto:hello@sixfl.co.uk"
                className="mt-5 inline-flex rounded-full bg-emerald-400 px-5 py-3 text-sm font-black text-black transition hover:bg-emerald-300"
              >
                hello@sixfl.co.uk
              </a>
            </div>
          </aside>
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
