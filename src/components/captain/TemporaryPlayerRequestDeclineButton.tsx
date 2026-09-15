"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  decideTemporaryPlayerRequest,
  subscribeToTemporaryPlayerDecisions,
} from "./temporary-player-request-client";

export default function TemporaryPlayerRequestDeclineButton({
  teamId, fixtureId, requestId, playerName,
}: {
  teamId: string;
  fixtureId: string;
  requestId: string;
  playerName: string;
}) {
  const router = useRouter();
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [resolved, setResolved] = useState<"accepted" | "declined" | null>(null);
  const [error, setError] = useState("");

  useEffect(() => subscribeToTemporaryPlayerDecisions((decision) => {
    if (decision.teamId === teamId && decision.fixtureId === fixtureId &&
        decision.requestId === requestId) {
      setResolved(decision.result.decision);
      setError("");
    }
  }), [teamId, fixtureId, requestId]);

  async function decline() {
    if (submitting.current || resolved) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      await decideTemporaryPlayerRequest({ teamId, fixtureId, requestId, decision: "decline" });
      setResolved("declined");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The request could not be declined. Refresh before trying again.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="min-w-0 sm:max-w-60">
      <button
        type="button"
        disabled={busy || resolved !== null}
        aria-label={`Decline ${playerName}'s request`}
        onClick={() => void decline()}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-100 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {resolved === "declined" ? "Declined" : resolved === "accepted" ? "Accepted" : busy ? "Declining…" : "Decline"}
      </button>
      {error ? <p role="alert" className="mt-2 text-sm text-red-100">{error}</p> : null}
      {resolved ? <span role="status" className="sr-only">{playerName}&apos;s request has been {resolved}.</span> : null}
    </div>
  );
}
