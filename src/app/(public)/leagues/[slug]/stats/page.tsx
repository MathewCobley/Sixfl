// ========================================
// File: src/app/(public)/leagues/[slug]/stats/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = { title: "Player Stats | SIXFL" };

type PageProps = { params: Promise<{ slug: string }> };
type Stat = {
  key: string;
  name: string;
  team: string;
  goals: number;
  assists: number;
  pom: number;
};

function sortByGoals(rows: Stat[]) {
  return [...rows].sort(
    (a, b) =>
      b.goals - a.goals ||
      b.assists - a.assists ||
      b.pom - a.pom ||
      a.name.localeCompare(b.name),
  );
}

function sortByAssists(rows: Stat[]) {
  return [...rows].sort(
    (a, b) =>
      b.assists - a.assists ||
      b.goals - a.goals ||
      b.pom - a.pom ||
      a.name.localeCompare(b.name),
  );
}

function sortByPom(rows: Stat[]) {
  return [...rows].sort(
    (a, b) =>
      b.pom - a.pom ||
      b.goals - a.goals ||
      b.assists - a.assists ||
      a.name.localeCompare(b.name),
  );
}

function StatsTable({ title, rows }: { title: string; rows: Stat[] }) {
  return (
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
      <div className="border-b border-white/10 px-6 py-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300/80">
          Player stats
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-white">{title}</h2>
      </div>
      <div className="divide-y divide-white/10">
        {rows.length ? (
          rows.map((row, index) => (
            <div
              key={`${title}-${row.key}`}
              className="grid gap-3 px-6 py-4 md:grid-cols-[64px_minmax(180px,1fr)_minmax(160px,1fr)_80px_80px_80px] md:items-center"
            >
              <div className="font-black text-emerald-200">{index + 1}</div>
              <div className="font-semibold text-white">{row.name}</div>
              <div className="text-sm text-white/60">{row.team}</div>
              <div className="text-sm text-white/80 md:text-right">
                <span className="text-white/40 md:hidden">Goals: </span>
                {row.goals}
              </div>
              <div className="text-sm text-white/80 md:text-right">
                <span className="text-white/40 md:hidden">Assists: </span>
                {row.assists}
              </div>
              <div className="text-sm text-white/80 md:text-right">
                <span className="text-white/40 md:hidden">POM: </span>
                {row.pom}
              </div>
            </div>
          ))
        ) : (
          <div className="px-6 py-8 text-sm text-white/55">
            No player stats recorded yet.
          </div>
        )}
      </div>
    </section>
  );
}

export default async function LeagueStatsPage({ params }: PageProps) {
  const { slug } = await params;
  const league = await prisma.league.findFirst({
    where: { slug, isActive: true },
    select: { id: true, name: true, slug: true },
  });

  if (!league) notFound();

  const allStats = await prisma.$queryRaw<Stat[]>`
    SELECT
      performance."teamMemberId" AS "key",
      COALESCE(
        NULLIF(BTRIM(account."name"), ''),
        NULLIF(BTRIM(account."email"), ''),
        'Unnamed player'
      ) AS "name",
      team."name" AS "team",
      COALESCE(SUM(performance."goals"), 0)::int AS "goals",
      COALESCE(SUM(performance."assists"), 0)::int AS "assists",
      COUNT(*) FILTER (
        WHERE performance."isPlayerOfMatch" = TRUE
      )::int AS "pom"
    FROM "PlayerMatchPerformance" performance
    INNER JOIN "TeamMember" member
      ON member."id" = performance."teamMemberId"
      AND member."teamId" = performance."teamId"
    INNER JOIN "User" account ON account."id" = member."userId"
    INNER JOIN "Team" team ON team."id" = performance."teamId"
    INNER JOIN "MatchResult" result
      ON result."id" = performance."matchResultId"
    INNER JOIN "Fixture" fixture ON fixture."id" = result."fixtureId"
    WHERE fixture."leagueId" = ${league.id}
      AND performance."played" = TRUE
    GROUP BY
      performance."teamMemberId",
      account."name",
      account."email",
      team."name"
  `;

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-[1200px] space-y-8 px-6 py-10 sm:px-10">
        <section className="rounded-3xl border border-emerald-400/15 bg-white/[0.04] p-6 sm:p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
            SIXFL stats
          </p>
          <h1 className="mt-3 text-3xl font-black sm:text-5xl">
            {league.name} player stats
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/65">
            Goals, assists and Player of the Match awards are built from the same
            player-match records used for appearances and ratings.
          </p>
          <Link
            href={`/leagues/${league.slug}`}
            className="mt-5 inline-flex rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white/80 hover:bg-white/10"
          >
            Back to league page
          </Link>
        </section>
        <StatsTable
          title="Top scorers"
          rows={sortByGoals(allStats)
            .filter((row) => row.goals > 0)
            .slice(0, 20)}
        />
        <StatsTable
          title="Top assists"
          rows={sortByAssists(allStats)
            .filter((row) => row.assists > 0)
            .slice(0, 20)}
        />
        <StatsTable
          title="Player of the Match awards"
          rows={sortByPom(allStats)
            .filter((row) => row.pom > 0)
            .slice(0, 20)}
        />
      </div>
    </main>
  );
}
