// ========================================
// File: src/app/s/[token]/not-found.tsx
// ========================================

import Link from "next/link";

export default function ShortLinkNotFound() {
  return (
    <main className="min-h-screen bg-[#07130f] px-4 py-10 text-white sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[70vh] max-w-2xl items-center justify-center">
        <section className="w-full rounded-3xl border border-amber-400/20 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.18),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] md:p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-200/80">
            Payment link
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            This payment link is no longer active
          </h1>
          <p className="mt-4 text-sm leading-6 text-white/70">
            This can happen if the fee has already been paid, waived, cancelled, or replaced with a newer payment link.
          </p>
          <p className="mt-3 text-sm leading-6 text-white/70">
            Please ask your captain or SIXFL organiser to send you a fresh payment link.
          </p>
          <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-white/60">
            No payment has been taken from this inactive link.
          </div>
          <div className="mt-6">
            <Link
              href="/"
              className="inline-flex rounded-2xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-black transition hover:bg-emerald-300"
            >
              Go to SIXFL
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
