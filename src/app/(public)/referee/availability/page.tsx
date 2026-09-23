import Link from "next/link";
import { redirect } from "next/navigation";

import RefereeAppShell from "@/components/referee/RefereeAppShell";
import RefereeAvailabilityControls from "@/components/referee/RefereeAvailabilityControls";
import { requireReferee } from "@/lib/admin";
import {
  formatAvailabilityDate,
  getAdjacentMonthKey,
  getRefereeAvailabilityMonth,
  normaliseMonthKey,
  type RefereeAvailabilitySlot,
} from "@/lib/referee-availability";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  searchParams?: Promise<{ month?: string }>;
};

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

      <div className="space-y-3">
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
                {slots.map((slot) => (

                    <div key={`${slot.leagueId}-${slot.date}`} className="p-3.5">
                      <div className="font-bold text-white">{formatAvailabilityDate(slot.date)}</div>
                      <RefereeAvailabilityControls
                        month={monthKey}
                        leagueId={slot.leagueId}
                        date={slot.date}
                        initialStatus={slot.status}
                        initialNote={slot.note}
                      />
                    </div>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </RefereeAppShell>
  );
}
