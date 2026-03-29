// ========================================
// File: src/app/safeguarding/page.tsx
// ========================================

import Link from "next/link";

export default function SafeguardingPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <section className="border-b border-white/10 bg-gradient-to-b from-emerald-950/30 to-black">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-emerald-400">
            SIXFL
          </p>

          <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">
            Safeguarding Policy
          </h1>

          <p className="mt-4 text-lg text-white/70">
            SIXFL is committed to safeguarding and promoting the welfare of
            children and young people participating in our leagues and events.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8 space-y-10 text-white/80 leading-relaxed">

        <div>
          <h2 className="text-2xl font-bold text-white">1. Our Commitment</h2>
          <p className="mt-3">
            SIXFL believes that football should be a safe, enjoyable and
            inclusive environment for all participants. We are committed to
            safeguarding children, young people and vulnerable individuals who
            take part in our leagues and activities.
          </p>
        </div>

        <div>
          <h2 className="text-2xl font-bold text-white">2. Responsibility</h2>
          <p className="mt-3">
            All league organisers, referees and volunteers working with SIXFL
            share responsibility for safeguarding. Everyone involved in the
            organisation of youth leagues must act in the best interests of
            young players and report any safeguarding concerns immediately.
          </p>
        </div>

        <div>
          <h2 className="text-2xl font-bold text-white">3. Safe Environment</h2>
          <p className="mt-3">
            SIXFL aims to provide a safe and respectful environment at all
            venues where matches take place. We work with reputable venues and
            facilities to ensure suitable playing conditions, appropriate
            supervision and safe conduct at all times.
          </p>
        </div>

        <div>
          <h2 className="text-2xl font-bold text-white">4. Behaviour and Conduct</h2>
          <p className="mt-3">
            Players, team representatives, spectators and officials are expected
            to behave respectfully and appropriately. Bullying, harassment,
            discrimination or abusive behaviour will not be tolerated and may
            result in disciplinary action or removal from the league.
          </p>
        </div>

        <div>
          <h2 className="text-2xl font-bold text-white">5. Reporting Concerns</h2>
          <p className="mt-3">
            Any safeguarding concerns should be reported to the SIXFL league
            organisers immediately. Concerns will be treated seriously and
            handled confidentially where possible.
          </p>

          <p className="mt-3">
            Where appropriate, safeguarding concerns may be reported to relevant
            authorities or governing bodies to ensure the welfare of those
            involved.
          </p>
        </div>

        <div>
          <h2 className="text-2xl font-bold text-white">6. Contact</h2>
          <p className="mt-3">
            If you have any safeguarding concerns relating to SIXFL leagues,
            please contact us:
          </p>

          <p className="mt-2 font-semibold text-white">
            Email: hello@sixfl.co.uk
          </p>
        </div>

        <div className="pt-6 border-t border-white/10">
          <Link
            href="/"
            className="text-emerald-400 hover:text-emerald-300 font-semibold"
          >
            ← Return to home
          </Link>
        </div>

      </section>
    </main>
  );
}