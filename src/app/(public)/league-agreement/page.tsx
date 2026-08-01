// ========================================
// File: src/app/(public)/league-agreement/page.tsx
// ========================================

import Link from "next/link";

const documentDetails = [
  { label: "Document", value: "League Participation Agreement" },
  { label: "Version", value: "1.1" },
  { label: "Status", value: "Active" },
  { label: "Last updated", value: "1 August 2026" },
  { label: "Next review", value: "1 August 2027" },
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
              This agreement outlines the responsibilities of teams and players
              participating in SIXFL leagues. By registering a team or
              participating in a SIXFL competition, you agree to the terms below.
            </p>

            <div className="mt-6 rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-5">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">
                Agreement statement
              </p>
              <p className="mt-3 text-sm leading-6 text-white/75">
                This agreement supports fair league management, clear team
                responsibilities and respectful participation in SIXFL fixtures.
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
        <AgreementSection
          title="1. Team Registration"
          text="Teams register for a SIXFL league through a designated team captain or organiser. The captain confirms they are authorised to enter the team into the league and communicate with SIXFL on behalf of the team."
        />

        <AgreementSection
          title="2. Captain Responsibilities"
          text="The team captain acts as the primary contact for the league. The captain is responsible for ensuring team members are aware of fixtures, league rules and conduct expectations."
        />

        <AgreementSection
          title="3. Match Attendance"
          text="Teams are expected to attend scheduled fixtures. If a team cannot attend a match, they should notify the league as early as possible. Failure to attend may result in the match being recorded as a forfeit."
        />

        <AgreementSection
          title="4. Player Conduct"
          text="Players are expected to behave respectfully toward opponents, referees and league organisers. Unsporting or abusive behaviour may result in disciplinary action or removal from the league."
        />

        <AgreementSection
          title="5. Referee Authority"
          text="All matches are officiated by referees appointed by the league. Decisions made by the referee during the match are final."
        />

        <AgreementSection
          title="6. Fixtures and Scheduling"
          text="Fixtures are organised and communicated by SIXFL. Match schedules may occasionally change due to weather, venue availability or other operational factors."
        />

        <AgreementSection
          title="7. League Management"
          text="SIXFL reserves the right to make reasonable decisions in the interest of fair play, safety and the smooth running of the league."
        />

        <AgreementSection
          title="8. Participation Risk"
          text="Football is a physical sport and participation carries a risk of injury. Players take part at their own risk and are responsible for ensuring they are fit to play."
        />

        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/[0.07] p-6">
          <h2 className="text-lg font-bold text-white">9. Founding Team Kit Package</h2>
          <p className="mt-2 leading-7 text-white/75">
            Where SIXFL expressly offers a team the Founding Team Kit Package, the package
            consists of nine complete personalised playing kits for a compulsory total team
            contribution of £90, equivalent to £10 per shirt. Payment is required before the
            order is placed. The captain is responsible for checking all sizes, names and
            numbers before submission.
          </p>
          <Link
            href="/founding-team-kit-terms"
            className="mt-4 inline-flex min-h-10 items-center rounded-full border border-amber-300/25 bg-amber-500/10 px-4 text-sm font-bold text-amber-100 transition hover:bg-amber-500/15"
          >
            Read the full Kit Package Terms
          </Link>
        </div>

        <AgreementSection
          title="10. Agreement Acceptance"
          text="By registering a team, joining a team or participating in a SIXFL match, players acknowledge and agree to these participation terms. A captain who submits a Founding Team Kit Package order also confirms acceptance of the separate Kit Package Terms."
        />
      </div>

      <section className="rounded-3xl border border-emerald-500/20 bg-emerald-500/10 px-6 py-8">
        <h2 className="text-2xl font-black text-white">
          Questions about this agreement?
        </h2>

        <p className="mt-3 text-white/70">
          If you have any questions about league participation, team registration or the
          Founding Team Kit Package, please contact SIXFL.
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
          View Kit Package Terms
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
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <h2 className="text-lg font-bold text-white">{title}</h2>
      <p className="mt-2 leading-7 text-white/75">{text}</p>
    </div>
  );
}
