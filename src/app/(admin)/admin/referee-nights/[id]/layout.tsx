import type { ReactNode } from "react";

import { formatMoney, getRefereeNightById } from "@/lib/referee-nights";

import {
  cancelIncorrectRefereeNightAction,
  updateOneOffRefereeNightFeeAction,
} from "./correction-actions";

export default async function RefereeNightDetailLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const night = await getRefereeNightById(id);

  if (!night) return children;

  const canChangeFee = night.status !== "CANCELLED" && night.status !== "SETTLED";
  const canCancel = night.status !== "CANCELLED" && night.status !== "SETTLED";
  const hasCashHistory =
    night.cashCollectedPence > 0 ||
    night.cashPaidToRefereePence > 0 ||
    night.cashReceivedFromRefereePence > 0;

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-amber-400/20 bg-amber-500/[0.07] p-5 md:p-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-100/70">
            Admin correction tools
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">
            Correct this referee night
          </h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-white/60">
            Use these controls for one-off corrections. A fee override changes only this night. If the referee did not work the night at all, cancel the incorrect assignment so it no longer appears as money owed.
          </p>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <form
            action={updateOneOffRefereeNightFeeAction}
            className="rounded-2xl border border-white/10 bg-black/20 p-4"
          >
            <input type="hidden" name="refereeNightId" value={night.id} />
            <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
              One-off night fee (£)
            </label>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <input
                name="feePounds"
                type="number"
                min="0"
                step="0.01"
                defaultValue={(night.feePence / 100).toFixed(2)}
                disabled={!canChangeFee}
                className="h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/35 px-3 text-sm text-white outline-none disabled:cursor-not-allowed disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!canChangeFee}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-emerald-400 px-4 text-sm font-semibold text-black transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/35"
              >
                Save fee
              </button>
            </div>
            <p className="mt-2 text-xs leading-5 text-white/45">
              Current fee: {formatMoney(night.feePence)}. This does not change the referee&apos;s standard fee for other nights.
            </p>
            {night.status === "SETTLED" ? (
              <p className="mt-2 text-xs font-medium text-amber-100">
                Reopen the night before changing a settled fee.
              </p>
            ) : null}
          </form>

          <details className="rounded-2xl border border-red-400/20 bg-red-500/[0.06] p-4">
            <summary className="cursor-pointer text-sm font-semibold text-red-100">
              Referee did not work this night — remove the incorrect assignment
            </summary>
            <div className="mt-3 text-sm leading-6 text-white/60">
              This keeps an audit record, but marks the night cancelled, changes its fee and balance to £0, and releases its fixture assignments so the correct referee can be recorded.
            </div>

            {hasCashHistory ? (
              <div className="mt-3 rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-100">
                This night has cash/payment history, so automatic cancellation is blocked. Reconcile the cash first.
              </div>
            ) : null}

            {night.status === "SETTLED" ? (
              <div className="mt-3 rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-100">
                This night is settled. Reopen it first if it needs correcting.
              </div>
            ) : null}

            {night.status === "CANCELLED" ? (
              <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs leading-5 text-white/55">
                This referee night has already been cancelled and no balance is due.
              </div>
            ) : null}

            <form action={cancelIncorrectRefereeNightAction} className="mt-4 space-y-3">
              <input type="hidden" name="refereeNightId" value={night.id} />
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-white/40">
                  Correction note (optional)
                </label>
                <input
                  name="correctionReason"
                  placeholder="e.g. Oli did not referee this date"
                  disabled={!canCancel || hasCashHistory}
                  className="h-11 w-full rounded-xl border border-white/10 bg-black/35 px-3 text-sm text-white outline-none placeholder:text-white/25 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
              <label className="flex items-start gap-2 text-xs leading-5 text-white/60">
                <input
                  type="checkbox"
                  name="confirmCancel"
                  value="yes"
                  required
                  disabled={!canCancel || hasCashHistory}
                  className="mt-1"
                />
                <span>I confirm this referee did not work this night and should not be owed the fee.</span>
              </label>
              <button
                type="submit"
                disabled={!canCancel || hasCashHistory}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-red-400/30 bg-red-500/15 px-4 text-sm font-semibold text-red-100 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-white/30"
              >
                Cancel incorrect referee night
              </button>
            </form>
          </details>
        </div>
      </section>

      {children}
    </div>
  );
}
