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
      <nav className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-2" aria-label="Result tools">
        <Link href={`/captain/team/${teamid}/results`} className="rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white">
          Scorers & match details
        </Link>
        <Link href={`/captain/team/${teamid}/results/ratings`} className="rounded-xl border border-sky-400/30 bg-sky-500/10 px-4 py-2.5 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/20">
          Who played & ratings
        </Link>
      </nav>
      {children}
    </div>
  );
}
