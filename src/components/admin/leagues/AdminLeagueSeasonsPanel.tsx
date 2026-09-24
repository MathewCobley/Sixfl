"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type Season = {
  id: string;
  name: string;
  season: string | null;
  isActive: boolean;
  publicAt: string | null;
  teamCount: number;
  fixtureCount: number;
  completedFixtureCount: number;
  isCurrent: boolean;
};
type Summary = {
  competition: { id: string; name: string; currentLeagueId: string | null } | null;
  seasons: Season[];
};
const buttonClass = "inline-flex min-h-11 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-50";
function isPublicNow(season: Season) {
  const timestamp = season.publicAt ? Date.parse(season.publicAt) : NaN;
  return season.isActive && Number.isFinite(timestamp) && timestamp <= Date.now();
}
function visibilityLabel(season: Season) {
  if (!season.isActive) return "Inactive";
  if (!season.publicAt) return "Private draft";
  return isPublicNow(season) ? "Public" : "Scheduled · not public yet";
}
async function submitSeasonAction(leagueId: string, body: Record<string, unknown>) {
  const response = await fetch(`/api/admin/leagues/${encodeURIComponent(leagueId)}/competition`, {
    method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null) as { leagueId?: string; error?: string } | null;
  if (!response.ok || !payload) throw new Error(payload?.error || "The season could not be updated. Please try again.");
  return payload;
}

export default function AdminLeagueSeasonsPanel({ leagueId }: { leagueId: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const isOverview = pathname.replace(/\/$/, "") === `/admin/leagues/${leagueId}`;
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [seasonName, setSeasonName] = useState("");
  const [copyTeams, setCopyTeams] = useState(true);

  useEffect(() => {
    if (!isOverview) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch(`/api/admin/leagues/${encodeURIComponent(leagueId)}/competition`, {
      cache: "no-store", credentials: "same-origin", signal: controller.signal,
    }).then(async response => {
      const data = await response.json().catch(() => null) as Summary | null;
      if (!response.ok || !data || !Array.isArray(data.seasons)) throw new Error("The season panel could not be loaded.");
      if (!controller.signal.aborted) setSummary(data);
    }).catch(caught => {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "The season panel could not be loaded.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [leagueId, revision, isOverview]);

  if (!isOverview) return null;
  const currentSeason = summary?.seasons.find(season => season.isCurrent);
  const viewedSeason = summary?.seasons.find(season => season.id === leagueId);

  async function perform(body: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await submitSeasonAction(leagueId, body);
      if (body.action === "createSeason") {
        if (!result.leagueId) throw new Error("The new season could not be opened. Refresh before trying again.");
        router.push(`/admin/leagues/${result.leagueId}`);
      } else {
        setRevision(value => value + 1);
      }
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The season could not be updated.");
    } finally { setBusy(false); }
  }

  return (
    <section aria-label="Competition seasons" className="mx-auto w-full max-w-7xl rounded-3xl border border-sky-400/20 bg-sky-500/[0.06] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Competition seasons</h2>
          <p className="mt-1 text-sm text-white/60">Prepare the next season privately while the current season stays live. Switching seasons is a separate confirmed action.</p>
        </div>
        <button type="button" className={buttonClass} disabled={busy || loading} onClick={() => setRevision(value => value + 1)}>Refresh seasons</button>
      </div>
      {error ? <p role="alert" className="mt-4 rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-100">{error}</p> : null}
      {loading ? <p role="status" className="mt-4 text-sm text-white/55">Loading seasons…</p> : summary ? (
        <>
          {!summary.competition ? (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-white/60">Create a parent competition first. The existing season, table and results are kept.</p>
              <button type="button" disabled={busy} className={buttonClass} onClick={() => void perform({ action: "ensureCompetition" })}>Create parent competition</button>
            </div>
          ) : (
            <>
              <p className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white/70">Parent competition: {summary.competition.name} · Current season: <strong>{currentSeason?.season || currentSeason?.name || "Not set"}</strong></p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {summary.seasons.map(season => (
                  <Link key={season.id} href={`/admin/leagues/${season.id}`} className="rounded-2xl border border-white/10 bg-black/20 p-4 transition hover:border-sky-400/30">
                    <div className="font-semibold text-white">{season.season || season.name}</div>
                    <p className="mt-1 text-xs text-white/45">{season.teamCount} teams · {season.fixtureCount} fixtures · {season.completedFixtureCount} results</p>
                    <p className="mt-2 text-xs font-semibold text-sky-200">{season.isCurrent ? "Current season" : "Not current"} · {visibilityLabel(season)}</p>
                  </Link>
                ))}
              </div>
              {viewedSeason && !viewedSeason.isCurrent ? (
                <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-500/[0.05] p-4">
                  <p className="text-sm leading-6 text-white/70">Keep Public go-live blank while preparing. When ready, save a go-live time that has arrived, then make this the current season here. Setting a date alone does not switch seasons. Fixtures remain unpublished until you publish them separately.</p>
                  <button type="button" className={`${buttonClass} mt-3`} disabled={busy || !isPublicNow(viewedSeason)} onClick={() => {
                    if (!window.confirm(`Make ${viewedSeason.season || viewedSeason.name} the current season instead of ${currentSeason?.season || currentSeason?.name || "the existing selection"}? Team dashboards will switch to this season. Previous results and payment history will be kept. This does not publish fixtures or send messages.`)) return;
                    void perform({ action: "makeCurrent", confirmed: true, expectedCurrentLeagueId: summary.competition?.currentLeagueId ?? null });
                  }}>Make current season</button>
                  {!isPublicNow(viewedSeason) ? <p className="mt-2 text-xs leading-5 text-amber-100">Available once this season is active and its Public go-live time has arrived. Save the settings, then select Refresh seasons.</p> : null}
                </div>
              ) : null}
              <form className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4" onSubmit={event => {
                event.preventDefault();
                if (seasonName.trim()) void perform({ action: "createSeason", seasonName: seasonName.trim(), copyTeams });
              }}>
                <h3 className="text-sm font-semibold text-white">Create next season privately</h3>
                <p className="mt-2 text-sm leading-6 text-white/60">The new season starts private with no go-live date. The current season, its table and team dashboards stay unchanged. Keep any new fixtures in draft while organising teams and divisions.</p>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
                  <label className="min-w-0 flex-1 text-sm text-white/60">New season name
                    <input required value={seasonName} onChange={event => setSeasonName(event.target.value)} placeholder="Winter 2026/27" className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-white" />
                  </label>
                  <button type="submit" disabled={busy} className={buttonClass}>Create private season</button>
                </div>
                <label className="mt-4 flex items-start gap-3 text-sm text-white/70">
                  <input type="checkbox" checked={copyTeams} onChange={event => setCopyTeams(event.target.checked)} className="mt-1" />
                  <span>Copy teams and division assignments into the new season. Fixtures and results are not copied.</span>
                </label>
              </form>
            </>
          )}
        </>
      ) : null}
    </section>
  );
}
