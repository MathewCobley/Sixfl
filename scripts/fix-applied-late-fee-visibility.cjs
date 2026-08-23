const fs = require("node:fs");
const path = require("node:path");

const actionsPath = path.join(
  process.cwd(),
  "src/app/(admin)/admin/fixtures/late-fees/actions.ts",
);
let source = fs.readFileSync(actionsPath, "utf8");

// The canonical late-fee reconciliation patch used to rebuild the candidate SQL
// with an explicit `latePaymentFeeStatus <> APPLIED` clause. That contradicts the
// admin page, which intentionally splits the returned rows into review rows and
// an "Applied £10 late-payment fees" audit section. Keep APPLIED rows in the data
// set, including paid ones, so the fee remains visible and reversible.
source = source.replace(
  `      WHERE charge.\"status\" <> 'VOID'\n        AND charge.\"latePaymentFeeStatus\" <> 'APPLIED'`,
  `      WHERE charge.\"status\" <> 'VOID'`,
);
source = source.replace(
  `      WHERE charge.\"status\" IN ('OPEN', 'PART_PAID')\n        AND charge.\"latePaymentFeeStatus\" <> 'APPLIED'`,
  `      WHERE charge.\"status\" <> 'VOID'`,
);

const oldFilter = `.filter((row) => row.outstandingPence > 0 && row.chargeStatus !== \"VOID\");`;
const newFilter = `.filter(\n      (row) =>\n        row.chargeStatus !== \"VOID\" &&\n        (row.paymentLateFeeStatus === \"APPLIED\" || row.outstandingPence > 0),\n    );`;
if (source.includes(oldFilter)) {
  source = source.replace(oldFilter, newFilter);
}

const olderFilter = `.filter(\n      (row) =>\n        row.outstandingPence > 0 &&\n        row.chargeStatus !== \"PAID\" &&\n        row.chargeStatus !== \"VOID\",\n    );`;
if (source.includes(olderFilter)) {
  source = source.replace(olderFilter, newFilter);
}

if (
  source.includes(`charge.\"latePaymentFeeStatus\" <> 'APPLIED'`) ||
  !source.includes('row.paymentLateFeeStatus === "APPLIED" || row.outstandingPence > 0')
) {
  throw new Error(
    "Applied late-payment fees are still being excluded from the canonical admin data set.",
  );
}

fs.writeFileSync(actionsPath, source, "utf8");
console.log(
  "Applied late-payment fees now remain visible in the admin audit section, including after payment.",
);
