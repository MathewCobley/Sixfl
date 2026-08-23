const fs = require("node:fs");
const path = require("node:path");

require("./apply-fixture-matchup-grid-screen-fit.cjs");
require("./apply-meta-area-import-inference.cjs");
require("./apply-late-fee-canonical-coverage.cjs");
require("./fix-late-fee-stale-paid-candidates.cjs");
require("./fix-late-fee-canonical-72h-review.cjs");
require("./apply-late-fee-adjustment-integrity.cjs");
require("./apply-late-fee-fixture-base-authority.cjs");
require("./fix-applied-late-fee-visibility.cjs");
require("./apply-authoritative-late-fee-ledger-display.cjs");

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, ...relativePath.split("/")), "utf8");
}

const actions = read("src/app/(admin)/admin/fixtures/late-fees/actions.ts");
const page = read("src/app/(admin)/admin/fixtures/late-fees/page.tsx");
const ledger = read("src/lib/payments/team-payment-ledger.ts");
const captainPayments = read("src/app/captain/team/[teamid]/payments/page.tsx");
const fixtureMatchFees = read("src/lib/payments/fixture-match-fees.ts");
const reduceMatchFee = read("src/app/api/admin/payments/adjust-charge/route.ts");
const waiveLateFee = read("src/app/api/admin/payments/waive-late-fee/route.ts");

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
    ok:
      page.includes("Applied £10 late-payment fees") &&
      page.includes("Applied fees stay visible here for audit even after the charge is paid"),
    message: "admin must retain an explicit visible audit section for applied £10 fees, including paid charges",
  },
  {
    ok: ledger.includes("latePaymentFeeStatus: string;") && ledger.includes("latePaymentFeeAmountPence: number;"),
    message: "captain payment ledger must expose late-payment fee composition",
  },
  {
    ok:
      captainPayments.includes("Late-payment admin fee applied") &&
      captainPayments.includes("base charge") &&
      captainPayments.includes("entry.baseMatchFeePence"),
    message: "captain payment screen must show the authoritative fixture base fee rather than deriving it by subtraction",
  },
  {
    ok:
      ledger.includes("baseMatchFeePence: number;") &&
      ledger.includes("const authoritativeBaseMatchFeePence =") &&
      ledger.includes("effectiveChargeAmountPence"),
    message: "captain ledger must calculate applied late fees on top of the authoritative fixture-side base fee",
  },
  {
    ok:
      fixtureMatchFees.includes("const appliedLatePaymentFeePence =") &&
      fixtureMatchFees.includes("const effectiveAmountPence =") &&
      fixtureMatchFees.includes("amountPence: effectiveAmountPence") &&
      fixtureMatchFees.includes("getChargeStatusFromAmounts(effectiveAmountPence, paidTotalPence)"),
    message: "fixture match-fee sync must preserve an applied late-payment admin fee on top of the base fixture charge",
  },
  {
    ok:
      actions.includes('getTeamPaymentLedger') &&
      actions.includes('ledgerEntry?.coveredPence') &&
      actions.includes('ledgerEntryByChargeId') &&
      actions.includes('Charge is already fully covered and cannot receive a late payment fee.'),
    message: "late-payment review and fee actions must use the same canonical fixture coverage as Team Payments",
  },
  {
    ok: page.includes('Covered: {formatMoney(row.paidTotalPence)}'),
    message: "late-payment review must label canonical fixture coverage accurately",
  },
  {
    ok:
      actions.includes(`WHERE charge.\"status\" <> 'VOID'`) &&
      !actions.includes(`charge.\"status\" IN ('OPEN', 'PART_PAID')`) &&
      actions.includes("const settledPence = ledgerEntry?.settledPence ?? coveredPence;") &&
      actions.includes("canonicalOutstandingPence") &&
      !actions.includes('charge.status === "PAID" ||'),
    message: "late-payment review must not hide genuinely unpaid charges just because their stored status is stale PAID",
  },
  {
    ok:
      actions.includes("INTERVAL '72 hours' <= NOW()") &&
      actions.includes('COALESCE(fixture."kickoffAt", charge."dueDate")') &&
      !actions.includes('WHERE "daysLate" >= 7'),
    message: "canonical payment reconciliation must preserve the 72-hour post-fixture review window",
  },
  {
    ok:
      actions.includes("isReversingAppliedFee") &&
      actions.includes('row.paymentLateFeeStatus === "APPLIED"'),
    message: "an applied admin fee must remain reversible even after the higher total has been paid",
  },
  {
    ok:
      !actions.includes(`charge.\"latePaymentFeeStatus\" <> 'APPLIED'`) &&
      actions.includes('row.paymentLateFeeStatus === "APPLIED" || row.outstandingPence > 0'),
    message: "applied late-payment fees must remain in the admin audit data set even after payment",
  },
  {
    ok:
      reduceMatchFee.includes("fixtureBaseChargePence") &&
      reduceMatchFee.includes("homeMatchFeePence ?? charge.fixture.matchFeePence") &&
      waiveLateFee.includes("fixtureBaseChargePence") &&
      waiveLateFee.includes("awayMatchFeePence ?? charge.fixture.matchFeePence"),
    message: "reduce-match-fee and waive-admin-fee actions must use the fixture-side team fee as the authoritative base charge",
  },
];

const failures = checks.filter((check) => !check.ok);
if (failures.length > 0) {
  console.error("Late-payment fee visibility contract failed:");
  for (const failure of failures) console.error(`- ${failure.message}`);
  process.exit(1);
}

console.log("Late-payment fee visibility contract passed.");
