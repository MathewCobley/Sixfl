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

const appliedRowsRemainInQuery = /WHERE charge\."status" IN \('OPEN', 'PART_PAID'\)\s+GROUP BY charge\."id"/.test(actions);

const checks = [
  {
    ok: appliedRowsRemainInQuery,
    message: "applied late-payment fees must remain in the open-charge admin query",
  },
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
];

const failures = checks.filter((check) => !check.ok);
if (failures.length > 0) {
  console.error("Late-payment fee visibility contract failed:");
  for (const failure of failures) console.error(`- ${failure.message}`);
  process.exit(1);
}

console.log("Late-payment fee visibility contract passed.");
