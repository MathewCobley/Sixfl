// ========================================
// File: src/app/safeguarding/reporting-concerns/page.tsx
// ========================================

import Link from "next/link";

export default function ReportingConcernsPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <section className="border-b border-white/10 bg-gradient-to-b from-emerald-950/30 to-black">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-emerald-400">
            SIXFL Safeguarding
          </p>

          <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">
            Reporting Safeguarding Concerns
          </h1>

          <p className="mt-4 text-lg text-white/70">
            SIXFL takes safeguarding seriously. If you have concerns about the
            safety or wellbeing of a player, particularly a child or young
            person, we encourage you to report it as soon as possible.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-4xl space-y-10 px-4 py-12 sm:px-6 lg:px-8 text-white/80">

        {/* Importance of reporting */}
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8">
          <h2 className="text-2xl font-bold text-white">
            1. Why reporting concerns matters
          </h2>

          <p className="mt-4 leading-7">
            Safeguarding concerns should always be taken seriously. Reporting
            concerns helps ensure that appropriate action can be taken to
            protect players and maintain a safe football environment.
          </p>

          <p className="mt-4 leading-7">
            Concerns may relate to behaviour, bullying, abuse, discrimination,
            inappropriate conduct or any situation where a participant feels
            unsafe or uncomfortable.
          </p>
        </div>

        {/* What to report */}
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8">
          <h2 className="text-2xl font-bold text-white">
            2. What should be reported
          </h2>

          <ul className="mt-4 list-disc space-y-2 pl-6 leading-7">
            <li>Bullying or harassment of a player.</li>
            <li>Abusive language or threatening behaviour.</li>
            <li>Unsafe conduct by players, spectators or officials.</li>
            <li>Concerns about the welfare of a child or young person.</li>
            <li>Any behaviour that makes someone feel unsafe or uncomfortable.</li>
          </ul>
        </div>

        {/* How to report */}
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8">
          <h2 className="text-2xl font-bold text-white">
            3. How to report a concern
          </h2>

          <p className="mt-4 leading-7">
            Safeguarding concerns can be reported directly to SIXFL by email.
            Please provide as much detail as possible, including the nature of
            the concern, where it occurred and who was involved.
          </p>

          <p className="mt-4 font-semibold text-white">
            Email: hello@sixfl.co.uk
          </p>

          <p className="mt-4 leading-7">
            All reports will be treated seriously and handled appropriately.
          </p>
        </div>

        {/* Confidentiality */}
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8">
          <h2 className="text-2xl font-bold text-white">
            4. Confidentiality
          </h2>

          <p className="mt-4 leading-7">
            SIXFL will treat safeguarding concerns with sensitivity and respect.
            Information will only be shared where necessary to ensure the safety
            of those involved or where required by relevant authorities.
          </p>
        </div>

        {/* Emergency situations */}
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8">
          <h2 className="text-2xl font-bold text-white">
            5. Immediate danger
          </h2>

          <p className="mt-4 leading-7">
            If a child or participant is in immediate danger, contact emergency
            services or the appropriate authorities immediately.
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