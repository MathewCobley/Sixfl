import Link from "next/link";
import { getPlayerRecruitmentMatches } from "@/lib/players/player-data-health-matches";
import PlayerDataHealthReview from "@/components/admin/players/PlayerDataHealthReview";
import HealthSubmitButton from "@/components/admin/players/HealthSubmitButton";
import { runCleanupNowAction } from "./actions";

import { getPlayerDataHealthRunChanges } from "@/lib/players/player-data-health-audit";
import {
  getPlayerDataHealthRuns,
} from "@/lib/players/player-data-health";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Player Data Health | SIXFL Admin",
};

type SearchParams = {
  cleaned?: string;
  error?: string;
  q?: string;
};

function formatDate(value: Date | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function statusLabel(value: string | null) {
  if (!value) return "Before status not recorded";
  return value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

function recordTypeLabel(value: string) {
  switch (value) {
    case "PLAYER_POOL":
      return "PlayerPool";
    case "PLAYER_POOL_REQUEST":
      return "PlayerPool request";
    case "PROSPECT":
      return "Prospect";
    case "LEAD":
      return "Lead";
    default:
      return value;
  }
}

export default async function PlayerDataHealthPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  await requireAdmin();
  const params = (await searchParams) ?? {};
  const [matches, runs] = await Promise.all([
    getPlayerRecruitmentMatches(),
    getPlayerDataHealthRuns(12),
  ]);
  const runChanges = await Promise.all(
    runs.map((run) =>
      getPlayerDataHealthRunChanges({
        id: run.id,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
      }),
    ),
  );

  const safeCount = matches.filter(m => m.safe).length;
  const query = (params.q || "").trim().toLowerCase().slice(0, 200);
  const visibleMatches = matches.filter(m => !query || [m.record.name, m.record.email, m.record.phone, m.record.publicCode,
    ...m.candidates.flatMap(c => [c.name, c.email, ...c.phones, ...c.teams.map(t => t.name)])].filter(Boolean).join(" ").toLowerCase().includes(query));

  return (
    <main className="space-y-8">
      <section className="rounded-3xl border border-emerald-400/20 bg-emerald-500/[0.06] p-6 lg:p-8">
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-200/70">
          Player data health
        </p>
        <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-3xl font-black text-white">One person, one live identity</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/65">
              Compare recruitment records with current squad identities by original record link, verified email and name, mobile, and name variants. Opening or searching this page does not run cleanup. Review the matches below before making changes.
            </p>
          </div>
          <form action={runCleanupNowAction} className="max-w-sm space-y-3">
            <label className="flex gap-2 text-sm text-white/70"><input type="checkbox" name="confirmSafe" value="yes" required/>Reconcile safe matches only. Leave possible duplicates for review.</label>
            <HealthSubmitButton>Run safe cleanup now ({safeCount})</HealthSubmitButton>
            <p className="text-xs text-white/50">Covers all safe matches, not just the current search results.</p>
          </form>
        </div>

        <div className="mt-6 rounded-2xl border border-sky-400/20 bg-sky-500/10 p-4 text-sm leading-6 text-sky-50/80">
          <strong className="text-white">Automatic safety rules:</strong> nothing is deleted. A single original link (without a name conflict), or one verified email plus full-name match, can qualify for safe cleanup. Matching mobile/name, similar names, multiple accounts, paused/declined records and other-team enquiries require review. Nothing is merged or deleted; completed matches, payments, messages and squad memberships stay intact.
        </div>
      </section>

      {params.cleaned ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          Cleanup complete: {params.cleaned}.
        </div>
      ) : null}
      {params.error ? (
        <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
          {params.error}
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-3">
        {[["Recruitment records flagged", matches.length], ["Safe to reconcile", safeCount], ["Review required", matches.length - safeCount]].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><p className="text-xs text-white/55">{label}</p><p className="mt-2 text-2xl font-bold text-white">{value}</p></div>
        ))}
      </section>
      <form method="get" className="flex flex-wrap gap-3">
        <label className="min-w-0 flex-1 text-sm text-white/70">Find a person, team, email, mobile or PlayerPool code<input name="q" defaultValue={params.q || ""} maxLength={200} className="mt-2 block w-full rounded-xl border border-white/15 bg-black/25 px-4 py-3" placeholder="Search records" /></label>
        <button className="self-end rounded-xl border border-white/20 px-5 py-3 text-sm text-white">Search</button>
        {query ? <Link href="/admin/players/data-health" className="self-end py-3 text-sm text-white/65 underline">Clear search</Link> : null}
      </form>
      <PlayerDataHealthReview matches={visibleMatches}/>

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035]">
        <div className="border-b border-white/10 px-5 py-4">
          <h2 className="text-xl font-semibold text-white">Cleanup history</h2>
          <p className="mt-1 text-sm text-white/50">
            Open any run to see exactly which people and records changed. Older runs created before itemised logging are reconstructed from the cleanup timestamps and audit notes and are labelled accordingly.
          </p>
        </div>
        {runs.length === 0 ? (
          <div className="px-5 py-8 text-sm text-white/45">No cleanup run has been recorded yet.</div>
        ) : (
          <div className="divide-y divide-white/10">
            {runs.map((run, index) => {
              const changes = runChanges[index] ?? [];
              return (
                <details key={run.id} className="group px-5 py-4 text-sm">
                  <summary className="cursor-pointer list-none">
                    <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-white">{run.source}</span>
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] ${run.status === "COMPLETED" ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100" : run.status === "FAILED" ? "border-red-400/20 bg-red-500/10 text-red-100" : "border-amber-400/20 bg-amber-500/10 text-amber-100"}`}>
                            {run.status}
                          </span>
                          <span className="text-white/40">{formatDate(run.startedAt)}</span>
                        </div>
                        <p className="mt-2 text-white/55">
                          {run.affectedUsers} people · {run.prospectsActivated} prospects linked · {run.prospectsClosedAsDuplicate} unassigned duplicates closed · {run.playerPoolProfilesJoined} PlayerPool profiles joined · {run.requestsJoined + run.requestsClosed} requests resolved · {run.leadsClosed} leads closed
                        </p>
                      </div>
                      <span className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/65 group-open:bg-white/10">
                        {changes.length > 0 ? `View ${changes.length} record change${changes.length === 1 ? "" : "s"}` : "No itemised records found"}
                      </span>
                    </div>
                  </summary>

                  {run.error ? <p className="mt-3 text-red-200/75">{run.error}</p> : null}

                  {changes.length > 0 ? (
                    <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
                      {changes.map((change) => (
                        <div key={change.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold text-white">{change.playerName || change.email || "Unknown player"}</span>
                                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/55">
                                  {recordTypeLabel(change.recordType)}
                                </span>
                                {change.reconstructed ? (
                                  <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-100">
                                    Reconstructed
                                  </span>
                                ) : null}
                              </div>
                              {change.email ? <div className="mt-1 text-xs text-white/45">{change.email}</div> : null}
                              {change.teamNames ? <div className="mt-1 text-xs text-white/40">Squad: {change.teamNames}</div> : null}
                              <div className="mt-3 font-medium text-white/80">{change.recordLabel || change.recordId}</div>
                              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                                <span className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-white/50">
                                  {statusLabel(change.previousStatus)}
                                </span>
                                <span className="text-white/30">→</span>
                                <span className="rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-2 py-1 text-emerald-100">
                                  {statusLabel(change.newStatus)}
                                </span>
                              </div>
                              {change.reason ? <p className="mt-3 text-xs leading-5 text-white/50">{change.reason}</p> : null}
                            </div>
                            {change.email ? (
                              <Link
                                href={`/admin/players/audit?q=${encodeURIComponent(change.email)}`}
                                className="inline-flex shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/65 hover:bg-white/10"
                              >
                                Full player audit
                              </Link>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-4 border-t border-white/10 pt-4 text-xs leading-5 text-white/45">
                      This run has a summary total but no recoverable per-record detail. Future cleanup changes are logged individually at the moment they happen.
                    </div>
                  )}
                </details>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
