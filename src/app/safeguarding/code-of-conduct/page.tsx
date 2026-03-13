// ========================================
// File: src/app/safeguarding/code-of-conduct/page.tsx
// ========================================

import Link from "next/link";

export default function CodeOfConductPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <section className="border-b border-white/10 bg-gradient-to-b from-emerald-950/30 to-black">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-emerald-400">
            SIXFL Safeguarding
          </p>

          <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">
            Code of Conduct
          </h1>

          <p className="mt-4 text-lg text-white/70">
            SIXFL is committed to creating a positive, respectful and inclusive
            football environment. This Code of Conduct outlines the behaviour
            expected from players, teams, spectators, referees and anyone
            involved in our leagues.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-4xl space-y-10 px-4 py-12 sm:px-6 lg:px-8 text-white/80">

        {/* General behaviour */}
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8">
          <h2 className="text-2xl font-bold text-white">1. Respect for others</h2>

          <p className="mt-4 leading-7">
            All participants must treat others with respect at all times.
            This includes players, referees, league organisers, spectators
            and venue staff.
          </p>

          <p className="mt-4 leading-7">
            Discrimination, abusive language, harassment or threatening
            behaviour will not be tolerated within SIXFL leagues.
          </p>
        </div>

        {/* Player conduct */}
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8">
          <h2 className="text-2xl font-bold text-white">2. Player conduct</h2>

          <ul className="mt-4 list-disc space-y-2 pl-6 leading-7">
            <li>Play fairly and respect the rules of the game.</li>
            <li>Accept the decisions of referees and match officials.</li>
            <li>Show respect to opponents before, during and after matches.</li>
            <li>Avoid aggressive, dangerous or unsporting behaviour.</li>
            <li>Encourage teammates and promote a positive team environment.</li>
          </ul>
        </div>

        {/* Team responsibility */}
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8">
          <h2 className="text-2xl font-bold text-white">3. Team responsibility</h2>

          <p className="mt-4 leading-7">
            Team captains and organisers are responsible for ensuring their
            players and supporters behave appropriately.
          </p>

          <p className="mt-4 leading-7">
            Teams must help create a safe and welcoming football environment
            and cooperate with league organisers and referees where required.
          </p>
        </div>

        {/* Spectator behaviour */}
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8">
          <h2 className="text-2xl font-bold text-white">4. Spectator behaviour</h2>

          <ul className="mt-4 list-disc space-y-2 pl-6 leading-7">
            <li>Support players in a positive and respectful way.</li>
            <li>Avoid abusive language or aggressive behaviour.</li>
            <li>Respect referees and match officials.</li>
            <li>Help maintain a safe environment for young players.</li>
          </ul>
        </div>

        {/* Safeguarding */}
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8">
          <h2 className="text-2xl font-bold text-white">5. Safeguarding</h2>

          <p className="mt-4 leading-7">
            SIXFL takes safeguarding seriously, particularly in youth leagues.
            All participants share responsibility for ensuring children and
            young people feel safe and supported while playing football.
          </p>

          <p className="mt-4 leading-7">
            Any safeguarding concerns should be reported to SIXFL immediately.
          </p>
        </div>

        {/* Breaches */}
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8">
          <h2 className="text-2xl font-bold text-white">6. Breaches of this code</h2>

          <p className="mt-4 leading-7">
            Failure to follow this Code of Conduct may result in disciplinary
            action by SIXFL. This could include warnings, match suspensions,
            removal from venues or exclusion from league participation.
          </p>
        </div>

        {/* Contact */}
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8">
          <h2 className="text-2xl font-bold text-white">7. Contact</h2>

          <p className="mt-4 leading-7">
            If you have concerns regarding behaviour within a SIXFL league,
            please contact:
          </p>

          <p className="mt-4 font-semibold text-white">
            hello@sixfl.co.uk
          </p>
        </div>

        {/* Back link */}
        <div className="border-t border-white/10 pt-6">
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