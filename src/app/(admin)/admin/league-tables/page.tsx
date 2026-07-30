// ========================================
// File: src/app/(admin)/admin/league-tables/page.tsx
// ========================================

import Link from "next/link";

import AdminLeagueTableSelector from "@/components/admin/leagues/AdminLeagueTableSelector";
import LeagueTableCard from "@/components/leagues/LeagueTableCard";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { getLeagueStandings } from "@/lib/standings";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "League Tables | SIXFL Admin",
};

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function leagueOptionLabel(league: {
  name: string;
  season: string | null;
  isActive: boolean;
}) {
  const parts = [league.name];
  if (league.season && !league.name.toLowerCase().includes(league.season.toLowerCase())) {
    parts.push(league.season);
  }
  if (!league.isActive) parts.push("Inactive");
  return parts.join(" · ");
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">{label}</div>
      <div className="mt-2 text-3xl font-semibold tracking-tight text-white">{value}</div>
      <div className="mt-1 text-sm text-white/45">{detail}</div>
    </div>
  );
}

export default async function AdminLeagueTablesPage({ searchParams }: PageProps) {
  await requireAdmin();

  const params = searchParams ? await searchParams : {};
  const requestedLeagueId = getParam(params.leagueId).trim();

  const leagues = await prisma.league.findMany({
    orderBy: [{ name: "asc" }, { season: "desc" }],
    select: { id: true, name: true, season: true, slug: true, isActive: true },
  });

  leagues.sort((left, right) => {
    if (left.isActive !== right.isActive) return left.isActive ? -1 : 1;
    return left.name.localeCompare(right.name) || (right.season ?? "").localeCompare(left.season ?? "");
  });

  const selectedLeague =
    leagues.find((league) => league.id === requestedLeagueId) ??
    leagues.find((league) => league.isActive) ??
    leagues[0] ??
    null;

  const standings = selectedLeague ? await getLeagueStandings(selectedLeague.id) : null;
  const tables = standings
    ? standings.hasDivisions
      ? standings.divisions.map((division) => ({ id: division.id, title: division.name, rows: division.rows }))
      : [{ id: standings.league.id, title: "League table", rows: standings.rows }]
    : [];

  const allRows = tables.flatMap((table) => table.rows);
  const teamIds = new Set(allRows.map((row) => row.teamId));
  const completedMatches = Math.floor(allRows.reduce((total, row) => total + row.played, 0) / 2);
  const leaders = tables.map((table) => table.rows[0]?.teamName).filter((name): name is string => Boolean(name));
  const leagueOptions = leagues.map((league) => ({ value: league.id, label: leagueOptionLabel(league) }));

  return (
    <div className="space-y-7 pb-10">
      <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300/80">Competition overview</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">League tables</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55 sm:text-base">
              Every SIXFL table is supplied by the central standings service used by admin, public, captain and player pages.
            </p>
          </div>

          {selectedLeague ? (
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <Link href={`/admin/leagues/${selectedLeague.id}`} className="inline-flex min-h-11 items-center rounded-2xl border border-sky-400/25 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/15">Open league admin</Link>
              {selectedLeague.slug ? (
                <Link href={`/leagues/${selectedLeague.slug}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-2 text-sm font-semibold text-white/75 transition hover:bg-white/[0.09] hover:text-white">Open public page</Link>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      <AdminLeagueTableSelector leagues={leagueOptions} selectedLeagueId={selectedLeague?.id ?? ""} />

      {!selectedLeague || !standings ? (
        <section className="rounded-3xl border border-dashed border-white/10 bg-white/[0.025] p-8 text-sm text-white/55">No leagues have been created yet.</section>
      ) : (
        <>
          <section className="rounded-3xl border border-white/10 bg-black/25 p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">Selected league</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">{selectedLeague.name}</h2>
                <p className="mt-1 text-sm text-white/45">
                  {selectedLeague.season ?? "No season label"} · {selectedLeague.isActive ? "Active" : "Inactive"}
                  {standings.hasDivisions ? ` · ${standings.divisions.length} division${standings.divisions.length === 1 ? "" : "s"}` : " · Single table"}
                </p>
              </div>
              <div className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-100">Central standings source</div>
            </div>
          </section>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Teams" value={teamIds.size} detail="Active teams shown" />
            <MetricCard label="Completed" value={completedMatches} detail="Matches in the table" />
            <MetricCard label="Tables" value={tables.length} detail={tables.length === 1 ? "One competition table" : "Active divisions"} />
            <MetricCard label={leaders.length === 1 ? "Leader" : "Leaders"} value={leaders.length === 1 ? leaders[0] : leaders.length} detail={leaders.length === 0 ? "No results entered yet" : leaders.length === 1 ? "Currently top" : "One per division"} />
          </div>

          <div className="space-y-7">
            {tables.map((table) => (
              <LeagueTableCard
                key={table.id}
                rows={table.rows}
                eyebrow={standings.hasDivisions ? selectedLeague.name : "Standings"}
                title={table.title}
                description={standings.hasDivisions ? `${selectedLeague.season ?? "Current season"} · ${table.rows.length} teams` : `${selectedLeague.name}${selectedLeague.season ? ` · ${selectedLeague.season}` : ""}`}
                showTeamLinks={false}
                emptyMessage="This table will populate as completed results are entered."
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
