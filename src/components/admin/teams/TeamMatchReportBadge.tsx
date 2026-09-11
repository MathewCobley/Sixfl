import { ClipboardDocumentCheckIcon } from "@heroicons/react/24/outline";

import type { TeamMatchReportActivity } from "@/lib/admin/team-match-report-activity";

type Props = { activity: TeamMatchReportActivity | null | undefined };

/** Native details makes the small badge usable by mouse, keyboard and touch. */
export default function TeamMatchReportBadge({ activity }: Props) {
  if (activity === undefined || (activity && activity.reportCount <= 0)) return null;
  if (activity === null) {
    return <span className="rounded-full border border-white/15 px-2.5 py-1 text-[11px] text-white/60" title="Match-report activity could not be checked. Refresh to try again.">Reports unavailable</span>;
  }

  const latest = new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London",
  }).format(new Date(activity.latestMatchAt));
  const matches = `${activity.reportCount} completed match${activity.reportCount === 1 ? "" : "es"}`;

  return (
    <details className="max-w-full" data-team-match-report-badge>
      <summary
        className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full border border-sky-400/25 bg-sky-500/10 px-2.5 py-1 text-[11px] font-semibold text-sky-200 hover:bg-sky-500/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 [&::-webkit-details-marker]:hidden"
        title={`Match details saved for ${matches}. Latest match: ${latest}. Open for details.`}
      >
        <ClipboardDocumentCheckIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>Match reports · {activity.reportCount}</span>
      </summary>
      <div className="mt-2 max-w-xs rounded-xl border border-white/10 bg-slate-950 p-3 text-xs font-normal leading-5 text-white/75">
        <p>Scorers, assists, Player of the Match or ratings saved for {matches}.</p>
        <p className="mt-1">Latest match: <time dateTime={activity.latestMatchAt}>{latest}</time>.</p>
        <p className="mt-1 text-white/55">History for this team record, not confirmation that the latest report is complete. Includes details entered on the team’s behalf.</p>
      </div>
    </details>
  );
}
