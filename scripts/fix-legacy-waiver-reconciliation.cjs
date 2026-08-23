const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, ...relativePath.split("/")), "utf8");
}

function write(relativePath, source) {
  fs.writeFileSync(path.join(root, ...relativePath.split("/")), source, "utf8");
}

// Before explicit SIXFL waiver markers existed, the admin payment control recorded
// a waiver by physically reducing PaymentCharge.amountPence and adding text such as:
//   Admin fee adjustment: £5.00 waived/reduced. Charge changed from £40.00 to £35.00.
// Later fixture synchronisation could restore the charge to £40 while leaving only
// that audit text behind. The newer canonical ledger then sees £35 settled against
// £40 and incorrectly resurrects £5 as debt. Preserve those historical decisions
// without treating a reduction that is still reflected in the current amount as an
// extra waiver.
const waiverPath = "src/lib/payments/team-charge-waivers.ts";
let waiverSource = read(waiverPath);

if (!waiverSource.includes("getLegacyAdminAdjustmentWaivedPence")) {
  const marker = "export function buildTeamChargeWaiverNote";
  const markerIndex = waiverSource.indexOf(marker);
  if (markerIndex < 0) {
    throw new Error("Legacy waiver compatibility could not find waiver helper insertion point.");
  }

  const helper = `const LEGACY_ADMIN_WAIVER_PATTERN = /Admin fee adjustment:\\s*£([\\d,]+(?:\\.\\d{1,2})?)\\s+waived\\/reduced\\.\\s*Charge changed from £([\\d,]+(?:\\.\\d{1,2})?) to £([\\d,]+(?:\\.\\d{1,2})?)\\./g;\n\nfunction legacyMoneyToPence(value: string) {\n  const pounds = Number(value.replaceAll(\",\", \"\"));\n  return Number.isFinite(pounds) ? Math.round(pounds * 100) : 0;\n}\n\nexport function getLegacyAdminAdjustmentWaivedPence(\n  description: string | null | undefined,\n  currentChargeAmountPence: number,\n) {\n  if (!description || !Number.isFinite(currentChargeAmountPence)) return 0;\n\n  let total = 0;\n  for (const match of description.matchAll(LEGACY_ADMIN_WAIVER_PATTERN)) {\n    const recordedReductionPence = legacyMoneyToPence(match[1]);\n    const oldAmountPence = legacyMoneyToPence(match[2]);\n    const reducedAmountPence = legacyMoneyToPence(match[3]);\n    const recordedDifferencePence = Math.max(oldAmountPence - reducedAmountPence, 0);\n    const validReductionPence = Math.min(recordedReductionPence, recordedDifferencePence);\n    if (validReductionPence <= 0) continue;\n\n    // If the current charge is still at (or below) the reduced amount then the\n    // historical decision is already represented by amountPence and must not be\n    // counted again. If sync restored some/all of it, count only the lost part.\n    const lostReductionPence = Math.max(\n      Math.min(currentChargeAmountPence - reducedAmountPence, validReductionPence),\n      0,\n    );\n    total += lostReductionPence;\n  }\n\n  return total;\n}\n\n`;

  waiverSource =
    waiverSource.slice(0, markerIndex) + helper + waiverSource.slice(markerIndex);
  write(waiverPath, waiverSource);
}

for (const relativePath of [
  "src/lib/payments/charge-summary.ts",
  "src/lib/payments/team-payment-ledger.ts",
]) {
  let source = read(relativePath);

  if (!source.includes("getLegacyAdminAdjustmentWaivedPence")) {
    if (source.includes('import { getTeamChargeWaivedPence } from "@/lib/payments/team-charge-waivers";')) {
      source = source.replace(
        'import { getTeamChargeWaivedPence } from "@/lib/payments/team-charge-waivers";',
        'import {\n  getLegacyAdminAdjustmentWaivedPence,\n  getTeamChargeWaivedPence,\n} from "@/lib/payments/team-charge-waivers";',
      );
    } else if (source.includes("  getTeamChargeWaivedPence,\n  stripTeamChargeWaiverMarkers,")) {
      source = source.replace(
        "  getTeamChargeWaivedPence,\n  stripTeamChargeWaiverMarkers,",
        "  getLegacyAdminAdjustmentWaivedPence,\n  getTeamChargeWaivedPence,\n  stripTeamChargeWaiverMarkers,",
      );
    } else {
      throw new Error(`Legacy waiver compatibility could not patch imports in ${relativePath}.`);
    }
  }

  const oldLine = "    const waivedPence = getTeamChargeWaivedPence(charge.description);";
  const newLine = [
    "    const waivedPence =",
    "      getTeamChargeWaivedPence(charge.description) +",
    "      getLegacyAdminAdjustmentWaivedPence(charge.description, charge.amountPence);",
  ].join("\n");

  if (!source.includes(newLine)) {
    if (!source.includes(oldLine)) {
      throw new Error(`Legacy waiver compatibility could not patch waiver calculation in ${relativePath}.`);
    }
    source = source.replace(oldLine, newLine);
  }

  write(relativePath, source);
}

const finalWaiverSource = read(waiverPath);
const finalSummary = read("src/lib/payments/charge-summary.ts");
const finalLedger = read("src/lib/payments/team-payment-ledger.ts");

if (
  !finalWaiverSource.includes("LEGACY_ADMIN_WAIVER_PATTERN") ||
  !finalWaiverSource.includes("getLegacyAdminAdjustmentWaivedPence") ||
  !finalWaiverSource.includes("currentChargeAmountPence - reducedAmountPence") ||
  !finalSummary.includes("getLegacyAdminAdjustmentWaivedPence(charge.description, charge.amountPence)") ||
  !finalLedger.includes("getLegacyAdminAdjustmentWaivedPence(charge.description, charge.amountPence)")
) {
  throw new Error("Legacy waived/reduced payment compatibility contract failed.");
}

console.log(
  "Legacy waived/reduced admin adjustments now remain settled if a later fixture sync restored the original charge amount.",
);
