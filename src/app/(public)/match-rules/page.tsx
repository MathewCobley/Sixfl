// ========================================
// File: src/app/(public)/match-rules/page.tsx
// ========================================

import Link from "next/link";

import { MATCH_RULES_VERSION, matchRuleSections } from "@/lib/match-rules";

export default function MatchRulesPage() {
  return (
    <div className="space-y-10">
      <section className="rounded-3xl border border-white/10 bg-white/5 px-6 py-10 md:px-10">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-400">
            SIXFL MATCH RULES
          </p>

          <h1 className="mt-3 text-4xl font-black tracking-tight text-white md:text-5xl">
            Match Rules
          </h1>

          <p className="mt-2 text-sm text-white/50">
            {MATCH_RULES_VERSION}
          </p>

          <p className="mt-4 text-white/70 md:text-lg">
            These rules outline how SIXFL matches are played. They apply to all
            SIXFL competitions unless otherwise stated by the league.
          </p>
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
