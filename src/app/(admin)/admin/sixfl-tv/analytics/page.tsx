import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/requireAdmin";
import {
  getSixflTvAnalyticsDashboard,
  syncSixflTvYoutubeMetrics,
} from "@/lib/sixfl-tv/analytics";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function number(value: number) {
  return new Intl.NumberFormat("en-GB").format(Math.round(value));
}

function captured(value: Date | null) {
  if (!value) return "Not synced yet";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  }).format(value);
}

function relative(score: number) {
  const difference = score - 100;
  if (!difference) return "at division average";
  return `${Math.abs(difference)}% ${difference > 0 ? "above" : "below"} division average`;
}

async function refreshYoutubeAnalyticsAction() {
  "use server";
  await requireAdmin();
  let query = "refreshed=1";
  try {
    const result = await syncSixflTvYoutubeMetrics({ force: true });
    query = result.synced
      ? `refreshed=1&videos=${result.videos}`
      : `refreshed=1&videos=0&skipped=${encodeURIComponent(result.skipped || "none")}`;
  } catch (error) {
    console.error("Could not refresh SIXFL TV YouTube analytics", error);
    query = `error=${encodeURIComponent(error instanceof Error ? error.message : "YouTube analytics refresh failed.")}`;
  }
  revalidatePath("/admin/sixfl-tv/analytics");
  redirect(`/admin/sixfl-tv/analytics?${query}`);
}

export default async function SixflTvAnalyticsPage({
  searchParams,
}: {
  searchParams?: Promise<{ refreshed?: string; videos?: string; skipped?: string; error?: string }>;
}) {
  await requireAdmin();
  const sp = (await searchParams) ?? {};
  const analytics = await getSixflTvAnalyticsDashboard();

  return <div className="space-y-6">
    <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div>
        <p className="text-sm font-semibold text-emerald-300">SIXFL TV</p>
        <h1 className="mt-2 text-3xl font-bold text-white">Audience & engagement</h1>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-white/60">
          View index is an audience index: 100 means average viewing for the team’s current division.
          It is not a second Priority score. Audience can contribute up to 10 points to the one SIXFL TV Priority
          Score out of 100, while goal nominations and voting can contribute another 10.
        </p>
      </div>
      <form action={refreshYoutubeAnalyticsAction}>
        <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-red-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-400">
          Refresh YouTube figures
        </button>
      </form>
    </header>

    {sp.refreshed ? <p role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-sm text-emerald-100">
      YouTube figures refreshed{sp.videos ? ` · ${sp.videos} video${sp.videos === "1" ? "" : "s"} read` : ""}{sp.skipped ? ` · ${sp.skipped}` : ""}.
    </p> : null}
    {sp.error ? <p role="alert" className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-100">{sp.error}</p> : null}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[
        [number(analytics.totalViews), "Current linked YouTube views"],
        [String(analytics.videosWithMetrics), `Videos measured · ${analytics.linkedVideos} linked`],
        [analytics.viewsGained == null ? "—" : `+${number(analytics.viewsGained)}`, "Views gained since previous sync"],
        [captured(analytics.latestCaptureAt), "Latest YouTube snapshot"],
      ].map(([value, label]) => <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="text-2xl font-bold text-white">{value}</div>
        <p className="mt-1 text-xs leading-5 text-white/50">{label}</p>
      </div>)}
    </section>

    <section className="rounded-3xl border border-fuchsia-400/20 bg-fuchsia-500/[0.04] p-5 sm:p-6">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-fuchsia-200/70">Camera priority</p>
        <h2 className="mt-2 text-xl font-semibold text-white">View index & Priority contributions</h2>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-white/60">
          View index uses up to each team’s five most recent recorded fixtures and compares average fixture views
          with teams in the same division. Highlights and full-match views count; extra links do not distort the
          benchmark. Audience is worth up to 10 of the 100 Priority points; nominations are worth up to 5 and voting up to 5.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[1050px] w-full text-left text-sm">
          <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-white/40">
            <tr>
              <th className="px-3 py-3">Team</th>
              <th className="px-3 py-3">Recorded</th>
              <th className="px-3 py-3">Avg views / fixture</th>
              <th className="px-3 py-3">Division avg</th>
              <th className="px-3 py-3">View index</th>
              <th className="px-3 py-3">Audience pts</th>
              <th className="px-3 py-3">Nomination pts</th>
              <th className="px-3 py-3">Voting pts</th>
              <th className="px-3 py-3">Into Priority</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {analytics.teams.map(team => <tr key={team.teamId} className="text-white/75">
              <td className="px-3 py-4">
                <Link href={`/admin/teams/${team.teamId}`} className="font-semibold text-white hover:underline">{team.teamName}</Link>
                <div className="mt-1 text-xs text-white/40">{team.cohortLabel}</div>
              </td>
              <td className="px-3 py-4">{team.recordedFixtures}/5{team.provisional ? <span className="ml-2 text-xs text-amber-200">Provisional</span> : null}</td>
              <td className="px-3 py-4">{number(team.averageViews)}</td>
              <td className="px-3 py-4">{number(team.cohortAverageViews)}</td>
              <td className="px-3 py-4">
                <strong className={team.viewScore > 100 ? "text-emerald-200" : team.viewScore < 100 ? "text-amber-200" : "text-white"}>{team.viewScore}</strong>
                <div className="mt-1 text-xs text-white/40">{relative(team.viewScore)}</div>
              </td>
              <td className="px-3 py-4 font-semibold">+{team.viewBonus}/10</td>
              <td className="px-3 py-4">+{team.nominationPoints}/5 <span className="text-xs text-white/35">({team.nominationParticipants} players)</span></td>
              <td className="px-3 py-4">+{team.votePoints}/5 <span className="text-xs text-white/35">({team.voteParticipants} players)</span></td>
              <td className="px-3 py-4"><strong className="text-fuchsia-100">{team.engagementBonus}/20 pts</strong></td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>

    <section className="rounded-3xl border border-white/10 bg-white/[0.025] p-5 sm:p-6">
      <div className="mb-5">
        <h2 className="text-xl font-semibold text-white">Most watched linked videos</h2>
        <p className="mt-2 text-sm text-white/55">Historic fixture links count too — this is not limited to videos uploaded by the new studio workflow.</p>
      </div>
      <div className="space-y-2">
        {analytics.videos.slice(0, 30).map(video => <div key={video.videoId} className="flex flex-col gap-2 rounded-xl border border-white/10 bg-black/20 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <a href={video.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-white hover:underline">{video.fixtureLabel}</a>
            <p className="mt-1 truncate text-xs text-white/40">{video.kind.toLowerCase().replace("_", " ")} · {video.title}</p>
          </div>
          <div className="shrink-0 text-right">
            <div className="font-bold text-white">{number(video.views)} views</div>
            <div className="text-xs text-white/40">{video.viewsGained == null ? "Trend starts after first snapshot" : `+${number(video.viewsGained)} since previous sync`}</div>
          </div>
        </div>)}
        {!analytics.videos.length ? <p className="text-sm text-white/50">Refresh YouTube figures to create the first analytics snapshot.</p> : null}
      </div>
    </section>
  </div>;
}
