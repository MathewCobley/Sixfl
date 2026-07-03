// ========================================
// File: src/components/admin/fixtures/FixtureMatchupGrid.tsx
// ========================================

"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type LeagueOption = { id: string; name: string; season: string | null; isActive: boolean };
type DivisionOption = { id: string; name: string; slug: string; sortOrder: number };
type TeamOption = { id: string; name: string };
type VisibilityFilter = "all" | "published" | "draft";
type GridCell = { opponentId: string; opponentName: string; homeCount: number; awayCount: number; totalCount: number; latestKickoffAt: string | null; label: string; isSelf: boolean };
type GridRow = { teamId: string; teamName: string; opponents: GridCell[] };
type MatchupGridData = {
  leagues: LeagueOption[];
  divisions: DivisionOption[];
  selectedLeagueId: string | null;
  selectedDivisionId: string | null;
  selectedVisibility?: VisibilityFilter;
  selectedLeagueLabel?: string | null;
  selectedDivisionLabel?: string | null;
  teams: TeamOption[];
  cells: GridRow[];
  summary: { scheduledPairs: number; oneWayPairs: number; completedPairs: number; missingPairs: number };
};

function parseVisibility(value: string | null): VisibilityFilter {
  if (value === "published" || value === "draft") return value;
  return "all";
}

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

function buildGridHref(leagueId: string, divisionId?: string | null, visibility: VisibilityFilter = "all") {
  const params = new URLSearchParams({ leagueId });
  if (divisionId) params.set("divisionId", divisionId);
  if (visibility !== "all") params.set("visibility", visibility);
  return `/admin/fixtures?${params.toString()}`;
}

function visibilityLabel(value: VisibilityFilter) {
  if (value === "published") return "Published only";
  if (value === "draft") return "Draft only";
  return "Published + draft";
}

function getFixturesTableRows() {
  const fixturesHeading = Array.from(document.querySelectorAll<HTMLHeadingElement>("h2"))
    .find((heading) => heading.textContent?.trim() === "Fixtures");
  const card = fixturesHeading?.closest("div.rounded-3xl");
  const table = card?.querySelector("table.min-w-full");
  return Array.from(table?.querySelectorAll<HTMLTableRowElement>("tbody tr") ?? []);
}

function getFixtureMatchText(row: HTMLTableRowElement) {
  const firstCell = row.querySelector<HTMLTableCellElement>("td");
  return firstCell?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function applyActualFixtureFilters(input: { teams: TeamOption[]; visibility: VisibilityFilter }) {
  const rows = getFixturesTableRows();
  if (rows.length === 0) return;

  const allowedNames = new Set(input.teams.map((team) => team.name.trim()).filter(Boolean));

  for (const row of rows) {
    const rowText = row.textContent?.replace(/\s+/g, " ").trim() ?? "";
    const matchText = getFixtureMatchText(row);
    const matchedTeamCount = Array.from(allowedNames).filter((teamName) => matchText.includes(teamName)).length;
    const matchesDivision = allowedNames.size === 0 || matchedTeamCount >= 2;
    const matchesVisibility =
      input.visibility === "all" ||
      (input.visibility === "published" && rowText.includes("Live on site")) ||
      (input.visibility === "draft" && rowText.includes("Draft only"));

    row.style.display = matchesDivision && matchesVisibility ? "" : "none";
  }
}

export default function FixtureMatchupGrid({ initialLeagueId, initialDivisionId }: { initialLeagueId?: string; initialDivisionId?: string }) {
  const searchParams = useSearchParams();
  const leagueIdFromUrl = searchParams.get("leagueId") ?? "";
  const divisionIdFromUrl = searchParams.get("divisionId") ?? "";
  const visibilityFromUrl = parseVisibility(searchParams.get("visibility"));
  const [selectedLeagueId, setSelectedLeagueId] = useState(initialLeagueId ?? leagueIdFromUrl);
  const [selectedDivisionId, setSelectedDivisionId] = useState(initialDivisionId ?? divisionIdFromUrl);
  const [selectedVisibility, setSelectedVisibility] = useState<VisibilityFilter>(visibilityFromUrl);
  const [data, setData] = useState<MatchupGridData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setSelectedLeagueId(leagueIdFromUrl || initialLeagueId || "");
    setSelectedDivisionId(divisionIdFromUrl || initialDivisionId || "");
    setSelectedVisibility(visibilityFromUrl);
  }, [initialLeagueId, initialDivisionId, leagueIdFromUrl, divisionIdFromUrl, visibilityFromUrl]);

  useEffect(() => {
    let cancelled = false;
    async function loadGrid() {
      setIsLoading(true);
      try {
        const params = new URLSearchParams();
        if (selectedLeagueId) params.set("leagueId", selectedLeagueId);
        if (selectedDivisionId) params.set("divisionId", selectedDivisionId);
        if (selectedVisibility !== "all") params.set("visibility", selectedVisibility);
        const response = await fetch(`/api/admin/fixtures/matchup-grid?${params.toString()}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Could not load fixture grid.");
        const result = (await response.json()) as MatchupGridData;
        if (cancelled) return;
        setData(result);
        if (!selectedLeagueId && result.selectedLeagueId) setSelectedLeagueId(result.selectedLeagueId);
        if (!selectedDivisionId && result.selectedDivisionId) setSelectedDivisionId(result.selectedDivisionId);
        if (result.selectedVisibility) setSelectedVisibility(result.selectedVisibility);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    loadGrid();
    return () => { cancelled = true; };
  }, [selectedLeagueId, selectedDivisionId, selectedVisibility]);

  const leagues = data?.leagues ?? [];
  const divisions = data?.divisions ?? [];
  const selectedLeague = useMemo(() => leagues.find((league) => league.id === selectedLeagueId) ?? null, [leagues, selectedLeagueId]);
  const selectedDivision = useMemo(() => divisions.find((division) => division.id === selectedDivisionId) ?? null, [divisions, selectedDivisionId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      applyActualFixtureFilters({ teams: data?.teams ?? [], visibility: selectedVisibility });
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [data?.teams, selectedVisibility, selectedDivisionId]);

  return (
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_24px_80px_rgba(0,0,0,0.32)]">
      <div className="border-b border-white/10 px-6 py-6 md:px-8">
        <div className="space-y-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">Fixture selector</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Choose league and division</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">Pick the league, division and fixture visibility first. The planning grid and fixtures table below use this same selection.</p>
          </div>
          <div className="space-y-3">
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">League</div>
              <div className="flex flex-wrap gap-2">
                {leagues.map((league) => {
                  const isActive = selectedLeagueId === league.id;
                  return <Link key={league.id} href={buildGridHref(league.id, null, selectedVisibility)} className={`rounded-2xl border px-4 py-2.5 text-sm font-semibold transition ${isActive ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-50" : "border-white/10 bg-black/25 text-white/65 hover:bg-white/[0.06] hover:text-white"}`}>{formatLeagueLabel(league)}{league.isActive ? "" : " · inactive"}</Link>;
                })}
              </div>
            </div>
            {divisions.length > 0 ? <div><div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">Division</div><div className="flex flex-wrap gap-2">{divisions.map((division) => { const isActive = selectedDivisionId === division.id; return <Link key={division.id} href={buildGridHref(selectedLeagueId, division.id, selectedVisibility)} className={`rounded-2xl border px-4 py-2.5 text-sm font-semibold transition ${isActive ? "border-sky-400/30 bg-sky-500/15 text-sky-50" : "border-white/10 bg-black/25 text-white/65 hover:bg-white/[0.06] hover:text-white"}`}>{division.name}</Link>; })}</div></div> : null}
            <div><div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">Fixture visibility</div><div className="flex flex-wrap gap-2">{(["all", "published", "draft"] as VisibilityFilter[]).map((visibility) => { const isActive = selectedVisibility === visibility; return <Link key={visibility} href={buildGridHref(selectedLeagueId, selectedDivisionId, visibility)} className={`rounded-2xl border px-4 py-2.5 text-sm font-semibold transition ${isActive ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-50" : "border-white/10 bg-black/25 text-white/65 hover:bg-white/[0.06] hover:text-white"}`}>{visibilityLabel(visibility)}</Link>; })}</div></div>
          </div>
        </div>
      </div>
      <div className="px-6 py-6 md:px-8">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-black/25 p-4"><div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">League</div><div className="mt-2 text-sm font-semibold text-white">{selectedLeague?.name ?? data?.selectedLeagueLabel ?? "—"}</div><div className="mt-1 text-xs text-sky-200/70">{selectedDivision?.name ?? data?.selectedDivisionLabel ?? "All divisions"} · {visibilityLabel(selectedVisibility)}</div></div>
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4"><div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-100/60">Both ways</div><div className="mt-2 text-2xl font-semibold text-white">{data?.summary.completedPairs ?? 0}</div></div>
          <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4"><div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-100/60">One way only</div><div className="mt-2 text-2xl font-semibold text-white">{data?.summary.oneWayPairs ?? 0}</div></div>
          <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4"><div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-red-100/60">Missing</div><div className="mt-2 text-2xl font-semibold text-white">{data?.summary.missingPairs ?? 0}</div></div>
        </div>
        {isLoading ? <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-6 text-sm text-white/55">Loading matchup grid...</div> : null}
        {!isLoading && (!data || data.teams.length === 0) ? <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-6 text-sm text-white/55">No teams found for this league/division/filter yet.</div> : null}
        {!isLoading && data && data.teams.length > 0 ? <div className="mt-6 overflow-x-auto rounded-3xl border border-white/10 bg-black/20"><table className="min-w-max border-collapse text-left text-xs"><thead><tr className="border-b border-white/10 bg-white/[0.04]"><th className="sticky left-0 z-20 min-w-[180px] border-r border-white/10 bg-[#07120f] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">Team</th>{data.teams.map((team) => <th key={team.id} className="min-w-[120px] max-w-[150px] border-r border-white/10 px-3 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/50"><span className="block truncate" title={team.name}>{team.name}</span></th>)}</tr></thead><tbody>{data.cells.map((row) => <tr key={row.teamId} className="border-b border-white/10 last:border-b-0"><th className="sticky left-0 z-10 min-w-[180px] border-r border-white/10 bg-[#07120f] px-4 py-3 text-sm font-semibold text-white">{row.teamName}</th>{row.opponents.map((cell) => <td key={cell.opponentId} className="border-r border-white/10 p-2 align-top"><div className={`min-h-[72px] rounded-2xl border px-3 py-2 ${getCellTone(cell)}`}><div className="text-sm font-semibold">{cell.label}</div>{!cell.isSelf ? <><div className="mt-1 text-[11px] opacity-75">{getCellHelper(cell)}</div>{cell.totalCount > 1 ? <div className="mt-1 text-[11px] opacity-70">{cell.totalCount} fixtures</div> : null}</> : null}</div></td>)}</tr>)}</tbody></table></div> : null}
        <div className="mt-5 flex flex-wrap gap-2 text-xs text-white/55"><span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-emerald-100">H + A = both directions covered</span><span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-amber-100">Only H or only A = reverse fixture missing</span><span className="rounded-full border border-red-400/20 bg-red-500/10 px-3 py-1 text-red-100">— = teams have not met</span></div>
      </div>
    </section>
  );
}
