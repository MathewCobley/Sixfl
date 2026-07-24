// ========================================
// File: src/components/captain/AvailabilityHistoryNudgePanel.tsx
// ========================================

"use client";

import { useState } from "react";

type NudgePlayer = {
  teamMemberId: string;
  name: string;
  email: string | null;
  ignoredCount: number;
  lastNudgeAt: string | null;
  nudgeStatus: string | null;
  nudgeCount: number;
};

type NudgeResponse = {
  error?: string;
  lastNudgeAt?: string;
  nudgeStatus?: string | null;
  nudgeCount?: number;
};

function formatNudgeDate(value: string | null) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatStatus(value: string | null) {
  if (!value) return null;

  switch (value) {
    case "SENT":
      return "sent";
    case "QUEUED":
      return "queued";
    case "PROCESSING":
      return "sending";
    case "FAILED":
      return "failed";
    case "SKIPPED":
      return "skipped";
    case "CANCELLED":
      return "cancelled";
    default:
      return value.toLowerCase();
  }
}

function PlayerNudgeRow({
  teamId,
  initialPlayer,
}: {
  teamId: string;
  initialPlayer: NudgePlayer;
}) {
  const [player, setPlayer] = useState(initialPlayer);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formattedDate = formatNudgeDate(player.lastNudgeAt);
  const status = formatStatus(player.nudgeStatus);

  async function sendNudge() {
    if (!player.email || sending) return;

    const confirmed = window.confirm(
      `Send an availability warning email to ${player.email}?`,
    );
    if (!confirmed) return;

    setSending(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/captain/team/${encodeURIComponent(teamId)}/availability-history-nudges`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teamMemberId: player.teamMemberId }),
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | NudgeResponse
        | null;

      if (!response.ok || !payload?.lastNudgeAt) {
        throw new Error(payload?.error || "The nudge could not be sent.");
      }

      setPlayer((current) => ({
        ...current,
        lastNudgeAt: payload.lastNudgeAt ?? current.lastNudgeAt,
        nudgeStatus: payload.nudgeStatus ?? current.nudgeStatus,
        nudgeCount: payload.nudgeCount ?? current.nudgeCount,
      }));
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "The nudge could not be sent.",
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-white">{player.name}</p>
          <span className="rounded-full border border-red-400/20 bg-red-500/10 px-2.5 py-1 text-[11px] font-medium text-red-100">
            Ignored {player.ignoredCount}
          </span>
        </div>
        <p className="mt-1 truncate text-xs text-white/45">
          {player.email || "No email saved"}
        </p>
        {formattedDate ? (
          <p className="mt-2 text-[11px] text-amber-100/70">
            Last nudge: {formattedDate}
            {status ? ` · ${status}` : ""}
            {player.nudgeCount > 1 ? ` · ${player.nudgeCount} nudges` : ""}
          </p>
        ) : null}
        {error ? <p className="mt-2 text-xs text-red-200">{error}</p> : null}
      </div>

      <button
        type="button"
        onClick={sendNudge}
        disabled={!player.email || sending}
        className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl border border-amber-400/25 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/15 disabled:cursor-not-allowed disabled:opacity-45"
      >
        {sending
          ? "Sending…"
          : player.lastNudgeAt
            ? "Nudge again"
            : "Send nudge"}
      </button>
    </div>
  );
}

export default function AvailabilityHistoryNudgePanel({
  teamId,
  players,
}: {
  teamId: string;
  players: NudgePlayer[];
}) {
  if (players.length === 0) return null;

  return (
    <section className="mb-8 overflow-hidden rounded-3xl border border-amber-400/20 bg-amber-500/[0.06] shadow-[0_20px_70px_rgba(0,0,0,0.24)]">
      <div className="border-b border-amber-400/15 px-6 py-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200/70">
          Availability follow-up
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
          Players who have ignored requests
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">
          Send a direct email reminder asking the player to confirm Available,
          Maybe or Unavailable for future fixtures.
        </p>
      </div>

      <div className="grid gap-3 p-5 sm:p-6">
        {players.map((player) => (
          <PlayerNudgeRow
            key={player.teamMemberId}
            teamId={teamId}
            initialPlayer={player}
          />
        ))}
      </div>
    </section>
  );
}
