const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, ...relativePath.split("/")), "utf8");
}

const actions = read("src/app/(admin)/admin/fixtures/late-fees/actions.ts");
const page = read("src/app/(admin)/admin/fixtures/late-fees/page.tsx");
const ledger = read("src/lib/payments/team-payment-ledger.ts");
const captainPayments = read("src/app/captain/team/[teamid]/payments/page.tsx");
const fixtureMatchFees = read("src/lib/payments/fixture-match-fees.ts");

// apply-visible-late-payment-fees.cjs itself uses an exact required replacement for
// the old SQL filter, so prebuild already fails if that filter cannot be removed.
// These contracts verify the durable user-visible and financial behaviour after the full patch chain.
const checks = [
  {
    ok: actions.includes("queueLatePaymentAppliedEmail") && actions.includes("PAYMENT_LATE_FEE_APPLIED"),
    message: "first application of a late-payment fee must attempt a team notification",
  },
  {
    ok: page.includes("paymentReviewRows") && page.includes("appliedPaymentRows"),
    message: "late-payment review rows and applied rows must be split explicitly",
  },
  {
    ok: page.includes("Applied £10 late-payment fees") && page.includes("Applying a fee no longer makes the case disappear"),
    message: "admin must retain an explicit visible section for applied £10 fees",
  },
  {
    ok: ledger.includes("latePaymentFeeStatus: string;") && ledger.includes("latePaymentFeeAmountPence: number;"),
    message: "captain payment ledger must expose late-payment fee composition",
  },
  {
    ok: captainPayments.includes("Late-payment admin fee applied") && captainPayments.includes("base charge"),
    message: "captain payment screen must explain the £10 addition instead of only showing a larger total",
  },
  {
    ok:
      fixtureMatchFees.includes("const appliedLatePaymentFeePence =") &&
      fixtureMatchFees.includes("const effectiveAmountPence =") &&
      fixtureMatchFees.includes("amountPence: effectiveAmountPence") &&
      fixtureMatchFees.includes("getChargeStatusFromAmounts(effectiveAmountPence, paidTotalPence)"),
    message: "fixture match-fee sync must preserve an applied late-payment admin fee on top of the base fixture charge",
  },
];

const failures = checks.filter((check) => !check.ok);
if (failures.length > 0) {
  console.error("Late-payment fee visibility contract failed:");
  for (const failure of failures) console.error(`- ${failure.message}`);
  process.exit(1);
}

console.log("Late-payment fee visibility contract passed.");
