// ========================================
// File: src/components/admin/fixtures/FixtureMatchupGrid.tsx
// ========================================

"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { FixtureConfirmationChaseButton } from "@/components/admin/fixtures/FixtureConfirmationChaseButton";

type LeagueOption = { id: string; name: string; season: string | null; isActive: boolean };
type DivisionOption = { id: string; name: string; slug: string; sortOrder: number };
type TeamOption = { id: string; name: string };
type VisibilityFilter = "all" | "published" | "draft";
type ConfirmationStatus = "PENDING" | "CONFIRMED" | "ISSUE_RAISED" | "OVERDUE" | null;
type GridCell = {
  opponentId: string;
  opponentName: string;
  homeCount: number;
  awayCount: number;
  totalCount: number;
  latestKickoffAt: string | null;
  label: string;
  isSelf: boolean;
};
type GridRow = { teamId: string; teamName: string; opponents: GridCell[] };
type GridFixture = {
  id: string;
  leagueId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  kickoffAt: string;
  round: number | null;
  position: number | null;
  pitch: string | null;
  venueName: string | null;
  status: string;
  publishedAt: string | null;
  homeMatchFeePence: number | null;
  awayMatchFeePence: number | null;
  homeConfirmationStatus: ConfirmationStatus;
  homeConfirmationNote: string | null;
  homeConfirmedAt: string | null;
  homeIssueRaisedAt: string | null;
  homeLastChasedAt: string | null;
  awayConfirmationStatus: ConfirmationStatus;
  awayConfirmationNote: string | null;
  awayConfirmedAt: string | null;
  awayIssueRaisedAt: string | null;
  awayLastChasedAt: string | null;
};
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
  fixtures: GridFixture[];
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
  const params = new URLSearchParams();
  if (leagueId) params.set("leagueId", leagueId);
  if (divisionId) params.set("divisionId", divisionId);
  if (visibility !== "all") params.set("visibility", visibility);
  const query = params.toString();
  return query ? `/admin/fixtures?${query}` : "/admin/fixtures";
}

function buildFixtureEditHref(input: {
  fixtureId: string;
  leagueId: string;
  divisionId: string;
  visibility: VisibilityFilter;
}) {
  const returnTo = buildGridHref(input.leagueId, input.divisionId || null, input.visibility);
  const params = new URLSearchParams({ returnTo });

  if (input.divisionId) {
    params.set("divisionId", input.divisionId);
  }

  return `/admin/fixtures/${input.fixtureId}/edit?${params.toString()}`;
}

function visibilityLabel(value: VisibilityFilter) {
  if (value === "published") return "Published only";
  if (value === "draft") return "Draft only";
  return "Published + draft";
}

function formatFixtureDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  }).format(new Date(value));
}

function formatShortDateTime(value: string | null) {
  if (!value) return null;

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  }).format(new Date(value));
}

function formatMoney(amountPence: number | null) {
  if (amountPence === null) return "Not set";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountPence / 100);
}

function fixtureStatusTone(status: string) {
  if (status === "COMPLETED") return "border-sky-400/20 bg-sky-500/10 text-sky-100";
  if (status === "POSTPONED") return "border-amber-400/20 bg-amber-500/10 text-amber-100";
  if (status === "CANCELLED") return "border-red-400/20 bg-red-500/10 text-red-100";
  return "border-emerald-400/20 bg-emerald-500/10 text-emerald-100";
}

function confirmationLabel(status: ConfirmationStatus) {
  if (status === "CONFIRMED") return "Confirmed";
  if (status === "ISSUE_RAISED") return "Issue raised";
  if (status === "OVERDUE") return "Not confirmed · overdue";
  if (status === "PENDING") return "Not confirmed";
  return "No confirmation record";
}

function confirmationTone(status: ConfirmationStatus) {
  if (status === "CONFIRMED") return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
  if (status === "ISSUE_RAISED") return "border-amber-400/20 bg-amber-400/10 text-amber-200";
  if (status === "OVERDUE") return "border-red-400/20 bg-red-500/10 text-red-200";
  return "border-white/10 bg-white/[0.045] text-white/75";
}

function canChase(status: ConfirmationStatus) {
  return status !== "CONFIRMED" && status !== "ISSUE_RAISED";
}

function getWeekLabel(round: number | null) {
  return round === null ? "Unassigned week" : `Week ${round}`;
}

function ConfirmationPanel({
  fixtureId,
  leagueId,
  teamId,
  teamName,
  status,
  confirmedAt,
  issueRaisedAt,
  lastChasedAt,
  note,
}: {
  fixtureId: string;
  leagueId: string;
  teamId: string;
  teamName: string;
  status: ConfirmationStatus;
  confirmedAt: string | null;
  issueRaisedAt: string | null;
  lastChasedAt: string | null;
  note: string | null;
}) {
  const confirmedLabel = formatShortDateTime(confirmedAt);
  const issueLabel = formatShortDateTime(issueRaisedAt);
  const chasedLabel = formatShortDateTime(lastChasedAt);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white" title={teamName}>
            {teamName}
          </div>
          <div className="mt-1 text-[11px] text-white/40">
            {chasedLabel ? `Last chased ${chasedLabel}` : "Not chased yet"}
          </div>
        </div>
        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${confirmationTone(status)}`}>
          {confirmationLabel(status)}
        </span>
      </div>

      {confirmedLabel ? <div className="mt-2 text-xs text-emerald-100/70">Confirmed {confirmedLabel}</div> : null}
      {issueLabel ? <div className="mt-2 text-xs text-amber-100/80">Issue raised {issueLabel}</div> : null}
      {note ? <div className="mt-2 rounded-xl border border-amber-400/15 bg-amber-500/5 px-3 py-2 text-xs leading-5 text-amber-100/85">{note}</div> : null}

      {canChase(status) ? (
        <div className="mt-3">
          <FixtureConfirmationChaseButton fixtureId={fixtureId} teamId={teamId} leagueId={leagueId} />
        </div>
      ) : null}
    </div>
  );
}

export default function FixtureMatchupGrid({
  initialLeagueId,
  initialDivisionId,
}: {
  initialLeagueId?: string;
  initialDivisionId?: string;
}) {
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
        if (result.selectedVisibility) setSelectedVisibility(result.selectedVisibility);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadGrid();

    return () => {
      cancelled = true;
    };
  }, [selectedLeagueId, selectedDivisionId, selectedVisibility]);

  const leagues = data?.leagues ?? [];
  const divisions = data?.divisions ?? [];
  const fixtures = data?.fixtures ?? [];
  const selectedLeague = useMemo(
    () => leagues.find((league) => league.id === selectedLeagueId) ?? null,
    [leagues, selectedLeagueId],
  );
  const selectedDivision = useMemo(
    () => divisions.find((division) => division.id === selectedDivisionId) ?? null,
    [divisions, selectedDivisionId],
  );

  const fixturesByRound = useMemo(() => {
    const grouped = new Map<string, GridFixture[]>();

    for (const fixture of fixtures) {
      const key = getWeekLabel(fixture.round);
      grouped.set(key, [...(grouped.get(key) ?? []), fixture]);
    }

    return Array.from(grouped.entries()).sort(([a], [b]) => {
      const aNumber = Number(a.replace("Week ", ""));
      const bNumber = Number(b.replace("Week ", ""));
      if (Number.isFinite(aNumber) && Number.isFinite(bNumber)) return aNumber - bNumber;
      return a.localeCompare(b);
    });
  }, [fixtures]);

  return (
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_24px_80px_rgba(0,0,0,0.32)]">
      <div className="border-b border-white/10 px-6 py-6 md:px-8">
        <div className="space-y-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">Fixture selector</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Choose league and division</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">
              Pick the league, division and fixture visibility. The grid and fixture cards below come from the same selection.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">League</div>
              <div className="flex flex-wrap gap-2">
                {leagues.map((league) => {
                  const isActive = selectedLeagueId === league.id;
                  return (
                    <Link
                      key={league.id}
                      href={buildGridHref(league.id, null, selectedVisibility)}
                      className={`rounded-2xl border px-4 py-2.5 text-sm font-semibold transition ${isActive ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-50" : "border-white/10 bg-black/25 text-white/65 hover:bg-white/[0.06] hover:text-white"}`}
                    >
                      {formatLeagueLabel(league)}{league.isActive ? "" : " · inactive"}
                    </Link>
                  );
                })}
              </div>
            </div>

            {divisions.length > 0 ? (
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">Division</div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={buildGridHref(selectedLeagueId, null, selectedVisibility)}
                    className={`rounded-2xl border px-4 py-2.5 text-sm font-semibold transition ${!selectedDivisionId ? "border-sky-400/30 bg-sky-500/15 text-sky-50" : "border-white/10 bg-black/25 text-white/65 hover:bg-white/[0.06] hover:text-white"}`}
                  >
                    All divisions
                  </Link>
                  {divisions.map((division) => {
                    const isActive = selectedDivisionId === division.id;
                    return (
                      <Link
                        key={division.id}
                        href={buildGridHref(selectedLeagueId, division.id, selectedVisibility)}
                        className={`rounded-2xl border px-4 py-2.5 text-sm font-semibold transition ${isActive ? "border-sky-400/30 bg-sky-500/15 text-sky-50" : "border-white/10 bg-black/25 text-white/65 hover:bg-white/[0.06] hover:text-white"}`}
                      >
                        {division.name}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">Fixture visibility</div>
              <div className="flex flex-wrap gap-2">
                {(["all", "published", "draft"] as VisibilityFilter[]).map((visibility) => {
                  const isActive = selectedVisibility === visibility;
                  return (
                    <Link
                      key={visibility}
                      href={buildGridHref(selectedLeagueId, selectedDivisionId, visibility)}
                      className={`rounded-2xl border px-4 py-2.5 text-sm font-semibold transition ${isActive ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-50" : "border-white/10 bg-black/25 text-white/65 hover:bg-white/[0.06] hover:text-white"}`}
                    >
                      {visibilityLabel(visibility)}
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 py-6 md:px-8">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">League</div>
            <div className="mt-2 text-sm font-semibold text-white">{selectedLeague?.name ?? data?.selectedLeagueLabel ?? "—"}</div>
            <div className="mt-1 text-xs text-sky-200/70">{selectedDivision?.name ?? data?.selectedDivisionLabel ?? "All divisions"} · {visibilityLabel(selectedVisibility)}</div>
          </div>
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-100/60">Both ways</div>
            <div className="mt-2 text-2xl font-semibold text-white">{data?.summary.completedPairs ?? 0}</div>
          </div>
          <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-100/60">One way only</div>
            <div className="mt-2 text-2xl font-semibold text-white">{data?.summary.oneWayPairs ?? 0}</div>
          </div>
          <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-red-100/60">Missing</div>
            <div className="mt-2 text-2xl font-semibold text-white">{data?.summary.missingPairs ?? 0}</div>
          </div>
        </div>

        {isLoading ? <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-6 text-sm text-white/55">Loading matchup grid...</div> : null}
        {!isLoading && (!data || data.teams.length === 0) ? <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-6 text-sm text-white/55">No teams found for this league/division/filter yet.</div> : null}

        {!isLoading && data && data.teams.length > 0 ? (
          <>
            <div className="mt-6 overflow-x-auto rounded-3xl border border-white/10 bg-black/20">
              <table className="min-w-max border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.04]">
                    <th className="sticky left-0 z-20 min-w-[180px] border-r border-white/10 bg-[#07120f] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">Team</th>
                    {data.teams.map((team) => (
                      <th key={team.id} className="min-w-[120px] max-w-[150px] border-r border-white/10 px-3 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/50">
                        <span className="block truncate" title={team.name}>{team.name}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.cells.map((row) => (
                    <tr key={row.teamId} className="border-b border-white/10 last:border-b-0">
                      <th className="sticky left-0 z-10 min-w-[180px] border-r border-white/10 bg-[#07120f] px-4 py-3 text-sm font-semibold text-white">{row.teamName}</th>
                      {row.opponents.map((cell) => (
                        <td key={cell.opponentId} className="border-r border-white/10 p-2 align-top">
                          <div className={`min-h-[72px] rounded-2xl border px-3 py-2 ${getCellTone(cell)}`}>
                            <div className="text-sm font-semibold">{cell.label}</div>
                            {!cell.isSelf ? (
                              <>
                                <div className="mt-1 text-[11px] opacity-75">{getCellHelper(cell)}</div>
                                {cell.totalCount > 1 ? <div className="mt-1 text-[11px] opacity-70">{cell.totalCount} fixtures</div> : null}
                              </>
                            ) : null}
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-5 flex flex-wrap gap-2 text-xs text-white/55">
              <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-emerald-100">H + A = both directions covered</span>
              <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-amber-100">Only H or only A = reverse fixture missing</span>
              <span className="rounded-full border border-red-400/20 bg-red-500/10 px-3 py-1 text-red-100">— = teams have not met</span>
            </div>

            <div className="mt-8 rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.12),transparent_32%),rgba(255,255,255,0.03)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.32)] md:p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300/80">Fixtures for selected league</p>
                  <h3 className="mt-1 text-2xl font-semibold tracking-tight text-white">Fixture cards</h3>
                  <p className="mt-2 text-sm text-white/55">Showing {fixtures.length} fixture{fixtures.length === 1 ? "" : "s"} from the same selection as the grid above.</p>
                </div>
                <Link
                  href={`/admin/fixtures/all?q=${encodeURIComponent(selectedLeague?.name ?? data?.selectedLeagueLabel ?? "")}`}
                  className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-sm font-semibold text-white/75 transition hover:border-white/20 hover:bg-white/[0.08]"
                >
                  Open full search view
                </Link>
              </div>

              {fixtures.length === 0 ? (
                <div className="mt-5 rounded-2xl border border-dashed border-white/10 bg-black/25 px-5 py-8 text-sm text-white/55">No fixture rows found for this league/division/visibility selection.</div>
              ) : (
                <div className="mt-6 space-y-6">
                  {fixturesByRound.map(([roundLabel, roundFixtures]) => (
                    <div key={roundLabel} className="space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-500/10 text-sm font-black text-emerald-100">
                          {roundLabel.replace("Week ", "")}
                        </div>
                        <div>
                          <div className="text-base font-semibold text-white">{roundLabel}</div>
                          <div className="text-xs text-white/40">{roundFixtures.length} fixture{roundFixtures.length === 1 ? "" : "s"}</div>
                        </div>
                      </div>

                      <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                        {roundFixtures.map((fixture) => (
                          <article key={fixture.id} className="rounded-3xl border border-white/10 bg-black/25 p-4 transition hover:border-white/20 hover:bg-white/[0.04]">
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <div className="text-sm font-semibold leading-6 text-white">
                                  {fixture.homeTeamName} <span className="text-white/35">vs</span> {fixture.awayTeamName}
                                </div>
                                <div className="mt-1 text-xs text-white/45">
                                  {fixture.pitch || "Pitch not set"}{fixture.position !== null ? ` · Game ${fixture.position}` : ""}
                                </div>
                              </div>
                              <div className="flex shrink-0 flex-wrap gap-2">
                                <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${fixtureStatusTone(fixture.status)}`}>{fixture.status}</span>
                                <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${fixture.publishedAt ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200" : "border-amber-400/20 bg-amber-400/10 text-amber-200"}`}>{fixture.publishedAt ? "Live" : "Draft"}</span>
                              </div>
                            </div>

                            <div className="mt-4 grid gap-2 text-sm text-white/65 sm:grid-cols-2">
                              <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-2">
                                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">Kickoff</div>
                                <div className="mt-1 font-medium text-white/80">{formatFixtureDate(fixture.kickoffAt)}</div>
                              </div>
                              <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-2">
                                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">Venue</div>
                                <div className="mt-1 font-medium text-white/80">{fixture.venueName || "No venue"}</div>
                              </div>
                              <div className="rounded-2xl border border-emerald-400/15 bg-emerald-500/[0.06] px-3 py-2">
                                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-200/60">Team 1 fee</div>
                                <div className="mt-1 font-semibold text-emerald-50">{formatMoney(fixture.homeMatchFeePence)}</div>
                                <div className="mt-0.5 truncate text-[11px] text-emerald-100/45" title={fixture.homeTeamName}>{fixture.homeTeamName}</div>
                              </div>
                              <div className="rounded-2xl border border-sky-400/15 bg-sky-500/[0.06] px-3 py-2">
                                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-200/60">Team 2 fee</div>
                                <div className="mt-1 font-semibold text-sky-50">{formatMoney(fixture.awayMatchFeePence)}</div>
                                <div className="mt-0.5 truncate text-[11px] text-sky-100/45" title={fixture.awayTeamName}>{fixture.awayTeamName}</div>
                              </div>
                            </div>

                            <div className="mt-4 grid gap-2 lg:grid-cols-2">
                              <ConfirmationPanel
                                fixtureId={fixture.id}
                                leagueId={fixture.leagueId}
                                teamId={fixture.homeTeamId}
                                teamName={fixture.homeTeamName}
                                status={fixture.homeConfirmationStatus}
                                confirmedAt={fixture.homeConfirmedAt}
                                issueRaisedAt={fixture.homeIssueRaisedAt}
                                lastChasedAt={fixture.homeLastChasedAt}
                                note={fixture.homeConfirmationNote}
                              />
                              <ConfirmationPanel
                                fixtureId={fixture.id}
                                leagueId={fixture.leagueId}
                                teamId={fixture.awayTeamId}
                                teamName={fixture.awayTeamName}
                                status={fixture.awayConfirmationStatus}
                                confirmedAt={fixture.awayConfirmedAt}
                                issueRaisedAt={fixture.awayIssueRaisedAt}
                                lastChasedAt={fixture.awayLastChasedAt}
                                note={fixture.awayConfirmationNote}
                              />
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-4">
                              <Link
                                href={buildFixtureEditHref({
                                  fixtureId: fixture.id,
                                  leagueId: selectedLeagueId,
                                  divisionId: selectedDivisionId,
                                  visibility: selectedVisibility,
                                })}
                                className="inline-flex h-10 items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 text-xs font-semibold text-emerald-100 transition hover:border-emerald-300/40 hover:bg-emerald-500/15"
                              >
                                Edit fixture
                              </Link>
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
