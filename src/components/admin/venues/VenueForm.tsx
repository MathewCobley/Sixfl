// ========================================
// File: src/components/admin/venues/VenueForm.tsx
// ========================================

"use client";

import { useActionState } from "react";
import { createVenueAction } from "@/app/admin/venues/actions";

type VenueFormState = {
  success?: boolean;
  error?: string;
  message?: string;
  errors?: Record<string, string[]>;
};

const initialState: VenueFormState = {};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;

  return <p className="mt-2 text-sm text-rose-300">{message}</p>;
}

export default function VenueForm() {
  const [state, formAction, isPending] = useActionState(
    createVenueAction,
    initialState
  );

  return (
    <form action={formAction} className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="lg:col-span-2">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
            Venue name
          </label>
          <input
            type="text"
            name="name"
            placeholder="e.g. Rossett Sports Centre"
            className="h-14 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
          />
          <FieldError message={state.errors?.name?.[0]} />
        </div>

        <div className="lg:col-span-2">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
            Address
          </label>
          <input
            type="text"
            name="address"
            placeholder="e.g. Rossett School, Green Lane, Harrogate"
            className="h-14 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
          />
        </div>

        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
            Postcode
          </label>
          <input
            type="text"
            name="postcode"
            placeholder="e.g. HG2 9JP"
            className="h-14 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white uppercase outline-none transition placeholder:text-white/25 focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
          />
        </div>

        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
            Notes
          </label>
          <input
            type="text"
            name="notes"
            placeholder="e.g. 2 pitches, parking on site"
            className="h-14 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
          />
        </div>
      </div>

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