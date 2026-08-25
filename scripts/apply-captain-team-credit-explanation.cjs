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
    throw new Error(`Expected ${label} source was not found in captain team payments.`);
  }
  source = source.replace(before, after);
}

// Make the one-match-fee credit rule obvious before a captain reaches the
// individual charge cards.
if (!source.includes("Your team has {formatMoney(creditBalancePence)} available credit")) {
  const creditMessageBlock = `      {creditMessage ? (\n        <div className={\`rounded-2xl border px-5 py-4 text-sm \${sp.credit === \"used\" ? \"border-emerald-400/20 bg-emerald-500/10 text-emerald-100\" : \"border-amber-400/20 bg-amber-500/10 text-amber-100\"}\`}>\n          {creditMessage}\n        </div>\n      ) : null}`;

  const creditNotice = `${creditMessageBlock}\n\n      {creditBalancePence > 0 ? (\n        <div className=\"rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-5 py-4 text-sm leading-6 text-emerald-50/85\">\n          <span className=\"font-semibold text-white\">\n            Your team has {formatMoney(creditBalancePence)} available credit.\n          </span>{\" \"}\n          SIXFL uses team credit against the next fixture fee before taking another card payment. Team credit is capped at one normal match fee.\n        </div>\n      ) : null}`;

  replaceRequired(creditMessageBlock, creditNotice, "team credit explanation notice");
}

source = source.replace(
  "            Credit available to use against fixture charges.",
  "            Used against the next fixture before another payment is taken. Credit is capped at one normal match fee.",
);

// Work out exactly what the captain would still have to pay after using the
// credit already sitting on the team account.
if (!source.includes("const creditAvailableForChargePence =")) {
  const oldActionValues = `              const canPayOnline =\n                Boolean(entry.paymentToken) &&\n                entry.displayStatus !== \"PAID\" &&\n                entry.displayStatus !== \"VOID\" &&\n                entry.outstandingPence > 0;\n              const canUseCredit =\n                creditBalancePence > 0 &&\n                entry.displayStatus !== \"PAID\" &&\n                entry.displayStatus !== \"VOID\" &&\n                entry.outstandingPence > 0;`;

  const newActionValues = `              const creditAvailableForChargePence = Math.min(\n                creditBalancePence,\n                entry.outstandingPence,\n              );\n              const payableAfterCreditPence = Math.max(\n                entry.outstandingPence - creditAvailableForChargePence,\n                0,\n              );\n              const canPayOnline =\n                Boolean(entry.paymentToken) &&\n                entry.displayStatus !== \"PAID\" &&\n                entry.displayStatus !== \"VOID\" &&\n                payableAfterCreditPence > 0;\n              const canUseCredit =\n                creditAvailableForChargePence > 0 &&\n                entry.displayStatus !== \"PAID\" &&\n                entry.displayStatus !== \"VOID\" &&\n                entry.outstandingPence > 0;`;

  replaceRequired(oldActionValues, newActionValues, "per-charge credit calculation");
}

// Show the difference between credit already applied and credit merely available
// so the £0/£40 situations make sense before the captain presses anything.
if (!source.includes("Available team credit")) {
  const usedCreditRow = `                          <div className=\"flex items-center justify-between gap-4\">\n                            <span>Team credit used</span>\n                            <span className=\"font-semibold text-white\">\n                              {formatMoney(teamCreditUsedPence)}\n                            </span>\n                          </div>`;

  const usedAndAvailableCreditRows = `${usedCreditRow}\n                          {creditAvailableForChargePence > 0 ? (\n                            <div className=\"flex items-center justify-between gap-4 text-emerald-100\">\n                              <span>Available team credit</span>\n                              <span className=\"font-semibold\">\n                                {formatMoney(creditAvailableForChargePence)}\n                              </span>\n                            </div>\n                          ) : null}`;

  replaceRequired(
    usedCreditRow,
    usedAndAvailableCreditRows,
    "available credit breakdown row",
  );
}

if (!source.includes("Remaining after available credit")) {
  const outstandingRow = `                          <div className=\"mt-2 flex items-center justify-between gap-4 text-sm\">\n                            <span className=\"text-white/60\">Outstanding</span>\n                            <span\n                              className={\n                                entry.outstandingPence > 0\n                                  ? \"font-semibold text-amber-100\"\n                                  : \"font-semibold text-emerald-100\"\n                              }\n                            >\n                              {formatMoney(entry.outstandingPence)}\n                            </span>\n                          </div>`;

  const outstandingWithCreditRow = `${outstandingRow}\n                          {creditAvailableForChargePence > 0 ? (\n                            <div className=\"mt-2 flex items-center justify-between gap-4 border-t border-emerald-400/10 pt-2 text-sm\">\n                              <span className=\"font-semibold text-emerald-100\">\n                                Remaining after available credit\n                              </span>\n                              <span className=\"font-semibold text-emerald-100\">\n                                {formatMoney(payableAfterCreditPence)}\n                              </span>\n                            </div>\n                          ) : null}`;

  replaceRequired(
    outstandingRow,
    outstandingWithCreditRow,
    "remaining balance after available credit row",
  );
}

// Explain the numbers immediately beside the action buttons so a captain never
// has to infer why Pay now has changed or disappeared.
if (!source.includes("Your available team credit covers this fee in full.")) {
  const actionMarker = `                      <div className=\"flex flex-col gap-2 lg:items-end\">\n                        {canUseCredit ? (`;

  const explainedActions = `                      <div className=\"flex w-full max-w-xl flex-col gap-2 lg:items-end\">\n                        {creditAvailableForChargePence > 0 ? (\n                          <div className=\"w-full rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-left\">\n                            <div className=\"text-sm font-semibold text-emerald-50\">\n                              {payableAfterCreditPence === 0\n                                ? \"Your available team credit covers this fee in full.\"\n                                : \`Use \${formatMoney(creditAvailableForChargePence)} team credit first\`}\n                            </div>\n                            <p className=\"mt-1 text-xs leading-5 text-emerald-50/70\">\n                              {payableAfterCreditPence === 0\n                                ? \`Apply \${formatMoney(creditAvailableForChargePence)} credit and there will be £0.00 left to pay by card.\`\n                                : \`After credit, \${formatMoney(payableAfterCreditPence)} remains to pay. If you choose Pay now, SIXFL applies the credit first and Stripe only collects the remainder.\`}\n                            </p>\n                          </div>\n                        ) : null}\n\n                        {canUseCredit ? (`;

  replaceRequired(actionMarker, explainedActions, "per-charge credit explanation");
}

source = source.replace(
  `                              Use team credit`,
  `                              Use {formatMoney(creditAvailableForChargePence)} credit`,
);

source = source.replace(
  `                              Pay now`,
  `                              {creditAvailableForChargePence > 0\n                                ? \`Pay \${formatMoney(payableAfterCreditPence)} after credit\`\n                                : \"Pay now\"}`,
);

source = source.replace(
  `                            {!isDueNow ? (\n                              <div className=\"text-xs text-white/45\">\n                                Optional early payment — due on match day.\n                              </div>\n                            ) : null}`,
  `                            {creditAvailableForChargePence > 0 ? (\n                              <div className=\"text-xs text-emerald-100/60\">\n                                Team credit is applied before Stripe takes the remaining payment.\n                              </div>\n                            ) : !isDueNow ? (\n                              <div className=\"text-xs text-white/45\">\n                                Optional early payment — due on match day.\n                              </div>\n                            ) : null}`,
);

source = source.replace(
  `                          entry.displayStatus !== \"VOID\" &&\n                          entry.outstandingPence > 0 ? (`,
  `                          entry.displayStatus !== \"VOID\" &&\n                          entry.outstandingPence > 0 &&\n                          payableAfterCreditPence > 0 ? (`,
);

if (
  !source.includes("Your team has {formatMoney(creditBalancePence)} available credit") ||
  !source.includes("const creditAvailableForChargePence =") ||
  !source.includes("const payableAfterCreditPence =") ||
  !source.includes("Available team credit") ||
  !source.includes("Remaining after available credit") ||
  !source.includes("Your available team credit covers this fee in full.") ||
  !source.includes("Use {formatMoney(creditAvailableForChargePence)} credit") ||
  !source.includes("Pay ${formatMoney(payableAfterCreditPence)} after credit") ||
  !source.includes("Team credit is applied before Stripe takes the remaining payment.")
) {
  throw new Error("Captain team-credit explanation was not applied correctly.");
}

fs.writeFileSync(pagePath, source, "utf8");
console.log(
  "Captain Team payments now explains available credit, the one-match-fee cap and the exact amount left to pay after credit.",
);
