import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  getPlayerDataHealthIssues,
  getPlayerDataHealthRuns,
} from "@/lib/players/player-data-health";
import { runSafePlayerDataHealthCleanup } from "@/lib/players/player-data-health-safe";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Player Data Health | SIXFL Admin",
};

type SearchParams = {
  cleaned?: string;
  error?: string;
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

async function runCleanupNowAction() {
  "use server";

  await requireAdmin();
  try {
    const result = await runSafePlayerDataHealthCleanup({ source: "MANUAL", force: true });
    revalidatePath("/admin/players/data-health");
    revalidatePath("/admin/player-prospects");
    revalidatePath("/admin/player-pool");
    revalidatePath("/admin/leads");
    redirect(
      `/admin/players/data-health?cleaned=${encodeURIComponent(
        `${result.affectedUsers} people reconciled`,
      )}`,
    );
  } catch (error) {
    console.error("Manual player data health cleanup failed", error);
    redirect("/admin/players/data-health?error=cleanup_failed");
  }
}

export default async function PlayerDataHealthPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  await requireAdmin();
  const params = (await searchParams) ?? {};
  const [issues, runs] = await Promise.all([
    getPlayerDataHealthIssues(),
    getPlayerDataHealthRuns(12),
  ]);

  const prospectCount = issues.reduce((sum, item) => sum + item.prospectCount, 0);
  const poolCount = issues.reduce((sum, item) => sum + item.playerPoolCount, 0);
  const requestCount = issues.reduce((sum, item) => sum + item.requestCount, 0);
  const leadCount = issues.reduce((sum, item) => sum + item.leadCount, 0);

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
              Squad membership is the live player identity. When a verified player joins a squad, matching same-team or unassigned recruitment records are reconciled automatically. This page is the monthly backstop and audit view rather than a task you need to remember to perform.
            </p>
          </div>
          <form action={runCleanupNowAction}>
            <button
              type="submit"
              className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-emerald-400 px-5 py-3 text-sm font-black text-black transition hover:bg-emerald-300"
            >
              Run safe cleanup now
            </button>
          </form>
        </div>

        <div className="mt-6 rounded-2xl border border-sky-400/20 bg-sky-500/10 p-4 text-sm leading-6 text-sky-50/80">
          <strong className="text-white">Automatic safety rules:</strong> nothing is deleted. Same-team prospects become Active squad, verified unassigned copies become Duplicated, matching PlayerPool profiles become Joined, and matching player leads close. Shared-email name conflicts and deliberately assigned records for another team are left untouched for review.
        </div>
      </section>

      {params.cleaned ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          Cleanup complete: {params.cleaned}.
        </div>
      ) : null}
      {params.error ? (
        <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
          The cleanup could not be completed. No destructive delete is used; review the server log before trying again.
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Records to review", issues.length],
          ["Open prospects", prospectCount],
          ["PlayerPool profiles", poolCount],
          ["Open requests", requestCount],
          ["Open player leads", leadCount],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">{label}</p>
            <p className="mt-2 text-2xl font-black text-white">{value}</p>
          </div>
        ))}
      </section>

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035]">
        <div className="border-b border-white/10 px-5 py-4">
          <h2 className="text-xl font-semibold text-white">Current recruitment overlaps</h2>
          <p className="mt-1 text-sm text-white/50">
            Most same-person records will clear automatically. Anything that remains may be a shared-email or intentional cross-team case and should be inspected rather than auto-merged.
          </p>
        </div>

        {issues.length === 0 ? (
          <div className="px-5 py-10 text-sm text-emerald-100/75">
            No live recruitment overlaps found.
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {issues.map((item) => (
              <div key={item.userId} className="flex flex-col gap-4 px-5 py-5 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-semibold text-white">{item.name || item.email}</div>
                    <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-100">
                      Active squad account
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-white/55">{item.email}</div>
                  <div className="mt-1 text-xs text-white/40">Squad: {item.teamNames}</div>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                    {item.prospectCount > 0 ? <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-2.5 py-1 text-amber-100">Prospects {item.prospectCount}</span> : null}
                    {item.playerPoolCount > 0 ? <span className="rounded-full border border-sky-400/20 bg-sky-500/10 px-2.5 py-1 text-sky-100">PlayerPool {item.playerPoolCount}</span> : null}
                    {item.requestCount > 0 ? <span className="rounded-full border border-violet-400/20 bg-violet-500/10 px-2.5 py-1 text-violet-100">Requests {item.requestCount}</span> : null}
                    {item.leadCount > 0 ? <span className="rounded-full border border-orange-400/20 bg-orange-500/10 px-2.5 py-1 text-orange-100">Leads {item.leadCount}</span> : null}
                  </div>
                </div>
                <Link
                  href={`/admin/players/audit?q=${encodeURIComponent(item.email)}`}
                  className="inline-flex shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white/75 transition hover:bg-white/10"
                >
                  Inspect full history
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035]">
        <div className="border-b border-white/10 px-5 py-4">
          <h2 className="text-xl font-semibold text-white">Cleanup history</h2>
          <p className="mt-1 text-sm text-white/50">Monthly and manual reconciliation runs are recorded here.</p>
        </div>
        {runs.length === 0 ? (
          <div className="px-5 py-8 text-sm text-white/45">No cleanup run has been recorded yet.</div>
        ) : (
          <div className="divide-y divide-white/10">
            {runs.map((run) => (
              <div key={run.id} className="px-5 py-4 text-sm">
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
                {run.error ? <p className="mt-2 text-red-200/75">{run.error}</p> : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
