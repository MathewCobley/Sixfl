// ========================================
// File: src/components/admin/leads/ManualLeadForm.tsx
// ========================================

"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import AdminSelect from "@/components/admin/AdminSelect";
import {
  createManualLeadAction,
  type ManualLeadFormState,
} from "@/app/(admin)/admin/leads/actions";

const initialState: ManualLeadFormState = {
  ok: false,
  message: "",
  errors: {},
};

const interestTypeOptions = [
  { value: "TEAM", label: "Team" },
  { value: "PLAYER", label: "Player" },
  { value: "REFEREE", label: "Referee" },
];

const statusOptions = [
  { value: "NEW", label: "New" },
  { value: "CONTACTED", label: "Contacted" },
  { value: "QUALIFIED", label: "Qualified" },
  { value: "CLOSED", label: "Closed" },
];

const leagueTypeOptions = [
  { value: "", label: "No league type" },
  { value: "MENS", label: "Mens" },
  { value: "WOMENS", label: "Womens" },
  { value: "YOUTH", label: "Youth" },
];

const preferredNightOptions = [
  { value: "MONDAY", label: "Monday" },
  { value: "TUESDAY", label: "Tuesday" },
  { value: "WEDNESDAY", label: "Wednesday" },
  { value: "THURSDAY", label: "Thursday" },
  { value: "FRIDAY", label: "Friday" },
  { value: "SATURDAY", label: "Saturday" },
  { value: "SUNDAY", label: "Sunday" },
  { value: "ANY", label: "Any" },
];

function FieldError({
  state,
  name,
}: {
  state: ManualLeadFormState;
  name: keyof NonNullable<ManualLeadFormState["errors"]>;
}) {
  const error = state.errors?.[name];

  if (!error) return null;

  return <p className="text-xs text-red-400">{error}</p>;
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Saving lead..." : "Save lead"}
    </button>
  );
}

export default function ManualLeadForm() {
  const [state, formAction] = useActionState(createManualLeadAction, initialState);

  return (
    <div className="space-y-6">
      <form
        action={formAction}
        className="space-y-6 rounded-2xl border border-white/10 bg-white/5 p-6"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <AdminSelect
              name="interestType"
              label="Lead type"
              defaultValue="TEAM"
              options={interestTypeOptions}
              required
              placeholder="Select lead type"
            />
            <FieldError state={state} name="interestType" />
          </div>

          <div className="space-y-2">
            <AdminSelect
              name="status"
              label="Initial status"
              defaultValue="NEW"
              options={statusOptions}
              required
              placeholder="Select status"
            />
            <FieldError state={state} name="status" />
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="block text-sm font-medium text-white">
              Contact name
            </label>
            <input
              name="contactName"
              placeholder="Full name"
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-emerald-500/60"
            />
            <FieldError state={state} name="contactName" />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-white">Email</label>
            <input
              name="email"
              type="email"
              placeholder="lead@example.com"
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-emerald-500/60"
            />
            <FieldError state={state} name="email" />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-white">Phone</label>
            <input
              name="phone"
              placeholder="Optional"
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-emerald-500/60"
            />
            <FieldError state={state} name="phone" />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-white">
              Team name
            </label>
            <input
              name="teamName"
              placeholder="Optional"
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-emerald-500/60"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-white">Area</label>
            <input
              name="area"
              placeholder="Harrogate"
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-emerald-500/60"
            />
          </div>

          <div className="space-y-2">
            <AdminSelect
              name="leagueType"
              label="League type"
              defaultValue=""
              options={leagueTypeOptions}
              placeholder="No league type"
            />
            <FieldError state={state} name="leagueType" />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-white">Source</label>
            <input
              name="source"
              defaultValue="Manual admin entry"
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-emerald-500/60"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="block text-sm font-medium text-white">
              Preferred nights
            </label>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {preferredNightOptions.map((night) => (
                <label
                  key={night.value}
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white transition hover:border-white/20 hover:bg-black/30"
                >
                  <input
                    type="checkbox"
                    name="preferredNights"
                    value={night.value}
                    className="h-4 w-4 rounded border-white/20 bg-black/40 text-emerald-500 focus:ring-emerald-500/20"
                  />
                  <span>{night.label}</span>
                </label>
              ))}
            </div>
            <FieldError state={state} name="preferredNights" />
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="block text-sm font-medium text-white">
              Message / notes
            </label>
            <textarea
              name="message"
              rows={5}
              placeholder="Anything useful you already know about this lead"
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-emerald-500/60"
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white">
            <input
              type="checkbox"
              name="wantsFreeKit"
              className="h-4 w-4 rounded border-white/20 bg-black/40 text-emerald-500 focus:ring-emerald-500/20"
            />
            <span>Interested in free kit offer</span>
          </label>

          <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white">
            <input
              type="checkbox"
              name="marketingConsent"
              className="h-4 w-4 rounded border-white/20 bg-black/40 text-emerald-500 focus:ring-emerald-500/20"
            />
            <span>Marketing consent confirmed</span>
          </label>
        </div>

        {state.message && !state.ok ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            {state.message}
          </div>
        ) : null}

        <div className="flex items-center gap-3">
          <SubmitButton />
        </div>
      </form>
    </div>
  );
}
