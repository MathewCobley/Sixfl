"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { updateRefereeAvailabilitySlotAction } from "@/app/(public)/referee/availability/actions";

type AvailabilityStatus = "AVAILABLE" | "MAYBE" | "UNAVAILABLE" | "NO_RESPONSE";

const OPTIONS: Array<{ value: AvailabilityStatus; label: string }> = [
  { value: "AVAILABLE", label: "Available" },
  { value: "MAYBE", label: "Maybe" },
  { value: "UNAVAILABLE", label: "Unavailable" },
  { value: "NO_RESPONSE", label: "No response" },
];

function selectedClasses(status: AvailabilityStatus) {
  switch (status) {
    case "AVAILABLE":
      return "border-emerald-400/55 bg-emerald-500/20 text-emerald-100";
    case "MAYBE":
      return "border-amber-400/55 bg-amber-500/20 text-amber-100";
    case "UNAVAILABLE":
      return "border-red-400/55 bg-red-500/20 text-red-100";
    default:
      return "border-white/25 bg-white/[0.1] text-white";
  }
}

export default function RefereeAvailabilityControls({
  month,
  leagueId,
  date,
  initialStatus,
  initialNote,
}: {
  month: string;
  leagueId: string;
  date: string;
  initialStatus: AvailabilityStatus;
  initialNote: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<AvailabilityStatus>(initialStatus);
  const [note, setNote] = useState(initialNote ?? "");
  const [savedNote, setSavedNote] = useState(initialNote ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save(nextStatus: AvailabilityStatus, nextNote: string) {
    setMessage(null);
    startTransition(async () => {
      try {
        await updateRefereeAvailabilitySlotAction({
          month,
          leagueId,
          date,
          status: nextStatus,
          note: nextNote,
        });
        setSavedNote(nextNote);
        setMessage("Saved");
        router.refresh();
      } catch {
        setMessage("Could not save");
      }
    });
  }

  function choose(nextStatus: AvailabilityStatus) {
    setStatus(nextStatus);
    save(nextStatus, note);
  }

  function saveNoteIfChanged() {
    if (note === savedNote) return;
    save(status, note);
  }

  return (
    <>
      <div className="mt-2 grid grid-cols-2 gap-2" aria-label="Availability">
        {OPTIONS.map((option) => {
          const selected = status === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              disabled={isPending && selected}
              onClick={() => choose(option.value)}
              className={`flex min-h-11 items-center justify-center rounded-xl border px-2 text-xs font-bold transition active:scale-[0.98] ${
                selected
                  ? selectedClasses(option.value)
                  : "border-white/10 bg-black/20 text-white/55"
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
    </>
  );
}
