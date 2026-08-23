const fs = require("node:fs");
const path = require("node:path");

const target = path.join(process.cwd(), "src/lib/payments/fixture-match-fees.ts");
let source = fs.readFileSync(target, "utf8");

const oldGuard = `    if (paidTotalPence > 0 && existingCharge.amountPence !== effectiveAmountPence) {\n      throw new Error(\n        \`Cannot change the match fee amount for \${existingCharge.team.name} because a payment has already been recorded.\`,\n      );\n    }`;

const newGuard = `    const isAppliedLateFeeReset =\n      appliedLatePaymentFeePence > 0 &&\n      existingCharge.amountPence === entry.amountPence &&\n      effectiveAmountPence === entry.amountPence + appliedLatePaymentFeePence;\n\n    if (\n      paidTotalPence > 0 &&\n      existingCharge.amountPence !== effectiveAmountPence &&\n      !isAppliedLateFeeReset\n    ) {\n      throw new Error(\n        \`Cannot change the match fee amount for \${existingCharge.team.name} because a payment has already been recorded.\`,\n      );\n    }`;

if (!source.includes(newGuard)) {
  if (!source.includes(oldGuard)) {
    throw new Error("Applied late-fee paid-charge reset guard anchor was not found.");
  }
  source = source.replace(oldGuard, newGuard);
}

if (
  !source.includes("const isAppliedLateFeeReset =") ||
  !source.includes("existingCharge.amountPence === entry.amountPence") ||
  !source.includes("!isAppliedLateFeeReset")
) {
  throw new Error("Paid applied late-fee reset repair contract failed.");
}

fs.writeFileSync(target, source, "utf8");
console.log(
  "Fixture fee sync can now repair the exact historical case where an applied £10 fee was lost from a paid base charge, while still blocking genuine paid-fee edits.",
);
