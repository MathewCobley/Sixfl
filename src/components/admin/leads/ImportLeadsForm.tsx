// ========================================
// File: src/components/admin/leads/ImportLeadsForm.tsx
// ========================================

"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import AdminSelect from "@/components/admin/AdminSelect";
import {
  importLeadsAction,
  type ImportLeadsState,
} from "@/app/(admin)/admin/leads/import/actions";

const initialState: ImportLeadsState = {
  success: false,
  message: "",
  processed: 0,
  created: 0,
  skipped: 0,
  errors: [],
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Importing..." : "Import CSV"}
    </button>
  );
}

export default function ImportLeadsForm() {
  const [state, formAction] = useActionState(importLeadsAction, initialState);

  return (
    <div className="space-y-6">
      <form
        action={formAction}
        className="space-y-6 rounded-2xl border border-white/10 bg-white/5 p-6"
      >
        <div className="rounded-xl border border-sky-400/20 bg-sky-500/10 p-4 text-sm text-sky-100">
          <div className="font-semibold">Meta / Facebook lead exports are recognised automatically.</div>
          <div className="mt-1 text-sky-100/75">
            SIXFL will read the Meta name, blank-headed email column, phone number, Facebook/Instagram source,
            team-vs-player answer and start timing. Existing leads are skipped automatically by email or phone.
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-white">
            CSV file
          </label>
          <input
            name="file"
            type="file"
            accept=".csv,text/csv"
            required
            className="block w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white file:mr-4 file:rounded-md file:border-0 file:bg-emerald-600 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-emerald-500"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <AdminSelect
              name="defaultInterestType"
              label="Fallback interest type"
              defaultValue="TEAM"
              options={[
                { value: "TEAM", label: "TEAM" },
                { value: "PLAYER", label: "PLAYER" },
                { value: "REFEREE", label: "REFEREE" },
              ]}
              placeholder="Select an option"
            />
            <p className="text-xs text-white/45">
              Meta files override this per row when the form answer identifies a team or individual player.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-white/70">Area override (optional)</label>
            <input
              name="defaultArea"
              placeholder="Leave blank to infer Catterick/Richmond from the Meta ad"
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder:text-white/30"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-sm text-white/70">Source override (optional)</label>
            <input
              name="defaultSource"
              placeholder="Leave blank for Meta - Facebook / Meta - Instagram"
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder:text-white/30"
            />
          </div>
        </div>

        <SubmitButton />
      </form>

      {state.message ? (
        <div
          className={[
            "rounded-xl border p-4 text-sm",
            state.success
              ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"
              : "border-amber-400/20 bg-amber-500/10 text-amber-100",
          ].join(" ")}
        >
          <div className="font-semibold">{state.message}</div>
          {state.processed > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-white/10 bg-black/15 px-3 py-1">{state.processed} processed</span>
              <span className="rounded-full border border-white/10 bg-black/15 px-3 py-1">{state.created} created</span>
              <span className="rounded-full border border-white/10 bg-black/15 px-3 py-1">{state.skipped} skipped</span>
            </div>
          ) : null}
        </div>
      ) : null}

      {state.errors.length > 0 ? (
        <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">
          <div className="font-semibold">Rows needing attention</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-100/80">
            {state.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
