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
} from "@/app/admin/leads/import/actions";

const initialState: ImportLeadsState = {
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
      className="inline-flex items-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Importing..." : "Import leads"}
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
              label="Default interest type"
              defaultValue="TEAM"
              options={[
                { value: "TEAM", label: "TEAM" },
                { value: "PLAYER", label: "PLAYER" },
                { value: "REFEREE", label: "REFEREE" },
              ]}
              placeholder="Select an option"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm text-white/70">Default source</label>
            <input
              name="defaultSource"
              defaultValue="Legacy import"
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
            />
          </div>
        </div>

        <SubmitButton />
      </form>

      {state.message ? (
        <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white">
          {state.message}
        </div>
      ) : null}
    </div>
  );
}