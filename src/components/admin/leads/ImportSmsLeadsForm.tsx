// ========================================
// File: src/components/admin/leads/ImportSmsLeadsForm.tsx
// ========================================

"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import AdminSelect from "@/components/admin/AdminSelect";
import {
  importSmsLeadsAction,
  type ImportSmsLeadsState,
} from "@/app/(admin)/admin/leads/import-sms/actions";

const initialState: ImportSmsLeadsState = {
  success: false,
  message: "",
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
      className="inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Importing..." : "Import SMS leads"}
    </button>
  );
}

export default function ImportSmsLeadsForm() {
  const [state, formAction] = useActionState(importSmsLeadsAction, initialState);

  return (
    <div className="space-y-6">
      <form
        action={formAction}
        className="space-y-6 rounded-2xl border border-white/10 bg-white/5 p-6"
      >
        <div className="space-y-2">
          <label className="block text-sm font-medium text-white">CSV file</label>
          <input
            name="file"
            type="file"
            accept=".csv,text/csv"
            required
            className="block w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white file:mr-4 file:rounded-md file:border-0 file:bg-emerald-600 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-emerald-500"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <AdminSelect
            name="defaultInterestType"
            label="Default interest type"
            defaultValue="TEAM"
            options={[
              { value: "TEAM", label: "TEAM" },
              { value: "PLAYER", label: "PLAYER" },
              { value: "REFEREE", label: "REFEREE" },
            ]}
            placeholder="Select an option"
          />

          <div className="space-y-2">
            <label className="text-sm text-white/70">Default source</label>
            <input
              name="defaultSource"
              defaultValue="SMS lead import"
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
            />
          </div>
        </div>

        <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/20 p-4">
          <input
            type="checkbox"
            name="skipExisting"
            defaultChecked
            className="mt-1 h-4 w-4 rounded border-white/20 bg-black/50 text-emerald-400 focus:ring-emerald-400/30"
          />
          <div>
            <div className="text-sm font-semibold text-white">
              Skip existing mobile numbers
            </div>
            <div className="mt-1 text-sm text-white/55">
              Dedupe against existing leads using the normalized UK mobile number.
            </div>
          </div>
        </label>

        <SubmitButton />
      </form>

      {state.message ? (
        <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white">
          <div>{state.message}</div>

          {(state.created > 0 || state.skipped > 0) && (
            <div className="mt-2 text-white/70">
              Created: {state.created} • Skipped: {state.skipped}
            </div>
          )}

          {state.errors.length > 0 ? (
            <div className="mt-4 space-y-2">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-300">
                Row issues
              </div>
              <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-white/75">
                {state.errors.map((error) => (
                  <div key={error}>{error}</div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}