"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";

import { updateRefereeAvailabilitySlotAction } from "@/app/(public)/referee/availability/actions";

type AvailabilityStatus = "AVAILABLE" | "MAYBE" | "UNAVAILABLE" | "NO_RESPONSE";

export type RefereeAvailabilityCalendarSlot = {
  id: string | null;
  leagueId: string;
  leagueName: string;
  leagueSeason: string | null;
  venueName: string | null;
  date: string;
  status: AvailabilityStatus;
  note: string | null;
};

const WEEKDAYS = [
  { short: "M", long: "Monday" },
  { short: "T", long: "Tuesday" },
  { short: "W", long: "Wednesday" },
  { short: "T", long: "Thursday" },
  { short: "F", long: "Friday" },
  { short: "S", long: "Saturday" },
  { short: "S", long: "Sunday" },
];

const STATUS_OPTIONS: Array<{ value: AvailabilityStatus; label: string }> = [
  { value: "AVAILABLE", label: "Available" },
  { value: "MAYBE", label: "Maybe" },
  { value: "UNAVAILABLE", label: "Unavailable" },
  { value: "NO_RESPONSE", label: "Unset" },
];

function dateKey(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function statusDot(status: AvailabilityStatus) {
  if (status === "AVAILABLE") return "bg-emerald-300";
  if (status === "MAYBE") return "bg-amber-300";
  if (status === "UNAVAILABLE") return "bg-red-300";
  return "bg-white/25";
}

function selectedStatusClasses(status: AvailabilityStatus) {
  if (status === "AVAILABLE") {
    return "border-emerald-400/55 bg-emerald-500/20 text-emerald-100";
  }
  if (status === "MAYBE") {
    return "border-amber-400/55 bg-amber-500/20 text-amber-100";
  }
  if (status === "UNAVAILABLE") {
    return "border-red-400/55 bg-red-500/20 text-red-100";
  }
  return "border-white/30 bg-white/[0.1] text-white";
}

function calendarDateClasses(statuses: AvailabilityStatus[], selected: boolean) {
  const unique = Array.from(new Set(statuses));

  if (selected) {
    return "border-emerald-300/70 bg-emerald-500/15 text-white ring-1 ring-emerald-300/25";
  }
  if (unique.length > 1) {
    return "border-sky-400/25 bg-sky-500/[0.07] text-white";
  }
  if (unique[0] === "AVAILABLE") {
    return "border-emerald-400/30 bg-emerald-500/12 text-emerald-50";
  }
  if (unique[0] === "MAYBE") {
    return "border-amber-400/30 bg-amber-500/12 text-amber-50";
  }
  if (unique[0] === "UNAVAILABLE") {
    return "border-red-400/30 bg-red-500/10 text-red-50";
  }
  return "border-emerald-400/15 bg-white/[0.025] text-white/80";
}

function formatSelectedDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function leagueLabel(slot: RefereeAvailabilityCalendarSlot) {
  return `${slot.leagueName}${slot.leagueSeason ? ` · ${slot.leagueSeason}` : ""}`;
}

function SlotEditor({
  month,
  slot,
  onSaved,
}: {
  month: string;
  slot: RefereeAvailabilityCalendarSlot;
  onSaved: (slot: RefereeAvailabilityCalendarSlot) => void;
}) {
  const [status, setStatus] = useState<AvailabilityStatus>(slot.status);
  const [note, setNote] = useState(slot.note ?? "");
  const [savedNote, setSavedNote] = useState(slot.note ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setStatus(slot.status);
    setNote(slot.note ?? "");
    setSavedNote(slot.note ?? "");
    setMessage(null);
  }, [slot.leagueId, slot.date, slot.status, slot.note]);

  function persist(nextStatus: AvailabilityStatus, nextNote: string) {
    const previousStatus = status;
    setStatus(nextStatus);
    setMessage(null);

    startTransition(async () => {
      try {
        await updateRefereeAvailabilitySlotAction({
          month,
          leagueId: slot.leagueId,
          date: slot.date,
          status: nextStatus,
          note: nextNote,
        });

        const normalisedNote = nextNote.trim() || null;
        setSavedNote(nextNote);
        setMessage("Saved");
        onSaved({
          ...slot,
          status: nextStatus,
          note: normalisedNote,
        });
      } catch {
        setStatus(previousStatus);
        setMessage("Could not save");
      }
    });
  }

  function saveNoteIfChanged() {
    if (note === savedNote) return;
    persist(status, note);
  }

  return (
    <div className="rounded-[1.15rem] border border-white/10 bg-black/20 p-3">
      <div>
        <div className="text-sm font-black text-white">{leagueLabel(slot)}</div>
        <div className="mt-0.5 text-xs text-white/40">
          {slot.venueName || "Venue TBC"}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2" aria-label={`Availability for ${leagueLabel(slot)}`}>
        {STATUS_OPTIONS.map((option) => {
          const active = status === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => persist(option.value, note)}
              className={`flex min-h-11 items-center justify-center rounded-xl border px-2 text-xs font-bold transition active:scale-[0.98] ${
                active
                  ? selectedStatusClasses(option.value)
                  : "border-white/10 bg-black/20 text-white/50"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <input
        type="text"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        onBlur={saveNoteIfChanged}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        placeholder="Optional note, e.g. after 7pm"
        className="mt-2.5 h-11 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-emerald-400/50"
      />

      <div className="mt-1 min-h-4 text-right text-[10px] text-white/35" aria-live="polite">
        {isPending ? "Saving…" : message}
      </div>
    </div>
  );
}

export default function RefereeAvailabilityCalendar({
  monthKey,
  monthLabel,
  previousMonth,
  nextMonth,
  todayDate,
  initialSlots,
}: {
  monthKey: string;
  monthLabel: string;
  previousMonth: string;
  nextMonth: string;
  todayDate: string;
  initialSlots: RefereeAvailabilityCalendarSlot[];
}) {
  const [slots, setSlots] = useState(initialSlots);

  const slotsByDate = useMemo(() => {
    const grouped = new Map<string, RefereeAvailabilityCalendarSlot[]>();
    for (const slot of slots) {
      grouped.set(slot.date, [...(grouped.get(slot.date) ?? []), slot]);
    }
    return grouped;
  }, [slots]);

  const initialSelectedDate = useMemo(() => {
    const sorted = Array.from(slotsByDate.keys()).sort();
    return (
      sorted.find(
        (value) =>
          value >= todayDate &&
          (slotsByDate.get(value) ?? []).some((slot) => slot.status === "NO_RESPONSE"),
      ) ??
      sorted.find((value) => value >= todayDate) ??
      sorted[0] ??
      null
    );
  }, [slotsByDate, todayDate]);

  const [selectedDate, setSelectedDate] = useState<string | null>(initialSelectedDate);

  useEffect(() => {
    if (!selectedDate || !slotsByDate.has(selectedDate)) {
      setSelectedDate(initialSelectedDate);
    }
  }, [initialSelectedDate, selectedDate, slotsByDate]);

  const [yearText, monthText] = monthKey.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const daysInMonth = new Date(Date.UTC(year, month, 0, 12)).getUTCDate();
  const firstDay = new Date(Date.UTC(year, month - 1, 1, 12)).getUTCDay();
  const mondayOffset = (firstDay + 6) % 7;

  const calendarCells: Array<number | null> = [
    ...Array.from({ length: mondayOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
  while (calendarCells.length % 7 !== 0) calendarCells.push(null);

  const counts = {
    available: slots.filter((slot) => slot.status === "AVAILABLE").length,
    maybe: slots.filter((slot) => slot.status === "MAYBE").length,
    unavailable: slots.filter((slot) => slot.status === "UNAVAILABLE").length,
    unset: slots.filter((slot) => slot.status === "NO_RESPONSE").length,
  };

  const selectedSlots = selectedDate ? slotsByDate.get(selectedDate) ?? [] : [];

  function updateSavedSlot(next: RefereeAvailabilityCalendarSlot) {
    setSlots((current) =>
      current.map((slot) =>
        slot.leagueId === next.leagueId && slot.date === next.date ? next : slot,
      ),
    );
  }

  return (
    <>
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
            <h1 className="truncate text-lg font-black text-white">{monthLabel}</h1>
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
            ["Unset", counts.unset, "text-white/65"],
          ].map(([label, value, tone]) => (
            <div key={String(label)} className="rounded-xl border border-white/[0.07] bg-black/20 px-1 py-2">
              <div className={`text-base font-black tabular-nums ${tone}`}>{value}</div>
              <div className="mt-0.5 text-[9px] text-white/40">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {slots.length === 0 ? (
        <div className="rounded-[1.2rem] border border-dashed border-white/10 bg-white/[0.03] p-4 text-sm text-white/55">
          No usual referee dates are set for this month.
        </div>
      ) : (
        <>
          <section className="rounded-[1.35rem] border border-white/10 bg-white/[0.03] p-3">
            <div className="grid grid-cols-7 gap-1 text-center">
              {WEEKDAYS.map((weekday, index) => (
                <div
                  key={`${weekday.long}-${index}`}
                  title={weekday.long}
                  className="pb-1 text-[9px] font-bold uppercase text-white/30"
                >
                  {weekday.short}
                </div>
              ))}

              {calendarCells.map((day, index) => {
                if (day === null) {
                  return <div key={`empty-${index}`} className="h-12" aria-hidden="true" />;
                }

                const value = dateKey(year, month, day);
                const dateSlots = slotsByDate.get(value) ?? [];
                const usualNight = dateSlots.length > 0;
                const selected = selectedDate === value;
                const statuses = dateSlots.map((slot) => slot.status);

                if (!usualNight) {
                  return (
                    <div
                      key={value}
                      className="flex h-12 items-center justify-center rounded-xl text-xs font-semibold text-white/18"
                    >
                      {day}
                    </div>
                  );
                }

                return (
                  <button
                    key={value}
                    type="button"
                    aria-label={`${formatSelectedDate(value)}, usual referee night`}
                    aria-pressed={selected}
                    onClick={() => setSelectedDate(value)}
                    className={`relative flex h-12 flex-col items-center justify-center rounded-xl border text-xs font-black transition active:scale-95 ${calendarDateClasses(
                      statuses,
                      selected,
                    )}`}
                  >
                    <span>{day}</span>
                    <span className="mt-1 flex h-1.5 items-center justify-center gap-0.5">
                      {dateSlots.slice(0, 3).map((slot) => (
                        <span
                          key={slot.leagueId}
                          className={`h-1.5 w-1.5 rounded-full ${statusDot(slot.status)}`}
                        />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/[0.07] pt-2 text-[9px] text-white/40">
              <span className="font-semibold text-white/55">Usual nights are highlighted</span>
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> Available
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-300" /> Maybe
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-red-300" /> Unavailable
              </span>
            </div>
          </section>

          {selectedDate && selectedSlots.length > 0 ? (
            <section className="rounded-[1.35rem] border border-white/10 bg-white/[0.03] p-3.5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-300/70">
                    Usual referee night
                  </p>
                  <h2 className="mt-1 text-base font-black text-white">
                    {formatSelectedDate(selectedDate)}
                  </h2>
                </div>
                <span className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] font-semibold text-white/45">
                  {selectedSlots.length} league{selectedSlots.length === 1 ? "" : "s"}
                </span>
              </div>

              <div className="mt-3 space-y-2">
                {selectedSlots.map((slot) => (
                  <SlotEditor
                    key={`${slot.leagueId}-${slot.date}`}
                    month={monthKey}
                    slot={slot}
                    onSaved={updateSavedSlot}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </>
  );
}
