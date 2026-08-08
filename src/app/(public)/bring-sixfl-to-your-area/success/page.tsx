// ========================================
// File: src/app/(public)/bring-sixfl-to-your-area/success/page.tsx
// ========================================

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Opportunity Received | SIXFL",
  description: "Your proposed SIXFL expansion opportunity has been received.",
};

export default function ExpansionLeadSuccessPage() {
  return (
    <section className="min-h-[70vh] bg-black px-4 py-16 text-white sm:px-6 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-[2rem] border border-emerald-400/20 bg-emerald-500/[0.07] p-7 shadow-2xl shadow-black/40 sm:p-10">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-400/15 text-2xl font-black text-emerald-300">
            ✓
          </div>

          <p className="mt-6 text-xs font-black uppercase tracking-[0.24em] text-emerald-300">
            Opportunity received
          </p>

          <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
            Thank you for helping us find the next SIXFL league.
          </h1>

          <p className="mt-5 text-base leading-7 text-white/70 sm:text-lg">
            We’ll review the area, potential venue and likely team demand. If it
            looks viable, SIXFL will contact you to discuss the opportunity and
            agree exactly what help is needed.
          </p>

          <div className="mt-8 rounded-2xl border border-white/10 bg-black/30 p-5">
            <h2 className="font-bold text-white">What happens next</h2>
            <ol className="mt-4 space-y-3 text-sm leading-6 text-white/70">
              <li>1. SIXFL checks how the area fits our expansion plans.</li>
              <li>2. We assess venue availability and realistic team demand.</li>
              <li>
                3. We agree the role, qualifying conditions and payment in
                writing before commission-earning work begins.
              </li>
            </ol>
          </div>

          <p className="mt-6 text-sm leading-6 text-white/50">
            SIXFL will confirm in writing when an opportunity is approved and
            agree any role, qualifying conditions and commission before work
            begins.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/"
              className="inline-flex h-12 items-center justify-center rounded-full bg-emerald-500 px-6 text-sm font-extrabold text-black transition hover:bg-emerald-400"
            >
              Return to SIXFL
            </Link>
            <Link
              href="/leagues"
              className="inline-flex h-12 items-center justify-center rounded-full border border-white/10 bg-white/5 px-6 text-sm font-bold text-white transition hover:bg-white/10"
            >
              View current leagues
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
