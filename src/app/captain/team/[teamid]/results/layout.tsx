import Link from "next/link";
import type { ReactNode } from "react";

export default async function CaptainResultsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ teamid: string }>;
}) {
  const { teamid } = await params;

  return (
    <div className="space-y-4">
      <nav
        className="sticky top-3 z-30 flex flex-col gap-2 rounded-2xl border border-sky-400/20 bg-[#07130f]/95 p-3 shadow-[0_14px_50px_rgba(0,0,0,0.45)] backdrop-blur sm:flex-row sm:items-center sm:justify-between"
        aria-label="Result tools"
      >
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">Match updates</p>
          <p className="mt-1 text-sm text-white/70">Choose scorers or record who played and rate them.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/captain/team/${teamid}/results`}
            className="rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
          >
            Scorers & match details
          </Link>
          <Link
            href={`/captain/team/${teamid}/results/ratings`}
            className="rounded-xl border border-sky-300/40 bg-sky-500/20 px-4 py-2.5 text-sm font-semibold text-sky-50 shadow-[0_0_24px_rgba(14,165,233,0.16)] transition hover:bg-sky-500/30"
          >
            Who played & ratings
          </Link>
        </div>
      </nav>
      {children}
    </div>
  );
}
