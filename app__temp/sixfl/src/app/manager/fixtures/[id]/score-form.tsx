"use client";

import { submitScore } from "./actions";
import { useFormStatus } from "react-dom";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-emerald-500 px-6 py-3 font-bold text-black disabled:opacity-60"
    >
      {pending ? "Saving..." : "Submit Score"}
    </button>
  );
}

export default function ScoreForm({ fixtureId }: { fixtureId: string }) {
  return (
    <form action={submitScore} className="mt-6 space-y-4">
      <input type="hidden" name="fixtureId" value={fixtureId} />

      <div className="flex gap-4">
        <input
          name="homeScore"
          type="number"
          placeholder="Home"
          className="w-full rounded-lg bg-white/5 p-3 text-white"
          required
        />
        <input
          name="awayScore"
          type="number"
          placeholder="Away"
          className="w-full rounded-lg bg-white/5 p-3 text-white"
          required
        />
      </div>

      <SubmitButton />
    </form>
  );
}