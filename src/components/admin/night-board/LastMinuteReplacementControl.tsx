"use client";

import { useEffect, useState } from "react";

type Result = {
  ok?: boolean;
  error?: string;
  eligibleTeams?: Array<{ id: string; name: string }>;
  email?: { sent: number; skipped: number; failed: number; queued: number };
  sms?: { sent: number; skipped: number; failed: number; queued: number };
};

type ControlState =
  | { status: "idle" }
  | { status: "alert_sent"; droppedTeamId: string }
  | {
      status: "resolved";
      droppedTeamId: string;
      replacementTeamId: string;
      replacementTeamName: string;
      opponentTeamId: string;
      opponentTeamName: string;
      resolvedAt: string;
    };

export default function LastMinuteReplacementControl({
  fixtureId,
  droppedTeamId,
  teamName,
}: {
  fixtureId: string;
  droppedTeamId: string;
  teamName: string;
}) {
  const [sending, setSending] = useState(false);
  const [controlState, setControlState] = useState<ControlState>({ status: "idle" });
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadState() {
      try {
        // If the fixture teams have already been changed after an alert was sent,
        // reconcile it now. The server is idempotent, so both team controls can
        // safely ask without creating duplicate messages.
        await fetch("/api/admin/night-board/last-minute-replacement/reconcile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fixtureId }),
          cache: "no-store",
        });

        const params = new URLSearchParams({ fixtureId, currentTeamId: droppedTeamId });
        const response = await fetch(
          `/api/admin/night-board/last-minute-replacement?${params.toString()}`,
          { cache: "no-store" },
        );
        const payload = (await response.json().catch(() => null)) as
          | { ok?: boolean; state?: ControlState }
          | null;

        if (!cancelled && response.ok && payload?.ok && payload.state) {
          setControlState(payload.state);
        }
      } catch {
        // Keep the manual alert control available if the status check cannot be loaded.
      }
    }

    void loadState();
    return () => {
      cancelled = true;
    };
  }, [fixtureId, droppedTeamId]);

  const sent = controlState.status === "alert_sent";

  async function sendAlert() {
    if (sending || sent || controlState.status === "resolved") return;

    const confirmed = window.confirm(
      `Send a last-minute FREE fixture alert by email and SMS to every eligible team in this league because ${teamName} has dropped out?`,
    );
    if (!confirmed) return;

    setSending(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/night-board/last-minute-replacement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixtureId, droppedTeamId }),
      });
      const payload = (await response.json().catch(() => null)) as Result | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "The replacement alert could not be sent.");
      }

      const eligible = payload.eligibleTeams?.length ?? 0;
      const emailSent = payload.email?.sent ?? 0;
      const smsSent = payload.sms?.sent ?? 0;
      const queued = (payload.email?.queued ?? 0) + (payload.sms?.queued ?? 0);
      const failures =
        (payload.email?.failed ?? 0) +
        (payload.sms?.failed ?? 0) +
        (payload.email?.skipped ?? 0) +
        (payload.sms?.skipped ?? 0);

      if (eligible > 0) {
        setControlState({ status: "alert_sent", droppedTeamId });
      }
      setMessage(
        eligible === 0
          ? "No eligible teams were available to contact."
          : `Alert sent to ${eligible} eligible team${eligible === 1 ? "" : "s"}: ${emailSent} email${emailSent === 1 ? "" : "s"} and ${smsSent} SMS sent${queued ? ` · ${queued} still queued` : ""}${failures ? ` · ${failures} skipped/failed` : ""}.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The replacement alert could not be sent.",
      );
    } finally {
      setSending(false);
    }
  }

  if (controlState.status === "resolved") {
    const isReplacement = controlState.replacementTeamId === droppedTeamId;
    const isOpponent = controlState.opponentTeamId === droppedTeamId;
    const label = isReplacement
      ? "✓ Last-minute replacement confirmed"
      : isOpponent
        ? `Replacement confirmed · ${controlState.replacementTeamName}`
        : `Replacement resolved · ${controlState.replacementTeamName}`;

    return (
      <div className="mt-1 inline-flex max-w-full rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-100">
        {label}
      </div>
    );
  }

  return (
    <div className="mt-1">
      <label
        className={[
          "inline-flex items-center gap-2 rounded-lg border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em]",
          sent
            ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
            : "cursor-pointer border-amber-400/25 bg-amber-500/10 text-amber-100 hover:bg-amber-500/15",
          sending ? "cursor-wait opacity-70" : "",
        ].join(" ")}
      >
        <input
          type="checkbox"
          checked={sent}
          disabled={sending || sent}
          onChange={() => void sendAlert()}
          className="h-3.5 w-3.5 accent-amber-300"
        />
        {sending ? "Sending alert…" : sent ? "Replacement alert sent" : "Last minute replace"}
      </label>
      {message ? (
        <div className={`mt-1 max-w-sm text-[10px] leading-4 ${sent ? "text-emerald-100/75" : "text-red-200"}`}>
          {message}
        </div>
      ) : null}
    </div>
  );
}
