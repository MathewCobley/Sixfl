// ========================================
// File: src/app/(admin)/admin/night-board/NightBoardFilters.tsx
// ========================================

"use client";

import { useMemo, useRef, useState } from "react";

type Option = {
  value: string;
  label: string;
  description?: string;
};

type NightBoardFiltersProps = {
  dateOptions: Option[];
  leagueOptions: Option[];
  venueOptions: Option[];
  selectedDate: string;
  selectedLeagueId: string;
  selectedVenueId: string;
  refFee: string;
  pitchHire: string;
  nightPitchCount: string;
  nightStartTime: string;
  nightEndTime: string;
  nightPitchTotalCost?: string;
  nightPitchCostPerHour?: string;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function CustomSelect({
  name,
  label,
  options,
  value,
  onChange,
}: {
  name: string;
  label: string;
  options: Option[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const selected = useMemo(
    () => options.find((option) => option.value === value) ?? options[0],
    [options, value],
  );

  return (
    <div className="relative" ref={wrapperRef}>
      <input type="hidden" name={name} value={value} />
      <div className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-white/35">
        {label}
      </div>
      <button
        type="button"
        onBlur={(event) => {
          if (!wrapperRef.current?.contains(event.relatedTarget as Node | null)) {
            setOpen(false);
          }
        }}
        onClick={() => setOpen((current) => !current)}
        className={cx(
          "flex h-12 w-full items-center justify-between gap-3 rounded-2xl border bg-black/35 px-4 text-left text-sm text-white outline-none transition",
          open ? "border-emerald-400/45 ring-2 ring-emerald-400/20" : "border-white/10 hover:border-white/20",
        )}
      >
        <span className="min-w-0">
          <span className="block truncate font-semibold">{selected?.label ?? "Select"}</span>
          {selected?.description ? (
            <span className="block truncate text-[11px] font-normal text-white/40">
              {selected.description}
            </span>
          ) : null}
        </span>
        <span className={cx("text-white/35 transition", open && "rotate-180")}>⌄</span>
      </button>

      {open ? (
        <div className="absolute z-50 mt-2 max-h-80 w-full overflow-y-auto rounded-2xl border border-white/10 bg-zinc-950 p-2 shadow-2xl shadow-black/60">
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={`${name}-${option.value || "all"}`}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={cx(
                  "w-full rounded-xl px-3 py-3 text-left text-sm transition",
                  isSelected
                    ? "bg-emerald-400 text-black"
                    : "text-white/75 hover:bg-white/[0.06] hover:text-white",
                )}
              >
                <span className="block font-semibold">{option.label}</span>
                {option.description ? (
                  <span className={cx("mt-0.5 block text-xs", isSelected ? "text-black/65" : "text-white/40")}>
                    {option.description}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function MoneyInput({
  label,
  name,
  defaultValue,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue: string;
  placeholder: string;
}) {
  return (
    <label className="space-y-1 text-xs font-semibold uppercase tracking-[0.16em] text-white/35">
      {label}
      <input
        name={name}
        inputMode="decimal"
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="mt-1 h-12 w-full rounded-2xl border border-white/10 bg-black/35 px-4 text-sm normal-case tracking-normal text-white outline-none placeholder:text-white/25 focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
      />
    </label>
  );
}

export default function NightBoardFilters({
  dateOptions,
  leagueOptions,
  venueOptions,
  selectedDate,
  selectedLeagueId,
  selectedVenueId,
  refFee,
  pitchHire,
  nightPitchCount,
  nightStartTime,
  nightEndTime,
  nightPitchTotalCost,
  nightPitchCostPerHour,
}: NightBoardFiltersProps) {
  const [date, setDate] = useState(selectedDate);
  const [leagueId, setLeagueId] = useState(selectedLeagueId);
  const [venueId, setVenueId] = useState(selectedVenueId);
  const totalPitchCostValue = nightPitchTotalCost ?? nightPitchCostPerHour ?? pitchHire ?? "";

  return (
    <form className="mt-6 space-y-4" action="/admin/night-board">
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
        <CustomSelect name="date" label="Fixture night" options={dateOptions} value={date} onChange={setDate} />
        <CustomSelect name="leagueId" label="League" options={leagueOptions} value={leagueId} onChange={setLeagueId} />
        <CustomSelect name="venueId" label="Venue" options={venueOptions} value={venueId} onChange={setVenueId} />
        <MoneyInput label="Ref fee / match" name="refFee" defaultValue={refFee} placeholder="e.g. 15" />
        <MoneyInput label="Pitch hire total" name="pitchHire" defaultValue={pitchHire} placeholder="manual total" />
      </div>

      <div className="rounded-2xl border border-amber-400/15 bg-amber-500/[0.05] p-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/70">
              One-night pitch cost override
            </div>
            <p className="mt-1 text-xs leading-5 text-white/45">
              Use this when a night has a different final pitch hire cost. These details are saved against this fixture night.
            </p>
          </div>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <label className="space-y-1 text-xs font-semibold uppercase tracking-[0.16em] text-white/35">
            Pitches tonight
            <input
              name="nightPitchCount"
              type="number"
              min="0"
              step="1"
              defaultValue={nightPitchCount}
              placeholder="e.g. 1"
              className="mt-1 h-12 w-full rounded-2xl border border-white/10 bg-black/35 px-4 text-sm normal-case tracking-normal text-white outline-none placeholder:text-white/25 focus:border-amber-400/40 focus:ring-2 focus:ring-amber-400/20"
            />
          </label>
          <label className="space-y-1 text-xs font-semibold uppercase tracking-[0.16em] text-white/35">
            Start time
            <input
              name="nightStartTime"
              type="time"
              defaultValue={nightStartTime}
              className="mt-1 h-12 w-full rounded-2xl border border-white/10 bg-black/35 px-4 text-sm normal-case tracking-normal text-white outline-none placeholder:text-white/25 focus:border-amber-400/40 focus:ring-2 focus:ring-amber-400/20"
            />
          </label>
          <label className="space-y-1 text-xs font-semibold uppercase tracking-[0.16em] text-white/35">
            End time
            <input
              name="nightEndTime"
              type="time"
              defaultValue={nightEndTime}
              className="mt-1 h-12 w-full rounded-2xl border border-white/10 bg-black/35 px-4 text-sm normal-case tracking-normal text-white outline-none placeholder:text-white/25 focus:border-amber-400/40 focus:ring-2 focus:ring-amber-400/20"
            />
          </label>
          <MoneyInput label="Total pitch cost" name="nightPitchTotalCost" defaultValue={totalPitchCostValue} placeholder="e.g. 120" />
        </div>
      </div>

      <button className="h-12 w-full rounded-2xl bg-emerald-400 px-5 text-sm font-semibold text-black transition hover:bg-emerald-300">
        Update board
      </button>
    </form>
  );
}
