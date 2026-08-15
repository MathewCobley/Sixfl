import type { ReactNode } from "react";
import Link from "next/link";

import { prisma } from "@/lib/prisma";

export default async function CaptainResultsHistoryLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ teamid: string }>;
}) {
  const { teamid } = await params;

  const team = await prisma.team.findUnique({
    where: { id: teamid },
    select: {
      league: {
        select: {
          slug: true,
          competition: {
            select: {
              currentLeague: {
                select: { slug: true },
              },
            },
          },
        },
      },
    },
  });

  const leagueSlug =
    team?.league?.competition?.currentLeague?.slug ?? team?.league?.slug ?? null;

  return (
    <>
      {leagueSlug ? (
        <div className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl border border-emerald-400/15 bg-emerald-500/[0.06] p-3">
          <span className="px-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200/70">
            Results
          </span>
          <Link
            href={`/captain/team/${teamid}/results-history`}
            className="inline-flex min-h-10 items-center rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm font-semibold text-white/75 transition hover:bg-white/[0.06] hover:text-white"
          >
            Our team results
          </Link>
          <Link
            href={`/leagues/${leagueSlug}/results`}
            className="inline-flex min-h-10 items-center rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15"
          >
            All league results
          </Link>
        </div>
      ) : null}
      {children}
    </>
  );
}
