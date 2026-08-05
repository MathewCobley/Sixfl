"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useSearchParams } from "next/navigation";

type PendingRequest = {
  id: string;
  displayName: string;
  createdAt: string;
  expiresAt: string;
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function TemporaryPlayerRequestsPanel() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => setMounted(true), []);

  const captainMatch = pathname.match(
    /^\/captain\/team\/([^/]+)\/match-fees\/?$/,
  );
  const teamId = captainMatch?.[1] ?? "";
  const fixtureId = searchParams.get("fixtureId") ?? "";

  useEffect(() => {
    if (!teamId || !fixtureId) {
      setRequests([]);
      return;
    }

    let cancelled = false;

    async function loadRequests() {
      try {
        const response = await fetch(
          `/api/captain/team/${teamId}/temporary-player-requests?fixtureId=${encodeURIComponent(fixtureId)}`,
          { cache: "no-store" },
        );
        const payload = (await response.json().catch(() => null)) as
          | { requests?: PendingRequest[] }
          | null;
        if (!cancelled && response.ok) {
          setRequests(payload?.requests ?? []);
        }
      } catch {
        // Keep the current panel state if a background refresh fails.
      }
    }

    void loadRequests();
    const timer = window.setInterval(() => void loadRequests(), 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [fixtureId, teamId]);

  async function decide(requestId: string, decision: "accept" | "decline") {
    setBusyId(requestId);
    setMessage("");

    try {
      const response = await fetch(
        `/api/captain/team/${teamId}/temporary-player-requests`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fixtureId, requestId, decision }),
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string;
            player?: { displayName?: string };
            decision?: string;
          }
        | null;

      if (!response.ok) {
        throw new Error(
          payload?.error ?? "The temporary-player request could not be updated.",
        );
      }

      setRequests((current) =>
        current.filter((request) => request.id !== requestId),
      );

      const playerName = payload?.player?.displayName ?? "The player";
      if (decision === "accept") {
        setMessage(
          `${playerName} has been added to this fixture and their £6 match fee is now open.`,
        );
        window.setTimeout(() => window.location.reload(), 900);
      } else {
        setMessage(`${playerName}'s request has been declined.`);
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The temporary-player request could not be updated.",
      );
    } finally {
      setBusyId(null);
    }
  }

  if (!mounted || !teamId || !fixtureId || (requests.length === 0 && !message)) {
    return null;
  }

  return createPortal(
    <aside className="fixed bottom-5 left-5 z-[92] w-[min(26rem,calc(100vw-2.5rem))] rounded-3xl border border-emerald-400/25 bg-[#0b1712]/95 p-5 text-white shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur">
      {requests.length > 0 ? (
        <>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300/75">
                Temporary player request{requests.length === 1 ? "" : "s"}
              </p>
              <h2 className="mt-1 text-lg font-semibold">
                {requests.length === 1
                  ? "A player wants to join this fixture"
                  : `${requests.length} players want to join this fixture`}
              </h2>
            </div>
            <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-100">
              {requests.length}
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {requests.map((request) => (
              <article
                key={request.id}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
              >
                <p className="font-semibold text-white">{request.displayName}</p>
                <p className="mt-1 text-sm leading-6 text-white/65">
                  Wants to play for your team in this fixture and pay the £6 match fee.
                  The request expires at {formatTime(request.expiresAt)}.
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={Boolean(busyId)}
                    onClick={() => void decide(request.id, "accept")}
                    className="rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-bold text-black transition hover:bg-emerald-300 disabled:opacity-50"
                  >
                    {busyId === request.id ? "Updating…" : "Accept"}
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(busyId)}
                    onClick={() => void decide(request.id, "decline")}
                    className="rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-100 transition hover:bg-red-500/15 disabled:opacity-50"
                  >
                    Decline
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      ) : null}

      {message ? (
        <p className="mt-4 rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm leading-6 text-white/80">
          {message}
        </p>
      ) : null}
    </aside>,
    document.body,
  );
}
