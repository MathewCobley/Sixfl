// ========================================
// File: src/app/(public)/league-rules/page.tsx
// ========================================

import Link from "next/link";

const documentDetails = [
  { label: "Document", value: "League Rules" },
  { label: "Version", value: "1.1" },
  { label: "Status", value: "Active" },
  { label: "Last updated", value: "21 July 2026" },
  { label: "Next review", value: "21 July 2027" },
  { label: "Owner", value: "SIXFL League Operations" },
  { label: "Applies to", value: "All SIXFL teams, players and league fixtures" },
];

export default function LeagueRulesPage() {
  return (
    <div className="space-y-10">
      <section className="rounded-3xl border border-white/10 bg-white/5 px-6 py-10 md:px-10">
        <div className="grid gap-8 lg:grid-cols-[1fr_360px] lg:items-start">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-400">
              SIXFL RULES
            </p>

            <h1 className="mt-3 text-4xl font-black tracking-tight text-white md:text-5xl">
              League Rules
            </h1>

            <p className="mt-4 text-white/70 md:text-lg">
              These rules outline the basic structure and expectations for teams
              participating in SIXFL competitions. Our aim is to provide a fair,
              well-organised and enjoyable football experience for all players.
            </p>

            <div className="mt-6 rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-5">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">
                Rules statement
              </p>
              <p className="mt-3 text-sm leading-6 text-white/75">
                These rules apply to all SIXFL leagues unless a league, venue or
                competition format confirms a specific local rule.
              </p>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/20 p-6">
            <h2 className="text-xl font-bold text-white">Document control</h2>
            <dl className="mt-5 divide-y divide-white/10">
              {documentDetails.map((detail) => (
                <div
                  key={detail.label}
                  className="grid grid-cols-[120px_1fr] gap-4 py-3 text-sm"
                >
                  <dt className="font-semibold text-white/55">{detail.label}</dt>
                  <dd className="font-semibold text-white/90">{detail.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <div className="space-y-6">
        <RulesSection
          title="1. Team Registration"
          text="All teams must complete the SIXFL registration process and provide accurate captain and player details before participating in league matches."
        />

        <RulesSection
          title="2. Match Format"
          text="Matches are played as 6-a-side fixtures in accordance with SIXFL competition regulations. Specific venue rules, kick-off times and fixture details will be communicated by the league."
        />

        <RulesSection
          title="3. Player Eligibility"
          text="Only properly registered players may represent a team in league fixtures. Teams may not field ineligible players or deliberately misrepresent player identity."
        />

        <RulesSection
          title="4. Squad and Substitute Limits"
          text="A team may register a maximum active squad of 15 players. A maximum of nine players may be named for any fixture, consisting of six starting players and no more than three rolling substitutes. Any guest players used for a fixture count within this nine-player matchday limit. Exceptions require prior approval from SIXFL."
        />

        <RulesSection
          title="5. Respect and Conduct"
          text="Players, captains and spectators must behave respectfully towards referees, opponents and league staff. Abuse, threatening behaviour and serious misconduct may result in suspension or removal from the league."
        />

        <RulesSection
          title="6. Results and League Table"
          text="Match results are recorded by the referee or league administrator and used to update the standings. SIXFL reserves the right to amend results where errors or rule breaches are identified."
        />

        <RulesSection
          title="7. Discipline"
          text="SIXFL may take disciplinary action in response to misconduct, dangerous play, abusive language, repeated non-attendance or any behaviour that brings the league into disrepute."
        />

        <RulesSection
          title="8. Fixtures and Cancellations"
          text="Fixtures are scheduled by SIXFL and may be changed where necessary due to venue issues, weather, operational requirements or exceptional circumstances."
        />

        <RulesSection
          title="9. League Decisions"
          text="SIXFL reserves the right to interpret and apply league rules in the interests of fairness, safety and good league management. League decisions are final unless otherwise stated."
        />
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-6 text-sm text-white/70">
        These rules apply to all SIXFL leagues unless otherwise stated.
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <Link
          href="/match-rules"
          className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-white/80 transition hover:border-emerald-400/40 hover:text-white"
        >
          View Match Rules
        </Link>

        <Link
          href="/league-agreement"
          className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-white/80 transition hover:border-emerald-400/40 hover:text-white"
        >
          View League Agreement
        </Link>

        <Link
          href="/referee-agreement"
          className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-white/80 transition hover:border-emerald-400/40 hover:text-white"
        >
          View Referee Agreement
        </Link>
      </div>
    </div>
  );
}

function RulesSection({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 px-6 py-6">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <p className="mt-2 text-white/70">{text}</p>
    </section>
  );
}
