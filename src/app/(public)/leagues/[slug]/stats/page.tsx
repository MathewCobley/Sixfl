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
type Contribution = { name: string; goals?: number; assists?: number; teamMemberId?: string };
type Stat = { key: string; name: string; team: string; goals: number; assists: number; pom: number };

function norm(value: string) {
  return value.trim().toLowerCase();
}

function parseContributions(value: unknown): Contribution[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): Contribution | null => {
      if (!item || typeof item !== "object") return null;
      const row = item as Partial<Contribution>;
      const name = typeof row.name === "string" ? row.name.trim() : "";
      const goals = Number(row.goals ?? 0);
      const assists = Number(row.assists ?? 0);
      if (!name || !Number.isInteger(goals) || goals < 0) return null;
      if (!Number.isInteger(assists) || assists < 0) return null;
      if (goals + assists < 1) return null;
      return {
        name,
        goals,
        assists,
        teamMemberId: typeof row.teamMemberId === "string" ? row.teamMemberId : undefined,
      };
    })
    .filter((item): item is Contribution => item !== null);
}

function sortByGoals(rows: Stat[]) {
  return [...rows].sort((a, b) => b.goals - a.goals || b.assists - a.assists || b.pom - a.pom || a.name.localeCompare(b.name));
}

function sortByAssists(rows: Stat[]) {
  return [...rows].sort((a, b) => b.assists - a.assists || b.goals - a.goals || b.pom - a.pom || a.name.localeCompare(b.name));
}

function sortByPom(rows: Stat[]) {
  return [...rows].sort((a, b) => b.pom - a.pom || b.goals - a.goals || b.assists - a.assists || a.name.localeCompare(b.name));
}

function StatsTable({ title, rows }: { title: string; rows: Stat[] }) {
  return (
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
      <div className="border-b border-white/10 px-6 py-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300/80">Player stats</p>
        <h2 className="mt-2 text-2xl font-semibold text-white">{title}</h2>
      </div>
      <div className="divide-y divide-white/10">
        {rows.length ? rows.map((row, index) => (
          <div key={`${title}-${row.key}`} className="grid gap-3 px-6 py-4 md:grid-cols-[64px_minmax(180px,1fr)_minmax(160px,1fr)_80px_80px_80px] md:items-center">
            <div className="font-black text-emerald-200">{index + 1}</div>
            <div className="font-semibold text-white">{row.name}</div>
            <div className="text-sm text-white/60">{row.team}</div>
            <div className="text-sm text-white/80 md:text-right"><span className="text-white/40 md:hidden">Goals: </span>{row.goals}</div>
            <div className="text-sm text-white/80 md:text-right"><span className="text-white/40 md:hidden">Assists: </span>{row.assists}</div>
            <div className="text-sm text-white/80 md:text-right"><span className="text-white/40 md:hidden">POM: </span>{row.pom}</div>
          </div>
        )) : (
          <div className="px-6 py-8 text-sm text-white/55">No player stats recorded yet.</div>
        )}
      </div>
    </section>
  );
}

export default async function LeagueStatsPage({ params }: PageProps) {
  const { slug } = await params;
  const league = await prisma.league.findFirst({
    where: { slug, isActive: true },
    select: {
      name: true,
      slug: true,
      fixtures: {
        where: { status: "COMPLETED", result: { isNot: null } },
        select: {
          homeTeam: { select: { id: true, name: true } },
          awayTeam: { select: { id: true, name: true } },
          result: { select: { teamMetadata: { select: { teamId: true, scorers: true, playerOfMatchName: true } } } },
        },
      },
    },
  });

  if (!league) notFound();

  const teamNames = new Map<string, string>();
  for (const fixture of league.fixtures) {
    teamNames.set(fixture.homeTeam.id, fixture.homeTeam.name);
    teamNames.set(fixture.awayTeam.id, fixture.awayTeam.name);
  }

  const stats = new Map<string, Stat>();
  const getStat = (teamId: string, name: string, teamMemberId?: string) => {
    const key = teamMemberId || `${teamId}:${norm(name)}`;
    const existing = stats.get(key);
    if (existing) return existing;
    const created = { key, name, team: teamNames.get(teamId) || "Unknown team", goals: 0, assists: 0, pom: 0 };
    stats.set(key, created);
    return created;
  };

  for (const fixture of league.fixtures) {
    for (const meta of fixture.result?.teamMetadata ?? []) {
      const contributions = parseContributions(meta.scorers);
      for (const contribution of contributions) {
        const stat = getStat(meta.teamId, contribution.name, contribution.teamMemberId);
        stat.goals += contribution.goals || 0;
        stat.assists += contribution.assists || 0;
      }
      if (meta.playerOfMatchName?.trim()) {
        const pomName = meta.playerOfMatchName.trim();
        const match = contributions.find((item) => norm(item.name) === norm(pomName));
        getStat(meta.teamId, pomName, match?.teamMemberId).pom += 1;
      }
    }
  }

  const allStats = Array.from(stats.values());

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-[1200px] space-y-8 px-6 py-10 sm:px-10">
        <section className="rounded-3xl border border-emerald-400/15 bg-white/[0.04] p-6 sm:p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">SIXFL stats</p>
          <h1 className="mt-3 text-3xl font-black sm:text-5xl">{league.name} player stats</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/65">Goals, assists and Player of the Match awards are built from captain-submitted match details.</p>
          <Link href={`/leagues/${league.slug}`} className="mt-5 inline-flex rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white/80 hover:bg-white/10">Back to league page</Link>
        </section>
        <StatsTable title="Top scorers" rows={sortByGoals(allStats).filter((row) => row.goals > 0).slice(0, 20)} />
        <StatsTable title="Top assists" rows={sortByAssists(allStats).filter((row) => row.assists > 0).slice(0, 20)} />
        <StatsTable title="Player of the Match awards" rows={sortByPom(allStats).filter((row) => row.pom > 0).slice(0, 20)} />
      </div>
    </main>
  );
}
