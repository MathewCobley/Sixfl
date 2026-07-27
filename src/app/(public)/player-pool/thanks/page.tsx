// ========================================
// File: src/app/(public)/player-pool/thanks/page.tsx
// ========================================

import Link from "next/link";

export const metadata = {
  title: "PlayerPool profile saved | SIXFL",
};

type SearchParams = Promise<{ code?: string }>;

export default async function PlayerPoolThanksPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const params = (await searchParams) ?? {};

  return (
    <main className="min-h-screen bg-black px-4 py-14 text-white sm:px-6 lg:px-8">
      <section className="mx-auto max-w-3xl rounded-[2rem] border border-emerald-400/20 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.2),transparent_40%),rgba(255,255,255,0.045)] p-7 text-center shadow-[0_28px_100px_rgba(0,0,0,0.48)] sm:p-10">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-500/15 text-3xl text-emerald-300">
          ✓
        </div>
        <div className="mt-6 text-[11px] font-black uppercase tracking-[0.22em] text-emerald-300">
          SIXFL PlayerPool
        </div>
        <h1 className="mt-3 text-4xl font-black tracking-tight">Your profile is live.</h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-white/70">
          Relevant SIXFL captains can now see your anonymised playing profile. Your name, email address and mobile number remain private. SIXFL will contact you before introducing you to a team.
        </p>
        {params.code ? (
          <div className="mx-auto mt-6 inline-flex rounded-full border border-white/10 bg-black/30 px-4 py-2 font-mono text-sm text-white/75">
            Player reference: {params.code}
          </div>
        ) : null}
        <div className="mt-8">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-emerald-500 px-6 py-3 text-sm font-black text-black transition hover:bg-emerald-400"
          >
            Back to SIXFL
          </Link>
        </div>
      </section>
    </main>
  );
}
