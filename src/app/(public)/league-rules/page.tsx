// ========================================
// File: src/app/(public)/league-rules/page.tsx
// ========================================

import Link from "next/link";

import {
  LEAGUE_RULES_EFFECTIVE_DATE,
  LEAGUE_RULES_NEXT_REVIEW,
  LEAGUE_RULES_VERSION,
  leagueRuleSections,
} from "@/lib/league-rules";

const documentDetails = [
  { label: "Document", value: "League Rules" },
  { label: "Version", value: LEAGUE_RULES_VERSION },
  { label: "Status", value: "Active" },
  { label: "Effective", value: LEAGUE_RULES_EFFECTIVE_DATE },
  { label: "Next review", value: LEAGUE_RULES_NEXT_REVIEW },
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
              These rules set out the competition, payment, conduct and fixture
              requirements for SIXFL teams. The Match Rules cover the laws and
              procedures used on the pitch.
            </p>

            <div className="mt-6 rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-5">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">
                Rules statement
              </p>
              <p className="mt-3 text-sm leading-6 text-white/75">
                Active rules are versioned and dated. SIXFL retains superseded
                versions internally so the wording in force at an earlier date
                can be identified.
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
        {leagueRuleSections.map((section) => (
          <RulesSection
            key={section.title}
            title={section.title}
            points={section.points}
          />
        ))}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-6 text-sm text-white/70">
        These rules apply to all SIXFL leagues unless SIXFL has expressly
        notified a more specific competition or venue rule.
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
  points,
}: {
  title: string;
  points: string[];
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 px-6 py-6">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <div className="mt-3 space-y-2 leading-7 text-white/70">
        {points.map((point) => (
          <p key={point}>{point}</p>
        ))}
      </div>
    </section>
  );
}
