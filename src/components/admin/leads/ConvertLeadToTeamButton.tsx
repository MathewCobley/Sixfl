// ========================================
// File: src/components/admin/leads/ConvertLeadToTeamButton.tsx
// ========================================

"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { convertLeadToTeamAction } from "@/app/admin/leads/[id]/actions";

type Props = {
  leadId: string;
  alreadyConverted?: boolean;
  convertedTeamId?: string | null;
};

export default function ConvertLeadToTeamButton({
  leadId,
  alreadyConverted = false,
  convertedTeamId,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [successTeamId, setSuccessTeamId] = useState<string | null>(
    convertedTeamId ?? null
  );
  const [successMessage, setSuccessMessage] = useState<string | null>(
    alreadyConverted
      ? "This lead has already been converted to a team."
      : null
  );

  function handleConvert() {
    const confirmed = window.confirm(
      "Convert this lead into a team? This will create the team, create or link the captain user, and close the lead."
    );

    if (!confirmed) return;

    setError(null);
    setSuccessMessage(null);

    const formData = new FormData();
    formData.append("leadId", leadId);

    startTransition(async () => {
      const result = await convertLeadToTeamAction(formData);

      if (!result.ok) {
        setError(result.error ?? "Failed to convert lead to team.");

        if (result.teamId) {
          setSuccessTeamId(result.teamId);
        }

        return;
      }

      setSuccessTeamId(result.teamId ?? null);
      setSuccessMessage(
        result.teamName
          ? `Lead converted successfully. Team created: ${result.teamName}.`
          : "Lead converted successfully."
      );
    });
  }

  if (alreadyConverted && successTeamId) {
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
        <div className="text-sm font-medium text-emerald-300">
          This lead has already been converted to a team.
        </div>

        <div className="mt-3">
          <Link
            href={`/admin/teams/${successTeamId}`}
            className="inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
          >
            View team
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={handleConvert}
          disabled={isPending || alreadyConverted}
          className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Converting..." : "Convert to team"}
        </button>

        {successTeamId ? (
          <Link
            href={`/admin/teams/${successTeamId}`}
            className="inline-flex items-center justify-center rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/5"
          >
            View team
          </Link>
        ) : null}
      </div>

      {successMessage ? (
        <p className="mt-3 text-sm text-emerald-300">{successMessage}</p>
      ) : null}

      {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
    </div>
  );
}