// ========================================
// File: src/components/captain/PendingActivationMoveButton.tsx
// ========================================

"use client";

import { useState } from "react";

type MoveData = {
  targetTeams: Array<{
    id: string;
    name: string;
    league: { name: string; season: string | null } | null;
  }>;
};

type LoadState = "idle" | "loading" | "loaded" | "moving" | "error";

function getTeamLabel(team: MoveData["targetTeams"][number]) {
  return team.league?.name
    ? `${team.name} · ${team.league.name}${team.league.season ? ` ${team.league.season}` : ""}`
    : team.name;
}

export default function PendingActivationMoveButton({
  teamId,
  prospectId,
  playerName,
}: {
  teamId: string;
  prospectId: string;
  playerName: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<LoadState>("idle");
  const [teams, setTeams] = useState<MoveData["targetTeams"]>([]);
  const [error, setError] = useState<string | null>(null);

  async function openModal() {
    setOpen(true);
    setState("loading");
    setError(null);

    try {
      const response = await fetch(`/api/captain/team/${teamId}/move-managed-player?type=prospect`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Could not load teams.");
      }

      const payload = (await response.json()) as MoveData;
      setTeams(payload.targetTeams ?? []);
      setState("loaded");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not load teams.");
      setState("error");
    }
  }

  async function moveToTeam(targetTeamId: string) {
    setState("moving");
    setError(null);

    try {
      const response = await fetch(`/api/captain/team/${teamId}/move-managed-player`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "prospect",
          itemId: prospectId,
          targetTeamId,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Pending player could not be moved.");
      }

      window.location.href = `/captain/team/${teamId}/squad?saved=pending-player-moved`;
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Pending player could not be moved.");
      setState("loaded");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="inline-flex w-full items-center justify-center rounded-xl border border-sky-400/30 bg-sky-500/10 px-4 py-2.5 text-center text-sm font-medium text-sky-100 transition hover:bg-sky-500/15 sm:w-auto"
      >
        Move pending player
      </button>

      {open ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-3xl border border-sky-400/20 bg-[#07130f] p-6 text-white shadow-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-100/70">
              Move pending player
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
              Move {playerName || "pending player"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-sky-100/70">
              Choose the team to move this pending activation player into. They will remain pending activation in the destination squad.
            </p>

            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/65">
              {state === "loading" ? "Loading teams…" : null}
              {state === "moving" ? "Moving pending player…" : null}
              {state === "loaded" && teams.length > 0 ? "Select a destination team." : null}
              {state === "loaded" && teams.length === 0 ? "No other teams are available." : null}
              {state === "error" ? error ?? "Could not load teams." : null}
            </div>

            {error && state !== "error" ? (
              <div className="mt-3 rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                {error}
              </div>
            ) : null}

            {teams.length > 0 ? (
              <div className="mt-4 grid gap-2">
                {teams.map((team) => (
                  <button
                    key={team.id}
                    type="button"
                    disabled={state === "moving"}
                    onClick={() => void moveToTeam(team.id)}
                    className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-left text-sm text-white transition hover:border-sky-400/30 hover:bg-sky-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span>
                      <span className="block font-semibold text-white">{getTeamLabel(team)}</span>
                      <span className="mt-1 block text-xs text-white/45">Move into this squad as pending activation</span>
                    </span>
                    <span className="rounded-xl border border-sky-400/25 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-100">
                      Move
                    </span>
                  </button>
                ))}
              </div>
            ) : null}

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex items-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/10"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
