// ========================================
// File: src/app/(admin)/admin/team-unavailability/page.tsx
// ========================================

import Link from "next/link";

import AdminCard from "@/components/admin/AdminCard";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  addWeeks,
  formatWeekLabel,
  getCurrentWeekStart,
} from "@/lib/team-week-unavailability";
import { getTeamWeekUnavailabilityOverview } from "@/lib/team-week-unavailability-overview";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatFixtureDate(value: Date) {
  return formatDateTimeInLondon(value, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusCopy(status: "CLEAR" | "DRAFT_CONFLICT" | "PUBLISHED_CONFLICT") {
  switch (status) {
    case "PUBLISHED_CONFLICT":
      return {
        label: "Published fixture conflict",
        classes: "border-red-400/30 bg-red-500/12 text-red-100",
      };
    case "DRAFT_CONFLICT":
      return {
        label: "Draft fixture conflict",
        classes: "border-amber-400/30 bg-amber-500/12 text-amber-100",
      };
    default:
      return {
        label: "Advance week off recorded",
        classes: "border-emerald-400/25 bg-emerald-500/10 text-emerald-100",
      };
  }
}

export default async function AdminTeamUnavailabilityPage() {
  await requireAdmin();

  // This planning list starts next Monday so completed/current weeks disappear.
  const from = addWeeks(getCurrentWeekStart(), 1);
  const to = addWeeks(from, 20);
  const notices = await getTeamWeekUnavailabilityOverview({ from, to });

  const publishedConflicts = notices.filter(
    (notice) => notice.status === "PUBLISHED_CONFLICT",
  ).length;
  const draftConflicts = notices.filter(
    (notice) => notice.status === "DRAFT_CONFLICT",
  ).length;

  const noticesByWeek = new Map<string, typeof notices>();
  for (const notice of notices) {
    const key = notice.weekStart.toISOString().slice(0, 10);
    const existing = noticesByWeek.get(key) ?? [];
    existing.push(notice);
    noticesByWeek.set(key, existing);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 pb-12 pt-6 sm:px-6 lg:px-8">
      <div className="rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_36%),rgba(255,255,255,0.03)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.34)] md:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-200">
              Fixture planning
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white md:text-4xl">
              Advance team unavailability
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60 md:text-base">
              Captains only report exceptions. Teams not shown here are assumed available. Check this page before generating or publishing fixtures.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin/fixtures/generate"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15"
            >
              Open fixture generator
            </Link>
            <Link
              href="/admin/fixtures"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-4 text-sm font-semibold text-white/80 transition hover:bg-white/[0.08]"
            >
              Back to fixtures
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <AdminCard className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
          <div className="text-xs uppercase tracking-[0.16em] text-white/35">Future notices</div>
          <div className="mt-2 text-3xl font-semibold text-white">{notices.length}</div>
          <div className="mt-1 text-sm text-white/45">Next 20 weeks</div>
        </AdminCard>
        <AdminCard className="rounded-3xl border border-amber-400/20 bg-amber-500/[0.07] p-5">
          <div className="text-xs uppercase tracking-[0.16em] text-amber-100/55">Draft conflicts</div>
          <div className="mt-2 text-3xl font-semibold text-white">{draftConflicts}</div>
          <div className="mt-1 text-sm text-amber-100/60">Fix before publishing</div>
        </AdminCard>
        <AdminCard className="rounded-3xl border border-red-400/20 bg-red-500/[0.07] p-5">
          <div className="text-xs uppercase tracking-[0.16em] text-red-100/55">Published conflicts</div>
          <div className="mt-2 text-3xl font-semibold text-white">{publishedConflicts}</div>
          <div className="mt-1 text-sm text-red-100/60">Needs direct contact</div>
        </AdminCard>
      </div>

      {notices.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-white/10 bg-black/20 p-12 text-center">
          <h2 className="text-xl font-semibold text-white">No advance unavailability reported</h2>
          <p className="mt-2 text-sm leading-6 text-white/55">
            All teams are currently assumed available for the next 20 weeks.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Array.from(noticesByWeek.entries()).map(([key, weekNotices]) => {
            const weekStart = weekNotices[0].weekStart;
            return (
              <section key={key} className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 md:p-6">
                <div className="flex flex-col gap-2 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/35">
                      Week commencing {key.split("-").reverse().join("/")}
                    </p>
                    <h2 className="mt-2 text-xl font-semibold text-white">{formatWeekLabel(weekStart)}</h2>
                  </div>
                  <div className="text-sm text-white/45">
                    {weekNotices.length} team{weekNotices.length === 1 ? "" : "s"} unavailable
                  </div>
                </div>

                <div className="mt-4 grid gap-4">
                  {weekNotices.map((notice) => {
                    const status = statusCopy(notice.status);
                    return (
                      <article key={notice.id} className="rounded-2xl border border-white/10 bg-black/20 p-4 md:p-5">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-lg font-semibold text-white">{notice.teamName}</h3>
                              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${status.classes}`}>
                                {status.label}
                              </span>
                            </div>
                            <p className="mt-2 text-sm text-white/55">
                              {notice.leagueName ?? "League not recorded"}
                              {notice.leagueSeason ? ` · ${notice.leagueSeason}` : ""}
                              {notice.divisionName ? ` · ${notice.divisionName}` : ""}
                            </p>
                            {notice.note ? (
                              <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm leading-6 text-white/70">
                                {notice.note}
                              </div>
                            ) : null}
                            <p className="mt-3 text-xs text-white/35">
                              Last updated {formatFixtureDate(notice.updatedAt)}
                              {notice.submittedByName || notice.submittedByEmail
                                ? ` · by ${notice.submittedByName ?? notice.submittedByEmail}`
                                : ""}
                            </p>
                          </div>

                          {notice.fixtures.length > 0 ? (
                            <div className="min-w-0 space-y-2 lg:max-w-md">
                              {notice.fixtures.map((fixture) => (
                                <Link
                                  key={fixture.id}
                                  href={`/admin/fixtures/${fixture.id}/edit`}
                                  className={`block rounded-xl border px-3 py-2 text-sm transition hover:bg-white/[0.06] ${
                                    fixture.publishedAt
                                      ? "border-red-400/25 bg-red-500/10 text-red-100"
                                      : "border-amber-400/25 bg-amber-500/10 text-amber-100"
                                  }`}
                                >
                                  <span className="font-semibold">
                                    {fixture.homeTeamName} vs {fixture.awayTeamName}
                                  </span>
                                  <span className="mt-1 block text-xs opacity-70">
                                    {formatFixtureDate(fixture.kickoffAt)} · {fixture.publishedAt ? "published" : "draft"}
                                  </span>
                                </Link>
                              ))}
                            </div>
                          ) : (
                            <div className="text-sm text-emerald-100/65 lg:text-right">
                              No scheduled fixture currently conflicts with this notice.
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
