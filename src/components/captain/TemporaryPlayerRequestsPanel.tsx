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

function formatMoney(amountPence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountPence / 100);
}

export default function TemporaryPlayerRequestsPanel() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [feeAmounts, setFeeAmounts] = useState<Record<string, string>>({});
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
          const nextRequests = payload?.requests ?? [];
          setRequests(nextRequests);
          setFeeAmounts((current) => {
            const next: Record<string, string> = {};
            for (const item of nextRequests) next[item.id] = current[item.id] ?? "";
            return next;
          });
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
    const amount = feeAmounts[requestId]?.trim() ?? "";
    if (decision === "accept" && !amount) {
      setMessage(
        "Enter this temporary player's match fee before accepting. Use £0 if no fee is due.",
      );
      return;
    }

    setBusyId(requestId);
    setMessage("");

    try {
      const response = await fetch(
        `/api/captain/team/${teamId}/temporary-player-requests`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fixtureId,
            requestId,
            decision,
            ...(decision === "accept" ? { amount } : {}),
          }),
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string;
            player?: { displayName?: string; amountPence?: number };
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
      setFeeAmounts((current) => {
        const next = { ...current };
        delete next[requestId];
        return next;
      });

      const playerName = payload?.player?.displayName ?? "The player";
      if (decision === "accept") {
        const amountPence = payload?.player?.amountPence ?? 0;
        setMessage(
          amountPence > 0
            ? `${playerName} has been added as a temporary player. Their match fee is ${formatMoney(amountPence)}.`
            : `${playerName} has been added as a temporary player with no match fee.`,
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
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-white">{request.displayName}</p>
                  <span className="rounded-full border border-violet-400/25 bg-violet-500/10 px-2.5 py-1 text-[11px] font-semibold text-violet-100">
                    Temporary player
                  </span>
                </div>
                <p className="mt-1 text-sm leading-6 text-white/65">
                  Wants to play for your team in this fixture. Choose what they
                  should pay before accepting. The request expires at {formatTime(request.expiresAt)}.
                </p>

                <label className="mt-4 block text-sm font-semibold text-white">
                  Match fee for this temporary player
                  <div className="relative mt-2">
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-white/45">
                      £
                    </span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      inputMode="decimal"
                      value={feeAmounts[request.id] ?? ""}
                      onChange={(event) =>
                        setFeeAmounts((current) => ({
                          ...current,
                          [request.id]: event.target.value,
                        }))
                      }
                      placeholder="Enter amount"
                      className="w-full rounded-xl border border-white/15 bg-black/25 py-2.5 pl-7 pr-3 text-white outline-none placeholder:text-white/30 focus:border-emerald-400"
                    />
                  </div>
                  <span className="mt-1 block text-xs font-normal text-white/45">
                    Enter 0 if no match fee is due. Nothing is assumed automatically.
                  </span>
                </label>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={Boolean(busyId)}
                    onClick={() => void decide(request.id, "accept")}
                    className="rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-bold text-black transition hover:bg-emerald-300 disabled:opacity-50"
                  >
                    {busyId === request.id ? "Updating…" : "Accept and set fee"}
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
