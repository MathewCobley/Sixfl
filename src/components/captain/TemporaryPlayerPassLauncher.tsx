"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useSearchParams } from "next/navigation";

type PassChoice = {
  fixtureId: string;
  teamId: string;
  teamName: string;
  opponentName: string;
  kickoffAt: string;
  venueName: string | null;
  pitch: string | null;
};

type PlayerPass = PassChoice & {
  id: string;
  code: string;
  status: "OPEN" | "ACCEPTED" | "REVOKED" | "EXPIRED";
  expiresAt: string;
  createdAt: string;
};

type PlayerPassPayload = {
  player: { firstName: string };
  choices: PassChoice[];
  passes: PlayerPass[];
};

type LinkedTemporaryPlayer = {
  id: string;
  firstName: string;
  surnameInitial: string;
  email: string | null;
  status: "OPEN" | "PAID" | "WAIVED" | "CANCELLED";
  amountPence: number;
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
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

function passStatusLabel(status: PlayerPass["status"]) {
  switch (status) {
    case "ACCEPTED":
      return "Accepted";
    case "REVOKED":
      return "Cancelled";
    case "EXPIRED":
      return "Expired";
    default:
      return "Waiting for captain";
  }
}

function passStatusClasses(status: PlayerPass["status"]) {
  switch (status) {
    case "ACCEPTED":
      return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
    case "REVOKED":
    case "EXPIRED":
      return "border-white/10 bg-white/[0.04] text-white/55";
    default:
      return "border-amber-400/25 bg-amber-500/10 text-amber-100";
  }
}

function linkedPlayerStatusLabel(status: LinkedTemporaryPlayer["status"]) {
  switch (status) {
    case "PAID":
      return "Paid";
    case "WAIVED":
      return "No fee";
    case "CANCELLED":
      return "Cancelled";
    default:
      return "Awaiting payment";
  }
}

export default function TemporaryPlayerPassLauncher() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [playerData, setPlayerData] = useState<PlayerPassPayload | null>(null);
  const [selection, setSelection] = useState("");
  const [linkedPlayers, setLinkedPlayers] = useState<LinkedTemporaryPlayer[]>([]);
  const [linkedFeeAmounts, setLinkedFeeAmounts] = useState<Record<string, string>>(
    {},
  );

  useEffect(() => setMounted(true), []);

  const captainMatch = pathname.match(/^\/captain\/team\/([^/]+)\/match-fees\/?$/);
  const isPlayerArea = pathname.startsWith("/player");
  const teamId = captainMatch?.[1] ?? "";
  const fixtureId = searchParams.get("fixtureId") ?? "";
  const previewMembershipId =
    isPlayerArea ? searchParams.get("previewMembershipId")?.trim() || null : null;

  function playerPassApiUrl() {
    if (!previewMembershipId) return "/api/player/temporary-pass";
    return `/api/player/temporary-pass?previewMembershipId=${encodeURIComponent(previewMembershipId)}`;
  }

  const openPasses = useMemo(
    () => playerData?.passes.filter((pass) => pass.status === "OPEN") ?? [],
    [playerData],
  );

  async function loadPlayerPasses() {
    if (!isPlayerArea) return;
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch(playerPassApiUrl(), { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as
        | (PlayerPassPayload & { error?: string })
        | null;
      if (!response.ok || !payload) {
        throw new Error(payload?.error || "Temporary-player passes could not be loaded.");
      }
      setPlayerData(payload);
      if (!selection && payload.choices[0]) {
        setSelection(`${payload.choices[0].fixtureId}|${payload.choices[0].teamId}`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Temporary-player passes could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  async function loadLinkedTemporaryPlayers() {
    if (!teamId || !fixtureId) {
      setLinkedPlayers([]);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `/api/captain/team/${teamId}/temporary-player?fixtureId=${encodeURIComponent(fixtureId)}`,
        { cache: "no-store" },
      );
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; players?: LinkedTemporaryPlayer[] }
        | null;
      if (!response.ok) {
        throw new Error(payload?.error || "Temporary players could not be loaded.");
      }

      const players = payload?.players ?? [];
      setLinkedPlayers(players);
      setLinkedFeeAmounts(
        Object.fromEntries(
          players.map((player) => [
            player.id,
            (player.amountPence / 100).toFixed(2),
          ]),
        ),
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Temporary players could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function openLauncher() {
    setMessage("");
    setOpen(true);
    if (isPlayerArea) {
      await loadPlayerPasses();
    } else if (captainMatch) {
      await loadLinkedTemporaryPlayers();
    }
  }

  async function createPass() {
    const [selectedFixtureId, selectedTeamId] = selection.split("|");
    if (!selectedFixtureId || !selectedTeamId) {
      setMessage("Choose the team and fixture you want to share with.");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/player/temporary-pass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fixtureId: selectedFixtureId,
          teamId: selectedTeamId,
          previewMembershipId,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; pass?: PlayerPass }
        | null;
      if (!response.ok || !payload?.pass) {
        throw new Error(payload?.error || "The temporary-player pass could not be created.");
      }
      setMessage(`Your one-time pass ${payload.pass.code} is ready to share.`);
      await loadPlayerPasses();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The temporary-player pass could not be created.");
    } finally {
      setBusy(false);
    }
  }

  async function revokePass(passId: string) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/player/temporary-pass", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passId, previewMembershipId }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error || "That pass could not be cancelled.");
      }
      setMessage("The temporary-player pass has been cancelled.");
      await loadPlayerPasses();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "That pass could not be cancelled.");
    } finally {
      setBusy(false);
    }
  }

  function shareText(pass: PlayerPass) {
    return [
      `I can play for ${pass.teamName} against ${pass.opponentName} on ${formatDateTime(pass.kickoffAt)}.`,
      `My one-time SIXFL temporary-player pass is ${pass.code}.`,
      "Add this pass to that fixture in the SIXFL Matchday Squad page.",
      `It expires ${formatDateTime(pass.expiresAt)} and only works for this team and fixture.`,
    ].join(" ");
  }

  async function sharePass(pass: PlayerPass) {
    const text = shareText(pass);
    try {
      if (navigator.share) {
        await navigator.share({ title: "SIXFL temporary-player pass", text });
      } else {
        await navigator.clipboard.writeText(text);
        setMessage("Pass details copied. You can now paste them into WhatsApp or a message.");
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      await navigator.clipboard.writeText(text);
      setMessage("Pass details copied. You can now paste them into WhatsApp or a message.");
    }
  }

  async function submitCaptainPass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!teamId || !fixtureId) {
      setMessage("Choose the fixture first, then add the temporary player.");
      return;
    }

    const form = new FormData(event.currentTarget);
    const passCode = String(form.get("passCode") ?? "").trim();
    const amount = String(form.get("amount") ?? "").trim();
    if (!amount) {
      setMessage(
        "Enter the temporary player's match fee before linking them. Use £0 if no fee is due.",
      );
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const response = await fetch(`/api/captain/team/${teamId}/temporary-player`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixtureId, passCode, amount }),
      });
      const result = (await response.json().catch(() => null)) as
        | {
            error?: string;
            player?: { displayName: string; amountPence: number };
          }
        | null;
      if (!response.ok || !result?.player) {
        throw new Error(result?.error || "The temporary player could not be added.");
      }

      setMessage(
        result.player.amountPence > 0
          ? `${result.player.displayName} has been linked as a temporary player with a ${formatMoney(result.player.amountPence)} match fee.`
          : `${result.player.displayName} has been linked as a temporary player with no match fee.`,
      );
      window.setTimeout(() => window.location.reload(), 900);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The temporary player could not be added.");
    } finally {
      setBusy(false);
    }
  }

  async function updateLinkedTemporaryPlayerFee(player: LinkedTemporaryPlayer) {
    const amount = linkedFeeAmounts[player.id]?.trim() ?? "";
    if (!amount) {
      setMessage("Enter the match fee to save. Use £0 if no fee is due.");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/captain/team/${teamId}/temporary-player`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixtureId, feeId: player.id, amount }),
      });
      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string;
            player?: { displayName: string; amountPence: number; status: string };
          }
        | null;
      if (!response.ok || !payload?.player) {
        throw new Error(payload?.error || "The temporary-player fee could not be updated.");
      }

      setMessage(
        payload.player.amountPence > 0
          ? `${payload.player.displayName}'s temporary-player fee is now ${formatMoney(payload.player.amountPence)}.`
          : `${payload.player.displayName} now has no match fee for this fixture.`,
      );
      await loadLinkedTemporaryPlayers();
      window.setTimeout(() => window.location.reload(), 900);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The temporary-player fee could not be updated.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!mounted || (!captainMatch && !isPlayerArea)) return null;

  return createPortal(
    <>
      <button
        type="button"
        onClick={() => void openLauncher()}
        className={
          captainMatch
            ? "fixed bottom-5 right-5 z-[90] rounded-full bg-emerald-400 px-5 py-3 text-sm font-bold text-black shadow-2xl hover:bg-emerald-300"
            : "fixed bottom-5 right-5 z-[90] rounded-full border border-emerald-400/30 bg-[#10241b] px-5 py-3 text-sm font-semibold text-emerald-100 shadow-2xl hover:bg-[#163326]"
        }
      >
        {captainMatch ? "+ Add temporary player" : "Play for another team"}
      </button>

      {open ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/75 p-4" role="dialog" aria-modal="true">
          <div className="my-8 w-full max-w-xl rounded-3xl border border-white/15 bg-[#111821] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white">
                  {captainMatch ? "Add a temporary player" : "Share a temporary-player pass"}
                </h2>
                <p className="mt-2 text-sm leading-6 text-white/65">
                  {captainMatch
                    ? "The player must create the pass from their own dashboard first. Enter the code and choose what this team wants them to pay for this fixture."
                    : "Choose the team and fixture you are offering to play in. You stay in control: the pass works once, expires automatically and can be cancelled before the captain accepts it."}
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="text-2xl leading-none text-white/60 hover:text-white" aria-label="Close">
                ×
              </button>
            </div>

            {captainMatch ? (
              <div className="mt-6 space-y-5">
                <form onSubmit={submitCaptainPass} className="space-y-4">
                  <label className="block text-sm font-semibold text-white">
                    One-time player pass
                    <input
                      name="passCode"
                      required
                      placeholder="TP-7K4P9A"
                      autoComplete="off"
                      className="mt-2 w-full rounded-xl border border-white/15 bg-black/25 px-4 py-3 font-mono uppercase text-white outline-none focus:border-emerald-400"
                    />
                  </label>
                  <label className="block text-sm font-semibold text-white">
                    Match fee for this temporary player
                    <div className="relative mt-2">
                      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-white/45">
                        £
                      </span>
                      <input
                        name="amount"
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        inputMode="decimal"
                        required
                        placeholder="Enter amount"
                        className="w-full rounded-xl border border-white/15 bg-black/25 py-3 pl-7 pr-4 text-white outline-none placeholder:text-white/30 focus:border-emerald-400"
                      />
                    </div>
                    <span className="mt-1 block text-xs font-normal text-white/45">
                      The team chooses the amount. Enter 0 if no match fee is due.
                    </span>
                  </label>
                  {message ? <p className="rounded-xl bg-white/[0.06] px-4 py-3 text-sm text-white/80">{message}</p> : null}
                  <button disabled={busy} className="w-full rounded-xl bg-emerald-400 px-4 py-3 font-bold text-black hover:bg-emerald-300 disabled:opacity-50">
                    {busy ? "Adding player…" : "Link temporary player and set fee"}
                  </button>
                </form>

                {loading ? (
                  <p className="rounded-xl bg-white/[0.06] px-4 py-3 text-sm text-white/70">
                    Loading temporary players…
                  </p>
                ) : null}

                {linkedPlayers.length > 0 ? (
                  <section className="space-y-3 border-t border-white/10 pt-5">
                    <div>
                      <h3 className="font-semibold text-white">
                        Temporary players linked to this fixture
                      </h3>
                      <p className="mt-1 text-xs leading-5 text-white/45">
                        The team can revise an unpaid temporary-player fee here. Paid fees stay locked for safe reconciliation.
                      </p>
                    </div>
                    {linkedPlayers.map((player) => {
                      const playerName = `${player.firstName}${
                        player.surnameInitial ? ` ${player.surnameInitial}.` : ""
                      }`;
                      const locked = player.status === "PAID" || player.status === "CANCELLED";

                      return (
                        <article
                          key={player.id}
                          className="rounded-2xl border border-violet-400/20 bg-violet-500/[0.07] p-4"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-white">{playerName}</p>
                            <span className="rounded-full border border-violet-400/25 bg-violet-500/10 px-2.5 py-1 text-[11px] font-semibold text-violet-100">
                              Temporary player
                            </span>
                            <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] text-white/60">
                              {linkedPlayerStatusLabel(player.status)}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-white/45">
                            {player.email || "Player account linked"}
                          </p>
                          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                            <div className="relative flex-1">
                              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-white/45">
                                £
                              </span>
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                inputMode="decimal"
                                disabled={locked || busy}
                                value={linkedFeeAmounts[player.id] ?? ""}
                                onChange={(event) =>
                                  setLinkedFeeAmounts((current) => ({
                                    ...current,
                                    [player.id]: event.target.value,
                                  }))
                                }
                                className="w-full rounded-xl border border-white/15 bg-black/25 py-2.5 pl-7 pr-3 text-white outline-none focus:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                              />
                            </div>
                            <button
                              type="button"
                              disabled={locked || busy}
                              onClick={() => void updateLinkedTemporaryPlayerFee(player)}
                              className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Update fee
                            </button>
                          </div>
                          {locked ? (
                            <p className="mt-2 text-xs text-white/45">
                              Current fee: {formatMoney(player.amountPence)}. This fee is locked because it is {player.status.toLowerCase()}.
                            </p>
                          ) : null}
                        </article>
                      );
                    })}
                  </section>
                ) : null}
              </div>
            ) : (
              <div className="mt-6 space-y-5">
                {loading ? (
                  <p className="rounded-xl bg-white/[0.06] px-4 py-3 text-sm text-white/70">Loading upcoming fixtures…</p>
                ) : null}

                {playerData && playerData.choices.length > 0 ? (
                  <div className="space-y-3">
                    <label className="block text-sm font-semibold text-white">
                      Team and fixture
                      <select
                        value={selection}
                        onChange={(event) => setSelection(event.target.value)}
                        className="mt-2 w-full rounded-xl border border-white/15 bg-[#0b1118] px-4 py-3 text-white outline-none focus:border-emerald-400"
                      >
                        {playerData.choices.map((choice) => (
                          <option
                            key={`${choice.fixtureId}:${choice.teamId}`}
                            value={`${choice.fixtureId}|${choice.teamId}`}
                          >
                            {choice.teamName} · {formatDateTime(choice.kickoffAt)} vs {choice.opponentName}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void createPass()}
                      className="w-full rounded-xl bg-emerald-400 px-4 py-3 font-bold text-black hover:bg-emerald-300 disabled:opacity-50"
                    >
                      {busy ? "Creating pass…" : "Create one-time pass"}
                    </button>
                  </div>
                ) : playerData && !loading ? (
                  <p className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm leading-6 text-white/65">
                    No suitable published fixtures were found in the next three weeks. The team may need to publish or confirm the fixture first.
                  </p>
                ) : null}

                {message ? <p className="rounded-xl bg-white/[0.06] px-4 py-3 text-sm text-white/80">{message}</p> : null}

                {openPasses.length > 0 ? (
                  <section className="space-y-3 border-t border-white/10 pt-5">
                    <h3 className="font-semibold text-white">Passes waiting for a captain</h3>
                    {openPasses.map((pass) => (
                      <article key={pass.id} className="rounded-2xl border border-amber-400/20 bg-amber-500/[0.08] p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-white">{pass.teamName} vs {pass.opponentName}</p>
                            <p className="mt-1 text-xs text-white/55">{formatDateTime(pass.kickoffAt)}{pass.venueName ? ` · ${pass.venueName}` : ""}</p>
                          </div>
                          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${passStatusClasses(pass.status)}`}>
                            {passStatusLabel(pass.status)}
                          </span>
                        </div>
                        <div className="mt-4 rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-center font-mono text-2xl font-bold tracking-wider text-white">
                          {pass.code}
                        </div>
                        <p className="mt-2 text-center text-xs text-white/50">Expires {formatDateTime(pass.expiresAt)}</p>
                        <div className="mt-4 grid gap-2 sm:grid-cols-2">
                          <button type="button" onClick={() => void sharePass(pass)} className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/15">
                            Share pass
                          </button>
                          <button type="button" disabled={busy} onClick={() => void revokePass(pass.id)} className="rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-100 hover:bg-red-500/15 disabled:opacity-50">
                            Cancel pass
                          </button>
                        </div>
                      </article>
                    ))}
                  </section>
                ) : null}

                {playerData && playerData.passes.some((pass) => pass.status !== "OPEN") ? (
                  <section className="space-y-2 border-t border-white/10 pt-5">
                    <h3 className="text-sm font-semibold text-white/75">Recent passes</h3>
                    {playerData.passes
                      .filter((pass) => pass.status !== "OPEN")
                      .slice(0, 5)
                      .map((pass) => (
                        <div key={pass.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm">
                          <span className="min-w-0 truncate text-white/65">{pass.teamName} · {formatDateTime(pass.kickoffAt)}</span>
                          <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs ${passStatusClasses(pass.status)}`}>
                            {passStatusLabel(pass.status)}
                          </span>
                        </div>
                      ))}
                  </section>
                ) : null}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>,
    document.body,
  );
}
