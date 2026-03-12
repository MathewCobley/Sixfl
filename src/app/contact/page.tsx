// ========================================
// File: src/app/contact/page.tsx
// ========================================

import Link from "next/link";

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <section className="mx-auto max-w-4xl px-4 py-20 sm:px-6 lg:px-8">

        <div className="text-center">

          <div className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
            Contact SIXFL
          </div>

          <h1 className="mt-6 text-4xl font-black tracking-tight sm:text-5xl">
            Get in touch
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-white/70 sm:text-lg">
            Have a question about joining a league, registering a team or
            refereeing for SIXFL? Send us a message or contact us directly.
          </p>

        </div>


        <div className="mt-12 rounded-3xl border border-white/10 bg-white/[0.05] p-8 text-center shadow-2xl shadow-black/30">

          <div className="space-y-10">

            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-white/50">
                Email
              </div>

              <a
                href="mailto:hello@sixfl.co.uk"
                className="mt-2 block text-xl font-bold text-emerald-400 hover:underline"
              >
                hello@sixfl.co.uk
              </a>
            </div>


            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-white/50">
                Phone
              </div>

              <div className="mt-2 text-xl font-bold">
                +44 XXXX XXX XXX
              </div>
            </div>


            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-white/50">
                Location
              </div>

              <div className="mt-2 text-white/70">
                North Yorkshire, United Kingdom
              </div>
            </div>

          </div>

        </div>


        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">

          <Link
            href="/register-interest?type=team"
            className="inline-flex h-12 items-center justify-center rounded-full bg-emerald-500 px-6 text-sm font-extrabold tracking-wide text-black transition hover:bg-emerald-400"
          >
            REGISTER YOUR TEAM
          </Link>

          <Link
            href="/"
            className="inline-flex h-12 items-center justify-center rounded-full border border-white/15 bg-white/5 px-6 text-sm font-bold tracking-wide text-white transition hover:bg-white/10"
          >
            BACK TO HOME
          </Link>

        </div>

      </section>
    </main>
  );
}