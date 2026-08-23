const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, ...relativePath.split("/")), "utf8");
}

function write(relativePath, source) {
  fs.writeFileSync(path.join(root, ...relativePath.split("/")), source, "utf8");
}

function requireContains(source, needle, label) {
  if (!source.includes(needle)) throw new Error(`Missing ${label}.`);
}

// Captain/team payment ledgers must never infer the base match fee by subtracting
// an applied admin fee from a possibly stale PaymentCharge total. When a fixture
// exists, its team-side match fee is the authoritative base.
const ledgerPath = "src/lib/payments/team-payment-ledger.ts";
let ledger = read(ledgerPath);

if (!ledger.includes("baseMatchFeePence: number;")) {
  ledger = ledger.replace(
    "  amountPence: number;\n  directPaidPence: number;",
    "  amountPence: number;\n  baseMatchFeePence: number;\n  directPaidPence: number;",
  );
}

ledger = ledger.replace(
  `            id: true,\n            kickoffAt: true,\n            homeTeam: { select: { name: true } },\n            awayTeam: { select: { name: true } },`,
  `            id: true,\n            kickoffAt: true,\n            matchFeePence: true,\n            homeMatchFeePence: true,\n            awayMatchFeePence: true,\n            homeTeamId: true,\n            awayTeamId: true,\n            homeTeam: { select: { name: true } },\n            awayTeam: { select: { name: true } },`,
);

if (!ledger.includes("const authoritativeBaseMatchFeePence =")) {
  const anchor = "    const paidPence = directPaidPence + playerPaidPence;";
  if (!ledger.includes(anchor)) throw new Error("Ledger paidPence anchor missing.");
  ledger = ledger.replace(
    anchor,
    `${anchor}\n    const appliedLatePaymentFeePence =\n      charge.latePaymentFeeStatus === \"APPLIED\"\n        ? Math.max(charge.latePaymentFeeAmountPence, 0)\n        : 0;\n    const fixtureBaseMatchFeePence = charge.fixture\n      ? charge.fixture.homeTeamId === charge.teamId\n        ? charge.fixture.homeMatchFeePence ?? charge.fixture.matchFeePence\n        : charge.fixture.awayTeamId === charge.teamId\n          ? charge.fixture.awayMatchFeePence ?? charge.fixture.matchFeePence\n          : null\n      : null;\n    const authoritativeBaseMatchFeePence =\n      fixtureBaseMatchFeePence ??\n      Math.max(charge.amountPence - appliedLatePaymentFeePence, 0);\n    const effectiveChargeAmountPence =\n      appliedLatePaymentFeePence > 0\n        ? authoritativeBaseMatchFeePence + appliedLatePaymentFeePence\n        : charge.amountPence;`,
  );
}

// The waiver patch may have changed coverage to settledPence. Replace only the
// amount used for status/outstanding/overpayment calculations and returned entry.
ledger = ledger.replaceAll(
  "      amountPence: charge.amountPence,\n      paidPence:",
  "      amountPence: effectiveChargeAmountPence,\n      paidPence:",
);
ledger = ledger.replaceAll(
  "      amountPence: charge.amountPence,\n      paidPence: settledPence,",
  "      amountPence: effectiveChargeAmountPence,\n      paidPence: settledPence,",
);
ledger = ledger.replace(
  "        ? Math.max(paidPence - charge.amountPence, 0)",
  "        ? Math.max(paidPence - effectiveChargeAmountPence, 0)",
);
ledger = ledger.replace(
  "      amountPence: charge.amountPence,\n      directPaidPence,",
  "      amountPence: effectiveChargeAmountPence,\n      baseMatchFeePence: authoritativeBaseMatchFeePence,\n      directPaidPence,",
);

write(ledgerPath, ledger);

const captainPath = "src/app/captain/team/[teamid]/payments/page.tsx";
let captain = read(captainPath);
captain = captain.replace(
  "base charge {formatMoney(Math.max(0, entry.amountPence - entry.latePaymentFeeAmountPence))} + {formatMoney(entry.latePaymentFeeAmountPence)} admin fee = {formatMoney(entry.amountPence)} total.",
  "base charge {formatMoney(entry.baseMatchFeePence)} + {formatMoney(entry.latePaymentFeeAmountPence)} admin fee = {formatMoney(entry.amountPence)} total.",
);
write(captainPath, captain);

requireContains(ledger, "baseMatchFeePence: number;", "ledger base fee type");
requireContains(ledger, "const authoritativeBaseMatchFeePence =", "authoritative fixture base calculation");
requireContains(ledger, "effectiveChargeAmountPence", "effective applied late-fee total");
requireContains(captain, "base charge {formatMoney(entry.baseMatchFeePence)}", "captain authoritative base display");

console.log(
  "Captain payment ledgers now show applied late fees on top of the authoritative fixture-side base fee instead of deriving a false £30 base from a stale total.",
);
