const fs = require("node:fs");
const path = require("node:path");

// Re-apply the team-specific fixture fee patch after every other compatibility
// script has run. This must be the final payment-related source mutation before
// Next.js builds, otherwise a later legacy patch can silently restore one shared
// fixture fee and overcharge the cheaper team.
require("./apply-fixture-team-fee-overrides.cjs");

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

console.log(
  "Final team-specific fixture fee guard passed: asymmetric team fees cannot be collapsed to one shared charge.",
);
