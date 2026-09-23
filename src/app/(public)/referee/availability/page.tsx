import Link from "next/link";
import { redirect } from "next/navigation";

import RefereeAppShell from "@/components/referee/RefereeAppShell";
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
      return "peer-checked:border-emerald-400/45 peer-checked:bg-emerald-500/20 peer-checked:text-emerald-100";
    case "MAYBE":
      return "peer-checked:border-amber-400/45 peer-checked:bg-amber-500/20 peer-checked:text-amber-100";
    case "UNAVAILABLE":
      return "peer-checked:border-red-400/45 peer-checked:bg-red-500/20 peer-checked:text-red-100";
    default:
      return "peer-checked:border-white/25 peer-checked:bg-white/[0.1] peer-checked:text-white";
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
  const { user, authenticatedUser, isAdminPreview } = await requireReferee();

  if (authenticatedUser.role === "ADMIN" && !isAdminPreview) {
    redirect("/admin/referees?error=select_referee_preview");
  }

  const sp = (await searchParams) ?? {};
  const monthKey = normaliseMonthKey(sp.month);
  const previousMonth = getAdjacentMonthKey(monthKey, -1);
  const nextMonth = getAdjacentMonthKey(monthKey, 1);
  const data = await getRefereeAvailabilityMonth({ refereeId: user.id, monthKey });
  const groupedSlots = groupSlotsByLeague(data.slots);
  const counts = {
    available: data.slots.filter((slot) => slot.status === "AVAILABLE").length,
    maybe: data.slots.filter((slot) => slot.status === "MAYBE").length,
    unavailable: data.slots.filter((slot) => slot.status === "UNAVAILABLE").length,
    noResponse: data.slots.filter((slot) => slot.status === "NO_RESPONSE").length,
  };

  return (
    <RefereeAppShell active="availability" title="Availability">
      {isAdminPreview ? (
        <details className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-xs text-amber-100">
          <summary className="cursor-pointer font-bold">Admin preview · {user.name || user.email || "referee"}</summary>
          <Link
            href={`/admin/referees/${user.id}/referee-preview/exit?to=${encodeURIComponent(`/admin/referees/${user.id}`)}`}
            className="mt-2 inline-flex min-h-11 items-center underline"
          >
            Switch back to admin
          </Link>
        </details>
      ) : null}

      <section className="rounded-[1.35rem] border border-emerald-400/20 bg-emerald-500/[0.07] p-3.5">
        <div className="flex items-center justify-between gap-3">
          <Link
            href={`/referee/availability?month=${previousMonth}`}
            aria-label="Previous month"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-black/20 text-lg text-white/70"
          >
            ‹
          </Link>
          <div className="min-w-0 text-center">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300/75">Your availability</p>
            <h1 className="mt-0.5 truncate text-lg font-black text-white">{data.monthLabel}</h1>
          </div>
          <Link
            href={`/referee/availability?month=${nextMonth}`}
            aria-label="Next month"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-500/10 text-lg text-emerald-100"
          >
            ›
          </Link>
        </div>

        <div className="mt-3 grid grid-cols-4 gap-1.5 text-center">
          {[
            ["Available", counts.available, "text-emerald-200"],
            ["Maybe", counts.maybe, "text-amber-200"],
            ["No", counts.unavailable, "text-red-200"],
            ["Unset", counts.noResponse, "text-white/65"],
          ].map(([label, value, tone]) => (
            <div key={String(label)} className="rounded-xl border border-white/[0.07] bg-black/20 px-1 py-2">
              <div className={`text-base font-black tabular-nums ${tone}`}>{value}</div>
              <div className="mt-0.5 text-[9px] text-white/40">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {sp.saved ? (
        <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2.5 text-sm font-semibold text-emerald-100">
          Availability saved.
        </div>
      ) : null}

      <form action={saveRefereeAvailabilityAction} className="space-y-3">
        <input type="hidden" name="month" value={monthKey} />

        {data.slots.length === 0 ? (
          <div className="rounded-[1.2rem] border border-dashed border-white/10 bg-white/[0.03] p-4 text-sm text-white/55">
            No league dates are available this month.
          </div>
        ) : (
          groupedSlots.map(([leagueLabel, slots]) => (
            <section key={leagueLabel} className="overflow-hidden rounded-[1.25rem] border border-white/10 bg-white/[0.03]">
              <div className="border-b border-white/[0.07] px-3.5 py-3">
                <h2 className="text-sm font-black text-white">{leagueLabel}</h2>
                <p className="mt-0.5 text-xs text-white/45">
                  {slots[0]?.venueName || "Venue TBC"}
                </p>
              </div>

              <div className="divide-y divide-white/[0.07]">
                {slots.map((slot, index) => {
                  const rowIndex = `${slot.leagueId}_${slot.date}_${index}`.replace(/[^a-zA-Z0-9_-]/g, "_");
                  return (
                    <div key={`${slot.leagueId}-${slot.date}`} className="p-3.5">
                      <input type="hidden" name="rowIndex" value={rowIndex} />
                      <input type="hidden" name={`leagueId_${rowIndex}`} value={slot.leagueId} />
                      <input type="hidden" name={`date_${rowIndex}`} value={slot.date} />

                      <div className="font-bold text-white">{formatAvailabilityDate(slot.date)}</div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        {STATUS_OPTIONS.map((option) => (
                          <label key={option.value} className="cursor-pointer">
                            <input
                              type="radio"
                              name={`status_${rowIndex}`}
                              value={option.value}
                              defaultChecked={slot.status === option.value}
                              className="peer sr-only"
                            />
                            <span className={`flex min-h-11 items-center justify-center rounded-xl border border-white/10 bg-black/20 px-2 text-xs font-bold text-white/55 ${peerCheckedClasses(option.value)}`}>
                              {option.label}
                            </span>
                          </label>
                        ))}
                      </div>

                      <input
                        name={`note_${rowIndex}`}
                        type="text"
                        defaultValue={slot.note ?? ""}
                        placeholder="Optional note, e.g. after 7pm"
                        className="mt-2.5 h-11 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-emerald-400/50"
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
            className="min-h-12 w-full rounded-xl bg-emerald-400 px-5 text-sm font-black text-[#04130c] active:bg-emerald-300"
          >
            Save availability
          </button>
        ) : null}
      </form>
    </RefereeAppShell>
  );
}
