const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const write = (file, source) => fs.writeFileSync(path.join(root, file), source, "utf8");

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`Missing ${label} anchor.`);
  }
  return source.replace(before, after);
}

function ensureImport(source, anchor, importLine, label) {
  if (source.includes(importLine)) return source;
  if (!source.includes(anchor)) {
    throw new Error(`Missing ${label} import anchor.`);
  }
  return source.replace(anchor, `${anchor}\n${importLine}`);
}

// Subsidy eligibility is native in player-fee-coverage.ts. An assigned-share
// difference must never be converted to an allowance without concession evidence.

// ---------------------------------------------------------------------------
// Team ledger: hydrate the durable captain share before calculating coverage.
// Open player links remain real collectible cash internally; the captain UI has
// its own assigned-share display below.
// ---------------------------------------------------------------------------
{
  const file = "src/lib/payments/team-payment-ledger.ts";
  let source = read(file);

  source = ensureImport(
    source,
    '} from "@/lib/payments/player-fee-coverage";',
    'import { hydrateCaptainAssignedPlayerFees } from "@/lib/payments/player-fee-assigned-share";',
    "team ledger assigned share",
  );

  if (!source.includes("captainAssignedAmountPence?: number | null;")) {
    source = replaceRequired(
      source,
      `type PlayerFeeRow = {\n  teamId: string;`,
      `type PlayerFeeRow = {\n  id: string;\n  teamId: string;`,
      "team ledger player fee id",
    );
    source = replaceRequired(
      source,
      `  note: string | null;\n};`,
      `  note: string | null;\n  captainAssignedAmountPence?: number | null;\n};`,
      "team ledger assigned share type",
    );
  }

  source = source.replaceAll(
    `      select: {\n        teamId: true,\n        fixtureId: true,`,
    `      select: {\n        id: true,\n        teamId: true,\n        fixtureId: true,`,
  );

  if (!source.includes("coveredPlayerFeesWithAssignedShares")) {
    source = replaceRequired(
      source,
      `  ]);\n\n  // Older/manual charge rows can legitimately exist without a checkout token.`,
      `  ]);\n\n  const coveredPlayerFeesWithAssignedShares =\n    await hydrateCaptainAssignedPlayerFees(coveredPlayerFees);\n\n  // Older/manual charge rows can legitimately exist without a checkout token.`,
      "team ledger assigned share hydration",
    );
  }

  source = source.replace(
    "buildPlayerFeeCoverageByTeamFixture(coveredPlayerFees);",
    "buildPlayerFeeCoverageByTeamFixture(coveredPlayerFeesWithAssignedShares);",
  );

  write(file, source);
}

// ---------------------------------------------------------------------------
// Reconciliation: when a capped £5 payment settles an £8 captain share, £5 is
// real cash and £3 is SIXFL coverage. The £3 never becomes team credit.
// ---------------------------------------------------------------------------
{
  const file = "src/lib/payments/player-match-fee-reconciliation.ts";
  let source = read(file);

  source = ensureImport(
    source,
    '} from "@/lib/payments/player-fee-coverage";',
    'import { hydrateCaptainAssignedPlayerFees } from "@/lib/payments/player-fee-assigned-share";',
    "reconciliation assigned share",
  );

  if (!source.includes("playerFeesWithAssignedShares")) {
    source = replaceRequired(
      source,
      `  ]);\n\n  if (!fixture) return null;`,
      `  ]);\n\n  const playerFeesWithAssignedShares =\n    await hydrateCaptainAssignedPlayerFees(playerFees);\n\n  if (!fixture) return null;`,
      "reconciliation assigned share hydration",
    );
  }

  source = source.replace(
    "  const paidTotalPence = playerFees.reduce(",
    "  const paidTotalPence = playerFeesWithAssignedShares.reduce(",
  );
  source = source.replace(
    "  const subsidyPence = playerFees.reduce(",
    "  const subsidyPence = playerFeesWithAssignedShares.reduce(",
  );

  write(file, source);
}

// ---------------------------------------------------------------------------
// Captain Team payments: always display the captain-entered share. The real
// capped amount remains in PlayerMatchFee.amountPence and in Stripe/accounting.
// ---------------------------------------------------------------------------
// Owning page now renders a shared receipt/balance presentation natively.

for (const [file, markers] of [
  [
    "src/lib/payments/player-fee-coverage.ts",
    ["captainAssignedAmountPence?: number | null", "const agreement = CAP_NOTE_PATTERN.exec"],
  ],
  [
    "src/lib/payments/team-payment-ledger.ts",
    ["hydrateCaptainAssignedPlayerFees", "coveredPlayerFeesWithAssignedShares"],
  ],
  [
    "src/lib/payments/player-match-fee-reconciliation.ts",
    ["hydrateCaptainAssignedPlayerFees", "playerFeesWithAssignedShares"],
  ],
  [
    "src/app/captain/team/[teamid]/payments/page.tsx",
    ["playerCollectionRowsWithAssignedShares", "getPlayerPaymentDisplay"],
  ],
]) {
  const source = read(file);
  for (const marker of markers) {
    if (!source.includes(marker)) {
      throw new Error(`Assigned-share marker ${marker} missing from ${file}.`);
    }
  }
}

console.log(
  "Capped player fees now retain the captain-entered share for display/fixture coverage while Stripe and cash accounting keep the lower capped payment.",
);
