// ========================================
// File: src/components/admin/leads/ConvertLeadToRefereeForm.tsx
// ========================================

"use client";

import { useActionState } from "react";
import { convertLeadToRefereeAction } from "@/app/(admin)/admin/leads/convert-referee-actions";
import { initialConvertLeadToRefereeState } from "@/app/(admin)/admin/leads/convert-referee-action-state";

type Props = {
  leadId: string;
  alreadyConverted?: boolean;
};

export default function ConvertLeadToRefereeForm({
  leadId,
  alreadyConverted = false,
}: Props) {
  const [state, formAction, isPending] = useActionState(
    convertLeadToRefereeAction,
    initialConvertLeadToRefereeState
  );

  if (alreadyConverted) {
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
        <div className="text-sm font-medium text-emerald-300">
          This referee lead has already been converted.
        </div>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="rounded-2xl border border-white/10 bg-white/5 p-4"
    >
      <input type="hidden" name="leadId" value={leadId} />

      <div>
        <h3 className="text-sm font-semibold text-white">Convert to referee</h3>
        <p className="mt-2 text-sm leading-6 text-white/60">
          This will create or update a user account with the REFEREE role so the
          person appears in the admin fixtures referee selector.
        </p>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="submit"
          disabled={isPending}
          onClick={(event) => {
            const confirmed = window.confirm(
              "Convert this lead into a referee? This will create or update a user account with the REFEREE role and close the lead."
            );

            if (!confirmed) {
              event.preventDefault();
            }
          }}
          className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Converting..." : "Convert to referee"}
        </button>
      </div>

      {state.error ? (
        <p className="mt-3 text-sm text-red-300">{state.error}</p>
      ) : null}
    </form>
  );
}