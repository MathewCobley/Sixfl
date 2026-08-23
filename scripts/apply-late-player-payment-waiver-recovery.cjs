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

// A team-charge waiver settles the balance without closing individual OPEN
// PlayerMatchFee records. If one of those player links is paid later, the fresh
// payment must replace the waiver pound-for-pound before any genuine surplus can
// become team credit.
const waiverPath = "src/lib/payments/team-charge-waivers.ts";
let waivers = read(waiverPath);

waivers = replaceRequired(
  waivers,
  'const TEAM_CHARGE_WAIVER_PATTERN = /\\[SIXFL_TEAM_WAIVER:(\\d+)\\]/g;',
  'const TEAM_CHARGE_WAIVER_PATTERN = /\\[SIXFL_TEAM_WAIVER:(\\d+)\\]/g;\nconst TEAM_CHARGE_WAIVER_REDUCTION_PATTERN = /\\[SIXFL_TEAM_WAIVER_REDUCTION:(\\d+)\\]/g;',
  "waiver reduction marker",
);

waivers = replaceRequired(
  waivers,
  `export function getTeamChargeWaivedPence(description: string | null | undefined) {\n  if (!description) return 0;\n\n  let total = 0;\n  for (const match of description.matchAll(TEAM_CHARGE_WAIVER_PATTERN)) {\n    const amount = Number(match[1]);\n    if (Number.isInteger(amount) && amount > 0) total += amount;\n  }\n  return total;\n}`,
  `export function getTeamChargeWaivedPence(description: string | null | undefined) {\n  if (!description) return 0;\n\n  let added = 0;\n  for (const match of description.matchAll(TEAM_CHARGE_WAIVER_PATTERN)) {\n    const amount = Number(match[1]);\n    if (Number.isInteger(amount) && amount > 0) added += amount;\n  }\n\n  let reduced = 0;\n  for (const match of description.matchAll(TEAM_CHARGE_WAIVER_REDUCTION_PATTERN)) {\n    const amount = Number(match[1]);\n    if (Number.isInteger(amount) && amount > 0) reduced += amount;\n  }\n\n  return Math.max(added - reduced, 0);\n}`,
  "net waiver calculation",
);

waivers = replaceRequired(
  waivers,
  `.replace(TEAM_CHARGE_WAIVER_PATTERN, \"\")\n    .replace(/[ \\t]+\\n/g, \"\\n\")`,
  `.replace(TEAM_CHARGE_WAIVER_PATTERN, \"\")\n    .replace(TEAM_CHARGE_WAIVER_REDUCTION_PATTERN, \"\")\n    .replace(/[ \\t]+\\n/g, \"\\n\")`,
  "waiver marker stripping",
);

if (!waivers.includes("buildTeamChargeWaiverReductionNote")) {
  const marker = `export function buildTeamChargeWaiverNote(input: { amountPence: number; reason: string }) {`;
  const markerIndex = waivers.indexOf(marker);
  if (markerIndex < 0) throw new Error("Waiver note builder marker was not found.");

  const addition = `export function buildTeamChargeWaiverReductionNote(input: { amountPence: number; reason: string }) {\n  const amount = new Intl.NumberFormat(\"en-GB\", {\n    style: \"currency\",\n    currency: \"GBP\",\n  }).format(input.amountPence / 100);\n\n  return \`SIXFL waiver reduced by \\${amount}. Reason: \\${input.reason.trim()} [SIXFL_TEAM_WAIVER_REDUCTION:\\${input.amountPence}]\`;\n}\n\n`;
  waivers = waivers.slice(0, markerIndex) + addition + waivers.slice(markerIndex);
}

write(waiverPath, waivers);

const reconciliationPath = "src/lib/payments/player-match-fee-reconciliation.ts";
let reconciliation = read(reconciliationPath);

if (!reconciliation.includes('from "@/lib/payments/charge-summary"')) {
  reconciliation = reconciliation.replace(
    'import { formatDateTimeInLondon } from "@/lib/datetime/london";',
    'import { formatDateTimeInLondon } from "@/lib/datetime/london";\nimport { getDirectChargePaidTotal } from "@/lib/payments/charge-summary";',
  );
}

if (!reconciliation.includes("buildTeamChargeWaiverReductionNote")) {
  reconciliation = reconciliation.replace(
    'import { syncFixtureOverpaymentCredit } from "@/lib/payments/team-credit-pot";',
    'import { syncFixtureOverpaymentCredit } from "@/lib/payments/team-credit-pot";\nimport {\n  buildTeamChargeWaiverReductionNote,\n  getTeamChargeWaivedPence,\n} from "@/lib/payments/team-charge-waivers";',
  );
}

reconciliation = replaceRequired(
  reconciliation,
  `      fixtureId: true,\n      dueDate: true,`,
  `      fixtureId: true,\n      dueDate: true,\n      transactions: { select: { amountPence: true, notes: true } },`,
  "matching charge transactions",
);

if (!reconciliation.includes("late_player_payment_reduces_team_waiver")) {
  const before = `  // Team credit is based on genuine money received only. A SIXFL subsidy can\n  // cover a fixture but can never create an overpayment balance for the team.\n  const overpaymentPence = Math.max(paidTotalPence - matchingCharge.amountPence, 0);`;

  const after = `  // late_player_payment_reduces_team_waiver\n  // The admin may have settled an old balance with a SIXFL waiver while leaving\n  // individual player links open. Later genuine player payments replace that\n  // waiver first. This keeps the original fixture charge intact and prevents a\n  // late player payment from becoming team credit while any waiver remains.\n  let effectiveDescription = matchingCharge.description;\n  const currentWaivedPence = getTeamChargeWaivedPence(effectiveDescription);\n\n  if (currentWaivedPence > 0) {\n    const directCoveredPence = getDirectChargePaidTotal(matchingCharge.transactions);\n    const nonWaiverCoveredPence = directCoveredPence + coveredTotalPence;\n    const excessSettlementPence = Math.max(\n      nonWaiverCoveredPence + currentWaivedPence - matchingCharge.amountPence,\n      0,\n    );\n    const waiverReductionPence = Math.min(currentWaivedPence, excessSettlementPence);\n\n    if (waiverReductionPence > 0) {\n      const reductionNote = buildTeamChargeWaiverReductionNote({\n        amountPence: waiverReductionPence,\n        reason: \"Later player payment replaced part of the SIXFL waiver\",\n      });\n      effectiveDescription = [effectiveDescription?.trim(), reductionNote]\n        .filter(Boolean)\n        .join(\"\\n\");\n\n      await prisma.paymentCharge.update({\n        where: { id: matchingCharge.id },\n        data: { description: effectiveDescription },\n      });\n    }\n  }\n\n  // Team credit is based on genuine money received only. A SIXFL subsidy can\n  // cover a fixture but can never create an overpayment balance for the team.\n  const overpaymentPence = Math.max(paidTotalPence - matchingCharge.amountPence, 0);`;

  reconciliation = replaceRequired(
    reconciliation,
    before,
    after,
    "late player payment waiver reduction",
  );
}

reconciliation = replaceRequired(
  reconciliation,
  `        appendCoveredNote(matchingCharge.description, coveredTotalPence),`,
  `        appendCoveredNote(effectiveDescription, coveredTotalPence),`,
  "preserve waiver reduction audit note",
);

write(reconciliationPath, reconciliation);

if (
  !waivers.includes("TEAM_CHARGE_WAIVER_REDUCTION_PATTERN") ||
  !waivers.includes("buildTeamChargeWaiverReductionNote") ||
  !reconciliation.includes("late_player_payment_reduces_team_waiver") ||
  !reconciliation.includes("getDirectChargePaidTotal(matchingCharge.transactions)")
) {
  throw new Error("Late player payment waiver recovery contract failed.");
}

console.log(
  "Open player links now remain collectible after a team waiver, and later payments reduce the waiver before team credit can arise.",
);

require("./apply-waiver-payment-ui-consistency.cjs");
