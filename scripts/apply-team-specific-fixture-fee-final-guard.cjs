const fs = require("node:fs");
const path = require("node:path");

// This runs last in prebuild/predev. Do not re-run the old whole fixture patch
// here because later compatibility steps intentionally evolve the publish code.
// Instead, add the last-line saved-card safety and then verify the final source
// that will actually be compiled/deployed.
require("./apply-team-autopay-fee-authority.cjs");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, ...relativePath.split("/")), "utf8");
}

function mustContain(source, expected, message) {
  if (!source.includes(expected)) {
    throw new Error(`Team-specific fixture fee safety failed: ${message}`);
  }
}

function mustNotMatch(source, pattern, message) {
  if (pattern.test(source)) {
    throw new Error(`Team-specific fixture fee safety failed: ${message}`);
  }
}

const publishBatch = read("src/app/(admin)/admin/fixtures/publish-actions.ts");
const publishOne = read("src/app/api/admin/fixtures/publish-one/route.ts");
const singleFixture = read("src/app/(admin)/admin/fixtures/generate/single-fixture-action.ts");
const editFixture = read("src/app/(admin)/admin/fixtures/[id]/edit/actions.ts");
const chargeSync = read("src/lib/payments/fixture-match-fees.ts");
const autoPay = read("src/lib/payments/team-autopay.ts");

for (const [label, source] of [
  ["batch fixture publishing", publishBatch],
  ["single fixture publishing", publishOne],
]) {
  mustContain(
    source,
    "homeMatchFeePence: number | null;",
    `${label} must load the home team's own fixture fee.`,
  );
  mustContain(
    source,
    "awayMatchFeePence: number | null;",
    `${label} must load the away team's own fixture fee.`,
  );
  mustContain(
    source,
    "fixture.homeMatchFeePence ?? fixture.matchFeePence ?? DEFAULT_MATCH_FEE_PENCE",
    `${label} must resolve the home fee independently.`,
  );
  mustContain(
    source,
    "fixture.awayMatchFeePence ?? fixture.matchFeePence ?? DEFAULT_MATCH_FEE_PENCE",
    `${label} must resolve the away fee independently.`,
  );
  mustNotMatch(
    source,
    /homeMatchFeePence:\s*matchFeePence,\s*awayMatchFeePence:\s*matchFeePence,/m,
    `${label} must never copy one shared fixture fee to both teams. A £36 team playing a £40 team must remain £36.`,
  );
}

mustContain(
  singleFixture,
  "homeMatchFeePence: homeStandardMatchFeePence,",
  "new fixtures must snapshot the home team's standard fee.",
);
mustContain(
  singleFixture,
  "awayMatchFeePence: awayStandardMatchFeePence,",
  "new fixtures must snapshot the away team's standard fee.",
);
mustContain(
  editFixture,
  "homeMatchFeePence,",
  "fixture edits must persist the home-side fee.",
);
mustContain(
  editFixture,
  "awayMatchFeePence,",
  "fixture edits must persist the away-side fee.",
);
mustContain(
  chargeSync,
  "amountPence: input.homeMatchFeePence",
  "charge sync must use the supplied home-side amount.",
);
mustContain(
  chargeSync,
  "amountPence: input.awayMatchFeePence",
  "charge sync must use the supplied away-side amount.",
);

mustContain(
  autoPay,
  "autoPayCapPence: number | null;",
  "saved-card autopay must carry a verified fee cap.",
);
mustContain(
  autoPay,
  't."standardMatchFeePence"',
  "saved-card autopay must verify the team's configured standard fee before charging.",
);
mustContain(
  autoPay,
  `    GROUP BY\n      pc."id",\n      pc."teamId",\n      t."name",\n      t."stripeCustomerId",\n      t."stripeDefaultPaymentMethodId",\n      t."autoPaySetupCheckoutSessionId",\n      t."standardMatchFeePence",\n      f."homeTeamId",\n      f."awayTeamId",\n      f."homeMatchFeePence",\n      f."awayMatchFeePence",\n      f."matchFeePence",\n      pc."fixtureId",`,
  "saved-card autopay must GROUP BY every Team/Fixture field used to derive the verified fee cap.",
);
mustNotMatch(
  autoPay,
  /SELECT[\s\S]*?t\."autoPaySetupCheckoutSessionId",\s*t\."standardMatchFeePence",\s*f\."homeTeamId",\s*f\."awayTeamId",\s*f\."homeMatchFeePence",\s*f\."awayMatchFeePence",\s*f\."matchFeePence",\s*pc\."fixtureId",[\s\S]*?FROM "PaymentCharge" pc/,
  "fee-authority GROUP BY columns must not be inserted as stray raw SELECT columns.",
);
mustContain(
  autoPay,
  "if (chargeAmountPence > autoPayCapPence)",
  "saved-card autopay must block/correct a stored charge above the verified fee.",
);
mustContain(
  autoPay,
  "storedAmountPence: row.amountPence",
  "saved-card corrections must be auditable.",
);
mustContain(
  autoPay,
  "sixfl_matchday_autopay_${row.chargeId}_${chargeAmountPence}",
  "saved-card idempotency must include the verified charge amount.",
);

console.log(
  "Final payment safety passed: asymmetric fixture fees stay separate and saved-card autopay cannot exceed the verified team fee.",
);
