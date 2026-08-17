import { getCaptainCollectedRemittanceSnapshots } from "@/lib/payments/captain-collected-remittance";
import { getTeamCreditLedger } from "@/lib/payments/team-credits";
import { formatPaymentFixtureDate, formatPaymentMoney, getTeamPaymentLedger } from "@/lib/payments/team-payment-ledger";

function formatMoney(amountPence: number) {
  return formatPaymentMoney(amountPence);
}

export default async function CaptainCollectedRemittancePanel({
  teamId,
}: {
  teamId: string;
}) {
  const ledger = await getTeamPaymentLedger(teamId);
  if (!ledger) return null;

  const fixtureEntries = ledger.entries
    .filter((entry) => Boolean(entry.fixtureId))
    .map((entry) => ({ ...entry, fixtureId: entry.fixtureId as string }));
  if (fixtureEntries.length === 0) return null;

  const [snapshots, creditLedger] = await Promise.all([
    getCaptainCollectedRemittanceSnapshots(
      fixtureEntries.map((entry) => ({
        chargeId: entry.chargeId,
        teamId: entry.teamId,
        fixtureId: entry.fixtureId,
      })),
    ),
    getTeamCreditLedger(ledger.relatedTeamIds),
  ]);

  const creditBalancePence = Math.max(creditLedger.balancePence, 0);

  const rows = fixtureEntries
    .map((entry) => {
      const snapshot = snapshots.get(entry.chargeId);
      if (
        !snapshot ||
        (snapshot.collectedPence <= 0 && snapshot.removedPence <= 0)
      ) {
        return null;
      }

      const amountAvailableToRemitPence = Math.min(
        snapshot.availablePence,
        entry.outstandingPence,
      );
      const creditAvailableForCollectedPence = Math.min(
        creditBalancePence,
        snapshot.availablePence,
        entry.outstandingPence,
      );

      return {
        entry,
        snapshot,
        amountAvailableToRemitPence,
        creditAvailableForCollectedPence,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  const activeRows = rows.filter((row) => row.snapshot.collectedPence > 0);
  const removedRows = rows.filter((row) => row.snapshot.removedPence > 0);

  if (activeRows.length === 0 && removedRows.length === 0) return null;

  return (
    <section className="rounded-3xl border border-cyan-400/25 bg-cyan-500/[0.08] p-5 sm:p-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/70">
        Money collected by captain
      </p>
      <h2 className="mt-2 text-2xl font-semibold text-white">
        {activeRows.length > 0
          ? "Settle player money collected by the captain"
          : "Captain-collected money history"}
      </h2>
      <p className="mt-2 max-w-4xl text-sm leading-6 text-cyan-50/70">
        These amounts come from players marked <strong>Paid captain directly</strong>. For each fixture, either pass the collected money to SIXFL or use available team credit instead. Your own player link and any other open player links stay separate.
      </p>

      {activeRows.length > 0 ? (
        <div className="mt-4 max-w-4xl rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs leading-5 text-white/65">
          <strong className="text-white/85">When to use “Remove from captain collection”:</strong>{" "}
          use it only if you and the player have sorted that money out between yourselves — for example, you returned the money or agreed a different private arrangement — so you no longer hold it to pass to SIXFL. Removing it does <strong>not</strong> reduce the fixture balance and is not a refund. If a Stripe checkout is pending, cancel that first; money already passed to SIXFL cannot be removed this way.
        </div>
      ) : null}

      {creditBalancePence > 0 && activeRows.length > 0 ? (
        <div className="mt-3 inline-flex rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-50">
          Team credit available: {formatMoney(creditBalancePence)}
        </div>
      ) : null}

      {activeRows.length > 0 ? (
        <div className="mt-5 space-y-4">
          {activeRows.map(({ entry, snapshot, amountAvailableToRemitPence, creditAvailableForCollectedPence }) => {
            const heldButNotRemittedPence = snapshot.unremittedPence;
            const cappedByOutstanding =
              snapshot.availablePence > amountAvailableToRemitPence;
            const hasPendingCheckout = snapshot.pendingPence > 0;
            const canRemoveFromCaptainCollection =
              snapshot.remittedPence === 0 &&
              !hasPendingCheckout &&
              snapshot.unremittedPence > 0;

            return (
              <article
                key={entry.chargeId}
                className="rounded-2xl border border-white/10 bg-black/25 p-4 sm:p-5"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="font-semibold text-white">{entry.fixtureLabel}</div>
                    <div className="mt-1 text-sm text-white/50">
                      {entry.kickoffAt
                        ? formatPaymentFixtureDate(entry.kickoffAt)
                        : "Fixture date not set"}
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-cyan-50">
                        Captain collected {formatMoney(snapshot.collectedPence)} from {snapshot.collectedPlayerCount} player{snapshot.collectedPlayerCount === 1 ? "" : "s"}
                      </span>
                      {snapshot.remittedPence > 0 ? (
                        <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-emerald-50">
                          Already passed to SIXFL {formatMoney(snapshot.remittedPence)}
                        </span>
                      ) : null}
                      {snapshot.pendingPence > 0 ? (
                        <span className="rounded-full border border-amber-300/20 bg-amber-400/10 px-3 py-1 text-amber-50">
                          Stripe checkout pending {formatMoney(snapshot.pendingPence)}
                        </span>
                      ) : null}
                      {creditAvailableForCollectedPence > 0 ? (
                        <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-emerald-50">
                          Credit can cover {formatMoney(creditAvailableForCollectedPence)}
                        </span>
                      ) : null}
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-white/65">
                        Fixture outstanding {formatMoney(entry.outstandingPence)}
                      </span>
                    </div>

                    {cappedByOutstanding ? (
                      <p className="mt-3 text-xs leading-5 text-amber-100/80">
                        {amountAvailableToRemitPence > 0 ? (
                          <>
                            You still hold {formatMoney(heldButNotRemittedPence)} recorded as collected. Only {formatMoney(amountAvailableToRemitPence)} needs to be settled against this fixture. {hasPendingCheckout
                              ? "The rest of the balance is already covered or has a Stripe checkout pending."
                              : "The rest of the fixture balance has already been covered."}
                          </>
                        ) : (
                          <>
                            You still hold {formatMoney(heldButNotRemittedPence)} recorded as collected. {hasPendingCheckout
                              ? "No further payment is due while a Stripe checkout is holding the remaining amount. You can cancel that checkout below if you want to pay a different way."
                              : "No further payment is due for this fixture because its balance has already been fully covered."}
                          </>
                        )}
                      </p>
                    ) : null}
                  </div>

                  <div className="w-full shrink-0 lg:w-[310px]">
                    {hasPendingCheckout ? (
                      <div className="rounded-2xl border border-amber-300/20 bg-amber-400/10 p-3 text-sm text-amber-50">
                        <p>
                          A Stripe checkout for this collected money is still in progress. Cancel it to release the amount and choose again.
                        </p>
                        <form
                          action={`/captain/team/${teamId}/payments/remit-collected/cancel`}
                          method="post"
                          className="mt-3"
                        >
                          <input type="hidden" name="chargeId" value={entry.chargeId} />
                          <button
                            type="submit"
                            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-amber-200/30 bg-amber-300 px-4 py-2.5 text-sm font-black text-black transition hover:bg-amber-200"
                          >
                            Cancel pending checkout
                          </button>
                        </form>
                      </div>
                    ) : amountAvailableToRemitPence > 0 ? (
                      <>
                        {creditAvailableForCollectedPence > 0 ? (
                          <>
                            <form
                              action={`/captain/team/${teamId}/payments/use-credit-for-collected`}
                              method="post"
                            >
                              <input type="hidden" name="chargeId" value={entry.chargeId} />
                              <button
                                type="submit"
                                className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-emerald-300 px-4 py-3 text-sm font-black text-black transition hover:bg-emerald-200"
                              >
                                Use {formatMoney(creditAvailableForCollectedPence)} team credit instead
                              </button>
                            </form>
                            <div className="my-2 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                              or
                            </div>
                          </>
                        ) : null}

                        <form
                          action={`/captain/team/${teamId}/payments/remit-collected`}
                          method="post"
                        >
                          <input type="hidden" name="chargeId" value={entry.chargeId} />
                          <input
                            type="hidden"
                            name="amount"
                            value={(amountAvailableToRemitPence / 100).toFixed(2)}
                          />
                          <button
                            type="submit"
                            className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-black text-black transition hover:bg-cyan-200"
                          >
                            Pay collected money to SIXFL — {formatMoney(amountAvailableToRemitPence)}
                          </button>
                        </form>

                        <details className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                          <summary className="cursor-pointer text-sm font-semibold text-white/70">
                            Pay a different amount
                          </summary>
                          <form
                            action={`/captain/team/${teamId}/payments/remit-collected`}
                            method="post"
                            className="mt-3 space-y-3"
                          >
                            <input type="hidden" name="chargeId" value={entry.chargeId} />
                            <label className="block text-xs text-white/55">
                              Amount to pass to SIXFL
                              <div className="mt-1 flex items-center rounded-xl border border-white/10 bg-black/25 px-3">
                                <span className="text-white/50">£</span>
                                <input
                                  type="number"
                                  name="amount"
                                  min="0.01"
                                  step="0.01"
                                  max={(amountAvailableToRemitPence / 100).toFixed(2)}
                                  defaultValue={(amountAvailableToRemitPence / 100).toFixed(2)}
                                  required
                                  className="h-11 min-w-0 flex-1 bg-transparent px-2 text-white outline-none"
                                />
                              </div>
                            </label>
                            <p className="text-xs leading-5 text-white/45">
                              Maximum right now: {formatMoney(amountAvailableToRemitPence)}. This payment is applied only to this fixture charge.
                            </p>
                            <button
                              type="submit"
                              className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-cyan-300/25 bg-cyan-400/10 px-4 text-sm font-semibold text-cyan-50 transition hover:bg-cyan-400/15"
                            >
                              Pay this amount
                            </button>
                          </form>
                        </details>
                      </>
                    ) : (
                      <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-50">
                        This fixture balance is fully settled. No collected player money needs to be passed to SIXFL for it.
                      </div>
                    )}

                    {canRemoveFromCaptainCollection ? (
                      <details className="mt-3 rounded-2xl border border-red-300/20 bg-red-500/[0.07] p-3">
                        <summary className="cursor-pointer text-sm font-semibold text-red-100/85">
                          Remove from captain collection
                        </summary>
                        <p className="mt-3 text-xs leading-5 text-red-50/65">
                          Use this only if the money has been resolved privately between you and the player and you no longer hold it for SIXFL. The fixture balance will stay exactly as it is.
                        </p>
                        <form
                          action={`/captain/team/${teamId}/payments/remove-collected`}
                          method="post"
                          className="mt-3"
                        >
                          <input type="hidden" name="chargeId" value={entry.chargeId} />
                          <button
                            type="submit"
                            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-red-300/30 bg-red-500/15 px-4 py-2.5 text-sm font-bold text-red-50 transition hover:bg-red-500/25"
                          >
                            Confirm — remove {formatMoney(snapshot.unremittedPence)} from captain collection
                          </button>
                        </form>
                      </details>
                    ) : snapshot.remittedPence > 0 ? (
                      <p className="mt-3 text-xs leading-5 text-white/40">
                        Money already passed to SIXFL cannot be removed from captain collection.
                      </p>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      {removedRows.length > 0 ? (
        <div className={`${activeRows.length > 0 ? "mt-7 border-t border-white/10 pt-6" : "mt-5"}`}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
            Previously removed from captain collection
          </p>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-white/55">
            These records remain visible for audit. They no longer count as money the captain holds for SIXFL, and removing them did not reduce the fixture balance.
          </p>
          <div className="mt-4 space-y-3">
            {removedRows.map(({ entry, snapshot }) => (
              <article
                key={`removed-${entry.chargeId}`}
                className="rounded-2xl border border-white/10 bg-black/20 p-4"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="font-semibold text-white/85">{entry.fixtureLabel}</div>
                    <div className="mt-1 text-xs text-white/45">
                      {entry.kickoffAt
                        ? formatPaymentFixtureDate(entry.kickoffAt)
                        : "Fixture date not set"}
                    </div>
                  </div>
                  <span className="inline-flex w-fit rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-semibold text-white/65">
                    Removed {formatMoney(snapshot.removedPence)} from {snapshot.removedPlayerCount} player{snapshot.removedPlayerCount === 1 ? "" : "s"}
                  </span>
                </div>
                {snapshot.removalNotes.length > 0 ? (
                  <div className="mt-3 space-y-1.5">
                    {snapshot.removalNotes.map((note) => (
                      <p key={note} className="text-xs leading-5 text-white/50">
                        {note}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-xs leading-5 text-white/50">
                    Captain and player resolved this privately. The SIXFL fixture balance was unchanged.
                  </p>
                )}
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
