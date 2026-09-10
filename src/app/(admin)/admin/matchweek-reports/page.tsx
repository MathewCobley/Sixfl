import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/requireAdmin";
import { prisma } from "@/lib/prisma";
import { formatDateTimeInLondon } from "@/lib/datetime/london";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = {
  title: "Admin matchweek reports | SIXFL",
  robots: { index: false, follow: false },
};

export default async function AdminMatchweekReportsPage() {
  await requireAdmin();

  const leagues = await prisma.league.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      season: true,
      area: true,
      fixtures: {
        where: {
          status: "COMPLETED",
          publishedAt: { not: null },
          result: { isNot: null },
        },
        orderBy: { kickoffAt: "desc" },
        take: 1,
        select: { kickoffAt: true },
      },
    },
  });

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-6 sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">Comms & media · Admin only</p>
        <h1 className="mt-3 text-3xl font-black text-white sm:text-4xl">Matchweek reports</h1>
        <p className="mt-3 max-w-3xl leading-7 text-white/70">
          Choose a league, then generate a genuine OpenAI match-night report. Review the article, edit the wording and save your private draft. Nothing is published automatically.
        </p>
      </header>

      {leagues.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {leagues.map((league) => {
            const latestResult = league.fixtures[0];
            return (
              <Link
                key={league.id}
                href={`/admin/matchweek-reports/${encodeURIComponent(league.slug)}`}
                className="group min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] p-6 transition hover:border-emerald-400/40 hover:bg-emerald-500/10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-400"
              >
                <h2 className="break-words text-xl font-bold text-white">{league.name}</h2>
                <p className="mt-2 text-sm text-white/55">{[league.area, league.season].filter(Boolean).join(" · ")}</p>
                <p className="mt-4 text-sm text-white/65">
                  {latestResult
                    ? `Latest completed fixture: ${formatDateTimeInLondon(latestResult.kickoffAt, { day: "numeric", month: "long", year: "numeric" })}`
                    : "No published completed results yet"}
                </p>
                <span className="mt-5 inline-flex font-semibold text-emerald-300">Open report editor →</span>
              </Link>
            );
          })}
        </div>
      ) : (
        <p className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-white/65">No active leagues are available yet.</p>
      )}
    </div>
  );
}
