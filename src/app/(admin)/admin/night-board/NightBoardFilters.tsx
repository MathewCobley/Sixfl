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

export default function NightBoardFilters({
  dateOptions,
  leagueOptions,
  venueOptions,
  selectedDate,
  selectedLeagueId,
  selectedVenueId,
  refFee,
  pitchHire,
}: NightBoardFiltersProps) {
  const [date, setDate] = useState(selectedDate);
  const [leagueId, setLeagueId] = useState(selectedLeagueId);
  const [venueId, setVenueId] = useState(selectedVenueId);

  return (
    <form className="mt-6 grid gap-3 md:grid-cols-3 xl:grid-cols-5" action="/admin/night-board">
      <CustomSelect
        name="date"
        label="Fixture night"
        options={dateOptions}
        value={date}
        onChange={setDate}
      />
      <CustomSelect
        name="leagueId"
        label="League"
        options={leagueOptions}
        value={leagueId}
        onChange={setLeagueId}
      />
      <CustomSelect
        name="venueId"
        label="Venue"
        options={venueOptions}
        value={venueId}
        onChange={setVenueId}
      />
      <label className="space-y-1 text-xs font-semibold uppercase tracking-[0.16em] text-white/35">
        Ref fee / match
        <input
          name="refFee"
          inputMode="decimal"
          defaultValue={refFee}
          placeholder="e.g. 15"
          className="mt-1 h-12 w-full rounded-2xl border border-white/10 bg-black/35 px-4 text-sm normal-case tracking-normal text-white outline-none placeholder:text-white/25 focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
        />
      </label>
      <label className="space-y-1 text-xs font-semibold uppercase tracking-[0.16em] text-white/35">
        Pitch hire total
        <input
          name="pitchHire"
          inputMode="decimal"
          defaultValue={pitchHire}
          placeholder="e.g. 120"
          className="mt-1 h-12 w-full rounded-2xl border border-white/10 bg-black/35 px-4 text-sm normal-case tracking-normal text-white outline-none placeholder:text-white/25 focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
        />
      </label>
      <button className="h-12 rounded-2xl bg-emerald-400 px-5 text-sm font-semibold text-black transition hover:bg-emerald-300 md:col-span-3 xl:col-span-5">
        Update board
      </button>
    </form>
  );
}
