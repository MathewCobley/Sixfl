import Link from "next/link";

import {
  addWeeks,
  formatWeekLabel,
  getCurrentWeekStart,
} from "@/lib/team-week-unavailability";
import { getTeamWeekUnavailabilityOverview } from "@/lib/team-week-unavailability-overview";

function statusCopy(status: "CLEAR" | "DRAFT_CONFLICT" | "PUBLISHED_CONFLICT") {
  switch (status) {
    case "PUBLISHED_CONFLICT":
      return {
        label: "Published conflict",
        classes: "border-red-400/30 bg-red-500/12 text-red-100",
      };
    case "DRAFT_CONFLICT":
      return {
        label: "Draft conflict",
        classes: "border-amber-400/30 bg-amber-500/12 text-amber-100",
      };
    default:
      return {
        label: "Week off recorded",
        classes: "border-emerald-400/25 bg-emerald-500/10 text-emerald-100",
      };
  }
}

export default async function AdminFixtureUnavailabilitySummary() {
  // Fixture planning is for complete upcoming weeks, so start from next Monday.
  const from = addWeeks(getCurrentWeekStart(), 1);
  const to = addWeeks(from, 20);
  const notices = await getTeamWeekUnavailabilityOverview({ from, to });
  const draftConflicts = notices.filter(
    (notice) => notice.status === "DRAFT_CONFLICT",
  ).length;
  const publishedConflicts = notices.filter(
    (notice) => notice.status === "PUBLISHED_CONFLICT",
  ).length;

  return (
    <section
      className={`rounded-3xl border p-5 shadow-[0_20px_60px_rgba(0,0,0,0.24)] md:p-6 ${
        notices.length > 0
          ? "border-amber-400/25 bg-amber-500/[0.07]"
          : "border-emerald-400/20 bg-emerald-500/[0.07]"
      }`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-100/70">
            Check before generating
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white">
            Teams unavailable in upcoming weeks
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">
            {notices.length === 0
              ? "No teams have reported a future week off. Teams are currently assumed available."
              : `${notices.length} future team notice${notices.length === 1 ? "" : "s"} recorded for the next 20 weeks. Check these before creating the schedule.`}
          </p>
        </div>
        <Link
          href="/admin/team-unavailability"
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-amber-300/25 bg-black/20 px-4 text-sm font-semibold text-amber-50 transition hover:bg-black/30"
        >
          Open full list
        </Link>
      </div>

      {notices.length > 0 ? (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-white/40">
                Future notices
              </div>
              <div className="mt-2 text-2xl font-semibold text-white">
                {notices.length}
              </div>
            </div>
            <div className="rounded-2xl border border-amber-400/20 bg-amber-500/[0.07] p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-amber-100/55">
                Draft conflicts
              </div>
              <div className="mt-2 text-2xl font-semibold text-white">
                {draftConflicts}
              </div>
            </div>
            <div className="rounded-2xl border border-red-400/20 bg-red-500/[0.07] p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-red-100/55">
                Published conflicts
              </div>
              <div className="mt-2 text-2xl font-semibold text-white">
                {publishedConflicts}
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-3">
            {notices.slice(0, 8).map((notice) => {
              const status = statusCopy(notice.status);
              return (
                <div
                  key={notice.id}
                  className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="font-semibold text-white">
                      {notice.teamName}
                    </div>
                    <div className="mt-1 text-xs leading-5 text-white/50">
                      {formatWeekLabel(notice.weekStart)}
                      {notice.leagueName ? ` · ${notice.leagueName}` : ""}
                      {notice.divisionName ? ` · ${notice.divisionName}` : ""}
                      {notice.note ? ` · ${notice.note}` : ""}
                    </div>
                  </div>
                  <span
                    className={`inline-flex shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${status.classes}`}
                  >
                    {status.label}
                  </span>
                </div>
              );
            })}
          </div>

          {notices.length > 8 ? (
            <p className="mt-4 text-sm text-white/50">
              Plus {notices.length - 8} more notice{notices.length - 8 === 1 ? "" : "s"}. Open the full list before generating.
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
