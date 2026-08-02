const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const actionsPath = path.join(
  root,
  "src/app/captain/team/[teamid]/player-payments/actions.ts",
);
const paymentsPagePath = path.join(
  root,
  "src/app/captain/team/[teamid]/payments/page.tsx",
);
const repairHelperPath = path.join(
  root,
  "src/lib/payments/zero-fee-player-adjustments.ts",
);

let source = fs.readFileSync(actionsPath, "utf8");

// Player payment rows are only a collection method. They must never alter the
// fixed amount SIXFL charges the team for a fixture.
source = source.replace(
  /\nasync function syncTeamChargeForZeroFeeWaivers\([\s\S]*?\nasync function emailPlayerPaymentLinks/,
  "\nasync function emailPlayerPaymentLinks",
);
source = source.replace(
  /\n\s*await syncTeamChargeForZeroFeeWaivers\(\{ teamId, fixtureId \}\);/g,
  "",
);
source = source.replaceAll(
  "Player fee override is £0.00, so this share reduces the team balance but is not counted as money collected.",
  "Player fee override is £0.00, so no player payment link is created. The fixed team fixture fee is unchanged.",
);

fs.writeFileSync(actionsPath, source, "utf8");

if (source.includes("syncTeamChargeForZeroFeeWaivers")) {
  throw new Error(
    "The obsolete zero-fee team-charge adjustment is still present in player payment actions.",
  );
}

// Repair old reduced charges whenever the captain opens Team payments. This is
// intentionally runtime-safe so it also fixes databases where a one-off
// migration was skipped by a hosting environment.
let paymentsPage = fs.readFileSync(paymentsPagePath, "utf8");
const repairImport =
  'import { reconcileZeroFeePlayerAdjustmentsForTeam } from "@/lib/payments/zero-fee-player-adjustments";';
if (!paymentsPage.includes(repairImport)) {
  const importAnchor =
    'import { isMatchFeeChargePayable } from "@/lib/payments/match-day-billing";';
  if (!paymentsPage.includes(importAnchor)) {
    throw new Error("Team payments repair import anchor was not found.");
  }
  paymentsPage = paymentsPage.replace(
    importAnchor,
    `${importAnchor}\n${repairImport}`,
  );
}

const repairCall = "  await reconcileZeroFeePlayerAdjustmentsForTeam(teamid);";
if (!paymentsPage.includes(repairCall)) {
  const accessAnchor = "  await requireCaptain(teamid);";
  if (!paymentsPage.includes(accessAnchor)) {
    throw new Error("Team payments repair call anchor was not found.");
  }
  paymentsPage = paymentsPage.replace(
    accessAnchor,
    `${accessAnchor}\n${repairCall}`,
  );
}

fs.writeFileSync(paymentsPagePath, paymentsPage, "utf8");

// PostgreSQL treats TRANSACTION as a keyword. Keep the raw repair query's alias
// unambiguous before TypeScript is built.
let repairHelper = fs.readFileSync(repairHelperPath, "utf8");
repairHelper = repairHelper
  .replaceAll('SUM(transaction."amountPence")', 'SUM(payment_tx."amountPence")')
  .replaceAll('FROM "PaymentTransaction" transaction', 'FROM "PaymentTransaction" payment_tx')
  .replaceAll('transaction."chargeId"', 'payment_tx."chargeId"');
fs.writeFileSync(repairHelperPath, repairHelper, "utf8");

if (
  !paymentsPage.includes(repairImport) ||
  !paymentsPage.includes(repairCall)
) {
  throw new Error("Team payments runtime charge repair was not applied.");
}

require("./apply-admin-only-player-fee-override.cjs");

console.log(
  "Player collections cannot change fixed fixture charges; old reductions are repaired when Team payments opens and fee overrides remain admin-only.",
);
