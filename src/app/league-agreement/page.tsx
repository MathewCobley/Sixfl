// ========================================
// File: src/app/league-agreement/page.tsx
// ========================================

import Link from "next/link";

export default function LeagueAgreementPage() {
  return (
    <div className="space-y-10">

      <section className="rounded-3xl border border-white/10 bg-white/5 px-6 py-10 md:px-10">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-400">
            SIXFL
          </p>

          <h1 className="mt-3 text-4xl font-black tracking-tight text-white md:text-5xl">
            League Participation Agreement
          </h1>

          <p className="mt-4 text-white/70 md:text-lg">
            This agreement outlines the responsibilities of teams and players
            participating in SIXFL leagues. By registering a team or
            participating in a SIXFL competition, you agree to the terms below.
          </p>
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

        <AgreementSection
          title="9. Agreement Acceptance"
          text="By registering a team, joining a team or participating in a SIXFL match, players acknowledge and agree to these participation terms."
        />

      </div>

      <section className="rounded-3xl border border-emerald-500/20 bg-emerald-500/10 px-6 py-8">
        <h2 className="text-2xl font-black text-white">
          Questions about this agreement?
        </h2>

        <p className="mt-3 text-white/70">
          If you have any questions about league participation or team
          registration, please contact SIXFL.
        </p>

        <div className="mt-6 flex gap-4">
          <a
            href="mailto:hello@sixfl.co.uk"
            className="inline-flex items-center justify-center rounded-full bg-emerald-500 px-6 py-3 text-sm font-extrabold text-black transition hover:bg-emerald-400"
          >
            Contact SIXFL
          </a>

          <Link
            href="/league-rules"
            className="inline-flex items-center justify-center rounded-full border border-white/20 px-6 py-3 text-sm font-bold text-white transition hover:bg-white/10"
          >
            View League Rules
          </Link>
        </div>
      </section>

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