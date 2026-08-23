const fs = require("node:fs");
const path = require("node:path");

const actionsPath = path.join(
  process.cwd(),
  "src/app/(admin)/admin/fixtures/late-fees/actions.ts",
);

let source = fs.readFileSync(actionsPath, "utf8");

function replaceRequired(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found.`);
  }
  source = source.replace(before, after);
}

replaceRequired(
  `      WHERE charge.\"status\" IN ('OPEN', 'PART_PAID')\n        AND charge.\"latePaymentFeeStatus\" <> 'APPLIED'`,
  `      WHERE charge.\"status\" <> 'VOID'\n        AND charge.\"latePaymentFeeStatus\" <> 'APPLIED'`,
  "late-fee candidate stored-status filter",
);

replaceRequired(
  `    const coveredPence = ledgerEntry?.coveredPence ?? charge.paidTotalPence;\n    const outstandingBeforeDecision =\n      ledgerEntry?.outstandingPence ??\n      Math.max(charge.amountPence - coveredPence, 0);\n\n    if (\n      charge.status === \"PAID\" ||\n      ledgerEntry?.displayStatus === \"PAID\" ||\n      outstandingBeforeDecision <= 0\n    ) {\n      throw new Error(\"Charge is already fully covered and cannot receive a late payment fee.\");\n    }`,
  `    const coveredPence = ledgerEntry?.coveredPence ?? charge.paidTotalPence;\n    const settledPence = ledgerEntry?.settledPence ?? coveredPence;\n    const outstandingBeforeDecision = Math.max(\n      charge.amountPence - settledPence,\n      0,\n    );\n\n    if (outstandingBeforeDecision <= 0) {\n      throw new Error(\"Charge is already fully covered and cannot receive a late payment fee.\");\n    }`,
  "late-fee decision stale paid status guard",
);

replaceRequired(
  `    const nextStatus = getChargeStatus({\n      amountPence: nextAmountPence,\n      paidTotalPence: coveredPence,\n    });`,
  `    const nextStatus = getChargeStatus({\n      amountPence: nextAmountPence,\n      paidTotalPence: settledPence,\n    });`,
  "late-fee decision settled status calculation",
);

replaceRequired(
  `    .map((row) => {\n      const ledgerEntry = ledgerEntryByChargeId.get(row.chargeId);\n      if (!ledgerEntry) return row;\n\n      return {\n        ...row,\n        chargeStatus: ledgerEntry.displayStatus,\n        paidTotalPence: ledgerEntry.coveredPence,\n        outstandingPence: ledgerEntry.outstandingPence,\n      };\n    })\n    .filter(\n      (row) =>\n        row.outstandingPence > 0 &&\n        row.chargeStatus !== \"PAID\" &&\n        row.chargeStatus !== \"VOID\",\n    );`,
  `    .map((row) => {\n      const ledgerEntry = ledgerEntryByChargeId.get(row.chargeId);\n      const coveredPence = ledgerEntry?.coveredPence ?? row.paidTotalPence;\n      const settledPence = ledgerEntry?.settledPence ?? coveredPence;\n      const canonicalOutstandingPence = Math.max(\n        row.amountPence - settledPence,\n        0,\n      );\n      const canonicalStatus =\n        canonicalOutstandingPence <= 0\n          ? \"PAID\"\n          : settledPence > 0\n            ? \"PART_PAID\"\n            : \"OPEN\";\n\n      return {\n        ...row,\n        chargeStatus: canonicalStatus,\n        paidTotalPence: coveredPence,\n        outstandingPence: canonicalOutstandingPence,\n      };\n    })\n    .filter((row) => row.outstandingPence > 0 && row.chargeStatus !== \"VOID\");`,
  "late-fee candidate canonical status mapping",
);

if (
  source.includes(`charge.\"status\" IN ('OPEN', 'PART_PAID')`) ||
  source.includes('charge.status === "PAID" ||') ||
  !source.includes("const settledPence = ledgerEntry?.settledPence ?? coveredPence;") ||
  !source.includes("canonicalOutstandingPence") ||
  !source.includes(`WHERE charge.\"status\" <> 'VOID'`)
) {
  throw new Error("Stale paid late-fee candidate repair did not apply correctly.");
}

fs.writeFileSync(actionsPath, source, "utf8");
console.log(
  "Late-fee review now evaluates stale stored PAID charges from real settlement coverage before deciding whether to hide them.",
);
