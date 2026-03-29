// ========================================
// File: src/components/admin/fixtures/ResultInput.tsx
// ========================================

"use client";

import { submitResultAction } from "@/app/(admin)/admin/fixtures/actions";

type ResultMatch = {
  id: string;
  homeScore: number | null;
  awayScore: number | null;
};

type ResultInputProps = {
  match: ResultMatch;
};

export default function ResultInput({ match }: ResultInputProps) {
  return (
    <form
      action={submitResultAction}
      className="flex items-center gap-2"
    >
      <input type="hidden" name="matchId" value={match.id} />

      <input
        name="homeScore"
        type="number"
        min="0"
        className="w-12 rounded bg-black text-white text-center"
        defaultValue={match.homeScore ?? ""}
      />

      <span className="text-white/50">-</span>

      <input
        name="awayScore"
        type="number"
        min="0"
        className="w-12 rounded bg-black text-white text-center"
        defaultValue={match.awayScore ?? ""}
      />

      <button className="text-xs text-emerald-400 hover:text-emerald-300">
        Save
      </button>
    </form>
  );
}