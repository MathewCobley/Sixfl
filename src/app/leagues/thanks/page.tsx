// ========================================
// File: src/app/leagues/thanks/page.tsx
// ========================================

export default function LeagueThanksPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <section className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 sm:p-12">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-400">
            SIXFL
          </p>

          <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
            Thanks for registering your interest
          </h1>

          <p className="mt-4 text-white/70">
            We&apos;ve received your details and will be in touch soon about the
            Rossett Men&apos;s Tuesday league.
          </p>
        </div>
      </section>
    </div>
  );
}