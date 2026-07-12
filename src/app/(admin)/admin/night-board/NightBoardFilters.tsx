// ========================================
// File: src/app/(admin)/admin/night-board/NightBoardFilters.tsx
// ========================================

"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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

type SavedOverride = {
  nightPitchCount: string;
  nightStartTime: string;
  nightEndTime: string;
  nightPitchTotalCost: string;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function hasAnyOverrideValue(input: {
  pitchHire: string;
  nightPitchCount: string;
  nightStartTime: string;
  nightEndTime: string;
  nightPitchTotalCost?: string;
  nightPitchCostPerHour?: string;
}) {
  return Boolean(
    input.pitchHire.trim() ||
      input.nightPitchCount.trim() ||
      input.nightStartTime.trim() ||
      input.nightEndTime.trim() ||
      input.nightPitchTotalCost?.trim() ||
      input.nightPitchCostPerHour?.trim(),
  );
}

function CustomSelect({
  name,
  label,
  options,
  value,
  onChange,
}: {
  name?: string;
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
      {name ? <input type="hidden" name={name} value={value} /> : null}
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
                key={`${label}-${option.value || "all"}`}
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
  value,
  placeholder,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  placeholder: string;
  onChange?: (value: string) => void;
}) {
  return (
    <label className="space-y-1 text-xs font-semibold uppercase tracking-[0.16em] text-white/35">
      {label}
      <input
        name={name}
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={placeholder}
        className="mt-1 h-12 w-full rounded-2xl border border-white/10 bg-black/35 px-4 text-sm normal-case tracking-normal text-white outline-none placeholder:text-white/25 focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
      />
    </label>
  );
}

function DateInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="space-y-1 text-xs font-semibold uppercase tracking-[0.16em] text-white/35">
      Board date
      <input
        type="date"
        name="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-12 w-full rounded-2xl border border-white/10 bg-black/35 px-4 text-sm normal-case tracking-normal text-white outline-none focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
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
  const initialTotalPitchCost = nightPitchTotalCost ?? nightPitchCostPerHour ?? pitchHire ?? "";
  const initialHasOverrideValue = hasAnyOverrideValue({
    pitchHire,
    nightPitchCount,
    nightStartTime,
    nightEndTime,
    nightPitchTotalCost,
    nightPitchCostPerHour,
  });

  const [date, setDate] = useState(selectedDate);
  const [leagueId, setLeagueId] = useState(selectedLeagueId);
  const [venueId, setVenueId] = useState(selectedVenueId);
  const [pitchHireValue, setPitchHireValue] = useState(pitchHire);
  const [pitchCountValue, setPitchCountValue] = useState(nightPitchCount);
  const [startTimeValue, setStartTimeValue] = useState(nightStartTime);
  const [endTimeValue, setEndTimeValue] = useState(nightEndTime);
  const [totalPitchCostValue, setTotalPitchCostValue] = useState(initialTotalPitchCost);
  const skipNextSavedLoadRef = useRef(initialHasOverrideValue);

  useEffect(() => {
    setDate(selectedDate);
    setLeagueId(selectedLeagueId);
    setVenueId(selectedVenueId);
    setPitchHireValue(pitchHire);
    setPitchCountValue(nightPitchCount);
    setStartTimeValue(nightStartTime);
    setEndTimeValue(nightEndTime);
    setTotalPitchCostValue(nightPitchTotalCost ?? nightPitchCostPerHour ?? pitchHire ?? "");
    skipNextSavedLoadRef.current = hasAnyOverrideValue({
      pitchHire,
      nightPitchCount,
      nightStartTime,
      nightEndTime,
      nightPitchTotalCost,
      nightPitchCostPerHour,
    });
  }, [
    selectedDate,
    selectedLeagueId,
    selectedVenueId,
    pitchHire,
    nightPitchCount,
    nightStartTime,
    nightEndTime,
    nightPitchTotalCost,
    nightPitchCostPerHour,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function loadSavedOverride() {
      if (!date) return;

      if (skipNextSavedLoadRef.current) {
        skipNextSavedLoadRef.current = false;
        return;
      }

      const params = new URLSearchParams();
      params.set("date", date);
      if (leagueId) params.set("leagueId", leagueId);
      if (venueId) params.set("venueId", venueId);

      try {
        const response = await fetch(`/admin/night-board/override?${params.toString()}`, {
          cache: "no-store",
        });

        if (!response.ok) return;

        const saved = (await response.json()) as SavedOverride;
        if (cancelled) return;

        setPitchCountValue(saved.nightPitchCount);
        setStartTimeValue(saved.nightStartTime);
        setEndTimeValue(saved.nightEndTime);
        setTotalPitchCostValue(saved.nightPitchTotalCost);
        setPitchHireValue(saved.nightPitchTotalCost);
      } catch {
        // Keep the existing form values if the saved override cannot be loaded.
      }
    }

    loadSavedOverride();

    return () => {
      cancelled = true;
    };
  }, [date, leagueId, venueId]);

  const handleDateChange = (value: string) => {
    skipNextSavedLoadRef.current = false;
    setDate(value);
  };

  const handleLeagueChange = (value: string) => {
    skipNextSavedLoadRef.current = false;
    setLeagueId(value);
    setVenueId("");
  };

  const handleVenueChange = (value: string) => {
    skipNextSavedLoadRef.current = false;
    setVenueId(value);
  };

  const handleTotalPitchCostChange = (value: string) => {
    setTotalPitchCostValue(value);
    setPitchHireValue(value);
  };

  const handlePitchHireChange = (value: string) => {
    setPitchHireValue(value);
    setTotalPitchCostValue(value);
  };

  return (
    <form className="mt-6 space-y-4" action="/admin/night-board/save">
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <DateInput value={date} onChange={handleDateChange} />
        <CustomSelect label="Known fixture nights" options={dateOptions} value={date} onChange={handleDateChange} />
        <CustomSelect name="leagueId" label="League" options={leagueOptions} value={leagueId} onChange={handleLeagueChange} />
        <CustomSelect name="venueId" label="Venue" options={venueOptions} value={venueId} onChange={handleVenueChange} />
        <MoneyInput label="Ref fee / match" name="refFee" value={refFee} placeholder="e.g. 15" />
        <MoneyInput label="Pitch hire total" name="pitchHire" value={pitchHireValue} onChange={handlePitchHireChange} placeholder="manual total" />
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
              value={pitchCountValue}
              onChange={(event) => setPitchCountValue(event.target.value)}
              placeholder="e.g. 1"
              className="mt-1 h-12 w-full rounded-2xl border border-white/10 bg-black/35 px-4 text-sm normal-case tracking-normal text-white outline-none placeholder:text-white/25 focus:border-amber-400/40 focus:ring-2 focus:ring-amber-400/20"
            />
          </label>
          <label className="space-y-1 text-xs font-semibold uppercase tracking-[0.16em] text-white/35">
            Start time
            <input
              name="nightStartTime"
              type="time"
              value={startTimeValue}
              onChange={(event) => setStartTimeValue(event.target.value)}
              className="mt-1 h-12 w-full rounded-2xl border border-white/10 bg-black/35 px-4 text-sm normal-case tracking-normal text-white outline-none placeholder:text-white/25 focus:border-amber-400/40 focus:ring-2 focus:ring-amber-400/20"
            />
          </label>
          <label className="space-y-1 text-xs font-semibold uppercase tracking-[0.16em] text-white/35">
            End time
            <input
              name="nightEndTime"
              type="time"
              value={endTimeValue}
              onChange={(event) => setEndTimeValue(event.target.value)}
              className="mt-1 h-12 w-full rounded-2xl border border-white/10 bg-black/35 px-4 text-sm normal-case tracking-normal text-white outline-none placeholder:text-white/25 focus:border-amber-400/40 focus:ring-2 focus:ring-amber-400/20"
            />
          </label>
          <MoneyInput label="Total pitch cost" name="nightPitchTotalCost" value={totalPitchCostValue} onChange={handleTotalPitchCostChange} placeholder="e.g. 120" />
        </div>
      </div>

      <button className="h-12 w-full rounded-2xl bg-emerald-400 px-5 text-sm font-semibold text-black transition hover:bg-emerald-300">
        Update board
      </button>
    </form>
  );
}
