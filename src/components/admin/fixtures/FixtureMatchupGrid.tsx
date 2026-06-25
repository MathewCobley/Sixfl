// ========================================
// File: src/components/admin/fixtures/FixtureMatchupGrid.tsx
// ========================================

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type LeagueOption = { id: string; name: string; season: string | null; isActive: boolean };
type TeamOption = { id: string; name: string };
type GridCell = { opponentId: string; opponentName: string; homeCount: number; awayCount: number; totalCount: number; latestKickoffAt: string | null; label: string; isSelf: boolean };
type GridRow = { teamId: string; teamName: string; opponents: GridCell[] };
type MatchupGridData = {
  leagues: LeagueOption[];
  selectedLeagueId: string | null;
  selectedLeagueLabel?: string;
  teams: TeamOption[];
  cells: GridRow[];
  summary: { scheduledPairs: number; oneWayPairs: number; completedPairs: number; missingPairs: number };
};

function getCellTone(cell: GridCell) {
  if (cell.isSelf) return "border-white/5 bg-white/[0.02] text-white/15";
  if (cell.totalCount === 0) return "border-red-400/15 bg-red-500/[0.06] text-red-100/70";
  if (cell.homeCount > 0 && cell.awayCount > 0) return "border-emerald-400/20 bg-emerald-500/10 text-emerald-100";
  return "border-amber-400/20 bg-amber-500/10 text-amber-100";
}

function getCellHelper(cell: GridCell) {
  if (cell.isSelf) return "";
  if (cell.totalCount === 0) return "Not scheduled";
  if (cell.homeCount > 0 && cell.awayCount > 0) return "Both ways";
  if (cell.homeCount > 0) return "Only as team 1";
  return "Only as team 2";
}

function formatLeagueLabel(league: LeagueOption) {
  return `${league.name}${league.season ? ` · ${league.season}` : ""}`;
}

export default function FixtureMatchupGrid({ initialLeagueId }: { initialLeagueId?: string }) {
  const [selectedLeagueId, setSelectedLeagueId] = useState(initialLeagueId ?? "");
  const [data, setData] = useState<MatchupGridData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setSelectedLeagueId(initialLeagueId ?? "");
  }, [initialLeagueId]);

  useEffect(() => {
    let cancelled = false;

    async function loadGrid() {
      setIsLoading(true);
      try {
        const params = new URLSearchParams();
        if (selectedLeagueId) params.set("leagueId", selectedLeagueId);
        const response = await fetch(`/api/admin/fixtures/matchup-grid?${params.toString()}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Could not load fixture grid.");
        const result = (await response.json()) as MatchupGridData;
        if (cancelled) return;
        setData(result);
        if (!selectedLeagueId && result.selectedLeagueId) setSelectedLeagueId(result.selectedLeagueId);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadGrid();
    return () => { cancelled = true };
  }, [selectedLeagueId]);

  const leagues = data?.leagues ?? [];
  const selectedLeague = useMemo(() => leagues.find((league) => league.id === selectedLeagueId) ?? null, [leagues, selectedLeagueId]);

  return (
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_24px_80px_rgba(0,0,0,0.32)]">
      <div className="border-b border-white/10 px-6 py-6 md:px-8">
        <div className="space-y-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">Fixture planning grid</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Who has played who</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">Pick a league here to control the whole fixtures page. Rows show the team. Columns show the opponent. H means the row team has been Team 1; A means they have been Team 2.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {leagues.length === 0 ? <span className="rounded-2xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white/55">No leagues found</span> : null}
            {leagues.map((league) => {
              const isActive = selectedLeagueId === league.id;
              return (
                <Link
                  key={league.id}
                  href={`/admin/fixtures?leagueId=${league.id}`}
                  aria-current={isActive ? "page" : undefined}
                  className={`rounded-2xl border px-4 py-2.5 text-sm font-semibold transition ${isActive ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-50" : "border-white/10 bg-black/25 text-white/65 hover:bg-white/[0.06] hover:text-white"}`}
                >
                  {formatLeagueLabel(league)}{league.isActive ? "" : " · inactive"}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      <div className="px-6 py-6 md:px-8">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-black/25 p-4"><div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">League</div><div className="mt-2 text-sm font-semibold text-white">{selectedLeague?.name ?? data?.selectedLeagueLabel ?? "—"}</div></div>
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4"><div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-100/60">Both ways</div><div className="mt-2 text-2xl font-semibold text-white">{data?.summary.completedPairs ?? 0}</div></div>
          <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4"><div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-100/60">One way only</div><div className="mt-2 text-2xl font-semibold text-white">{data?.summary.oneWayPairs ?? 0}</div></div>
          <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4"><div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-red-100/60">Missing</div><div className="mt-2 text-2xl font-semibold text-white">{data?.summary.missingPairs ?? 0}</div></div>
        </div>

        {isLoading ? <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-6 text-sm text-white/55">Loading matchup grid...</div> : null}
        {!isLoading && (!data || data.teams.length === 0) ? <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-6 text-sm text-white/55">No teams found for this league yet.</div> : null}

        {!isLoading && data && data.teams.length > 0 ? (
          <div className="mt-6 overflow-x-auto rounded-3xl border border-white/10 bg-black/20">
            <table className="min-w-max border-collapse text-left text-xs">
              <thead><tr className="border-b border-white/10 bg-white/[0.04]"><th className="sticky left-0 z-20 min-w-[180px] border-r border-white/10 bg-[#07120f] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">Team</th>{data.teams.map((team) => <th key={team.id} className="min-w-[120px] max-w-[150px] border-r border-white/10 px-3 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/50"><span className="block truncate" title={team.name}>{team.name}</span></th>)}</tr></thead>
              <tbody>{data.cells.map((row) => <tr key={row.teamId} className="border-b border-white/10 last:border-b-0"><th className="sticky left-0 z-10 min-w-[180px] border-r border-white/10 bg-[#07120f] px-4 py-3 text-sm font-semibold text-white">{row.teamName}</th>{row.opponents.map((cell) => <td key={cell.opponentId} className="border-r border-white/10 p-2 align-top"><div className={`min-h-[72px] rounded-2xl border px-3 py-2 ${getCellTone(cell)}`}><div className="text-sm font-semibold">{cell.label}</div>{!cell.isSelf ? <><div className="mt-1 text-[11px] opacity-75">{getCellHelper(cell)}</div>{cell.totalCount > 1 ? <div className="mt-1 text-[11px] opacity-70">{cell.totalCount} fixtures</div> : null}</> : null}</div></td>)}</tr>)}</tbody>
            </table>
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2 text-xs text-white/55">
          <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-emerald-100">H + A = both directions covered</span>
          <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-amber-100">Only H or only A = reverse fixture missing</span>
          <span className="rounded-full border border-red-400/20 bg-red-500/10 px-3 py-1 text-red-100">— = teams have not met</span>
        </div>
      </div>
    </section>
  );
}
