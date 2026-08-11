const fs = require("node:fs");
const path = require("node:path");

const pagePath = path.join(
  process.cwd(),
  "src/app/captain/team/[teamid]/payments/page.tsx",
);

let source = fs.readFileSync(pagePath, "utf8");

const derivedMarker = "              const playerCollectionDetails = entry.fixtureId";
const returnMarker = "\n\n              return (";

if (!source.includes("const teamCreditUsedPence =")) {
  const derivedStart = source.indexOf(derivedMarker);
  if (derivedStart < 0) {
    throw new Error("Fixture payment breakdown player-collection marker is missing.");
  }

  const returnIndex = source.indexOf(returnMarker, derivedStart);
  if (returnIndex < 0) {
    throw new Error("Fixture payment breakdown return marker is missing.");
  }

  const derivedValues = `
              const nonPlayerChargePayments = entry.payments.filter((payment) => {
                const notes = (payment.notes ?? "").toLowerCase();
                return (
                  !notes.includes("player match fee paid online") &&
                  !notes.includes("player fee id:")
                );
              });
              const teamCreditUsedPence = nonPlayerChargePayments
                .filter((payment) => {
                  const notes = (payment.notes ?? "").toLowerCase();
                  return (
                    payment.reference === "TEAM_CREDIT" ||
                    notes.includes("team credit used")
                  );
                })
                .reduce((sum, payment) => sum + payment.amountPence, 0);
              const teamPaymentPence = Math.max(
                entry.directPaidPence - teamCreditUsedPence,
                0,
              );
              const totalAppliedPence = Math.min(
                entry.paidPence,
                entry.amountPence,
              );`;

  source =
    source.slice(0, returnIndex) +
    derivedValues +
    source.slice(returnIndex);
}

const summaryStartMarker = `                      <div className="text-right">
                        <div className="text-base font-semibold text-white">
                          {formatMoney(entry.amountPence)}`;
const settledWarningMarker = `                      {entry.displayStatus === "PAID" && entry.playerOpenPence > 0 ? (`;
const actionMarker = `                      <div className="flex flex-col gap-2 lg:items-end">`;

const summaryStart = source.indexOf(summaryStartMarker);
if (summaryStart < 0 && !source.includes("Total applied to fixture")) {
  throw new Error("Fixture payment breakdown summary marker is missing.");
}

if (summaryStart >= 0) {
  const warningStart = source.indexOf(settledWarningMarker, summaryStart);
  const actionStart = source.indexOf(actionMarker, summaryStart);
  const summaryEnd = warningStart >= 0 ? warningStart : actionStart;

  if (summaryEnd < 0) {
    throw new Error("Fixture payment breakdown summary end marker is missing.");
  }

  const clearSummary = `                      <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-black/20 p-4 text-left">
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-sm font-semibold text-white">
                            Fixture charge
                          </span>
                          <span className="text-lg font-semibold text-white">
                            {formatMoney(entry.amountPence)}
                          </span>
                        </div>

                        <div className="mt-3 space-y-2 text-sm text-white/65">
                          <div className="flex items-center justify-between gap-4">
                            <span>Players paid</span>
                            <span className="font-semibold text-white">
                              {formatMoney(entry.playerPaidPence)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span>Team paid</span>
                            <span className="font-semibold text-white">
                              {formatMoney(teamPaymentPence)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span>Team credit used</span>
                            <span className="font-semibold text-white">
                              {formatMoney(teamCreditUsedPence)}
                            </span>
                          </div>
                        </div>

                        <div className="mt-3 border-t border-white/10 pt-3">
                          <div className="flex items-center justify-between gap-4 text-sm">
                            <span className="font-semibold text-white">
                              Total applied to fixture
                            </span>
                            <span className="font-semibold text-emerald-100">
                              {formatMoney(totalAppliedPence)}
                            </span>
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-4 text-sm">
                            <span className="text-white/60">Outstanding</span>
                            <span
                              className={
                                entry.outstandingPence > 0
                                  ? "font-semibold text-amber-100"
                                  : "font-semibold text-emerald-100"
                              }
                            >
                              {formatMoney(entry.outstandingPence)}
                            </span>
                          </div>
                        </div>

                        {entry.playerOpenPence > 0 ? (
                          <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2.5">
                            <div className="flex items-center justify-between gap-4 text-sm text-amber-100">
                              <span className="font-semibold">Player links still open</span>
                              <span className="font-semibold">
                                {formatMoney(entry.playerOpenPence)}
                              </span>
                            </div>
                            <p className="mt-1 text-xs leading-5 text-amber-50/70">
                              This is not outstanding on the fixture. It would become team credit if collected.
                            </p>
                          </div>
                        ) : null}

                        {entry.overpaidPence > 0 ? (
                          <div className="mt-3 text-xs text-emerald-200">
                            Team credit generated: {formatMoney(entry.overpaidPence)}
                          </div>
                        ) : null}

                        {nonPlayerChargePayments.length > 0 ? (
                          <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">
                              Team payment and credit details
                            </div>
                            <div className="mt-2 space-y-2">
                              {nonPlayerChargePayments.map((payment) => {
                                const notes = (payment.notes ?? "").toLowerCase();
                                const isTeamCredit =
                                  payment.reference === "TEAM_CREDIT" ||
                                  notes.includes("team credit used");

                                return (
                                  <div
                                    key={payment.id}
                                    className="flex items-start justify-between gap-4 text-xs leading-5"
                                  >
                                    <div>
                                      <div className="font-semibold text-white">
                                        {isTeamCredit ? "Team credit used" : "Team payment"}
                                      </div>
                                      <div className="text-white/40">
                                        {isTeamCredit
                                          ? "Applied from the team credit balance"
                                          : payment.method.replaceAll("_", " ") +
                                            " · " +
                                            formatUkDateTime(payment.paidAt)}
                                      </div>
                                    </div>
                                    <span className="shrink-0 font-semibold text-white">
                                      {formatMoney(payment.amountPence)}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}

                        <div className="mt-3">
                          <span
                            className={[
                              "inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em]",
                              getChargeStatusTone(entry.displayStatus),
                            ].join(" ")}
                          >
                            {formatChargeStatus(entry.displayStatus)}
                          </span>
                        </div>
                      </div>

`;

  source =
    source.slice(0, summaryStart) +
    clearSummary +
    source.slice(summaryEnd);
}

const warningStart = source.indexOf(settledWarningMarker);
if (warningStart >= 0) {
  const warningEnd = source.indexOf(actionMarker, warningStart);
  if (warningEnd < 0) {
    throw new Error("Fixture payment breakdown warning end marker is missing.");
  }

  const clearWarning = `                      {entry.displayStatus === "PAID" && entry.playerOpenPence > 0 ? (
                        <div className="w-full max-w-xl rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4 text-left">
                          <div className="font-semibold text-amber-100">
                            Fixture paid — these player links are extra
                          </div>
                          <p className="mt-2 text-sm leading-6 text-amber-50/80">
                            The fixture charge is already fully covered. The remaining {formatMoney(entry.playerOpenPence)} is still available to collect from players, but it is not owed to SIXFL for this fixture.
                          </p>

                          <div className="mt-3 rounded-xl border border-amber-300/20 bg-black/20 px-3 py-2 text-sm text-amber-50/85">
                            {formatMoney(entry.playerPaidPence)} players + {formatMoney(teamPaymentPence)} team payment + {formatMoney(teamCreditUsedPence)} team credit = {formatMoney(totalAppliedPence)} applied.
                          </div>

                          {unpaidPlayers.length > 0 ? (
                            <div className="mt-3 overflow-hidden rounded-xl border border-amber-300/20 bg-black/20">
                              <div className="border-b border-amber-300/15 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-100/70">
                                Links still awaiting payment
                              </div>
                              <div className="divide-y divide-white/10">
                                {unpaidPlayers.map((player) => (
                                  <div
                                    key={player.id}
                                    className="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                                  >
                                    <div className="min-w-0">
                                      <div className="font-semibold text-white">{player.name}</div>
                                      {player.contact ? (
                                        <div className="mt-0.5 break-all text-xs text-white/50">
                                          {player.contact}
                                        </div>
                                      ) : null}
                                    </div>
                                    <div className="shrink-0 font-semibold text-amber-100">
                                      {formatMoney(player.amountPence)}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          <p className="mt-3 text-xs leading-5 text-amber-50/65">
                            Any payment received from these links will be added to the team credit balance.
                          </p>

                          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                            <form action={closeSettledChargePlayerLinksAction}>
                              <input type="hidden" name="teamId" value={team.id} />
                              <input type="hidden" name="chargeId" value={entry.chargeId} />
                              <button type="submit" className="inline-flex min-h-10 items-center justify-center rounded-xl bg-amber-300 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-200">
                                Close these unpaid links
                              </button>
                            </form>
                            <span className="text-xs text-white/55">
                              Or leave them open to build team credit.
                            </span>
                          </div>
                        </div>
                      ) : null}

`;

  source =
    source.slice(0, warningStart) +
    clearWarning +
    source.slice(warningEnd);
}

if (
  !source.includes("Total applied to fixture") ||
  !source.includes("Fixture paid — these player links are extra") ||
  !source.includes("Team payment and credit details") ||
  source.includes("Direct team payment details")
) {
  throw new Error("Clear fixture payment breakdown was not applied correctly.");
}

fs.writeFileSync(pagePath, source, "utf8");
require("./apply-native-team-payment-copy.cjs");
console.log(
  "Fixture charges now show a clear players + team + credit calculation without duplicating player transactions, with saved-card state applied afterwards.",
);