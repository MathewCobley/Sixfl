import Link from "next/link";

import { getHomepageLeagues } from "@/lib/leagues/homepage-leagues";
import { requireAdmin } from "@/lib/requireAdmin";
import { updateHomepageLeagueAction } from "./actions";

function formatDay(value: string | null) {
  if (!value || value === "ANY") return "Night TBC";
  return value.charAt(0) + value.slice(1).toLowerCase();
}

function formatDate(value: Date | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(value);
}

function stageClasses(stage: string) {
  switch (stage) {
    case "LIVE":
      return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
    case "FORMING":
      return "border-sky-400/25 bg-sky-500/10 text-sky-100";
    case "PLANNED":
      return "border-amber-400/25 bg-amber-500/10 text-amber-100";
    default:
      return "border-white/10 bg-white/[0.04] text-white/55";
  }
}

export default async function HomepageLeaguesAdminPage({
  searchParams,
}: {
  searchParams?: Promise<{ updated?: string }>;
}) {
  await requireAdmin();

  const params = (await searchParams) ?? {};
  const leagues = await getHomepageLeagues({ includeHidden: true });

  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link
            href="/admin/leagues"
            className="text-sm font-semibold text-emerald-300 hover:text-emerald-200"
          >
            ← Back to leagues
          </Link>
          <h1 className="mt-3 text-3xl font-semibold text-white">
            Homepage leagues
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">
            This is the growth pipeline for SIXFL. Current league records drive the homepage automatically; change the stage here instead of editing homepage code.
          </p>
        </div>
        <Link
          href="/admin/leagues/new"
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-500 px-5 text-sm font-semibold text-black transition hover:bg-emerald-400"
        >
          Create new league
        </Link>
      </div>

      {params.updated ? (
        <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          Homepage league settings updated.
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-4">
        {[
          ["LIVE", "Playing now", "Fixtures/results are already public."],
          ["FORMING", "Actively recruiting", "The main launch stage for a new SIXFL league."],
          ["PLANNED", "Testing demand", "Collect early interest before the launch plan is ready."],
          ["HIDDEN", "Not on homepage", "Keep the league/data without advertising it publicly."],
        ].map(([stage, title, copy]) => (
          <div key={stage} className={`rounded-2xl border p-4 ${stageClasses(stage)}`}>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] opacity-70">{stage}</p>
            <p className="mt-2 font-semibold">{title}</p>
            <p className="mt-1 text-xs leading-5 opacity-65">{copy}</p>
          </div>
        ))}
      </div>

      <div className="rounded-3xl border border-sky-400/20 bg-sky-500/[0.06] p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-white">How to use this going forward</h2>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-white/60">
          Brand-new league records default to <strong className="text-sky-100">FORMING</strong>. Put an idea in <strong className="text-amber-100">PLANNED</strong> while you test demand, move it to <strong className="text-sky-100">FORMING</strong> once you are actively recruiting, and switch it to <strong className="text-emerald-100">LIVE</strong> when fixtures are running. Use <strong className="text-white">HIDDEN</strong> for old or broad catch-all pages such as Heartlands.
        </p>
      </div>

      <div className="space-y-4">
        {leagues.map((league) => (
          <article
            key={league.id}
            className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 sm:p-6"
          >
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_430px] xl:items-end">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${stageClasses(league.homepageStage)}`}>
                    {league.homepageStage}
                  </span>
                  <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[10px] font-bold text-white/50">
                    Priority {league.homepagePriority}
                  </span>
                </div>
                <h2 className="mt-3 text-xl font-semibold text-white">{league.name}</h2>
                <p className="mt-1 text-sm text-white/50">
                  {league.area || "Area not set"} · {formatDay(league.dayOfWeek)} · {league.venueName || "Venue not set"}
                </p>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-white/40">
                  <span>Planned start: {formatDate(league.proposedStartDate)}</span>
                  <span>{league.teamCount} current team{league.teamCount === 1 ? "" : "s"}</span>
                  <span>{league.publishedFixtureCount} published fixture{league.publishedFixtureCount === 1 ? "" : "s"}</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link
                    href={`/admin/leagues/${league.id}`}
                    className="text-sm font-semibold text-emerald-300 hover:text-emerald-200"
                  >
                    Edit league →
                  </Link>
                  <Link
                    href={`/leagues/${league.slug}`}
                    className="text-sm font-semibold text-white/60 hover:text-white"
                  >
                    View public page →
                  </Link>
                </div>
              </div>

              <form action={updateHomepageLeagueAction} className="grid gap-3 sm:grid-cols-[1fr_120px_auto] sm:items-end">
                <input type="hidden" name="leagueId" value={league.id} />
                <label className="space-y-2 text-xs font-semibold text-white/55">
                  <span className="block uppercase tracking-[0.15em]">Homepage stage</span>
                  <select
                    name="homepageStage"
                    defaultValue={league.homepageStage}
                    className="h-11 w-full rounded-xl border border-white/10 bg-neutral-950 px-3 text-sm text-white outline-none focus:border-emerald-400/40"
                  >
                    <option value="LIVE">Live</option>
                    <option value="FORMING">Forming</option>
                    <option value="PLANNED">Planned</option>
                    <option value="HIDDEN">Hidden</option>
                  </select>
                </label>
                <label className="space-y-2 text-xs font-semibold text-white/55">
                  <span className="block uppercase tracking-[0.15em]">Order</span>
                  <input
                    name="homepagePriority"
                    type="number"
                    min="0"
                    max="999"
                    defaultValue={league.homepagePriority}
                    className="h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-emerald-400/40"
                  />
                </label>
                <button
                  type="submit"
                  className="h-11 rounded-xl bg-emerald-400 px-5 text-sm font-semibold text-black transition hover:bg-emerald-300"
                >
                  Save
                </button>
              </form>
            </div>
          </article>
        ))}

        {leagues.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center text-sm text-white/50">
            No current active leagues are available to manage.
          </div>
        ) : null}
      </div>
    </div>
  );
}
