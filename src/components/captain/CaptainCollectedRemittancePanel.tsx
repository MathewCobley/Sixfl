import { getCaptainCollectedRemittanceSnapshots } from "@/lib/payments/captain-collected-remittance";
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

  const snapshots = await getCaptainCollectedRemittanceSnapshots(
    fixtureEntries.map((entry) => ({
      chargeId: entry.chargeId,
      teamId: entry.teamId,
      fixtureId: entry.fixtureId,
    })),
  );

  const rows = fixtureEntries
    .map((entry) => {
      const snapshot = snapshots.get(entry.chargeId);
      if (!snapshot || snapshot.collectedPence <= 0) return null;

      const amountAvailableToRemitPence = Math.min(
        snapshot.unremittedPence,
        entry.outstandingPence,
      );

      return {
        entry,
        snapshot,
        amountAvailableToRemitPence,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  if (rows.length === 0) return null;

  return (
    <section className="rounded-3xl border border-cyan-400/25 bg-cyan-500/[0.08] p-5 sm:p-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/70">
        Money collected by captain
      </p>
      <h2 className="mt-2 text-2xl font-semibold text-white">
        Pass player money on to SIXFL without paying the whole fixture balance
      </h2>
      <p className="mt-2 max-w-4xl text-sm leading-6 text-cyan-50/70">
        These amounts come from players marked <strong>Paid captain directly</strong>. Use this section to send only the money you have collected. Your own player link and any other open player links stay separate.
      </p>

      <div className="mt-5 space-y-4">
        {rows.map(({ entry, snapshot, amountAvailableToRemitPence }) => {
          const heldButNotRemittedPence = snapshot.unremittedPence;
          const cappedByOutstanding =
            heldButNotRemittedPence > amountAvailableToRemitPence;

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
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-white/65">
                      Fixture outstanding {formatMoney(entry.outstandingPence)}
                    </span>
                  </div>

                  {cappedByOutstanding ? (
                    <p className="mt-3 text-xs leading-5 text-amber-100/80">
                      You still hold {formatMoney(heldButNotRemittedPence)} recorded as collected, but only {formatMoney(amountAvailableToRemitPence)} can be paid to this fixture because that is all that remains outstanding.
                    </p>
                  ) : null}
                </div>

                <div className="w-full shrink-0 lg:w-[310px]">
                  {amountAvailableToRemitPence > 0 ? (
                    <>
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
                      No collected player money needs to be passed to this fixture right now.
                    </div>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
