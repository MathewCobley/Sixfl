const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, ...relativePath.split("/")), "utf8");
}

function write(relativePath, source) {
  fs.writeFileSync(path.join(root, ...relativePath.split("/")), source, "utf8");
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found.`);
  }
  return source.replace(before, after);
}

// A PaymentCharge total can temporarily be stale after an old late-fee bug.
// The fixture-side team fee is the authoritative BASE match fee. Never infer the
// base solely as total minus late fee when fixture data is available.
{
  const file = "src/app/api/admin/payments/adjust-charge/route.ts";
  let source = read(file);

  source = replaceRequired(
    source,
    `    const currentBaseChargePence = Math.max(\n      charge.amountPence - appliedLateFeePence,\n      0,\n    );`,
    `    const fixtureBaseChargePence = charge.fixture\n      ? charge.fixture.homeTeamId === charge.teamId\n        ? charge.fixture.homeMatchFeePence ?? charge.fixture.matchFeePence\n        : charge.fixture.awayTeamId === charge.teamId\n          ? charge.fixture.awayMatchFeePence ?? charge.fixture.matchFeePence\n          : null\n      : null;\n    const currentBaseChargePence =\n      fixtureBaseChargePence ??\n      Math.max(charge.amountPence - appliedLateFeePence, 0);`,
    "fixture-authoritative base fee in reduce-match-fee action",
  );

  write(file, source);
}

{
  const file = "src/app/api/admin/payments/waive-late-fee/route.ts";
  let source = read(file);

  source = replaceRequired(
    source,
    `    include: { transactions: { select: { amountPence: true, notes: true } } },`,
    `    include: {\n      transactions: { select: { amountPence: true, notes: true } },\n      fixture: {\n        select: {\n          homeTeamId: true,\n          awayTeamId: true,\n          homeMatchFeePence: true,\n          awayMatchFeePence: true,\n          matchFeePence: true,\n        },\n      },\n    },`,
    "fixture fields in waive-late-fee action",
  );

  source = replaceRequired(
    source,
    `  const newAmountPence = Math.max(charge.amountPence - feeAmountPence, 0);`,
    `  const fixtureBaseChargePence = charge.fixture\n    ? charge.fixture.homeTeamId === charge.teamId\n      ? charge.fixture.homeMatchFeePence ?? charge.fixture.matchFeePence\n      : charge.fixture.awayTeamId === charge.teamId\n        ? charge.fixture.awayMatchFeePence ?? charge.fixture.matchFeePence\n        : null\n    : null;\n  const newAmountPence =\n    fixtureBaseChargePence ??\n    Math.max(charge.amountPence - feeAmountPence, 0);`,
    "fixture-authoritative base fee when waiving admin fee",
  );

  write(file, source);
}

const adjust = read("src/app/api/admin/payments/adjust-charge/route.ts");
const waive = read("src/app/api/admin/payments/waive-late-fee/route.ts");
if (
  !adjust.includes("fixtureBaseChargePence") ||
  !adjust.includes("homeMatchFeePence ?? charge.fixture.matchFeePence") ||
  !waive.includes("fixtureBaseChargePence") ||
  !waive.includes("awayMatchFeePence ?? charge.fixture.matchFeePence")
) {
  throw new Error("Late-fee fixture base authority contract failed.");
}

console.log(
  "Late-fee reductions and waivers now use the fixture-side team fee as the authoritative base charge.",
);
