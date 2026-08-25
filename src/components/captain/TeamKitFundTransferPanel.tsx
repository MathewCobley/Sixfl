"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type KitFundEntry = {
  id: string;
  entryType: "FUND_ADDED" | "FUND_USED" | "FUND_RESTORED";
  amountPence: number;
  description: string | null;
  createdAtIso: string;
};

function formatMoney(amountPence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountPence / 100);
}

function formatEntryType(entryType: KitFundEntry["entryType"]) {
  if (entryType === "FUND_ADDED") return "Added to kit fund";
  if (entryType === "FUND_USED") return "Used for kits";
  return "Restored to kit fund";
}

export default function TeamKitFundTransferPanel({
  teamId,
  teamCreditPence,
  kitFundBalancePence,
  entries,
}: {
  teamId: string;
  teamCreditPence: number;
  kitFundBalancePence: number;
  entries: KitFundEntry[];
}) {
  const router = useRouter();
  const defaultMovePence = Math.min(teamCreditPence, 2000);
  const [amount, setAmount] = useState(
    defaultMovePence > 0 ? (defaultMovePence / 100).toFixed(2) : "",
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const wholeKits = Math.floor(kitFundBalancePence / 2000);
  const remainderPence = kitFundBalancePence % 2000;
  const amountPence = useMemo(() => {
    const pounds = Number(amount);
    return Number.isFinite(pounds) ? Math.round(pounds * 100) : 0;
  }, [amount]);

  async function moveCredit(pence = amountPence) {
    if (pence <= 0 || pence > teamCreditPence) return;

    setBusy(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(
        `/api/captain/team/${encodeURIComponent(teamId)}/kit-fund/transfer`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amountPence: pence }),
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string;
            amountMovedPence?: number;
            kitFundBalancePence?: number;
          }
        | null;

      if (!response.ok || !payload) {
        throw new Error(payload?.error || "The credit could not be moved.");
      }

      setMessage(
        `${formatMoney(payload.amountMovedPence ?? pence)} moved to the kit fund. It is now reserved for SIXFL kits and no longer counts as match-fee credit.`,
      );
      setAmount("");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The credit could not be moved to the kit fund.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-3xl border border-sky-400/20 bg-sky-500/[0.07] p-5 sm:p-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-100/70">
            Kit fund
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white">
            {formatMoney(kitFundBalancePence)} set aside for kits
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-sky-50/75">
            Move surplus team credit here when the team wants to save it for kits instead of using it against the next match fee. Kit fund money is separate from the one-match-fee team-credit cap and is automatically used first when extra kits are ordered.
          </p>

          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-white/65">
              Team credit available: {formatMoney(teamCreditPence)}
            </span>
            <span className="rounded-full border border-sky-300/20 bg-sky-400/10 px-3 py-1.5 text-sky-100">
              {wholeKits} full kit{wholeKits === 1 ? "" : "s"}
              {remainderPence > 0 ? ` + ${formatMoney(remainderPence)} toward another` : ""}
            </span>
          </div>

          {teamCreditPence > 0 ? (
            <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
              <label className="block text-sm font-semibold text-white" htmlFor="kit-fund-amount">
                Move team credit to kit fund
              </label>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                <div className="flex h-11 flex-1 items-center rounded-xl border border-white/10 bg-black/30 px-3">
                  <span className="mr-2 text-white/45">£</span>
                  <input
                    id="kit-fund-amount"
                    inputMode="decimal"
                    type="number"
                    min="0.01"
                    max={(teamCreditPence / 100).toFixed(2)}
                    step="0.01"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    className="w-full bg-transparent text-white outline-none"
                  />
                </div>
                <button
                  type="button"
                  disabled={busy || amountPence <= 0 || amountPence > teamCreditPence}
                  onClick={() => void moveCredit()}
                  className="inline-flex h-11 items-center justify-center rounded-xl bg-sky-300 px-5 text-sm font-semibold text-black transition hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? "Moving…" : "Move to kit fund"}
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {teamCreditPence >= 2000 ? (
                  <button type="button" disabled={busy} onClick={() => void moveCredit(2000)} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/[0.08]">
                    Move £20
                  </button>
                ) : null}
                {teamCreditPence >= 4000 ? (
                  <button type="button" disabled={busy} onClick={() => void moveCredit(4000)} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/[0.08]">
                    Move £40
                  </button>
                ) : null}
                <button type="button" disabled={busy} onClick={() => void moveCredit(teamCreditPence)} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/[0.08]">
                  Move all {formatMoney(teamCreditPence)}
                </button>
              </div>

              <p className="mt-3 text-xs leading-5 text-white/45">
                Moving money to the kit fund is a one-way captain action. The fund can only be used for SIXFL kit charges; an admin can correct a mistake if needed.
              </p>
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/55">
              There is no match-fee team credit available to move at the moment.
            </div>
          )}

          {message ? <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{message}</div> : null}
          {error ? <div className="mt-4 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</div> : null}
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-sm font-semibold text-white">Recent kit fund activity</div>
          <div className="mt-3 space-y-2">
            {entries.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-white/45">
                No kit fund movements yet.
              </div>
            ) : (
              entries.map((entry) => {
                const positive = entry.entryType !== "FUND_USED";
                return (
                  <div key={entry.id} className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-white">{formatEntryType(entry.entryType)}</div>
                        <div className="mt-1 text-xs leading-5 text-white/45">{entry.description || "Kit fund movement"}</div>
                        <div className="mt-1 text-[11px] text-white/35">{new Date(entry.createdAtIso).toLocaleString("en-GB")}</div>
                      </div>
                      <div className={positive ? "font-semibold text-emerald-100" : "font-semibold text-amber-100"}>
                        {positive ? "+" : "−"}{formatMoney(entry.amountPence)}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
