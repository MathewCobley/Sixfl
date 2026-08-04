"use client";

import { FormEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useSearchParams } from "next/navigation";

type PlayerCode = { playerCode: string; firstName: string };

export default function TemporaryPlayerBridge() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [playerCode, setPlayerCode] = useState<PlayerCode | null>(null);

  useEffect(() => setMounted(true), []);

  const captainMatch = pathname.match(/^\/captain\/team\/([^/]+)\/match-fees\/?$/);
  const isPlayerArea = pathname.startsWith("/player");
  const teamId = captainMatch?.[1] ?? "";
  const fixtureId = searchParams.get("fixtureId") ?? "";

  useEffect(() => {
    if (!isPlayerArea || playerCode) return;
    fetch("/api/player-code", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => data && setPlayerCode(data))
      .catch(() => null);
  }, [isPlayerArea, playerCode]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!teamId || !fixtureId) {
      setMessage("Choose a fixture first, then add the temporary player.");
      return;
    }

    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");

    const response = await fetch(`/api/captain/team/${teamId}/temporary-player`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fixtureId,
        firstName: form.get("firstName"),
        playerCode: form.get("playerCode"),
      }),
    });

    const result = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      setMessage(result.error || "The temporary player could not be added.");
      return;
    }

    setMessage(`${result.player.displayName} has been added as a temporary player.`);
    window.setTimeout(() => window.location.reload(), 700);
  }

  if (!mounted || (!captainMatch && !isPlayerArea)) return null;

  return createPortal(
    <>
      {captainMatch ? (
        <button
          type="button"
          onClick={() => {
            setMessage("");
            setOpen(true);
          }}
          className="fixed bottom-5 right-5 z-[90] rounded-full bg-emerald-400 px-5 py-3 text-sm font-bold text-black shadow-2xl hover:bg-emerald-300"
        >
          + Add temporary player
        </button>
      ) : null}

      {isPlayerArea && playerCode ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-[90] rounded-full border border-white/15 bg-[#151b24] px-5 py-3 text-sm font-semibold text-white shadow-2xl hover:bg-[#1d2632]"
        >
          My SIXFL Player Code
        </button>
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-3xl border border-white/15 bg-[#111821] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white">
                  {captainMatch ? "Add temporary player" : "Your SIXFL Player Code"}
                </h2>
                <p className="mt-2 text-sm leading-6 text-white/65">
                  {captainMatch
                    ? "Enter the first name and private code given to you by the player. Their email address and phone number remain hidden."
                    : "Share this code and your first name with a captain when playing temporarily for another team."}
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="text-2xl leading-none text-white/60 hover:text-white" aria-label="Close">
                ×
              </button>
            </div>

            {captainMatch ? (
              <form onSubmit={submit} className="mt-6 space-y-4">
                <label className="block text-sm font-semibold text-white">
                  First name
                  <input name="firstName" required autoComplete="off" className="mt-2 w-full rounded-xl border border-white/15 bg-black/25 px-4 py-3 text-white outline-none focus:border-emerald-400" />
                </label>
                <label className="block text-sm font-semibold text-white">
                  SIXFL Player Code
                  <input name="playerCode" required placeholder="SIX-4K7P9ABC" autoComplete="off" className="mt-2 w-full rounded-xl border border-white/15 bg-black/25 px-4 py-3 font-mono uppercase text-white outline-none focus:border-emerald-400" />
                </label>
                {message ? <p className="rounded-xl bg-white/[0.06] px-4 py-3 text-sm text-white/80">{message}</p> : null}
                <button disabled={busy} className="w-full rounded-xl bg-emerald-400 px-4 py-3 font-bold text-black hover:bg-emerald-300 disabled:opacity-50">
                  {busy ? "Adding player…" : "Add to this fixture"}
                </button>
              </form>
            ) : playerCode ? (
              <div className="mt-6 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-5 text-center">
                <div className="text-sm text-emerald-100/75">First name: {playerCode.firstName}</div>
                <div className="mt-2 font-mono text-2xl font-bold tracking-wider text-white">{playerCode.playerCode}</div>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(`${playerCode.firstName} ${playerCode.playerCode}`)}
                  className="mt-4 rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
                >
                  Copy details
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>,
    document.body,
  );
}
