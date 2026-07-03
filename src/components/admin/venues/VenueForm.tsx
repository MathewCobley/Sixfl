// ========================================
// File: src/components/admin/venues/VenueForm.tsx
// ========================================

"use client";

import type { ReactNode } from "react";
import { useActionState } from "react";
import { createVenueAction } from "@/app/(admin)/admin/venues/actions";

type VenueFormState = {
  success?: boolean;
  error?: string;
  message?: string;
  errors?: Record<string, string[]>;
};

const initialState: VenueFormState = {};

const inputClassName =
  "h-14 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;

  return <p className="mt-2 text-sm text-rose-300">{message}</p>;
}

function FormSection({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-black/20 p-4 sm:p-5">
      <div className="mb-5 space-y-1">
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300/70">
          {eyebrow}
        </div>
        <h3 className="text-sm font-semibold text-white">{title}</h3>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">{children}</div>
    </div>
  );
}

function TextField({
  label,
  name,
  placeholder,
  className,
  uppercase = false,
  type = "text",
  min,
  step,
  error,
}: {
  label: string;
  name: string;
  placeholder: string;
  className?: string;
  uppercase?: boolean;
  type?: string;
  min?: string;
  step?: string;
  error?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
        {label}
      </label>
      <input
        type={type}
        min={min}
        step={step}
        name={name}
        placeholder={placeholder}
        className={[inputClassName, uppercase ? "uppercase" : ""].join(" ")}
      />
      <FieldError message={error} />
    </div>
  );
}

export default function VenueForm() {
  const [state, formAction, isPending] = useActionState(
    createVenueAction,
    initialState
  );

  return (
    <form action={formAction} className="space-y-6">
      <FormSection eyebrow="Core details" title="Where fixtures take place">
        <TextField
          label="Venue name"
          name="name"
          placeholder="e.g. Rossett Sports Centre"
          className="lg:col-span-2"
          error={state.errors?.name?.[0]}
        />

        <TextField
          label="Address"
          name="address"
          placeholder="e.g. Rossett School, Green Lane, Harrogate"
          className="lg:col-span-2"
        />

        <TextField
          label="Postcode"
          name="postcode"
          placeholder="e.g. HG2 9JP"
          uppercase
        />

        <TextField
          label="Notes"
          name="notes"
          placeholder="e.g. Wednesday league venue"
        />
      </FormSection>

      <FormSection eyebrow="Pitch costs" title="Default venue rate">
        <TextField
          label="Default pitch cost per hour (£)"
          name="defaultPitchCostPerHour"
          type="number"
          min="0"
          step="0.01"
          placeholder="e.g. 60"
          className="lg:col-span-2"
          error={state.errors?.defaultPitchCostPerHour?.[0]}
        />
        <p className="text-sm leading-6 text-white/45 lg:col-span-2">
          This is the venue’s usual hourly pitch rate. Individual leagues can override it if a specific booking is different.
        </p>
      </FormSection>

      <FormSection eyebrow="Public links" title="Images, website and directions">
        <TextField
          label="Venue image URL"
          name="imageUrl"
          placeholder="https://www.sixfl.co.uk/venues/northallerton-leisure-centre.jpg"
          className="lg:col-span-2"
        />

        <TextField
          label="Website URL"
          name="websiteUrl"
          placeholder="https://..."
        />

        <TextField
          label="Google Maps URL"
          name="googleMapsUrl"
          placeholder="https://maps.google.com/..."
        />
      </FormSection>

      <FormSection eyebrow="Facilities" title="Useful details for captains">
        <TextField
          label="Parking notes"
          name="parkingNotes"
          placeholder="e.g. Free parking available on site"
          className="lg:col-span-2"
        />

        <TextField
          label="Pitch notes"
          name="pitchNotes"
          placeholder="e.g. 3G pitch, moulded boots recommended"
        />

        <TextField
          label="Facilities"
          name="facilities"
          placeholder="e.g. Changing rooms, toilets, floodlights"
        />
      </FormSection>

      {(state.error || state.message) && (
        <div
          className={[
            "rounded-2xl border px-4 py-3 text-sm",
            state.error
              ? "border-rose-500/20 bg-rose-500/10 text-rose-200"
              : "border-emerald-500/20 bg-emerald-500/10 text-emerald-200",
          ].join(" ")}
        >
          {state.error || state.message}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-6">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex h-12 items-center justify-center rounded-2xl bg-emerald-400 px-6 text-sm font-semibold text-black transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isPending ? "Creating venue..." : "Create venue"}
        </button>

        <p className="text-sm text-white/45">
          Venues created here become available in fixture creation and generation.
        </p>
      </div>
    </form>
  );
}
