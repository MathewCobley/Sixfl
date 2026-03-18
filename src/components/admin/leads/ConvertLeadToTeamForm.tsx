// ========================================
// File: src/components/admin/leads/ConvertLeadToTeamForm.tsx
// ========================================

"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { convertLeadToTeamAction } from "@/app/admin/leads/convert-actions";
import { initialConvertLeadToTeamState } from "@/app/admin/leads/convert-action-state";

type Props = {
  leadId: string;
  defaultTeamName?: string;
  alreadyConverted?: boolean;
  convertedTeamId?: string | null;
};

export default function ConvertLeadToTeamForm({
  leadId,
  defaultTeamName = "",
  alreadyConverted = false,
  convertedTeamId,
}: Props) {
  const [state, formAction, isPending] = useActionState(
    convertLeadToTeamAction,
    initialConvertLeadToTeamState
  );

  const [teamName, setTeamName] = useState(defaultTeamName);

  if (alreadyConverted && convertedTeamId) {
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
        <div className="text-sm font-medium text-emerald-300">
          This lead has already been converted to a team.
        </div>

        <div className="mt-3">
          <Link
            href={`/admin/teams/${convertedTeamId}`}
            className="inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
          >
            View team
          </Link>
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
        <label
          htmlFor="teamName"
          className="mb-2 block text-sm font-semibold text-white/85"
        >
          Team name
        </label>

        <input
          id="teamName"
          name="teamName"
          type="text"
          value={teamName}
          onChange={(event) => setTeamName(event.target.value)}
          placeholder="Enter team name"
          className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-emerald-500/40"
        />

        <p className="mt-2 text-xs text-white/50">
          You can leave this as-is or rename the team before conversion.
        </p>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="submit"
          disabled={isPending}
          onClick={(event) => {
            const confirmed = window.confirm(
              "Convert this lead into a team? This will create the team, create or link the captain user, add them as captain, and close the lead."
            );

            if (!confirmed) {
              event.preventDefault();
            }
          }}
          className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Converting..." : "Convert to team"}
        </button>

        {convertedTeamId ? (
          <Link
            href={`/admin/teams/${convertedTeamId}`}
            className="inline-flex items-center justify-center rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/5"
          >
            View team
          </Link>
        ) : null}
      </div>

      {state.error ? (
        <p className="mt-3 text-sm text-red-300">{state.error}</p>
      ) : null}
    </form>
  );
}