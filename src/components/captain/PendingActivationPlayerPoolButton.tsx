"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type MoveResponse = {
  ok?: boolean;
  message?: string;
  error?: string;
};

type Props = {
  teamId: string;
  prospectId: string;
  playerName: string;
  hasEmail: boolean;
};

export default function PendingActivationPlayerPoolButton({
  teamId,
  prospectId,
  playerName,
  hasEmail,
}: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function moveToPlayerPool() {
    if (!hasEmail || pending) return;

    const confirmed = window.confirm(
      `Move ${playerName} to PlayerPool? This will remove their pending place from this squad, keep their details and email them the PlayerPool profile form.`,
    );

    if (!confirmed) return;

    setPending(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/captain/team/${encodeURIComponent(teamId)}/prospects/${encodeURIComponent(
          prospectId,
        )}/move-to-player-pool`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      const payload = (await response.json().catch(() => null)) as MoveResponse | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.error || "The player could not be moved to PlayerPool.",
        );
      }

      router.push("/admin/player-pool");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The player could not be moved to PlayerPool.",
      );
      setPending(false);
    }
  }

  return (
    <div className="w-full sm:w-auto">
      <button
        type="button"
        disabled={!hasEmail || pending}
        onClick={() => void moveToPlayerPool()}
        title={hasEmail ? undefined : "Add an email address before moving this player to PlayerPool."}
        className="inline-flex w-full items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-center text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.04] disabled:text-white/35 sm:w-auto"
      >
        {pending
          ? "Moving to PlayerPool…"
          : hasEmail
            ? "Move to PlayerPool"
            : "Add email for PlayerPool"}
      </button>

      {error ? (
        <p className="mt-2 max-w-xs rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-100">
          {error}
        </p>
      ) : null}
    </div>
  );
}
