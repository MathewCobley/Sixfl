"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

const money = (pence: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(pence / 100);

const field =
  "mt-2 w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white";
const button =
  "rounded-xl bg-emerald-400 px-5 py-3 font-semibold text-black disabled:opacity-50";

type SaveResult = {
  teamId: string;
  feeId: string;
  previousAssignedPence: number;
  assignedPence: number;
  playerChargePence: number;
  unchanged: boolean;
  adjustmentRecorded?: boolean;
};

export default function CorrectCaptainAssignedShareForm({
  feeId,
  teamId,
  playerChargePence,
  currentAssignedPence,
  suggestedAssignedPence,
  capPence,
  overridePence,
  hasFeeCapEvidence,
  canApplyCurrentCapToFixture,
}: {
  feeId: string;
  teamId: string;
  playerChargePence: number;
  currentAssignedPence: number;
  suggestedAssignedPence: number;
  capPence: number | null;
  overridePence: number | null;
  hasFeeCapEvidence: boolean;
  canApplyCurrentCapToFixture: boolean;
}) {
  const [amount, setAmount] = useState((suggestedAssignedPence / 100).toFixed(2));
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<SaveResult | null>(null);

  const account = `/captain/team/${teamId}/player-payments/account/${feeId}`;
  const adjustmentPence = Math.max(currentAssignedPence - playerChargePence, 0);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const response = await fetch(
        `/api/admin/player-fees/${encodeURIComponent(feeId)}/assigned-share`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            assignedAmount: amount,
            expectedAssignedPence: currentAssignedPence,
            confirmed,
          }),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "The captain share was not changed.");
      }
      setSaved(result);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "The captain share could not be changed. Reload and check the player account.",
      );
    } finally {
      clearTimeout(timeout);
      setBusy(false);
    }
  }

  if (saved) {
    return (
      <section
        role="status"
        className="space-y-4 rounded-2xl border border-emerald-400/30 p-5"
      >
        <h2 className="text-xl font-semibold">
          {saved.adjustmentRecorded
            ? "Fixture adjustment recorded"
            : saved.unchanged
              ? "Captain share already correct"
              : "Captain share corrected"}
        </h2>
        <p>
          Captain-assigned share: <strong>{money(saved.assignedPence)}</strong>.
          The player&apos;s recorded charge remains <strong>{money(saved.playerChargePence)}</strong>.
        </p>
        {saved.adjustmentRecorded ? (
          <p className="text-sm text-white/70">
            The difference is now recorded on this fixture as the player&apos;s SIXFL cap adjustment, so the payment row can settle as the assigned share rather than showing “Check balance”.
          </p>
        ) : null}
        <p className="text-sm text-white/70">
          No payment was taken, no debt was created, no receipt was changed and no email or SMS was sent.
        </p>
        <Link className="text-emerald-200 underline" href={`/captain/team/${teamId}/payments`}>
          Back to team payments
        </Link>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      {error ? (
        <p role="alert" className="rounded-xl border border-red-300/40 p-4 text-red-100">
          {error}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <p className="text-xs uppercase tracking-wider text-white/45">Player charge</p>
          <p className="mt-1 text-lg font-semibold text-white">{money(playerChargePence)}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <p className="text-xs uppercase tracking-wider text-white/45">Current captain share</p>
          <p className="mt-1 text-lg font-semibold text-white">{money(currentAssignedPence)}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs text-white/65">
        {capPence !== null ? (
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
            Current player cap {money(capPence)}
          </span>
        ) : null}
        {overridePence !== null ? (
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
            Current player override {money(overridePence)}
          </span>
        ) : null}
        {hasFeeCapEvidence ? (
          <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1.5 text-emerald-100">
            Cap recorded on this fixture
          </span>
        ) : (
          <span className="rounded-full border border-amber-300/20 bg-amber-400/10 px-3 py-1.5 text-amber-100">
            Current profile concession only — check this fixture
          </span>
        )}
      </div>

      {canApplyCurrentCapToFixture ? (
        <div className="rounded-xl border border-emerald-300/25 bg-emerald-400/[0.06] p-4 text-sm leading-6 text-emerald-50/90">
          <p className="font-semibold">This is the missing step for this fixture.</p>
          <p className="mt-1">
            The captain share is already {money(currentAssignedPence)} and the player cap is {money(playerChargePence)}. Saving below will record the {money(adjustmentPence)} difference on this fixture as the SIXFL cap adjustment, without changing the £5 payment.
          </p>
        </div>
      ) : null}

      <form className="space-y-5" onSubmit={submit}>
        <label className="block">
          Correct captain-assigned share (£)
          <input
            className={field}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="decimal"
            required
            disabled={busy}
          />
        </label>

        <label className="flex gap-3 rounded-xl border border-amber-300/20 bg-amber-400/[0.06] p-4 text-sm leading-6">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            required
            disabled={busy}
            className="mt-1"
          />
          <span>
            {canApplyCurrentCapToFixture
              ? `I confirm the player's ${money(playerChargePence)} cap applied to this fixture. Keep the real payment unchanged and record the ${money(adjustmentPence)} difference as the SIXFL adjustment.`
              : "I am correcting only what the captain originally assigned. Keep the player's cap/override, actual charge, payment status and outstanding balance unchanged."}
          </span>
        </label>

        <button className={button} disabled={busy || !confirmed}>
          {busy
            ? "Saving…"
            : canApplyCurrentCapToFixture
              ? `Apply ${money(adjustmentPence)} adjustment to this fixture`
              : "Save captain share only"}
        </button>
      </form>
    </section>
  );
}
