import { getCaptainCollectedRemittanceSnapshots } from "@/lib/payments/captain-collected-remittance";
import { getTeamCreditLedger } from "@/lib/payments/team-credits";
import {
  formatPaymentFixtureDate,
  formatPaymentMoney,
  getTeamPaymentLedger,
} from "@/lib/payments/team-payment-ledger";

export default async function CaptainCollectedCreditOptions({
  teamId,
}: {
  teamId: string;
}) {
  const ledger = await getTeamPaymentLedger(teamId);
  if (!ledger) return null;

  const fixtureEntries = ledger.entries
    .filter(
      (entry) =>
        Boolean(entry.fixtureId) &&
        entry.outstandingPence > 0 &&
        entry.displayStatus !== "PAID" &&
        entry.displayStatus !== "VOID",
    )
    .map((entry) => ({ ...entry, fixtureId: entry.fixtureId as string }));

  if (fixtureEntries.length === 0) return null;

  const [creditLedger, snapshots] = await Promise.all([
    getTeamCreditLedger(ledger.relatedTeamIds),
    getCaptainCollectedRemittanceSnapshots(
      fixtureEntries.map((entry) => ({
        chargeId: entry.chargeId,
        teamId: entry.teamId,
        fixtureId: entry.fixtureId,
      })),
    ),
  ]);

  const creditBalancePence = Math.max(creditLedger.balancePence, 0);
  if (creditBalancePence <= 0) return null;

  const rows = fixtureEntries
    .map((entry) => {
      const snapshot = snapshots.get(entry.chargeId);
      if (!snapshot || snapshot.unremittedPence <= 0) return null;

      const creditAvailableForCollectedPence = Math.min(
        creditBalancePence,
        snapshot.unremittedPence,
        entry.outstandingPence,
      );

      if (creditAvailableForCollectedPence <= 0) return null;

      return {
        entry,
        snapshot,
        creditAvailableForCollectedPence,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  if (rows.length === 0) return null;

  return (
    <section className="rounded-3xl border border-emerald-400/25 bg-emerald-500/[0.08] p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/70">
            Team credit available
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">
            Use team credit before sending collected cash to SIXFL
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-emerald-50/75">
            Your team currently has {formatPaymentMoney(creditBalancePence)} credit. If you have collected player money, you can use existing team credit against the fixture instead of sending the same amount to SIXFL again.
          </p>
        </div>
        <a
          href={`/captain/team/${teamId}/payments/credit-ledger`}
          className="inline-flex shrink-0 items-center justify-center rounded-xl border border-emerald-300/25 bg-emerald-400/10 px-4 py-2.5 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-400/15"
        >
          View credit ledger
        </a>
      </div>

      <div className="mt-5 space-y-3">
        {rows.map(({ entry, snapshot, creditAvailableForCollectedPence }) => {
          const blockedByPendingCheckout = snapshot.pendingPence > 0;

          return (
            <article
              key={entry.chargeId}
              className="rounded-2xl border border-white/10 bg-black/20 p-4"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="font-semibold text-white">{entry.fixtureLabel}</div>
                  <div className="mt-1 text-sm text-white/50">
                    {entry.kickoffAt
                      ? formatPaymentFixtureDate(entry.kickoffAt)
                      : "Fixture date not set"}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-cyan-50">
                      Captain still holds {formatPaymentMoney(snapshot.unremittedPence)}
                    </span>
                    <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-emerald-50">
                      Credit can cover {formatPaymentMoney(creditAvailableForCollectedPence)}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-white/65">
                      Fixture outstanding {formatPaymentMoney(entry.outstandingPence)}
                    </span>
                  </div>
                </div>

                <div className="w-full shrink-0 lg:w-[320px]">
                  {blockedByPendingCheckout ? (
                    <div className="rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-50">
                      Cancel the pending Stripe checkout first, then you can use team credit instead.
                    </div>
                  ) : (
                    <form
                      action={`/captain/team/${teamId}/payments/use-credit-for-collected`}
                      method="post"
                    >
                      <input type="hidden" name="chargeId" value={entry.chargeId} />
                      <button
                        type="submit"
                        className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-emerald-300 px-4 py-3 text-sm font-black text-black transition hover:bg-emerald-200"
                      >
                        Use {formatPaymentMoney(creditAvailableForCollectedPence)} team credit instead
                      </button>
                    </form>
                  )}
                  <p className="mt-2 text-xs leading-5 text-white/45">
                    The captain keeps the same amount of collected player money and the team credit is reduced by that amount.
                  </p>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
