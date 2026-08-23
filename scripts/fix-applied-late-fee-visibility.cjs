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
//
// Do not depend on one exact surrounding WHERE block here. Several later payment
// patches legitimately reshape that block, so remove only the obsolete APPLIED
// exclusion itself and leave every other candidate condition intact.
source = source.replace(
  /^\s*AND\s+charge\."latePaymentFeeStatus"\s*<>\s*'APPLIED'\s*$/gm,
  "",
);

// Very old generated variants can still carry the OPEN/PART_PAID pre-filter.
// Canonical reconciliation must be allowed to inspect stale PAID rows too.
source = source.replace(
  `      WHERE charge."status" IN ('OPEN', 'PART_PAID')`,
  `      WHERE charge."status" <> 'VOID'`,
);

const requiredFilter = [
  '.filter(',
  '      (row) =>',
  '        row.chargeStatus !== "VOID" &&',
  '        (row.paymentLateFeeStatus === "APPLIED" || row.outstandingPence > 0),',
  '    );',
].join("\n");

if (!source.includes(requiredFilter)) {
  const simpleFilter = `.filter((row) => row.outstandingPence > 0 && row.chargeStatus !== "VOID");`;
  const legacyFilter = [
    '.filter(',
    '      (row) =>',
    '        row.outstandingPence > 0 &&',
    '        row.chargeStatus !== "PAID" &&',
    '        row.chargeStatus !== "VOID",',
    '    );',
  ].join("\n");
  const reversedOrderFilter = [
    '.filter(',
    '      (row) =>',
    '        row.chargeStatus !== "VOID" &&',
    '        (row.outstandingPence > 0 || row.paymentLateFeeStatus === "APPLIED"),',
    '    );',
  ].join("\n");

  if (source.includes(simpleFilter)) {
    source = source.replace(simpleFilter, requiredFilter);
  } else if (source.includes(legacyFilter)) {
    source = source.replace(legacyFilter, requiredFilter);
  } else if (source.includes(reversedOrderFilter)) {
    source = source.replace(reversedOrderFilter, requiredFilter);
  }
}

if (
  /charge\."latePaymentFeeStatus"\s*<>\s*'APPLIED'/.test(source) ||
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

require("./fix-legacy-waiver-reconciliation.cjs");
