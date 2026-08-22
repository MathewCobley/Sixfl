// ========================================
// File: src/app/(public)/match-rules/page.tsx
// ========================================

import Link from "next/link";

import { MATCH_RULES_VERSION, matchRuleSections } from "@/lib/match-rules";

const documentDetails = [
  { label: "Document", value: "Match Rules" },
  { label: "Version", value: MATCH_RULES_VERSION.replace("Version ", "") },
  { label: "Status", value: "Active" },
  { label: "Effective", value: "22 August 2026" },
  { label: "Next review", value: "22 August 2027" },
  { label: "Owner", value: "SIXFL League Operations" },
  { label: "Applies to", value: "All SIXFL matches and competitions" },
];

export default function MatchRulesPage() {
  return (
    <div className="space-y-10">
      <section className="rounded-3xl border border-white/10 bg-white/5 px-6 py-10 md:px-10">
        <div className="grid gap-8 lg:grid-cols-[1fr_360px] lg:items-start">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-400">
              SIXFL MATCH RULES
            </p>

            <h1 className="mt-3 text-4xl font-black tracking-tight text-white md:text-5xl">
              Match Rules
            </h1>

            <p className="mt-4 text-white/70 md:text-lg">
              These rules outline how SIXFL matches are played. They apply to all
              SIXFL competitions unless otherwise stated by the league.
            </p>

            <div className="mt-6 rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-5">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">
                Match rules statement
              </p>
              <p className="mt-3 text-sm leading-6 text-white/75">
                These match rules support fair play, safe match management and a
                consistent experience across SIXFL fixtures. League administration,
                payments and competition outcomes are governed by the League Rules.
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
        {matchRuleSections.map((section) => (
          <Rule key={section.title} title={section.title} points={section.points} />
        ))}
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <Link
          href="/league-rules"
          className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-white/80 transition hover:border-emerald-400/40 hover:text-white"
        >
          View League Rules
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

function Rule({
  title,
  points,
}: {
  title: string;
  points: string[];
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <h2 className="text-lg font-bold text-white">{title}</h2>
      <div className="mt-3 space-y-2 leading-7 text-white/75">
        {points.map((point) => (
          <p key={point}>{point}</p>
        ))}
      </div>
    </div>
  );
}
