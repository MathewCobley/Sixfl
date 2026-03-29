// ========================================
// File: src/components/admin/leagues/LeagueForm.tsx
// ========================================

"use client";

// ========================================
// Imports
// ========================================

import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import type { LeagueType, PreferredNight } from "@prisma/client";
import type { LeagueFormState } from "@/app/(admin)/admin/leagues/actions";

// ========================================
// Types
// ========================================

type LeagueFormValues = {
  name: string;
  slug: string;
  season: string;
  isActive: boolean;
  area: string;
  dayOfWeek: PreferredNight | "";
  leagueType: LeagueType | "";
  venueName: string;
  kickoffInfo: string;
  format: string;
  surface: string;
  description: string;
  heroImageUrl: string;
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

// ========================================
// Constants
// ========================================

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

// ========================================
// Helpers
// ========================================

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
  hasError = false,
}: {
  id: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  type?: string;
  hasError?: boolean;
}) {
  return (
    <input
      id={id}
      name={name}
      type={type}
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

// ========================================
// Component
// ========================================

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
      area: initialValues?.area ?? "",
      dayOfWeek: initialValues?.dayOfWeek ?? "",
      leagueType: initialValues?.leagueType ?? "",
      venueName: initialValues?.venueName ?? "",
      kickoffInfo: initialValues?.kickoffInfo ?? "",
      format: initialValues?.format ?? "",
      surface: initialValues?.surface ?? "",
      description: initialValues?.description ?? "",
      heroImageUrl: initialValues?.heroImageUrl ?? "",
      ctaText: initialValues?.ctaText ?? "",
    }),
    [initialValues],
  );

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
          <Input
            id="season"
            name="season"
            defaultValue={values.season}
            placeholder="Spring 2026"
            hasError={Boolean(state.errors?.season)}
          />
          <FieldError errors={state.errors} name="season" />
        </div>

        <div className="space-y-2">
          <label htmlFor="area" className="block text-sm font-medium text-white">
            Area
          </label>
          <Input
            id="area"
            name="area"
            defaultValue={values.area}
            placeholder="Harrogate"
            hasError={Boolean(state.errors?.area)}
          />
          <FieldError errors={state.errors} name="area" />
        </div>

        <div className="space-y-2">
          <label htmlFor="venueName" className="block text-sm font-medium text-white">
            Venue name
          </label>
          <Input
            id="venueName"
            name="venueName"
            defaultValue={values.venueName}
            placeholder="Rossett Sports Centre"
            hasError={Boolean(state.errors?.venueName)}
          />
          <FieldError errors={state.errors} name="venueName" />
        </div>

        <div className="space-y-2">
          <label htmlFor="dayOfWeek" className="block text-sm font-medium text-white">
            Day of week
          </label>
          <Select
            id="dayOfWeek"
            name="dayOfWeek"
            defaultValue={values.dayOfWeek}
            options={dayOptions}
            hasError={Boolean(state.errors?.dayOfWeek)}
          />
          <FieldError errors={state.errors} name="dayOfWeek" />
        </div>

        <div className="space-y-2">
          <label htmlFor="leagueType" className="block text-sm font-medium text-white">
            League type
          </label>
          <Select
            id="leagueType"
            name="leagueType"
            defaultValue={values.leagueType}
            options={leagueTypeOptions}
            hasError={Boolean(state.errors?.leagueType)}
          />
          <FieldError errors={state.errors} name="leagueType" />
        </div>

        <div className="space-y-2">
          <label htmlFor="kickoffInfo" className="block text-sm font-medium text-white">
            Kickoff info
          </label>
          <Input
            id="kickoffInfo"
            name="kickoffInfo"
            defaultValue={values.kickoffInfo}
            placeholder="From 7pm"
            hasError={Boolean(state.errors?.kickoffInfo)}
          />
          <FieldError errors={state.errors} name="kickoffInfo" />
        </div>

        <div className="space-y-2">
          <label htmlFor="format" className="block text-sm font-medium text-white">
            Format
          </label>
          <Input
            id="format"
            name="format"
            defaultValue={values.format}
            placeholder="6-a-side"
            hasError={Boolean(state.errors?.format)}
          />
          <FieldError errors={state.errors} name="format" />
        </div>

        <div className="space-y-2">
          <label htmlFor="surface" className="block text-sm font-medium text-white">
            Surface
          </label>
          <Input
            id="surface"
            name="surface"
            defaultValue={values.surface}
            placeholder="3G"
            hasError={Boolean(state.errors?.surface)}
          />
          <FieldError errors={state.errors} name="surface" />
        </div>

        <div className="space-y-2">
          <label htmlFor="heroImageUrl" className="block text-sm font-medium text-white">
            Hero image URL
          </label>
          <Input
            id="heroImageUrl"
            name="heroImageUrl"
            defaultValue={values.heroImageUrl}
            placeholder="/venues/rossett_dark_trendy.jpg"
            hasError={Boolean(state.errors?.heroImageUrl)}
          />
          <FieldError errors={state.errors} name="heroImageUrl" />
        </div>

        <div className="space-y-2 md:col-span-2">
          <label htmlFor="ctaText" className="block text-sm font-medium text-white">
            CTA text
          </label>
          <Input
            id="ctaText"
            name="ctaText"
            defaultValue={values.ctaText}
            placeholder="Register your team"
            hasError={Boolean(state.errors?.ctaText)}
          />
          <FieldError errors={state.errors} name="ctaText" />
        </div>

        <div className="space-y-2 md:col-span-2">
          <label htmlFor="description" className="block text-sm font-medium text-white">
            Description
          </label>
          <TextArea
            id="description"
            name="description"
            defaultValue={values.description}
            placeholder="Premium weekly 6-a-side football in Harrogate with proper fixtures, proper refs, and a properly run league."
            rows={6}
            hasError={Boolean(state.errors?.description)}
          />
          <FieldError errors={state.errors} name="description" />
        </div>

        <div className="space-y-2">
          <label htmlFor="isActive" className="block text-sm font-medium text-white">
            Status
          </label>
          <Select
            id="isActive"
            name="isActive"
            defaultValue={values.isActive ? "true" : "false"}
            options={[
              { value: "true", label: "Active" },
              { value: "false", label: "Inactive" },
            ]}
          />
        </div>
      </div>

      {state.error || state.message ? (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${
            state.error
              ? "border-red-500/30 bg-red-500/10 text-red-200"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
          }`}
        >
          {state.error || state.message}
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <SubmitButton mode={mode} />
      </div>
    </form>
  );
}