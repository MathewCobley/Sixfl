// ========================================
// File: src/app/(public)/referee/availability/page.tsx
// ========================================

import Link from "next/link";

import RefereeTabs from "@/components/referee/RefereeTabs";
import { requireReferee } from "@/lib/admin";
import {
  formatAvailabilityDate,
  getAdjacentMonthKey,
  getRefereeAvailabilityMonth,
  normaliseMonthKey,
  type RefereeAvailabilitySlot,
  type RefereeAvailabilityStatus,
} from "@/lib/referee-availability";
import { saveRefereeAvailabilityAction } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  searchParams?: Promise<{ month?: string; saved?: string }>;
};

const STATUS_OPTIONS: Array<{ value: RefereeAvailabilityStatus; label: string }> = [
  { value: "AVAILABLE", label: "Available" },
  { value: "MAYBE", label: "Maybe" },
  { value: "UNAVAILABLE", label: "Unavailable" },
  { value: "NO_RESPONSE", label: "No response" },
];

function peerCheckedClasses(status: RefereeAvailabilityStatus) {
  switch (status) {
    case "AVAILABLE":
      return "peer-checked:border-emerald-400/35 peer-checked:bg-emerald-500/15 peer-checked:text-emerald-100";
    case "MAYBE":
      return "peer-checked:border-amber-400/35 peer-checked:bg-amber-500/15 peer-checked:text-amber-100";
    case "UNAVAILABLE":
      return "peer-checked:border-red-400/35 peer-checked:bg-red-500/15 peer-checked:text-red-100";
    default:
      return "peer-checked:border-white/20 peer-checked:bg-white/[0.08] peer-checked:text-white";
  }
}

function getLeagueLabel(slot: RefereeAvailabilitySlot) {
  return `${slot.leagueName}${slot.leagueSeason ? ` · ${slot.leagueSeason}` : ""}`;
}

function groupSlotsByLeague(slots: RefereeAvailabilitySlot[]) {
  const groups = new Map<string, RefereeAvailabilitySlot[]>();

  for (const slot of slots) {
    const key = getLeagueLabel(slot);
    groups.set(key, [...(groups.get(key) ?? []), slot]);
  }

  return Array.from(groups.entries());
}

export default async function RefereeAvailabilityPage({ searchParams }: PageProps) {
  const { user, isAdminPreview } = await requireReferee();
  const sp = (await searchParams) ?? {};
  const monthKey = normaliseMonthKey(sp.month);
  const previousMonth = getAdjacentMonthKey(monthKey, -1);
  const nextMonth = getAdjacentMonthKey(monthKey, 1);
  const data = await getRefereeAvailabilityMonth({ refereeId: user.id, monthKey });
  const groupedSlots = groupSlotsByLeague(data.slots);
  const availableCount = data.slots.filter((slot) => slot.status === "AVAILABLE").length;
  const maybeCount = data.slots.filter((slot) => slot.status === "MAYBE").length;
  const unavailableCount = data.slots.filter((slot) => slot.status === "UNAVAILABLE").length;
  const noResponseCount = data.slots.filter((slot) => slot.status === "NO_RESPONSE").length;

  return (
    <main className="min-h-screen bg-[#07130f] px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        {isAdminPreview ? (
          <section className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-5 text-sm text-amber-100">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-semibold text-white">Referee preview mode</div>
                <p className="mt-1 text-amber-50/80">
                  You are seeing what {user.name || user.email || "this referee"} sees.
                </p>
              </div>
              <Link
                href={`/admin/referees/${user.id}/referee-preview/exit?to=${encodeURIComponent(`/admin/referees/${user.id}`)}`}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-black/20 px-4 text-sm font-semibold text-white transition hover:bg-black/30"
              >
                Switch back to Full Admin View
              </Link>
            </div>
          </section>
        ) : null}

        <RefereeTabs active="availability" />

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
                Mark the dates you can referee. You only see the dates where an active SIXFL league is scheduled to run.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href={`/referee/availability?month=${previousMonth}`}
                  className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-5 py-3 text-sm font-medium text-white/80 transition hover:border-white/20 hover:bg-white/5 hover:text-white"
                >
                  Previous month
                </Link>
                <Link
                  href={`/referee/availability?month=${nextMonth}`}
                  className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-500/15 px-5 py-3 text-sm font-medium text-emerald-50 transition hover:bg-emerald-500/20"
                >
                  Next month
                </Link>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/70">Available</p>
                <p className="mt-3 text-3xl font-semibold text-white">{availableCount}</p>
              </div>
              <div className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/70">Maybe</p>
                <p className="mt-3 text-3xl font-semibold text-white">{maybeCount}</p>
              </div>
              <div className="rounded-3xl border border-red-400/20 bg-red-500/10 p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-100/70">Unavailable</p>
                <p className="mt-3 text-3xl font-semibold text-white">{unavailableCount}</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">No response</p>
                <p className="mt-3 text-3xl font-semibold text-white">{noResponseCount}</p>
              </div>
            </div>
          </div>
        </section>

        {sp.saved ? (
          <section className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
            Availability saved.
          </section>
        ) : null}

        <form action={saveRefereeAvailabilityAction} className="space-y-6">
          <input type="hidden" name="month" value={monthKey} />

          {data.slots.length === 0 ? (
            <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-sm text-white/60">
              There are no active league dates for this month yet.
            </section>
          ) : (
            groupedSlots.map(([leagueLabel, slots]) => (
              <section key={leagueLabel} className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
                <div className="border-b border-white/10 px-6 py-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                    League night
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-white">{leagueLabel}</h2>
                  <p className="mt-1 text-sm text-white/55">
                    {slots[0]?.venueName || "Venue TBC"} · {slots.length} date{slots.length === 1 ? "" : "s"}
                  </p>
                </div>

                <div className="divide-y divide-white/10">
                  {slots.map((slot, index) => {
                    const rowIndex = `${slot.leagueId}_${slot.date}_${index}`.replace(/[^a-zA-Z0-9_-]/g, "_");

                    return (
                      <div key={`${slot.leagueId}-${slot.date}`} className="grid gap-4 px-6 py-5 lg:grid-cols-[220px_260px_minmax(0,1fr)] lg:items-center">
                        <input type="hidden" name="rowIndex" value={rowIndex} />
                        <input type="hidden" name={`leagueId_${rowIndex}`} value={slot.leagueId} />
                        <input type="hidden" name={`date_${rowIndex}`} value={slot.date} />

                        <div>
                          <div className="font-semibold text-white">{formatAvailabilityDate(slot.date)}</div>
                          <div className="mt-1 text-xs text-white/45">{slot.date}</div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
                          {STATUS_OPTIONS.map((option) => (
                            <label key={option.value} className="cursor-pointer">
                              <input
                                type="radio"
                                name={`status_${rowIndex}`}
                                value={option.value}
                                defaultChecked={slot.status === option.value}
                                className="peer sr-only"
                              />
                              <span
                                className={`flex items-center justify-center rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs font-semibold text-white/55 transition hover:bg-white/[0.05] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-emerald-300 ${peerCheckedClasses(option.value)}`}
                              >
                                {option.label}
                              </span>
                            </label>
                          ))}
                        </div>

                        <input
                          name={`note_${rowIndex}`}
                          type="text"
                          defaultValue={slot.note ?? ""}
                          placeholder="Optional note, for example times you can do"
                          className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-emerald-500/60"
                        />
                      </div>
                    );
                  })}
                </div>
              </section>
            ))
          )}

          {data.slots.length > 0 ? (
            <button
              type="submit"
              className="inline-flex items-center rounded-2xl bg-emerald-400 px-6 py-3 text-sm font-semibold text-black transition hover:bg-emerald-300"
            >
              Save availability
            </button>
          ) : null}
        </form>
      </div>
    </main>
  );
}
