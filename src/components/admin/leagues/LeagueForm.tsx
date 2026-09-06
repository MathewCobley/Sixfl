// ========================================
// File: src/components/admin/leagues/LeagueForm.tsx
// ========================================

"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import type { LeagueType, PreferredNight } from "@prisma/client";
import type { LeagueFormState } from "@/app/(admin)/admin/leagues/actions";

type LeagueFormValues = {
  name: string;
  slug: string;
  season: string;
  isActive: boolean;
  isMoving: boolean;
  area: string;
  dayOfWeek: PreferredNight | "";
  leagueType: LeagueType | "";
  venueName: string;
  proposedStartDate: string;
  minutesPerGame: string;
  costPerTeamPerMatch: string;
  targetTeamCount: string;
  requiredRefereesPerNight: string;
  bookedPitchCount: string;
  bookingStartTime: string;
  bookingEndTime: string;
  pitchCostPerHourOverride: string;
  kickoffInfo: string;
  format: string;
  surface: string;
  description: string;
  heroImageUrl: string;
  badgeUrl: string;
  ctaText: string;
};

type LeagueFormProps = {
  mode: "create" | "edit";
  action: (
    prevState: LeagueFormState,
    formData: FormData,
  ) => Promise<LeagueFormState>;
  initialValues?: Partial<LeagueFormValues>;
};

const initialState: LeagueFormState = {};

const dayOptions: Array<{ value: PreferredNight | ""; label: string }> = [
  { value: "", label: "Select a night" },
  { value: "MONDAY", label: "Monday" },
  { value: "TUESDAY", label: "Tuesday" },
  { value: "WEDNESDAY", label: "Wednesday" },
  { value: "THURSDAY", label: "Thursday" },
  { value: "FRIDAY", label: "Friday" },
  { value: "SATURDAY", label: "Saturday" },
  { value: "SUNDAY", label: "Sunday" },
  { value: "ANY", label: "Any" },
];

const leagueTypeOptions: Array<{ value: LeagueType | ""; label: string }> = [
  { value: "", label: "Select league type" },
  { value: "MENS", label: "Mens" },
  { value: "WOMENS", label: "Womens" },
  { value: "YOUTH", label: "Youth" },
];

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function FieldError({
  errors,
  name,
}: {
  errors?: Record<string, string[]>;
  name: string;
}) {
  const message = errors?.[name]?.[0];

  if (!message) {
    return null;
  }

  return <p className="text-sm text-red-400">{message}</p>;
}

function Input({
  id,
  name,
  defaultValue,
  placeholder,
  type = "text",
  min,
  step,
  hasError = false,
}: {
  id: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  type?: string;
  min?: string;
  step?: string;
  hasError?: boolean;
}) {
  return (
    <input
      id={id}
      name={name}
      type={type}
      min={min}
      step={step}
      defaultValue={defaultValue}
      placeholder={placeholder}
      className={`w-full rounded-2xl px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 ${
        hasError
          ? "border border-red-500/50 bg-red-500/5 focus:border-red-400"
          : "border border-white/10 bg-white/5 focus:border-emerald-500/60 focus:bg-white/[0.07]"
      }`}
    />
  );
}

function TextArea({
  id,
  name,
  defaultValue,
  placeholder,
  rows = 5,
  hasError = false,
}: {
  id: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  rows?: number;
  hasError?: boolean;
}) {
  return (
    <textarea
      id={id}
      name={name}
      defaultValue={defaultValue}
      placeholder={placeholder}
      rows={rows}
      className={`w-full rounded-2xl px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 ${
        hasError
          ? "border border-red-500/50 bg-red-500/5 focus:border-red-400"
          : "border border-white/10 bg-white/5 focus:border-emerald-500/60 focus:bg-white/[0.07]"
      }`}
    />
  );
}

function Select({
  id,
  name,
  defaultValue,
  options,
  hasError = false,
}: {
  id: string;
  name: string;
  defaultValue?: string;
  options: Array<{ value: string; label: string }>;
  hasError?: boolean;
}) {
  return (
    <select
      id={id}
      name={name}
      defaultValue={defaultValue}
      className={`w-full rounded-2xl px-4 py-3 text-sm text-white outline-none transition ${
        hasError
          ? "border border-red-500/50 bg-red-500/5 focus:border-red-400"
          : "border border-white/10 bg-neutral-950 focus:border-emerald-500/60"
      }`}
    >
      {options.map((option) => (
        <option key={`${name}-${option.value}`} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function SubmitButton({ mode }: { mode: "create" | "edit" }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Saving..." : mode === "create" ? "Create league" : "Save changes"}
    </button>
  );
}

export default function LeagueForm({
  mode,
  action,
  initialValues,
}: LeagueFormProps) {
  const [state, formAction] = useActionState(action, initialState);

  const values = useMemo<LeagueFormValues>(
    () => ({
      name: initialValues?.name ?? "",
      slug: initialValues?.slug ?? "",
      season: initialValues?.season ?? "",
      isActive: initialValues?.isActive ?? true,
      isMoving: initialValues?.isMoving ?? false,
      area: initialValues?.area ?? "",
      dayOfWeek: initialValues?.dayOfWeek ?? "",
      leagueType: initialValues?.leagueType ?? "",
      venueName: initialValues?.venueName ?? "",
      proposedStartDate: initialValues?.proposedStartDate ?? "",
      minutesPerGame: initialValues?.minutesPerGame ?? "40",
      costPerTeamPerMatch: initialValues?.costPerTeamPerMatch ?? "40",
      targetTeamCount: initialValues?.targetTeamCount ?? "12",
      requiredRefereesPerNight: initialValues?.requiredRefereesPerNight ?? "1",
      bookedPitchCount: initialValues?.bookedPitchCount ?? "",
      bookingStartTime: initialValues?.bookingStartTime ?? "",
      bookingEndTime: initialValues?.bookingEndTime ?? "",
      pitchCostPerHourOverride: initialValues?.pitchCostPerHourOverride ?? "",
      kickoffInfo: initialValues?.kickoffInfo ?? "",
      format: initialValues?.format ?? "",
      surface: initialValues?.surface ?? "",
      description: initialValues?.description ?? "",
      heroImageUrl: initialValues?.heroImageUrl ?? "",
      badgeUrl: initialValues?.badgeUrl ?? "",
      ctaText: initialValues?.ctaText ?? "",
    }),
    [initialValues],
  );

  const [isMoving, setIsMoving] = useState(values.isMoving);
  useEffect(() => { setIsMoving(values.isMoving); }, [values.isMoving]);

  const [name, setName] = useState(values.name);
  const [slug, setSlug] = useState(values.slug);
  const [slugTouched, setSlugTouched] = useState(Boolean(values.slug));

  useEffect(() => {
    setName(values.name);
    setSlug(values.slug);
    setSlugTouched(Boolean(values.slug));
  }, [values]);

  useEffect(() => {
    if (!slugTouched) {
      setSlug(slugify(name));
    }
  }, [name, slugTouched]);

  return (
    <form action={formAction} className="space-y-8">
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <label htmlFor="name" className="block text-sm font-medium text-white">
            League name
          </label>
          <input
            id="name"
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Rossett Mens Tuesday"
            className={`w-full rounded-2xl px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 ${
              state.errors?.name
                ? "border border-red-500/50 bg-red-500/5 focus:border-red-400"
                : "border border-white/10 bg-white/5 focus:border-emerald-500/60 focus:bg-white/[0.07]"
            }`}
          />
          <FieldError errors={state.errors} name="name" />
        </div>

        <div className="space-y-2">
          <label htmlFor="slug" className="block text-sm font-medium text-white">
            Slug
          </label>
          <input
            id="slug"
            name="slug"
            value={slug}
            onChange={(event) => {
              const nextValue = event.target.value;
              setSlugTouched(nextValue.trim().length > 0);
              setSlug(nextValue);
            }}
            placeholder="rossett-mens-tuesday"
            className={`w-full rounded-2xl px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 ${
              state.errors?.slug
                ? "border border-red-500/50 bg-red-500/5 focus:border-red-400"
                : "border border-white/10 bg-white/5 focus:border-emerald-500/60 focus:bg-white/[0.07]"
            }`}
          />
          <p className="text-xs text-white/40">Public URL: /leagues/{slug || "your-slug"}</p>
          <FieldError errors={state.errors} name="slug" />
        </div>

        <div className="space-y-2">
          <label htmlFor="season" className="block text-sm font-medium text-white">
            Season
          </label>
          <Input id="season" name="season" defaultValue={values.season} placeholder="Spring 2026" hasError={Boolean(state.errors?.season)} />
          <FieldError errors={state.errors} name="season" />
        </div>

        <div className="space-y-2">
          <label htmlFor="area" className="block text-sm font-medium text-white">Area</label>
          <Input id="area" name="area" defaultValue={values.area} placeholder="Harrogate" hasError={Boolean(state.errors?.area)} />
          <FieldError errors={state.errors} name="area" />
        </div>

        <div className="space-y-2">
          <label htmlFor="venueName" className="block text-sm font-medium text-white">Venue name</label>
          <Input id="venueName" name="venueName" defaultValue={values.venueName} placeholder="Rossett Sports Centre" hasError={Boolean(state.errors?.venueName)} />
          <FieldError errors={state.errors} name="venueName" />
        </div>

        <div className="space-y-2">
          <label htmlFor="proposedStartDate" className="block text-sm font-medium text-white">Proposed start date</label>
          <Input id="proposedStartDate" name="proposedStartDate" type="date" defaultValue={values.proposedStartDate} hasError={Boolean(state.errors?.proposedStartDate)} />
          <p className="text-xs text-white/40">Used in team confirmation emails.</p>
          <FieldError errors={state.errors} name="proposedStartDate" />
        </div>

        <div className="space-y-2">
          <label htmlFor="minutesPerGame" className="block text-sm font-medium text-white">Minutes per game</label>
          <Input id="minutesPerGame" name="minutesPerGame" type="number" min="1" step="1" defaultValue={values.minutesPerGame} placeholder="40" hasError={Boolean(state.errors?.minutesPerGame)} />
          <FieldError errors={state.errors} name="minutesPerGame" />
        </div>

        <div className="space-y-2">
          <label htmlFor="costPerTeamPerMatch" className="block text-sm font-medium text-white">Cost per team per match (£)</label>
          <Input id="costPerTeamPerMatch" name="costPerTeamPerMatch" type="number" min="0" step="0.01" defaultValue={values.costPerTeamPerMatch} placeholder="40" hasError={Boolean(state.errors?.costPerTeamPerMatch)} />
          <FieldError errors={state.errors} name="costPerTeamPerMatch" />
        </div>

        <div className="space-y-2">
          <label htmlFor="targetTeamCount" className="block text-sm font-medium text-white">Target number of teams</label>
          <Input id="targetTeamCount" name="targetTeamCount" type="number" min="2" step="1" defaultValue={values.targetTeamCount} placeholder="12" hasError={Boolean(state.errors?.targetTeamCount)} />
          <FieldError errors={state.errors} name="targetTeamCount" />
        </div>

        <div className="space-y-2">
          <label htmlFor="dayOfWeek" className="block text-sm font-medium text-white">Day of week</label>
          <Select id="dayOfWeek" name="dayOfWeek" defaultValue={values.dayOfWeek} options={dayOptions} hasError={Boolean(state.errors?.dayOfWeek)} />
          <FieldError errors={state.errors} name="dayOfWeek" />
        </div>

        <div className="space-y-2">
          <label htmlFor="leagueType" className="block text-sm font-medium text-white">League type</label>
          <Select id="leagueType" name="leagueType" defaultValue={values.leagueType} options={leagueTypeOptions} hasError={Boolean(state.errors?.leagueType)} />
          <FieldError errors={state.errors} name="leagueType" />
        </div>

        <div className="space-y-2 md:col-span-2">
          <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.04] p-4">
            <div className="text-sm font-semibold text-white">Night booking / pitch cost</div>
            <p className="mt-1 text-xs leading-5 text-white/45">Used by the Night Board to calculate pitch hire. Leave the override blank to use the venue default hourly cost.</p>
            <div className="mt-4 grid gap-4 md:grid-cols-4">
              <label className="space-y-2">
                <span className="block text-sm font-medium text-white">Pitches booked</span>
                <Input id="bookedPitchCount" name="bookedPitchCount" type="number" min="0" step="1" defaultValue={values.bookedPitchCount} placeholder="2" hasError={Boolean(state.errors?.bookedPitchCount)} />
                <FieldError errors={state.errors} name="bookedPitchCount" />
              </label>
              <label className="space-y-2">
                <span className="block text-sm font-medium text-white">Booking start</span>
                <Input id="bookingStartTime" name="bookingStartTime" type="time" defaultValue={values.bookingStartTime} placeholder="19:00" hasError={Boolean(state.errors?.bookingStartTime)} />
                <FieldError errors={state.errors} name="bookingStartTime" />
              </label>
              <label className="space-y-2">
                <span className="block text-sm font-medium text-white">Booking end</span>
                <Input id="bookingEndTime" name="bookingEndTime" type="time" defaultValue={values.bookingEndTime} placeholder="21:00" hasError={Boolean(state.errors?.bookingEndTime)} />
                <FieldError errors={state.errors} name="bookingEndTime" />
              </label>
              <label className="space-y-2">
                <span className="block text-sm font-medium text-white">Hourly cost override (£)</span>
                <Input id="pitchCostPerHourOverride" name="pitchCostPerHourOverride" type="number" min="0" step="0.01" defaultValue={values.pitchCostPerHourOverride} placeholder="blank = venue" hasError={Boolean(state.errors?.pitchCostPerHourOverride)} />
                <FieldError errors={state.errors} name="pitchCostPerHourOverride" />
              </label>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="requiredRefereesPerNight" className="block text-sm font-medium text-white">Referees needed per night</label>
          <Input id="requiredRefereesPerNight" name="requiredRefereesPerNight" type="number" min="0" step="1" defaultValue={values.requiredRefereesPerNight} placeholder="1" hasError={Boolean(state.errors?.requiredRefereesPerNight)} />
          <FieldError errors={state.errors} name="requiredRefereesPerNight" />
        </div>

        <div className="space-y-2"><label htmlFor="kickoffInfo" className="block text-sm font-medium text-white">Kickoff info</label><Input id="kickoffInfo" name="kickoffInfo" defaultValue={values.kickoffInfo} placeholder="From 7pm" hasError={Boolean(state.errors?.kickoffInfo)} /><FieldError errors={state.errors} name="kickoffInfo" /></div>
        <div className="space-y-2"><label htmlFor="format" className="block text-sm font-medium text-white">Format</label><Input id="format" name="format" defaultValue={values.format} placeholder="6-a-side" hasError={Boolean(state.errors?.format)} /><FieldError errors={state.errors} name="format" /></div>
        <div className="space-y-2"><label htmlFor="surface" className="block text-sm font-medium text-white">Surface</label><Input id="surface" name="surface" defaultValue={values.surface} placeholder="3G" hasError={Boolean(state.errors?.surface)} /><FieldError errors={state.errors} name="surface" /></div>
        <div className="space-y-2"><label htmlFor="heroImageUrl" className="block text-sm font-medium text-white">Hero image URL</label><Input id="heroImageUrl" name="heroImageUrl" defaultValue={values.heroImageUrl} placeholder="/venues/rossett_dark_trendy.jpg" hasError={Boolean(state.errors?.heroImageUrl)} /><FieldError errors={state.errors} name="heroImageUrl" /></div>
        <div className="space-y-2"><label htmlFor="badgeUrl" className="block text-sm font-medium text-white">League badge URL</label><Input id="badgeUrl" name="badgeUrl" defaultValue={values.badgeUrl} placeholder="/leagues/harrogate-tuesday-mens-rossett-sports.png" hasError={Boolean(state.errors?.badgeUrl)} /><FieldError errors={state.errors} name="badgeUrl" /></div>

        <div className="space-y-2 md:col-span-2"><label htmlFor="ctaText" className="block text-sm font-medium text-white">CTA text</label><Input id="ctaText" name="ctaText" defaultValue={values.ctaText} placeholder="Register your team" hasError={Boolean(state.errors?.ctaText)} /><FieldError errors={state.errors} name="ctaText" /></div>
        <div className="space-y-2 md:col-span-2"><label htmlFor="description" className="block text-sm font-medium text-white">Description</label><TextArea id="description" name="description" defaultValue={values.description} placeholder="Premium weekly 6-a-side football..." rows={6} hasError={Boolean(state.errors?.description)} /><FieldError errors={state.errors} name="description" /></div>

        <div className="space-y-2"><label htmlFor="isActive" className="block text-sm font-medium text-white">Status</label><Select id="isActive" name="isActive" defaultValue={values.isActive ? "true" : "false"} options={[{ value: "true", label: "Active" }, { value: "false", label: "Inactive" }]} /></div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <input type="hidden" name="leagueMoveSettingPresent" value="1" />
        <label htmlFor="isMoving" className="flex items-start gap-3 text-sm text-white">
          <input id="isMoving" name="isMoving" type="checkbox" value="true"
            checked={isMoving} onChange={event => setIsMoving(event.target.checked)}
            aria-describedby="league-move-help" className="mt-0.5 h-5 w-5 shrink-0 accent-emerald-500" />
          <span className="font-semibold">League move</span>
        </label>
        <p id="league-move-help" className="mt-2 text-xs leading-5 text-white/60">
          Show move-confirmation dropdowns for this league's teams. Untick to hide them without deleting saved responses. Save changes to apply. This does not move any teams or send messages.
        </p>
      </div>

      {state.error || state.message ? (
        <div className={`rounded-2xl border px-4 py-3 text-sm ${state.error ? "border-red-500/30 bg-red-500/10 text-red-200" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"}`}>
          {state.error || state.message}
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <SubmitButton mode={mode} />
      </div>
    </form>
  );
}
