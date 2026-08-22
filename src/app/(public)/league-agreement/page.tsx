// ========================================
// File: src/app/(public)/league-agreement/page.tsx
// ========================================

import Link from "next/link";

import {
  LEAGUE_AGREEMENT_EFFECTIVE_DATE,
  LEAGUE_AGREEMENT_NEXT_REVIEW,
  LEAGUE_AGREEMENT_VERSION,
  leagueAgreementSections,
} from "@/lib/league-agreement";

const documentDetails = [
  { label: "Document", value: "League Participation Agreement" },
  { label: "Version", value: LEAGUE_AGREEMENT_VERSION },
  { label: "Status", value: "Active" },
  { label: "Effective", value: LEAGUE_AGREEMENT_EFFECTIVE_DATE },
  { label: "Next review", value: LEAGUE_AGREEMENT_NEXT_REVIEW },
  { label: "Owner", value: "SIXFL League Operations" },
  { label: "Applies to", value: "Registered teams, captains and players" },
];

export default function LeagueAgreementPage() {
  return (
    <div className="space-y-10">
      <section className="rounded-3xl border border-white/10 bg-white/5 px-6 py-10 md:px-10">
        <div className="grid gap-8 lg:grid-cols-[1fr_360px] lg:items-start">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-400">
              SIXFL AGREEMENT
            </p>

            <h1 className="mt-3 text-4xl font-black tracking-tight text-white md:text-5xl">
              League Participation Agreement
            </h1>

            <p className="mt-4 text-white/70 md:text-lg">
              This agreement sets out the responsibilities accepted by teams,
              captains and players participating in SIXFL leagues.
            </p>

            <div className="mt-6 rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-5">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">
                Agreement statement
              </p>
              <p className="mt-3 text-sm leading-6 text-white/75">
                The active agreement is versioned and dated. Superseded versions
                are retained internally alongside earlier League and Match Rules.
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
        {leagueAgreementSections.map((section) => (
          <AgreementSection
            key={section.title}
            title={section.title}
            points={section.points}
          />
        ))}
      </div>

      <section className="rounded-3xl border border-emerald-500/20 bg-emerald-500/10 px-6 py-8">
        <h2 className="text-2xl font-black text-white">
          Questions about this agreement?
        </h2>

        <p className="mt-3 text-white/70">
          If you have a genuine question about league participation or a rule
          which applies to your team, please contact SIXFL.
        </p>

        <div className="mt-6 flex flex-wrap gap-4">
          <Link
            href="/contact"
            className="inline-flex items-center justify-center rounded-full bg-emerald-500 px-6 py-3 text-sm font-extrabold text-black transition hover:bg-emerald-400"
          >
            Contact SIXFL
          </Link>

          <Link
            href="/league-rules"
            className="inline-flex items-center justify-center rounded-full border border-white/20 px-6 py-3 text-sm font-bold text-white transition hover:bg-white/10"
          >
            View League Rules
          </Link>
        </div>
      </section>

      <div className="flex flex-wrap gap-4 text-sm">
        <Link
          href="/match-rules"
          className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-white/80 transition hover:border-emerald-400/40 hover:text-white"
        >
          View Match Rules
        </Link>

        <Link
          href="/league-rules"
          className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-white/80 transition hover:border-emerald-400/40 hover:text-white"
        >
          View League Rules
        </Link>

        <Link
          href="/founding-team-kit-terms"
          className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-white/80 transition hover:border-emerald-400/40 hover:text-white"
        >
          View Kit Offer Terms
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

function AgreementSection({
  title,
  points,
}: {
  title: string;
  points: string[];
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <h2 className="text-lg font-bold text-white">{title}</h2>
      <div className="mt-3 space-y-2 leading-7 text-white/75">
        {points.map((point) => (
          <p key={point}>{point}</p>
        ))}
      </div>
    </section>
  );
}
