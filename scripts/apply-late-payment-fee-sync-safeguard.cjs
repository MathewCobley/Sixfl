const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const file = "src/lib/payments/fixture-match-fees.ts";
const absolutePath = path.join(root, ...file.split("/"));
let source = fs.readFileSync(absolutePath, "utf8");

function replaceRequired(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`${label} anchor not found.`);
  }
  source = source.replace(before, after);
}

// Fixture sync receives the base fixture fee. PaymentCharge.amountPence, however,
// includes an already-applied late-payment admin fee. Never let a later fixture
// sync overwrite the total back to the base amount and effectively erase the fee.
if (!source.includes("const appliedLatePaymentFeePence =")) {
  replaceRequired(
    `    const paidTotalPence = getChargePaidTotal(existingCharge.transactions);\n\n    if (paidTotalPence > 0 && existingCharge.amountPence !== entry.amountPence) {`,
    `    const appliedLatePaymentFeePence =\n      existingCharge.latePaymentFeeStatus === "APPLIED"\n        ? Math.max(existingCharge.latePaymentFeeAmountPence, 0)\n        : 0;\n    const effectiveAmountPence =\n      entry.amountPence + appliedLatePaymentFeePence;\n    const paidTotalPence = getChargePaidTotal(existingCharge.transactions);\n\n    if (paidTotalPence > 0 && existingCharge.amountPence !== effectiveAmountPence) {`,
    "late-payment fee effective fixture amount",
  );

  replaceRequired(
    `        amountPence: entry.amountPence,\n        dueDate: input.kickoffAt,\n        status: getChargeStatusFromAmounts(entry.amountPence, paidTotalPence),`,
    `        amountPence: effectiveAmountPence,\n        dueDate: input.kickoffAt,\n        status: getChargeStatusFromAmounts(effectiveAmountPence, paidTotalPence),`,
    "late-payment fee fixture charge preservation",
  );
}

fs.writeFileSync(absolutePath, source, "utf8");

console.log(
  "Fixture match-fee sync now preserves any already-applied late-payment admin fee on top of the base fixture charge.",
);
