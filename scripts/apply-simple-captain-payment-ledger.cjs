const fs = require("node:fs");
const path = require("node:path");

const pagePath = path.join(
  process.cwd(),
  "src/app/captain/team/[teamid]/payments/page.tsx",
);
let source = fs.readFileSync(pagePath, "utf8");

function replaceRequired(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found in captain payments.`);
  }
  source = source.replace(before, after);
}

if (!source.includes("function getTeamPaymentSourceLabel(")) {
  const marker = `function formatUkDateTime(value: Date) {
  return formatDateTimeInLondon(value, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}`;
  const helper = `${marker}

function getTeamPaymentSourceLabel(payment: {
  method: string;
  reference: string | null;
  notes: string | null;
}) {
  const notes = (payment.notes ?? "").toLowerCase();
  if (notes.includes("saved-card matchday team payment taken automatically by sixfl")) {
    return "Automatic saved-card payment";
  }
  if (notes.includes("paid online via stripe checkout")) {
    return "Paid manually online";
  }
  if (payment.reference === "TEAM_CREDIT" || notes.includes("team credit used")) {
    return "Team credit";
  }
  if (payment.method === "STRIPE") return "Stripe payment";
  if (payment.method === "BANK_TRANSFER") return "Bank transfer";
  if (payment.method === "CASH") return "Cash payment";
  if (payment.method === "CARD") return "Card payment";
  return payment.method.replaceAll("_", " ").toLowerCase();
}`;
  replaceRequired(marker, helper, "team payment source helper marker");
}

source = source
  .replace(
    `{payment.statusMeta}`,
    `{entry.displayStatus === "PAID" && payment.statusLabel === "Awaiting payment"
                                      ? "Fixture already paid"
                                      : payment.statusMeta}`,
  )
  .replace(
    `{payment.statusLabel}`,
    `{entry.displayStatus === "PAID" && payment.statusLabel === "Awaiting payment"
                                      ? "Link not needed"
                                      : payment.statusLabel}`,
  );

const summaryStartMarker = `                      <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-black/20 p-4 text-left">`;
const actionMarker = `                      <div className="flex flex-col gap-2 lg:items-end">`;
const summaryStart = source.indexOf(summaryStartMarker);
const actionStart = summaryStart >= 0 ? source.indexOf(actionMarker, summaryStart) : -1;

if (summaryStart < 0 || actionStart < 0) {
  if (!source.includes("Payment source")) {
    throw new Error("Expected simplified fixture summary replacement markers were not found.");
  }
} else {
  const simpleSummary = `                      <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-black/20 p-4 text-left">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">
                              Fixture payment
                            </div>
                            <div className="mt-1 text-base font-semibold text-white">
                              {entry.displayStatus === "PAID" ? "Paid in full" : formatChargeStatus(entry.displayStatus)}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-semibold text-white">{formatMoney(entry.amountPence)}</div>
                            <div className={entry.outstandingPence > 0 ? "text-xs text-amber-100" : "text-xs text-emerald-100"}>
                              {entry.outstandingPence > 0
                                ? formatMoney(entry.outstandingPence) + " still due"
                                : "Nothing left to pay"}
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
                          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                            <div className="text-[10px] uppercase tracking-[0.12em] text-white/35">Players paid</div>
                            <div className="mt-1 font-semibold text-white">{formatMoney(entry.playerPaidPence)}</div>
                          </div>
                          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                            <div className="text-[10px] uppercase tracking-[0.12em] text-white/35">Team paid</div>
                            <div className="mt-1 font-semibold text-white">{formatMoney(teamPaymentPence)}</div>
                          </div>
                          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                            <div className="text-[10px] uppercase tracking-[0.12em] text-white/35">Credit used</div>
                            <div className="mt-1 font-semibold text-white">{formatMoney(teamCreditUsedPence)}</div>
                          </div>
                        </div>

                        {nonPlayerChargePayments.length > 0 ? (
                          <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
                              Payment source
                            </div>
                            <div className="mt-2 space-y-2">
                              {nonPlayerChargePayments.map((payment) => {
                                const notes = (payment.notes ?? "").toLowerCase();
                                const isTeamCredit =
                                  payment.reference === "TEAM_CREDIT" ||
                                  notes.includes("team credit used");

                                return (
                                  <div key={payment.id} className="flex items-start justify-between gap-4 text-xs">
                                    <div>
                                      <div className="font-semibold text-white">
                                        {isTeamCredit ? "Team credit" : getTeamPaymentSourceLabel(payment)}
                                      </div>
                                      <div className="mt-0.5 text-white/40">
                                        {formatUkDateTime(payment.paidAt)}
                                      </div>
                                    </div>
                                    <div className="shrink-0 font-semibold text-white">
                                      {formatMoney(payment.amountPence)}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}

                        {entry.displayStatus === "PAID" && entry.playerOpenPence > 0 ? (
                          <div className="mt-3 rounded-xl border border-amber-400/25 bg-amber-500/10 p-3">
                            <div className="font-semibold text-amber-100">
                              Player link still open — not needed
                            </div>
                            <p className="mt-1 text-xs leading-5 text-amber-50/75">
                              This fixture is already fully paid. Closing the remaining player link avoids collecting extra money by mistake.
                            </p>
                            {unpaidPlayers.length > 0 ? (
                              <div className="mt-2 space-y-1 text-xs text-white/70">
                                {unpaidPlayers.map((player) => (
                                  <div key={player.id} className="flex items-center justify-between gap-3">
                                    <span>{player.name}</span>
                                    <span className="font-semibold text-white">{formatMoney(player.amountPence)}</span>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                            <form action={closeSettledChargePlayerLinksAction} className="mt-3">
                              <input type="hidden" name="teamId" value={team.id} />
                              <input type="hidden" name="chargeId" value={entry.chargeId} />
                              <button
                                type="submit"
                                className="inline-flex min-h-10 items-center justify-center rounded-xl bg-amber-300 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-200"
                              >
                                Close unpaid player {unpaidPlayers.length === 1 ? "link" : "links"}
                              </button>
                            </form>
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
    simpleSummary +
    source.slice(actionStart);
}

if (
  !source.includes("Player link still open — not needed") ||
  !source.includes("Automatic saved-card payment") ||
  !source.includes("Payment source") ||
  source.includes("Fixture paid — these player links are extra") ||
  source.includes("Cancel all unpaid player links")
) {
  throw new Error("Simplified captain fixture payment ledger was not applied correctly.");
}

fs.writeFileSync(pagePath, source, "utf8");
console.log(
  "Captain fixture payment ledger now has one clear summary, explicit payment source and one player-link action.",
);
