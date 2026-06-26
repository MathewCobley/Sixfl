// ========================================
// File: src/app/(admin)/admin/referee-availability/page.tsx
// ========================================

import Link from "next/link";

import {
  formatAvailabilityDate,
  getAdminRefereeAvailabilityMonth,
  getAdjacentMonthKey,
  normaliseMonthKey,
  type RefereeAvailabilityStatus,
} from "@/lib/referee-availability";
import { requireAdmin } from "@/lib/requireAdmin";
import { sendRefereeAvailabilityRequestsAction } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  searchParams?: Promise<{
    month?: string;
    sent?: string;
    already?: string;
    skipped?: string;
  }>;
};

function statusClasses(status: RefereeAvailabilityStatus) {
  switch (status) {
    case "AVAILABLE":
      return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
    case "MAYBE":
      return "border-amber-400/25 bg-amber-500/10 text-amber-100";
    case "UNAVAILABLE":
      return "border-red-400/25 bg-red-500/10 text-red-100";
    default:
      return "border-white/10 bg-white/[0.04] text-white/55";
  }
}

function statusLabel(status: RefereeAvailabilityStatus) {
  if (status === "NO_RESPONSE") return "No response";
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function groupByReferee<T extends { refereeId: string; refereeName: string | null; refereeEmail: string | null }>(rows: T[]) {
  const groups = new Map<string, { refereeName: string | null; refereeEmail: string | null; rows: T[] }>();

  for (const row of rows) {
    const group = groups.get(row.refereeId) ?? {
      refereeName: row.refereeName,
      refereeEmail: row.refereeEmail,
      rows: [],
    };

    group.rows.push(row);
    groups.set(row.refereeId, group);
  }

  return Array.from(groups.entries());
}

export default async function AdminRefereeAvailabilityPage({ searchParams }: PageProps) {
  await requireAdmin();

  const sp = (await searchParams) ?? {};
  const monthKey = normaliseMonthKey(sp.month);
  const previousMonth = getAdjacentMonthKey(monthKey, -1);
  const nextMonth = getAdjacentMonthKey(monthKey, 1);
  const data = await getAdminRefereeAvailabilityMonth(monthKey);
  const grouped = groupByReferee(data.rows);
  const availableCount = data.rows.filter((row) => row.status === "AVAILABLE").length;
  const maybeCount = data.rows.filter((row) => row.status === "MAYBE").length;
  const unavailableCount = data.rows.filter((row) => row.status === "UNAVAILABLE").length;
  const noResponseCount = data.rows.filter((row) => row.status === "NO_RESPONSE").length;

  return (
    <div className="space-y-8 pb-10">
      <section className="overflow-hidden rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
        <div className="grid gap-8 px-6 py-6 lg:grid-cols-[1.15fr_0.85fr] lg:px-8 lg:py-8">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
              Referee availability
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              {data.monthLabel}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/70 sm:text-base">
              Review referee availability for the league nights that actually run this month. The monthly email job asks referees on the 20th for the coming month.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link href={`/admin/referee-availability?month=${previousMonth}`} className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-5 py-3 text-sm font-medium text-white/80 transition hover:border-white/20 hover:bg-white/5 hover:text-white">
                Previous month
              </Link>
              <Link href={`/admin/referee-availability?month=${nextMonth}`} className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-500/15 px-5 py-3 text-sm font-medium text-emerald-50 transition hover:bg-emerald-500/20">
                Next month
              </Link>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/70">Available</p><p className="mt-3 text-3xl font-semibold text-white">{availableCount}</p></div>
            <div className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-5"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/70">Maybe</p><p className="mt-3 text-3xl font-semibold text-white">{maybeCount}</p></div>
            <div className="rounded-3xl border border-red-400/20 bg-red-500/10 p-5"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-100/70">Unavailable</p><p className="mt-3 text-3xl font-semibold text-white">{unavailableCount}</p></div>
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">No response</p><p className="mt-3 text-3xl font-semibold text-white">{noResponseCount}</p></div>
          </div>
        </div>
      </section>

      {sp.sent || sp.already || sp.skipped ? (
        <section className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          Availability requests queued: {Number(sp.sent ?? 0)} · already sent/queued: {Number(sp.already ?? 0)} · skipped: {Number(sp.skipped ?? 0)}.
        </section>
      ) : null}

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
              Monthly request
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">Send availability email</h2>
            <p className="mt-1 text-sm leading-6 text-white/55">
              The cron job is designed to run on the 20th. This manual button lets you test or resend for the selected month.
            </p>
          </div>
          <form action={sendRefereeAvailabilityRequestsAction} className="flex flex-wrap gap-3">
            <input type="hidden" name="month" value={monthKey} />
            <button type="submit" className="inline-flex items-center rounded-2xl border border-emerald-400/30 bg-emerald-500/15 px-5 py-3 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-500/20">
              Send requests
            </button>
            <button type="submit" name="force" value="yes" className="inline-flex items-center rounded-2xl border border-amber-400/25 bg-amber-500/10 px-5 py-3 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/15">
              Force resend
            </button>
          </form>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.04]">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Responses</p>
            <h2 className="mt-2 text-xl font-semibold text-white">Referee availability grid</h2>
          </div>
          <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-medium text-white/55">
            {grouped.length} referee{grouped.length === 1 ? "" : "s"}
          </div>
        </div>

        {grouped.length === 0 ? (
          <div className="px-6 py-10 text-sm text-white/55">No referee availability rows are available yet.</div>
        ) : (
          <div className="space-y-5 p-5">
            {grouped.map(([refereeId, group]) => (
              <article key={refereeId} className="overflow-hidden rounded-3xl border border-white/10 bg-black/20">
                <div className="border-b border-white/10 px-5 py-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-white">{group.refereeName || group.refereeEmail || "Unnamed referee"}</h3>
                      <p className="mt-1 text-sm text-white/45">{group.refereeEmail || "No email"}</p>
                    </div>
                    <Link href={`/admin/referees/${refereeId}/preview`} className="inline-flex items-center rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white/75 transition hover:bg-white/[0.08]">
                      Preview referee
                    </Link>
                  </div>
                </div>

                <div className="grid gap-2 p-4 md:grid-cols-2 xl:grid-cols-3">
                  {group.rows.map((row) => (
                    <div key={`${row.leagueId}-${row.date}`} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusClasses(row.status)}`}>
                          {statusLabel(row.status)}
                        </span>
                        <span className="text-xs text-white/45">{formatAvailabilityDate(row.date)}</span>
                      </div>
                      <div className="mt-3 text-sm font-semibold text-white">{row.leagueName}{row.leagueSeason ? ` · ${row.leagueSeason}` : ""}</div>
                      <div className="mt-1 text-xs text-white/45">{row.venueName || "Venue TBC"}</div>
                      {row.note ? <div className="mt-2 text-xs text-white/55">Note: {row.note}</div> : null}
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
