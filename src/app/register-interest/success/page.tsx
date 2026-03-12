// ========================================
// File: src/app/register-interest/success/page.tsx
// ========================================

import Link from "next/link";

export default async function RegisterInterestSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;

  const heading =
    type === "player"
      ? "Thanks for registering your interest."
      : type === "referee"
      ? "Thanks for registering referee interest."
      : "Thanks for registering your team.";

  const body =
    type === "player"
      ? "Your details have been added to the SIXFL player pipeline and we’ll be in touch as launch plans progress in your area."
      : type === "referee"
      ? "Your details have been added to the SIXFL referee pipeline and we’ll be in touch as launch plans progress in your area."
      : "Your team details have been added to the SIXFL pipeline and we’ll be in touch as league spaces open in your area.";

  return (
    <main className="min-h-screen bg-black text-white">
      <section className="mx-auto max-w-4xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-8 text-center shadow-2xl shadow-black/30 sm:p-12">
          <div className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
            Interest received
          </div>

          <h1 className="mt-6 text-4xl font-black tracking-tight sm:text-5xl">
            {heading}
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-white/70 sm:text-lg">
            {body}
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/"
              className="inline-flex h-12 items-center justify-center rounded-full bg-emerald-500 px-6 text-sm font-extrabold tracking-wide text-black transition hover:bg-emerald-400"
            >
              BACK TO HOMEPAGE
            </Link>

            <Link
              href="/pricing"
              className="inline-flex h-12 items-center justify-center rounded-full border border-white/15 bg-white/5 px-6 text-sm font-bold tracking-wide text-white transition hover:bg-white/10"
            >
              VIEW PRICING
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}