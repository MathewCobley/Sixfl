"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type NudgeResponse = {
  ok?: boolean;
  error?: string;
  nudgedAt?: string;
  dispatchStatus?: string;
  nudgedBy?: string;
};

function formatDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function formatStatus(value: string | null) {
  if (!value) return "Recorded";
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function statusClasses(value: string | null) {
  if (value === "SENT") return "text-emerald-200";
  if (value === "FAILED" || value === "CANCELLED" || value === "SKIPPED") {
    return "text-red-200";
  }
  if (value === "QUEUED" || value === "PROCESSING") return "text-amber-200";
  return "text-white/55";
}

export default function PlayerPoolNudgeButton({
  profileId,
  playerName,
  canNudge,
  initialNudgeCount,
  initialLastNudgeAt,
  initialLastNudgeStatus,
  initialLastNudgeBy,
}: {
  profileId: string;
  playerName: string;
  canNudge: boolean;
  initialNudgeCount: number;
  initialLastNudgeAt: string | null;
  initialLastNudgeStatus: string | null;
  initialLastNudgeBy: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nudgeCount, setNudgeCount] = useState(initialNudgeCount);
  const [lastNudgeAt, setLastNudgeAt] = useState(initialLastNudgeAt);
  const [lastNudgeStatus, setLastNudgeStatus] = useState(initialLastNudgeStatus);
  const [lastNudgeBy, setLastNudgeBy] = useState(initialLastNudgeBy);

  async function sendNudge() {
    const confirmed = window.confirm(
      `Send a PlayerPool profile reminder to ${playerName}?\n\nThis sends the full PlayerPool explanation and their secure profile form link.`,
    );
    if (!confirmed) return;

    setPending(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/admin/player-pool/${encodeURIComponent(profileId)}/nudge`,
        { method: "POST" },
      );
      const payload = (await response.json().catch(() => null)) as NudgeResponse | null;

      if (!response.ok || !payload?.ok || !payload.nudgedAt) {
        throw new Error(payload?.error || "The profile reminder could not be sent.");
      }

      setNudgeCount((value) => value + 1);
      setLastNudgeAt(payload.nudgedAt);
      setLastNudgeStatus(payload.dispatchStatus ?? "QUEUED");
      setLastNudgeBy(payload.nudgedBy ?? "SIXFL admin");
      setSent(true);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The profile reminder could not be sent.",
      );
    } finally {
      setPending(false);
    }
  }

  const formattedLastNudge = formatDate(lastNudgeAt);

  return (
    <div className="min-w-0 flex-1">
      <div className="text-xs leading-5 text-white/45">
        {nudgeCount > 0 && formattedLastNudge ? (
          <>
            <span className="font-semibold text-white/70">
              Last profile email: {formattedLastNudge}
            </span>
            <span className={`ml-2 font-semibold ${statusClasses(lastNudgeStatus)}`}>
              {formatStatus(lastNudgeStatus)}
            </span>
            {lastNudgeBy ? <span className="ml-2">by {lastNudgeBy}</span> : null}
            <span className="ml-2">
              · {nudgeCount} reminder{nudgeCount === 1 ? "" : "s"} recorded
            </span>
          </>
        ) : (
          <span>No profile reminder email sent yet.</span>
        )}
      </div>

      {error ? (
        <div className="mt-2 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-100">
          {error}
        </div>
      ) : null}

      {canNudge ? (
        <button
          type="button"
          onClick={sendNudge}
          disabled={pending}
          className={[
            "mt-3 inline-flex min-h-10 items-center justify-center rounded-xl border px-4 py-2 text-xs font-bold transition disabled:cursor-wait disabled:opacity-60",
            sent
              ? "border-emerald-400/35 bg-emerald-500/15 text-emerald-100"
              : "border-amber-400/30 bg-amber-500/10 text-amber-100 hover:border-amber-400/45 hover:bg-amber-500/15",
          ].join(" ")}
        >
          {pending
            ? "Queueing…"
            : sent
              ? "Reminder queued ✓"
              : "Send profile reminder"}
        </button>
      ) : null}
    </div>
  );
}
