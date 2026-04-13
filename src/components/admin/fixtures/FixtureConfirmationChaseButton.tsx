// ========================================
// File: src/components/admin/fixtures/FixtureConfirmationChaseButton.tsx
// ========================================

"use client";

import { chaseFixtureConfirmationSmsAction } from "@/app/(admin)/admin/fixtures/confirmation-actions";

type FixtureConfirmationChaseButtonProps = {
  fixtureId: string;
  teamId: string;
};

export function FixtureConfirmationChaseButton({
  fixtureId,
  teamId,
}: FixtureConfirmationChaseButtonProps) {
  return (
    <form action={chaseFixtureConfirmationSmsAction}>
      <input type="hidden" name="fixtureId" value={fixtureId} />
      <input type="hidden" name="teamId" value={teamId} />
      <button
        type="submit"
        className="inline-flex h-9 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 text-xs font-semibold text-emerald-100 transition hover:border-emerald-400/30 hover:bg-emerald-500/15"
      >
        Chase SMS
      </button>
    </form>
  );
}